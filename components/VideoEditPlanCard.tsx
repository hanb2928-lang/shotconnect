import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import {
  Scissors,
  ShieldCheck,
  Copy,
  Check,
  Clock,
  Music,
  Camera,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
  Shuffle,
  Volume2,
  Zap,
  Activity,
} from 'lucide-react-native';
import { buildBeatSync, formatBeatSyncSummary, getBeatSyncAccuracyLabel } from '@/lib/audioSyncEngine';
import * as Clipboard from 'expo-clipboard';
import { theme } from '@/lib/theme';
import {
  EditPlan,
  CopyVariant,
  PsychologyPreset,
  fetchVideoEditPlan,
} from '@/lib/videoEditPlan';

interface VideoEditPlanCardProps {
  productName?: string;
  productCategory?: string;
  platform?: string;
  accentColor?: string;
  hook?: string;
  oneLiner?: string;
  hasVideoSelected: boolean;
  onPlanGenerated?: (plan: EditPlan) => void;
  hideCopyVariants?: boolean;
}



export function VideoEditPlanCard({
  productName,
  productCategory,
  platform,
  accentColor,
  hook,
  oneLiner,
  hasVideoSelected,
  onPlanGenerated,
  hideCopyVariants = false,
}: VideoEditPlanCardProps) {
  const [duration, setDuration] = useState<15 | 30>(15);
  const psychPreset: PsychologyPreset = 'auto';
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyIndex, setCopyIndex] = useState(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [showDetailGuide, setShowDetailGuide] = useState(false);
  const [audioDucking, setAudioDucking] = useState(true);
  const [shuffling, setShuffling] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const startProgress = useCallback(() => {
    setProgress(0);
    progressAnim.setValue(0);
    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = setInterval(() => {
      setProgress((prev) => Math.min(prev + Math.random() * 12 + 4, 92));
    }, 250);
  }, [progressAnim]);

  const finishProgress = useCallback(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    setProgress(100);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress / 100,
      duration: 200,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  useEffect(() => {
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    startProgress();
    try {
      const result = await fetchVideoEditPlan({
        productName,
        productCategory,
        videoDuration: duration,
        platform,
        accentColor,
        hook,
        oneLiner,
        psychologyPreset: psychPreset,
      });
      setPlan(result);
      setCopyIndex(0);
      onPlanGenerated?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '편집 계획 생성에 실패했습니다.');
    } finally {
      finishProgress();
      setLoading(false);
    }
  }, [duration, psychPreset, productName, productCategory, platform, accentColor, hook, oneLiner, startProgress, finishProgress, onPlanGenerated]);

  const copyToClipboard = useCallback(async (text: string, fieldKey: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore
    }
  }, []);

  const copyFullVariant = useCallback((variant: CopyVariant, index: number) => {
    const full = [
      variant.hook,
      variant.body,
      variant.cta,
      variant.hashtags.join(' '),
      variant.disclosure,
    ].join('\n');
    copyToClipboard(full, `variant-${index}`);
  }, [copyToClipboard]);

  if (!hasVideoSelected) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <Scissors size={16} color={theme.colors.warning[400]} strokeWidth={2.5} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>영상 편집 계획 (15초 / 30초)</Text>
            <Text style={styles.subtitle}>
              먼저 위에서 영상을 선택해주세요. 편집 계획을 생성할 수 있습니다.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconWrap}>
          <Scissors size={16} color={theme.colors.warning[400]} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>영상 편집 계획 (15초 / 30초)</Text>
          <Text style={styles.subtitle}>
            AI가 상품에 맞는 최적 편집 계획을 자동 생성합니다
          </Text>
        </View>
      </View>

      {/* Duration selector */}
      <View style={styles.durationRow}>
        {[15, 30].map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.durationBtn, duration === d && styles.durationBtnActive]}
            onPress={() => setDuration(d as 15 | 30)}
            activeOpacity={0.7}
          >
            <Clock size={13} color={duration === d ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={[styles.durationBtnText, duration === d && styles.durationBtnTextActive]}>
              {d}초
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.generateBtn}
          onPress={handleGenerate}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Sparkles size={14} color="#fff" strokeWidth={2.5} />
              <Text style={styles.generateBtnText}>편집 계획 생성</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading && (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>AI 편집 계획 생성 중...</Text>
            <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[styles.progressFill, { width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }) }]}
            />
          </View>
        </View>
      )}

      {plan && (
        <ScrollView style={styles.planScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {/* Segments timeline */}
          <Text style={styles.sectionLabel}>컷 편집 타임라인</Text>
          <View style={styles.segmentsWrap}>
            {plan.segments.map((seg, i) => {
              const isCtaSegment = seg.label.includes('CTA') && seg.startSec >= plan.duration - 2;
              return (
                <View key={i} style={[styles.segmentRow, isCtaSegment && styles.segmentRowCta]}>
                  <View style={[styles.segmentTime, isCtaSegment && styles.segmentTimeCta]}>
                    <Text style={[styles.segmentTimeText, isCtaSegment && styles.segmentTimeTextCta]}>{seg.startSec}~{seg.endSec}초</Text>
                  </View>
                  <View style={styles.segmentBody}>
                    <View style={styles.segmentLabelRow}>
                      {isCtaSegment && <ShieldCheck size={11} color={theme.colors.success[400]} strokeWidth={2.5} />}
                      <Text style={[styles.segmentLabel, isCtaSegment && styles.segmentLabelCta]}>{seg.label}</Text>
                    </View>
                    <Text style={styles.segmentPurpose}>{seg.purpose}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Music & motion + audio ducking toggle */}
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Music size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={styles.metaChipText}>{plan.musicMood}</Text>
            </View>
            <View style={styles.metaChip}>
              <Camera size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={styles.metaChipText}>{plan.motionPreset}</Text>
            </View>
            <View style={styles.metaChip}>
              <Zap size={11} color={theme.colors.success[400]} strokeWidth={2.5} />
              <Text style={[styles.metaChipText, { color: theme.colors.success[400] }]}>최적화 적용됨</Text>
            </View>
          </View>

          {/* Audio ducking toggle */}
          <View style={styles.duckRow}>
            <Volume2 size={13} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.duckLabel}>배경음악 자동 조절 (오디오 더킹)</Text>
            <TouchableOpacity
              style={[styles.duckToggle, audioDucking && styles.duckToggleOn]}
              onPress={() => setAudioDucking(!audioDucking)}
              activeOpacity={0.7}
            >
              <View style={[styles.duckKnob, audioDucking && styles.duckKnobOn]} />
            </TouchableOpacity>
          </View>

          {/* Beat sync card */}
          {(() => {
            const bpmMap: Record<string, number> = {
              '하이텐션': 128, '시네마틱': 90, 'ASMR': 60, '감성': 75, '로파이': 82,
            };
            const effectiveBpm = bpmMap[plan.musicMood] ?? 120;
            const sync = buildBeatSync(
              effectiveBpm,
              plan.duration,
              plan.segments.map((s, i) => ({
                index: i,
                startSec: s.startSec,
                endSec: s.endSec,
                label: s.label,
                purpose: s.purpose,
                textOverlay: '',
                position: 'center' as const,
                storyPhase: 'gaze_hook' as const,
                narrationCue: s.purpose,
              })),
              plan.musicMood ?? '하이텐션',
            );
            const accuracy = getBeatSyncAccuracyLabel(sync);
            const downbeats = sync.beats.filter((b) => b.isDownbeat);
            return (
              <View style={styles.beatSyncCard}>
                <View style={styles.beatSyncHeader}>
                  <Activity size={14} color={theme.colors.accent[400]} strokeWidth={2} />
                  <Text style={styles.beatSyncTitle}>비트 컷 싱크 + 오디오 덕킹</Text>
                  <View style={styles.accuracyBadge}>
                    <Text style={styles.accuracyText}>{accuracy}</Text>
                  </View>
                </View>

                {/* Beat timeline visualization */}
                <View style={styles.beatTimeline}>
                  {sync.beats.map((beat, i) => (
                    <View
                      key={i}
                      style={[
                        styles.beatDot,
                        beat.isDownbeat && styles.beatDotDownbeat,
                        beat.snappedCutIndex !== null && styles.beatDotSnapped,
                      ]}
                    />
                  ))}
                </View>

                {/* Beat stats */}
                <View style={styles.beatStatsRow}>
                  <Text style={styles.beatStatLabel}>BPM</Text>
                  <Text style={styles.beatStatValue}>{sync.bpm}</Text>
                  <Text style={styles.beatStatDivider}>|</Text>
                  <Text style={styles.beatStatLabel}>비트</Text>
                  <Text style={styles.beatStatValue}>{sync.beats.length}</Text>
                  <Text style={styles.beatStatDivider}>|</Text>
                  <Text style={styles.beatStatLabel}>다운비트</Text>
                  <Text style={styles.beatStatValue}>{downbeats.length}</Text>
                  <Text style={styles.beatStatDivider}>|</Text>
                  <Text style={styles.beatStatLabel}>스냅된 컷</Text>
                  <Text style={styles.beatStatValue}>
                    {sync.cutOffsets.filter((c) => c.offsetMs !== 0).length}/{sync.cutOffsets.length}
                  </Text>
                </View>

                {/* Ducking timeline */}
                {audioDucking && (
                  <View style={styles.duckingSection}>
                    <Text style={styles.duckingLabel}>오디오 덕킹 타임라인</Text>
                    <View style={styles.duckingBar}>
                      {sync.duckingCurve.map((seg, i) => {
                        const widthPct = ((seg.endSec - seg.startSec) / plan.duration) * 100;
                        const isDucked = seg.levelDb < 0;
                        return (
                          <View
                            key={i}
                            style={[
                              styles.duckingSegment,
                              { width: `${Math.max(widthPct, 2)}%` },
                              isDucked ? styles.duckingSegmentLow : styles.duckingSegmentFull,
                              (seg.fadeType === 'fadeOut' || seg.fadeType === 'fadeIn') && styles.duckingSegmentFade,
                            ]}
                          />
                        );
                      })}
                    </View>
                    <View style={styles.duckingLegend}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, styles.duckingSegmentFull]} />
                        <Text style={styles.legendText}>BGM 0dB</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, styles.duckingSegmentLow]} />
                        <Text style={styles.legendText}>나레이션 시 -18dB</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* BGM track selection */}
                {sync.selectedTrack && (
                  <View style={styles.trackInfoRow}>
                    <Music size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
                    <Text style={styles.trackInfoText}>
                      {sync.selectedTrack.title} ({sync.selectedTrack.bpm}BPM)
                    </Text>
                  </View>
                )}
                <Text style={styles.trackReasonText}>{sync.selectionReason}</Text>
              </View>
            );
          })()}

          {/* Collapsible detail guide */}
          <TouchableOpacity
            style={styles.detailToggle}
            onPress={() => setShowDetailGuide(!showDetailGuide)}
            activeOpacity={0.7}
          >
            <Info size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.detailToggleText}>
              {showDetailGuide ? '상세 가이드 접기' : '상세 가이드 보기'}
            </Text>
            {showDetailGuide ? (
              <ChevronUp size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
            ) : (
              <ChevronDown size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
            )}
          </TouchableOpacity>

          {showDetailGuide && (
            <>
              {/* Reason */}
              <View style={styles.reasonBox}>
                <Text style={styles.reasonText}>{plan.reason}</Text>
              </View>

              {/* Hook timing */}
              <View style={styles.infoCard}>
                <View style={styles.infoCardHeader}>
                  <Sparkles size={14} color={theme.colors.warning[400]} strokeWidth={2} />
                  <Text style={styles.infoCardTitle}>후킹 타이밍</Text>
                </View>
                <Text style={styles.infoCardBody}>
                  첫 후킹: {plan.hookTiming.firstHookSec}초{'\n'}{plan.hookTiming.reason}
                </Text>
              </View>

              {/* Psychology */}
              <View style={styles.infoCard}>
                <View style={styles.infoCardHeader}>
                  <Sparkles size={14} color={theme.colors.accent[400]} strokeWidth={2} />
                  <Text style={styles.infoCardTitle}>심리학 적용</Text>
                </View>
                <Text style={styles.infoCardLabel}>원리: {plan.psychology.principle}</Text>
                <Text style={styles.infoCardBody}>{plan.psychology.application}</Text>
                <Text style={styles.infoCardTrigger}>트리거 지점: {plan.psychology.triggerPoint}</Text>
              </View>


            </>
          )}

          {/* AI recommended copy — single card with shuffle */}
          {!hideCopyVariants && plan.copyVariants.length > 0 && (() => {
            const variant = plan.copyVariants[copyIndex % plan.copyVariants.length];
            const copyKey = `copy-${copyIndex}`;
            const handleShuffle = () => {
              if (plan.copyVariants.length <= 1) return;
              setShuffling(true);
              setTimeout(() => {
                setCopyIndex((prev) => (prev + 1) % plan.copyVariants.length);
                setShuffling(false);
              }, 200);
            };
            return (
              <>
                <View style={styles.copyHeaderRow}>
                  <Text style={styles.sectionLabel}>AI 추천 카피</Text>
                  {plan.copyVariants.length > 1 && (
                    <TouchableOpacity
                      style={styles.shuffleBtn}
                      onPress={handleShuffle}
                      activeOpacity={0.7}
                    >
                      <Shuffle size={12} color={theme.colors.warning[400]} strokeWidth={2} />
                      <Text style={styles.shuffleBtnText}>다른 스타일로 바꾸기</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View key={copyKey} style={[styles.copyCard, shuffling && styles.copyCardShuffling]}>
                  <View style={styles.copyBody}>
                    <View style={styles.copyField}>
                      <Text style={styles.copyFieldLabel}>후킹</Text>
                      <Text style={styles.copyFieldText}>{variant.hook}</Text>
                    </View>
                    <View style={styles.copyField}>
                      <Text style={styles.copyFieldLabel}>본문</Text>
                      <Text style={styles.copyFieldText}>{variant.body}</Text>
                    </View>
                    <View style={styles.copyField}>
                      <Text style={styles.copyFieldLabel}>CTA</Text>
                      <Text style={styles.copyFieldText}>{variant.cta}</Text>
                    </View>
                    <View style={styles.copyField}>
                      <Text style={styles.copyFieldLabel}>해시태그</Text>
                      <Text style={styles.copyFieldText}>{variant.hashtags.join(' ')}</Text>
                    </View>
                    <View style={styles.copyField}>
                      <Text style={styles.copyFieldLabel}>공정위 문구</Text>
                      <Text style={styles.copyFieldText}>{variant.disclosure}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.copyAllBtn}
                      onPress={() => copyFullVariant(variant, copyIndex)}
                      activeOpacity={0.7}
                    >
                      {copiedField === `variant-${copyIndex}` ? (
                        <>
                          <Check size={13} color="#fff" strokeWidth={2.5} />
                          <Text style={styles.copyAllBtnText}>복사됨!</Text>
                        </>
                      ) : (
                        <>
                          <Copy size={13} color="#fff" strokeWidth={2} />
                          <Text style={styles.copyAllBtnText}>전체 복사</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            );
          })()}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.warning[400] + '25',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.spacing.sm + 2,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.warning[400] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  durationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surface,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  durationBtnActive: {
    backgroundColor: theme.colors.warning[500],
    borderColor: theme.colors.warning[400],
  },
  durationBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  durationBtnTextActive: {
    color: '#fff',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.warning[500],
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  generateBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  errorBox: {
    backgroundColor: theme.colors.error[400] + '12',
    borderRadius: theme.radius.sm,
    padding: 10,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.error[400] + '60',
  },
  errorText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    lineHeight: 17,
  },
  progressContainer: {
    marginBottom: theme.spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
  },
  progressPercent: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  progressTrack: {
    height: 4,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.warning[400],
    borderRadius: 2,
  },
  planScroll: {
    maxHeight: 600,
  },
  reasonBox: {
    backgroundColor: theme.colors.warning[400] + '12',
    borderRadius: theme.radius.sm,
    padding: 10,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.warning[400] + '60',
  },
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    marginBottom: 4,
  },
  detailToggleText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  reasonText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 17,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 8,
    marginTop: 4,
  },
  segmentsWrap: {
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  segmentRowCta: {
    backgroundColor: theme.colors.success[400] + '0D',
    borderRadius: 6,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.success[400] + '30',
  },
  segmentLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  segmentLabelCta: {
    color: theme.colors.success[400],
  },
  segmentTime: {
    backgroundColor: theme.colors.warning[400] + '18',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 58,
  },
  segmentTimeCta: {
    backgroundColor: theme.colors.success[400] + '20',
  },
  segmentTimeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
  },
  segmentTimeTextCta: {
    color: theme.colors.success[400],
  },
  segmentBody: {
    flex: 1,
  },
  segmentLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  segmentPurpose: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
    lineHeight: 15,
  },
  infoCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  infoCardTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  infoCardLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
    marginBottom: 2,
  },
  infoCardBody: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
  },
  infoCardTrigger: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  metaChipText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  duckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  duckLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  duckToggle: {
    width: 34,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  duckToggleOn: {
    backgroundColor: theme.colors.success[400],
  },
  duckKnob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  duckKnobOn: {
    alignSelf: 'flex-end',
  },
  copyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 4,
  },
  shuffleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.warning[400] + '15',
    borderWidth: 1,
    borderColor: theme.colors.warning[400] + '30',
  },
  shuffleBtnText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
  },
  copyCardShuffling: {
    opacity: 0.4,
  },
  copyCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  copyBody: {
    padding: 10,
    paddingTop: 0,
    gap: 8,
  },
  copyField: {},
  copyFieldLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 2,
  },
  copyFieldText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 17,
  },
  copyAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    justifyContent: 'center',
    backgroundColor: theme.colors.warning[500],
    borderRadius: theme.radius.sm,
    paddingVertical: 8,
    marginTop: 4,
  },
  copyAllBtnText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  beatSyncCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.accent[400] + '30',
  },
  beatSyncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  beatSyncTitle: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  accuracyBadge: {
    backgroundColor: theme.colors.accent[400] + '20',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  accuracyText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
  },
  beatTimeline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  beatDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.dark.border,
  },
  beatDotDownbeat: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent[400],
  },
  beatDotSnapped: {
    backgroundColor: theme.colors.warning[400],
    transform: [{ scale: 1.3 }],
  },
  beatStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  beatStatLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  beatStatValue: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  beatStatDivider: {
    fontSize: 9,
    color: theme.colors.dark.border,
    marginHorizontal: 2,
  },
  duckingSection: {
    marginBottom: 8,
  },
  duckingLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 4,
  },
  duckingBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: theme.colors.dark.surfaceLight,
    gap: 1,
  },
  duckingSegment: {
    height: '100%',
  },
  duckingSegmentFull: {
    backgroundColor: theme.colors.success[400],
  },
  duckingSegmentLow: {
    backgroundColor: theme.colors.error[400] + '70',
  },
  duckingSegmentFade: {
    opacity: 0.6,
  },
  duckingLegend: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  trackInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  trackInfoText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  trackReasonText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
    lineHeight: 13,
  },
});
