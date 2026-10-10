import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Box, Layers, Upload, Check, AlertCircle, Sparkles } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useQueuedJob } from '@/hooks/useQueuedJob';
import { generateIdempotencyKey } from '@/lib/aiVideoPipeline';
import { compressAndUploadUri } from '@/lib/imageEdit';
import { friendlyError } from '@/lib/errors';
import { logError } from '@/lib/errorLogger';

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
  const idempotencyKeyRef = useRef<string>('');

  const { jobId, status, error: jobError, result, submit, reset } = useQueuedJob();

  useEffect(() => {
    if (status === 'done' && result) {
      const url = (result as { resultUrl?: string }).resultUrl;
      if (url) {
        setResultUrl(url);
        onResult?.(url);
      }
    }
  }, [status, result, onResult]);

  const pickTexture = useCallback(async () => {
    setLocalError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const uri = result.assets[0].uri;
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
  }, [reset]);

  const displayError = localError ?? jobError;
  const isBusy = status === 'queued' || status === 'processing' || isUploading;
  const canSubmit = !!modelImageUrl && !!textureSourceUrl && !isBusy;

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

      {/* Status Display */}
      {status !== 'idle' && (
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
          ) : (
            <View style={styles.processingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary[400]} />
              <Text style={styles.processingText}>{STATUS_LABELS[status] ?? '처리 중...'}</Text>
            </View>
          )}
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
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  processingText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
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
