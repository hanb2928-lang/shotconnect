import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image as RNImage,
} from 'react-native';
import { Camera, Check, X, RotateCcw, ChevronRight, Loader } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useSafeTop } from '@/hooks/useSafeTop';
import {
  InlineCameraViewfinder,
  type InlineViewfinderHandle,
} from '@/components/InlineCameraViewfinder';

export type AngleShot = {
  id: string;
  orderIndex: number;
  label: string;
  hint: string;
  base64?: string;
  dataUrl?: string;
  mimeType: string;
};

export type AngleGuide = {
  id: string;
  label: string;
  hint: string;
  emoji: string;
};

const ANGLE_GUIDES: AngleGuide[] = [
  { id: 'front', label: '정면', hint: '제품 전체가 보이도록 정면에서 촬영', emoji: '📸' },
  { id: 'left', label: '좌측면', hint: '제품의 왼쪽 측면을 45도 각도에서 촬영', emoji: '👈' },
  { id: 'right', label: '우측면', hint: '제품의 오른쪽 측면을 45도 각도에서 촬영', emoji: '👉' },
  { id: 'back', label: '후면', hint: '라벨이나 디자인이 보이는 뒷면을 촬영', emoji: '🔄' },
  { id: 'top', label: '상부', hint: '제품의 윗면을 위에서 내려다보며 촬영', emoji: '⬆️' },
];

interface MultiAngleCaptureGuideProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (shots: AngleShot[]) => void;
  /** Pick from gallery instead of camera */
  onPickImage?: (angleId: string) => Promise<{ base64: string; mimeType: string } | null>;
  /** Capture from camera */
  onCaptureImage?: (angleId: string) => Promise<{ base64: string; mimeType: string } | null>;
  /** Custom angle guides (defaults to 5-angle stereo cut) */
  guides?: AngleGuide[];
  /** Minimum shots required before early completion is allowed (default: guides.length) */
  minShots?: number;
  /** Custom header title */
  headerTitle?: string;
  /** Custom intro title */
  introTitle?: string;
  /** Custom intro description */
  introDesc?: string;
  /** Accent color for active elements (defaults to primary) */
  accentColor?: string;
  /** Label for the complete button when all shots done */
  completeLabelAll?: string;
  /** Label for the early-complete button when minShots met but not all done */
  completeLabelEarly?: string;
}

export function MultiAngleCaptureGuide({
  visible,
  onClose,
  onComplete,
  onPickImage,
  onCaptureImage,
  guides = ANGLE_GUIDES,
  minShots,
  headerTitle = '입체컷 오토 · 5각도 가이드',
  introTitle = '5각도 순차 촬영으로 입체적 AI 영상 완성',
  introDesc,
  accentColor,
  completeLabelAll = '5장으로 콘텐츠 만들기',
  completeLabelEarly,
}: MultiAngleCaptureGuideProps) {
  const safeTop = useSafeTop();
  const [shots, setShots] = useState<Record<string, AngleShot>>({});
  const [currentAngle, setCurrentAngle] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const pickLockRef = useRef(false);
  const shotsRef = useRef<Record<string, AngleShot>>({});
  const viewfinderRefs = useRef<Record<string, InlineViewfinderHandle | null>>({});

  const effectiveMinShots = minShots ?? guides.length;
  const effectiveAccent = accentColor ?? theme.colors.primary[400];
  const effectiveAccentBg = accentColor ?? theme.colors.primary[600];
  const effectiveIntroDesc = introDesc ??
    '정면, 좌측, 우측, 후면, 상부를 순서대로 촬영하면 AI가 제품의 입체적 특성을 정밀하게 복원합니다. 5장의 사진으로 왜곡 없는 역동적인 숏폼을 생성합니다.';

  // Keep ref in sync with state so async callbacks always see the latest shots
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  const completedCount = Object.keys(shots).length;
  const allDone = completedCount >= guides.length;
  const minMet = completedCount >= effectiveMinShots;

  const handleAddShot = useCallback(
    async (angleId: string, base64: string, mimeType: string) => {
      const guideIndex = guides.findIndex((g) => g.id === angleId);
      const guide = guides[guideIndex];
      if (!guide || !base64) return;
      const dataUrl = `data:${mimeType};base64,${base64}`;

      setCaptureError(null);
      setShots((prev) => {
        const next = { ...prev };
        next[angleId] = {
          id: angleId,
          orderIndex: guideIndex,
          label: guide.label,
          hint: guide.hint,
          base64,
          dataUrl,
          mimeType,
        };
        return next;
      });

      // Auto-advance to next incomplete angle
      const nextIdx = guides.findIndex((g, i) => i > guideIndex && !shotsRef.current[g.id]);
      if (nextIdx !== -1) {
        setCurrentAngle(nextIdx);
      } else if (guideIndex < guides.length - 1) {
        setCurrentAngle(guideIndex + 1);
      }

    },
    [guides],
  );

  const handlePickFromGallery = useCallback(
    async (angleId: string) => {
      if (!onPickImage) return;
      if (pickLockRef.current) return;
      pickLockRef.current = true;
      setProcessing(true);
      setCaptureError(null);
      try {
        const result = await onPickImage(angleId);
        if (result?.base64) {
          await handleAddShot(angleId, result.base64, result.mimeType);
        } else {
          setCaptureError('이미지를 불러오지 못했습니다. 다시 시도해 주세요.');
        }
      } catch {
        setCaptureError('갤러리에서 이미지를 가져오는 중 오류가 발생했습니다. 다시 시도해 주세요.');
      }
      setProcessing(false);
      setTimeout(() => { pickLockRef.current = false; }, 300);
    },
    [onPickImage, handleAddShot],
  );

  const handleCaptureFromCamera = useCallback(
    async (angleId: string) => {
      if (pickLockRef.current) return;
      pickLockRef.current = true;
      setProcessing(true);
      setCaptureError(null);
      try {
        const viewfinder = viewfinderRefs.current[angleId];
        let result: { base64: string; mimeType: string } | null = null;
        if (viewfinder?.isReady()) {
          result = await viewfinder.capture();
        }
        if (!result && onCaptureImage) {
          result = await onCaptureImage(angleId);
        }
        if (result?.base64) {
          await handleAddShot(angleId, result.base64, result.mimeType);
        } else {
          setCaptureError('카메라 캡처에 실패했습니다. 다시 촬영해 주세요.');
        }
      } catch {
        setCaptureError('카메라 캡처 중 오류가 발생했습니다. 다시 촬영해 주세요.');
      }
      setProcessing(false);
      setTimeout(() => { pickLockRef.current = false; }, 300);
    },
    [onCaptureImage, handleAddShot],
  );

  const handleRetake = useCallback((angleId: string) => {
    setShots((prev) => {
      const next = { ...prev };
      delete next[angleId];
      return next;
    });
  }, []);

  const handleComplete = useCallback(() => {
    // Use ref to avoid stale closure — always read the latest shots
    const currentShots = shotsRef.current;
    const ordered = guides.map((g, idx) => {
      const shot = currentShots[g.id];
      if (!shot?.base64) return null;
      return { ...shot, orderIndex: idx };
    }).filter(Boolean) as AngleShot[];
    if (ordered.length === 0) return;
    onComplete(ordered);
    setShots({});
    shotsRef.current = {};
    setCurrentAngle(0);
  }, [guides, onComplete]);

  const handleClose = useCallback(() => {
    setShots({});
    shotsRef.current = {};
    setCurrentAngle(0);
    setCaptureError(null);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.overlay, { paddingTop: safeTop }]}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={handleClose} activeOpacity={0.7}>
              <X size={20} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Progress */}
          <View style={styles.progressRow}>
            {guides.map((g, i) => (
              <View key={g.id} style={[styles.progressDot, shots[g.id] && styles.progressDotDone, i === currentAngle && { ...styles.progressDotActive, backgroundColor: effectiveAccent }]} />
            ))}
            <Text style={styles.progressText}>{completedCount}/{guides.length} 완료</Text>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {captureError && (
              <View style={styles.captureErrorBox}>
                <Text style={styles.captureErrorText}>{captureError}</Text>
              </View>
            )}
            {/* Intro */}
            <View style={styles.introBox}>
              <Text style={styles.introTitle}>{introTitle}</Text>
              <Text style={styles.introDesc}>{effectiveIntroDesc}</Text>
            </View>

            {/* Angle cards */}
            {guides.map((guide, idx) => {
              const shot = shots[guide.id];
              const isActive = idx === currentAngle;
              return (
                <View key={guide.id} style={[styles.angleCard, isActive && { ...styles.angleCardActive, borderColor: effectiveAccent }]}>
                  <View style={styles.angleHeader}>
                    <Text style={styles.angleEmoji}>{guide.emoji}</Text>
                    <View style={styles.angleHeaderText}>
                      <Text style={styles.angleLabel}>STEP {idx + 1} · {guide.label}</Text>
                      <Text style={styles.angleHint}>{guide.hint}</Text>
                    </View>
                    {shot && (
                      <View style={styles.doneBadge}>
                        <Check size={12} color="#fff" strokeWidth={2.5} />
                      </View>
                    )}
                  </View>

                  {shot?.dataUrl ? (
                    <View style={styles.shotPreview}>
                      <RNImage source={{ uri: shot.dataUrl }} style={styles.shotImage} resizeMode="cover" />
                      <View style={styles.shotIndexBadge}>
                        <Text style={styles.shotIndexText}>{String(idx + 1).padStart(2, '0')}</Text>
                      </View>
                      <View style={styles.shotActions}>
                        <TouchableOpacity
                          style={styles.retakeBtn}
                          onPress={() => {
                            handleRetake(guide.id);
                            setCurrentAngle(idx);
                          }}
                          activeOpacity={0.7}
                        >
                          <RotateCcw size={13} color={theme.colors.dark.text} strokeWidth={2} />
                          <Text style={styles.retakeText}>다시 촬영</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.shotPlaceholder}>
                      <InlineCameraViewfinder
                        ref={(r) => { viewfinderRefs.current[guide.id] = r; }}
                        isActive={isActive}
                        accentColor={effectiveAccent}
                        onPickFromGallery={() => handlePickFromGallery(guide.id)}
                        onCapture={() => handleCaptureFromCamera(guide.id)}
                        processing={processing}
                      />
                      {/* Capture button */}
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: effectiveAccentBg }, !onCaptureImage && styles.actionBtnHidden]}
                        onPress={() => {
                          if (pickLockRef.current || processing) return;
                          setCurrentAngle(idx);
                          handleCaptureFromCamera(guide.id);
                        }}
                        disabled={processing}
                        activeOpacity={0.6}
                        hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                      >
                        {processing ? (
                          <>
                            <Loader size={16} color="#fff" strokeWidth={2} />
                            <Text style={styles.actionBtnText}>촬영 중...</Text>
                          </>
                        ) : (
                          <>
                            <Camera size={18} color="#fff" strokeWidth={2} />
                            <Text style={styles.actionBtnText}>촬영하기</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Bottom action */}
          <View style={styles.bottomBar}>
            {minMet && !allDone && (
              <TouchableOpacity
                style={[styles.completeBtn, { backgroundColor: effectiveAccent, marginBottom: 8 }]}
                onPress={handleComplete}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
              >
                <Check size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.completeBtnText}>
                  {completeLabelEarly ?? `${completedCount}장으로 합성하기`}
                </Text>
                <ChevronRight size={18} color="#fff" strokeWidth={2} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.completeBtn, !allDone && styles.completeBtnDisabled, allDone && { backgroundColor: effectiveAccentBg }]}
              onPress={handleComplete}
              disabled={!allDone}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
            >
              <Check size={18} color={allDone ? '#fff' : theme.colors.dark.textFaint} strokeWidth={2} />
              <Text style={[styles.completeBtnText, !allDone && styles.completeBtnTextDisabled]}>
                {allDone ? completeLabelAll : `${guides.length - completedCount}장 더 촬영하세요`}
              </Text>
              {allDone && <ChevronRight size={18} color="#fff" strokeWidth={2} />}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
    zIndex: 9999,
    elevation: 9999,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  headerSpacer: {
    width: 40,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.dark.border,
  },
  progressDotDone: {
    backgroundColor: theme.colors.success[500],
  },
  progressDotActive: {
    backgroundColor: theme.colors.primary[400],
    width: 24,
  },
  progressText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    marginLeft: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  introBox: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: 6,
  },
  introTitle: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  introDesc: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 19,
  },
  angleCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: theme.spacing.sm,
  },
  angleCardActive: {
    borderColor: theme.colors.primary[400],
  },
  angleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  angleEmoji: {
    fontSize: 24,
  },
  angleHeaderText: {
    flex: 1,
    gap: 2,
  },
  angleLabel: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  angleHint: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
  },
  doneBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.success[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  shotPreview: {
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  shotIndexBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  shotIndexText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  shotImage: {
    width: '100%',
    height: 240,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  shotActions: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  retakeText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#fff',
  },
  shotPlaceholder: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  actionBtnHidden: {
    opacity: 0,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[600],
    minHeight: 48,
    zIndex: 5,
    elevation: 5,
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  bottomBar: {
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
    backgroundColor: theme.colors.dark.surface,
    zIndex: 10,
    elevation: 10,
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary[500],
    minHeight: 52,
  },
  completeBtnDisabled: {
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  completeBtnText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  completeBtnTextDisabled: {
    color: theme.colors.dark.textFaint,
  },
  captureErrorBox: {
    backgroundColor: theme.colors.error[500] + '18',
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.error[500] + '30',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  captureErrorText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.error[400],
  },
});
