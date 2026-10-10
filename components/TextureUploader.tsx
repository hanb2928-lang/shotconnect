import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Box, Layers, Upload, Check, AlertCircle, Sparkles } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useQueuedJob } from '@/hooks/useQueuedJob';
import { generateIdempotencyKey } from '@/lib/aiVideoPipeline';
import { compressAndUploadUri } from '@/lib/imageEdit';
import { friendlyError } from '@/lib/errors';
import { logError } from '@/lib/errorLogger';
import { getJob } from '@/lib/jobQueue';
import {
  saveActiveTextureJob,
  updateActiveTextureJobProgress,
  clearActiveTextureJob,
  getActiveTextureJob,
} from '@/lib/textureJobPersistence';

type SynthesisMode = 'uv-remap' | 'projection' | 'hybrid';

interface TextureUploaderProps {
  productName?: string;
  productCategory?: string;
  modelImageUrl?: string;
  onResult?: (resultUrl: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  idle: '대기 중',
  queued: '큐에 대기 중',
  processing: '텍스처 합성 중...',
  done: '합성 완료',
  error: '오류 발생',
};

const STAGE_LABELS: { threshold: number; label: string }[] = [
  { threshold: 0.1, label: '3D 모델 분석 중...' },
  { threshold: 0.25, label: '텍스처 소스 로딩 중...' },
  { threshold: 0.4, label: 'AI 텍스처 합성 중...' },
  { threshold: 0.75, label: '결과 파싱 중...' },
  { threshold: 0.9, label: '결과 저장 중...' },
  { threshold: 1.0, label: '완료' },
];

function getStageLabel(progress: number | null): string {
  if (progress === null || progress <= 0) return '준비 중...';
  for (let i = STAGE_LABELS.length - 1; i >= 0; i--) {
    if (progress >= STAGE_LABELS[i].threshold) return STAGE_LABELS[i].label;
  }
  return '준비 중...';
}

export function TextureUploader({
  productName,
  productCategory,
  modelImageUrl,
  onResult,
}: TextureUploaderProps) {
  const [textureSourceUri, setTextureSourceUri] = useState<string | null>(null);
  const [textureSourceUrl, setTextureSourceUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<SynthesisMode>('hybrid');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [restoringJob, setRestoringJob] = useState(false);
  const idempotencyKeyRef = useRef<string>('');
  const recoveredRef = useRef(false);

  const { jobId, status, error: jobError, result, progress, submit, reset } = useQueuedJob();

  // When jobId or progress changes, persist to local storage
  useEffect(() => {
    if (jobId && status === 'processing') {
      saveActiveTextureJob(jobId, modelImageUrl ?? '', textureSourceUrl ?? '', mode);
    }
  }, [jobId, status, modelImageUrl, textureSourceUrl, mode]);

  useEffect(() => {
    if (progress !== null && (status === 'processing' || status === 'queued')) {
      updateActiveTextureJobProgress(progress);
    }
  }, [progress, status]);

  // On result, clear persistence
  useEffect(() => {
    if (status === 'done' && result) {
      const url = (result as { resultUrl?: string }).resultUrl;
      if (url) {
        setResultUrl(url);
        onResult?.(url);
      }
      clearActiveTextureJob();
    } else if (status === 'error') {
      clearActiveTextureJob();
    }
  }, [status, result, onResult]);

  // On mount: check for a previously saved incomplete job and force-sync
  useEffect(() => {
    if (recoveredRef.current) return;
    recoveredRef.current = true;
    (async () => {
      const saved = await getActiveTextureJob();
      if (!saved || !saved.jobId) return;
      setRestoringJob(true);
      try {
        const job = await getJob(saved.jobId);
        if (!job) {
          clearActiveTextureJob();
          return;
        }
        if (job.status === 'done') {
          const url = (job.result as { resultUrl?: string } | null)?.resultUrl;
          if (url) {
            setResultUrl(url);
            onResult?.(url);
          }
          clearActiveTextureJob();
        } else if (job.status === 'error') {
          clearActiveTextureJob();
        } else {
          // Job still in progress — the useQueuedJob hook can't reattach
          // its Realtime subscription to an existing jobId, so we surface
          // a recovery banner and poll once. If the job completes, we
          // show the result; otherwise the user can start a new one.
          setLocalError('이전 텍스처 합성 작업이 진행 중입니다. 잠시만 기다려주세요.');
        }
      } catch {
        clearActiveTextureJob();
      } finally {
        setRestoringJob(false);
      }
    })();
  }, [onResult]);

  const pickTexture = useCallback(async () => {
    setLocalError(null);
    try {
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) return;

      const uri = pickerResult.assets[0].uri;
      setTextureSourceUri(uri);
      setResultUrl(null);

      setIsUploading(true);
      try {
        const uploadedUrl = await compressAndUploadUri(uri, 720, 0.8, 'webp');
        setTextureSourceUrl(uploadedUrl);
      } catch (err) {
        setLocalError(friendlyError(err, '텍스처 이미지 업로드에 실패했습니다.'));
      } finally {
        setIsUploading(false);
      }
    } catch (err) {
      logError(err, { component: 'TextureUploader', action: 'pickTexture' });
      setLocalError('이미지 선택 중 오류가 발생했습니다.');
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!modelImageUrl || !textureSourceUrl) return;
    setLocalError(null);
    setResultUrl(null);
    idempotencyKeyRef.current = generateIdempotencyKey();

    await submit('texture-synthesis', {
      modelImageUrl,
      textureSourceUrl,
      productName,
      productCategory,
      synthesisMode: mode,
      outputFormat: 'png',
      idempotencyKey: idempotencyKeyRef.current,
    }, { timeoutMs: 300_000 });
  }, [modelImageUrl, textureSourceUrl, productName, productCategory, mode, submit]);

  const handleReset = useCallback(() => {
    reset();
    setTextureSourceUri(null);
    setTextureSourceUrl(null);
    setResultUrl(null);
    setLocalError(null);
    clearActiveTextureJob();
  }, [reset]);

  const displayError = localError ?? jobError;
  const isBusy = status === 'queued' || status === 'processing' || isUploading || restoringJob;
  const canSubmit = !!modelImageUrl && !!textureSourceUrl && !isBusy;
  const progressPercent = progress !== null ? Math.round(progress * 100) : 0;
  const stageLabel = getStageLabel(progress);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Box size={20} color={theme.colors.gold[400]} strokeWidth={2} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>3D 텍스처 합성</Text>
          <Text style={styles.subtitle}>3D 모델에 텍스처 소스를 매핑합니다</Text>
        </View>
      </View>

      {/* Model Image Preview */}
      {modelImageUrl ? (
        <View style={styles.previewRow}>
          <View style={styles.previewItem}>
            <Text style={styles.previewLabel}>3D 모델</Text>
            <Image source={{ uri: modelImageUrl }} style={styles.previewImage} resizeMode="contain" />
          </View>
          <View style={styles.previewItem}>
            <Text style={styles.previewLabel}>텍스처 소스</Text>
            {textureSourceUri ? (
              <Image source={{ uri: textureSourceUri }} style={styles.previewImage} resizeMode="contain" />
            ) : (
              <TouchableOpacity style={styles.uploadPlaceholder} onPress={pickTexture} disabled={isBusy}>
                {isUploading ? (
                  <ActivityIndicator size="small" color={theme.colors.primary[400]} />
                ) : (
                  <>
                    <Upload size={22} color={theme.colors.dark.textDim} strokeWidth={2} />
                    <Text style={styles.uploadText}>텍스처 선택</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.noModelBox}>
          <Layers size={24} color={theme.colors.dark.textFaint} strokeWidth={2} />
          <Text style={styles.noModelText}>먼저 3D 모델 이미지를 업로드해주세요</Text>
        </View>
      )}

      {/* Mode Selector */}
      <View style={styles.modeRow}>
        {([
          { id: 'hybrid', label: '하이브리드' },
          { id: 'uv-remap', label: 'UV 리맵' },
          { id: 'projection', label: '프로젝션' },
        ] as const).map((opt) => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.modeChip, mode === opt.id && styles.modeChipActive]}
            onPress={() => setMode(opt.id)}
            disabled={isBusy}
          >
            <Text style={[styles.modeChipText, mode === opt.id && styles.modeChipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Progress Bar — shown during queued/processing */}
      {(status === 'queued' || status === 'processing') && (
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarHeader}>
            <Text style={styles.progressBarStage}>{stageLabel}</Text>
            <Text style={styles.progressBarPercent}>{progressPercent}%</Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.max(progressPercent, 3)}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Status Display */}
      {status !== 'idle' && status !== 'queued' && status !== 'processing' && (
        <View style={styles.statusBox}>
          {status === 'done' && resultUrl ? (
            <View style={styles.resultRow}>
              <Check size={18} color={theme.colors.success[400]} strokeWidth={2.5} />
              <Text style={styles.resultText}>텍스처 합성 완료</Text>
              <Image source={{ uri: resultUrl }} style={styles.resultThumb} resizeMode="contain" />
            </View>
          ) : status === 'error' ? (
            <View style={styles.errorRow}>
              <AlertCircle size={18} color={theme.colors.error[400]} strokeWidth={2} />
              <Text style={styles.errorText}>{displayError ?? '합성 실패'}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Error Display */}
      {displayError && status !== 'error' && (
        <View style={styles.errorBanner}>
          <AlertCircle size={16} color={theme.colors.error[400]} strokeWidth={2} />
          <Text style={styles.errorBannerText}>{displayError}</Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        {status === 'done' ? (
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>새 텍스처 합성</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Sparkles size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.submitButtonText}>텍스처 합성 시작</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Job ID display for debugging */}
      {jobId && __DEV__ && (
        <Text style={styles.jobIdText}>Job: {jobId.slice(0, 8)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  previewRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  previewItem: {
    flex: 1,
  },
  previewLabel: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    marginBottom: theme.spacing.xs,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  uploadPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  uploadText: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  noModelBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  noModelText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  modeRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  modeChip: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    alignItems: 'center',
  },
  modeChipActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: theme.colors.primary[400],
  },
  modeChipText: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  modeChipTextActive: {
    color: theme.colors.primary[400],
    fontFamily: theme.typography.fontFamily.medium,
  },
  progressBarContainer: {
    marginBottom: theme.spacing.md,
  },
  progressBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  progressBarStage: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
  },
  progressBarPercent: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary[400],
    borderRadius: 3,
  },
  statusBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  resultText: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.success[400],
  },
  resultThumb: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surface,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  errorBannerText: {
    flex: 1,
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    ...theme.shadows.glowPrimary,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  resetButton: {
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  resetButtonText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  jobIdText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: theme.colors.dark.textFaint,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
});
