import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Easing } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import { Check, Loader2 } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  resolveVideoGenSteps,
  getCurrentStepIndex,
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

export function VideoGenStepTracker({ progress, variant = 'overlay' }: VideoGenStepTrackerProps) {
  const steps = resolveVideoGenSteps(progress);
  const activeIdx = getCurrentStepIndex(progress);
  const progressPercent = Math.round((progress?.progress ?? 0) * 100);

  const pulseSV = useSharedValue(0);
  const prevActiveRef = useRef(-1);

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

  const activePulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseSV.value, [0, 1], [0, 0.6]),
    transform: [{ scale: interpolate(pulseSV.value, [0, 1], [1, 1.15]) }],
  }));

  const isOverlay = variant === 'overlay';
  const containerStyle = isOverlay ? styles.overlayContainer : styles.inlineContainer;
  const isCompleted = progress?.phase === 'completed';
  const isError = progress?.phase === 'error';

  return (
    <View style={containerStyle} pointerEvents={isOverlay ? 'none' : 'auto'}>
      <View style={styles.headerRow}>
        <Text style={styles.titleText}>
          {isCompleted ? '영상 생성 완료' : isError ? '생성 실패' : 'AI 영상 생성 진행 중'}
        </Text>
        <Text style={styles.percentText}>{progressPercent}%</Text>
      </View>

      <View style={styles.progressBarTrack}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${progressPercent}%`,
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
});
