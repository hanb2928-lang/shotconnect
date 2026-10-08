import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, type DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  cancelAnimation,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { Check, Loader2 } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  resolveVideoGenSteps,
  getCurrentStepIndex,
  stepToProgress,
  type VideoGenStep,
} from '@/lib/videoGenSteps';
import type { VideoGenProgress } from '@/lib/aiVideoPipeline';

interface VideoGenStepTrackerProps {
  progress: VideoGenProgress | null;
  variant?: 'overlay' | 'inline';
}

const STEP_ICONS: Record<string, string> = {
  analyze: '🔍',
  hook: '🎯',
  plan: '🎬',
  submit: '📤',
  render: '🎞️',
  finalize: '✨',
};

const RENDERING_MESSAGES = [
  '시선 강탈 훅 조합 중...',
  'AI가 감성 시퀀스 렌더링 중...',
  '최적의 컷 전환 타이밍 계산 중...',
  '자막 싱크 맞추는 중...',
  'BGM과 영상 리듬 동기화 중...',
  '화면 전환 효과 적용 중...',
  '색감 보정 및 그레이딩 중...',
  '마지막 프레임 합성 중...',
];

export function VideoGenStepTracker({ progress, variant = 'overlay' }: VideoGenStepTrackerProps) {
  const steps = resolveVideoGenSteps(progress);
  const activeIdx = getCurrentStepIndex(progress);
  const rawProgress = Number(progress?.progress ?? 0);
  const progressPercent = Math.max(0, Math.min(100, Math.round((isNaN(rawProgress) ? 0 : rawProgress) * 100) || 0));
  const [activityMsg, setActivityMsg] = useState('');
  const [displayPercent, setDisplayPercent] = useState(0);

  const isRendering = activeIdx >= 0 && progress?.phase !== 'completed' && progress?.phase !== 'error';
  const isCompleted = progress?.phase === 'completed';

  // Animated progress bar via Reanimated SharedValue for smooth transitions.
  // The bar width is driven by a SharedValue that eases toward the target
  // percentage, eliminating the janky stepwise jumps of the old static View.
  const barWidthSV = useSharedValue(0);
  const [creepFloor, setCreepFloor] = useState(0);

  // Soft creep guard: every 2 seconds, nudge a floor value up by 3 points so
  // the bar never visually freezes even when the server is silent. The cap is
  // bound to the server step progress so the bar cannot race to 90% while the
  // step icons are still on an earlier stage (the desync bug).
  const serverStepProg = progress?.serverStep
    ? stepToProgress(progress.serverStep)
    : null;
  // Don't bind the creep cap to the server step — if the websocket drops,
  // the stale server step would clamp the bar below its actual position.
  // Instead, always allow creep up to 90% so the bar stays alive while
  // the step icons are driven by resolveVideoGenSteps (which now also
  // factors in the raw percentage).
  const creepCap = 90;

  useEffect(() => {
    if (!isRendering) {
      setCreepFloor(0);
      return;
    }
    const interval = setInterval(() => {
      setCreepFloor((prev) => Math.min(prev + 3, creepCap));
    }, 2000);
    return () => clearInterval(interval);
  }, [isRendering, creepCap]);

  // Drive the animated bar toward the max of (realProgress, creepFloor).
  // On completion, snap to 100% immediately.
  useEffect(() => {
    const target = isCompleted ? 100 : Math.max(progressPercent, creepFloor);
    const safeTarget = Math.max(0, Math.min(100, isNaN(target) ? 0 : target));
    barWidthSV.value = withTiming(safeTarget, {
      duration: isCompleted ? 300 : 500,
      easing: Easing.out(Easing.quad),
    });
    setDisplayPercent(safeTarget);
  }, [progressPercent, creepFloor, isCompleted, barWidthSV]);

  const pulseSV = useSharedValue(0);
  const prevActiveRef = useRef(-1);
  const msgIdxRef = useRef(0);

  useEffect(() => {
    if (activeIdx !== prevActiveRef.current) {
      prevActiveRef.current = activeIdx;
      pulseSV.value = withSequence(
        withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) }),
        withTiming(0.6, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      );
    }
  }, [activeIdx, pulseSV]);

  useEffect(() => {
    if (activeIdx >= 0 && progress?.phase !== 'completed' && progress?.phase !== 'error') {
      pulseSV.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(pulseSV);
      pulseSV.value = withTiming(0, { duration: 200 });
    }
  }, [activeIdx, progress?.phase, pulseSV]);

  useEffect(() => {
    return () => { cancelAnimation(pulseSV); };
  }, [pulseSV]);

  // Rotating activity messages during rendering to reduce perceived wait.
  useEffect(() => {
    if (!isRendering) {
      setActivityMsg('');
      return;
    }
    msgIdxRef.current = 0;
    setActivityMsg(RENDERING_MESSAGES[0]);
    const interval = setInterval(() => {
      msgIdxRef.current = (msgIdxRef.current + 1) % RENDERING_MESSAGES.length;
      setActivityMsg(RENDERING_MESSAGES[msgIdxRef.current]);
    }, 3500);
    return () => clearInterval(interval);
  }, [isRendering]);

  const activePulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseSV.value, [0, 1], [0, 0.6]),
    transform: [{ scale: interpolate(pulseSV.value, [0, 1], [1, 1.15]) }],
  }));

  const animatedBarStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, barWidthSV.value))}%` as unknown as DimensionValue,
  }));

  const isOverlay = variant === 'overlay';
  const containerStyle = isOverlay ? styles.overlayContainer : styles.inlineContainer;
  const isError = progress?.phase === 'error';

  return (
    <View style={containerStyle} pointerEvents={isOverlay ? 'none' : 'auto'}>
      <View style={styles.headerRow}>
        <Text style={styles.titleText}>
          {isCompleted ? '영상 생성 완료' : isError ? '생성 실패' : 'AI 영상 생성 진행 중'}
        </Text>
        <Text style={styles.percentText}>{displayPercent}%</Text>
      </View>

      <View style={styles.progressBarTrack}>
        <Animated.View
          style={[
            styles.progressBarFill,
            animatedBarStyle,
            {
              backgroundColor: isError
                ? theme.colors.error[400]
                : isCompleted
                  ? theme.colors.success[400]
                  : theme.colors.primary[400],
            },
          ]}
        />
      </View>

      {isOverlay && steps[activeIdx] && !isCompleted && !isError && (
        <Text style={styles.currentStepText} numberOfLines={2}>
          {steps[activeIdx].label} — {steps[activeIdx].description}
        </Text>
      )}

      {activityMsg && !isCompleted && !isError && (
        <Text style={styles.activityText} numberOfLines={1}>
          {activityMsg}
        </Text>
      )}

      <View style={styles.stepsRow}>
        {steps.map((step: VideoGenStep, idx: number) => {
          const isActive = step.status === 'active';
          const isDone = step.status === 'done';
          const showConnector = idx < steps.length - 1;

          return (
            <React.Fragment key={step.id}>
              <View style={styles.stepItem}>
                <View style={styles.stepIconWrap}>
                  {isActive && !isError && (
                    <Animated.View
                      style={[styles.stepPulseRing, activePulseStyle, { borderColor: theme.colors.primary[400] }]}
                    />
                  )}
                  <View
                    style={[
                      styles.stepCircle,
                      isDone && styles.stepCircleDone,
                      isActive && !isError && styles.stepCircleActive,
                      isError && idx <= activeIdx && styles.stepCircleError,
                    ]}
                  >
                    {isDone ? (
                      <Check size={11} color={theme.colors.dark.surface} strokeWidth={3} />
                    ) : isActive && !isError ? (
                      <Loader2 size={11} color={theme.colors.dark.surface} strokeWidth={2.5} />
                    ) : (
                      <Text style={styles.stepEmoji}>{STEP_ICONS[step.id] ?? '•'}</Text>
                    )}
                  </View>
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    isDone && styles.stepLabelDone,
                    isActive && styles.stepLabelActive,
                    !isDone && !isActive && styles.stepLabelPending,
                  ]}
                  numberOfLines={isOverlay ? 1 : 2}
                >
                  {step.label}
                </Text>
              </View>
              {showConnector && (
                <View
                  style={[
                    styles.stepConnector,
                    isDone && styles.stepConnectorDone,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {progress?.elapsedSec != null && progress.elapsedSec > 0 && (
        <Text style={styles.elapsedText}>{progress.elapsedSec}초 경과</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(10, 10, 15, 0.88)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 6,
  },
  inlineContainer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '30',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  percentText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  progressBarTrack: {
    width: '100%',
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  currentStepText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 14,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
  },
  stepIconWrap: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepPulseRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  stepCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleDone: {
    backgroundColor: theme.colors.success[400],
  },
  stepCircleActive: {
    backgroundColor: theme.colors.primary[400],
  },
  stepCircleError: {
    backgroundColor: theme.colors.error[400],
  },
  stepEmoji: {
    fontSize: 9,
    lineHeight: 11,
  },
  stepLabel: {
    fontSize: 7.5,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily.regular,
  },
  stepLabelDone: {
    color: theme.colors.success[400],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  stepLabelActive: {
    color: theme.colors.primary[300],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  stepLabelPending: {
    color: 'rgba(255,255,255,0.3)',
  },
  stepConnector: {
    width: 12,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 1,
    marginBottom: 14,
  },
  stepConnectorDone: {
    backgroundColor: theme.colors.success[400] + '60',
  },
  elapsedText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
  activityText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[300] + 'CC',
    lineHeight: 14,
    marginTop: 2,
  },
});
