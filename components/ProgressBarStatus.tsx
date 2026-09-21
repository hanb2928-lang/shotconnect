import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, AppState, type AppStateStatus, type DimensionValue } from 'react-native';
import Svg, { Circle, Path, Ellipse, Defs, RadialGradient, Stop, LinearGradient } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useDerivedValue,
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  Easing,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import { theme } from '@/lib/theme';

type ProgressStep = 0 | 1 | 2 | 3;

interface ProgressBarStatusProps {
  progressSV: SharedValue<number>;
  step: ProgressStep;
  text: string;
}

const STAGES = [
  { range: [0, 25] as const, label: '준비 중...', bubble: '...', eyeState: 'sleepy' as const },
  { range: [26, 50] as const, label: '분석 중...', bubble: '음마?', eyeState: 'curious' as const },
  { range: [51, 75] as const, label: '제작 중...', bubble: '까꿍!', eyeState: 'happy' as const },
  { range: [76, 100] as const, label: '완료!', bubble: '대박나세요!', eyeState: 'excited' as const },
];

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export function ProgressBarStatus({ progressSV, step, text }: ProgressBarStatusProps) {
  const bubbleOpacity = useSharedValue(0);
  const bubbleScale = useSharedValue(0.5);
  const bodyBob = useSharedValue(0);
  const eyeScale = useSharedValue(1);
  const mouthOpen = useSharedValue(0);
  const progressWidth = useSharedValue(0);
  const blinkTimer = useSharedValue(0);
  const prevStep = useRef<ProgressStep>(0);

  const isComplete = step >= 3;

  const rawProgress = useDerivedValue(() => Math.max(0, Math.min(progressSV.value, 1)));
  const stageIndex = useDerivedValue(() => {
    const pct = rawProgress.value * 100;
    if (pct <= 25) return 0;
    if (pct <= 50) return 1;
    if (pct <= 75) return 2;
    return 3;
  });
  const progressPct = useDerivedValue(() => `${rawProgress.value * 100}%`);

  useEffect(() => {
    progressWidth.value = withTiming(rawProgress.value * 100, { duration: 400, easing: Easing.out(Easing.quad) });
  }, [rawProgress.value, progressWidth]);

  useEffect(() => {
    bodyBob.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
    eyeScale.value = withRepeat(
      withSequence(
        withDelay(2000, withTiming(0.2, { duration: 80 })),
        withTiming(1, { duration: 120 }),
        withDelay(3000, withTiming(0.2, { duration: 80 })),
        withTiming(1, { duration: 120 }),
      ),
      -1, false,
    );
    blinkTimer.value = 0;
  }, [bodyBob, eyeScale, blinkTimer]);

  useEffect(() => {
    if (step !== prevStep.current || isComplete) {
      const newStage = isComplete ? 3 : Math.min(step, 2);
      const bubbleText = STAGES[newStage].bubble;

      bubbleOpacity.value = withSequence(
        withTiming(0, { duration: 150 }),
        withTiming(1, { duration: 200 }),
      );
      bubbleScale.value = withSequence(
        withTiming(0.3, { duration: 150 }),
        withTiming(1, { duration: 250, easing: Easing.out(Easing.back(1.5)) }),
      );

      if (newStage >= 2) {
        mouthOpen.value = withSequence(
          withTiming(2.5, { duration: 200 }),
          withTiming(0, { duration: 300 }),
          withTiming(2, { duration: 150 }),
          withTiming(0, { duration: 400 }),
        );
      }
    }
    prevStep.current = step;
  }, [step, isComplete, bubbleOpacity, bubbleScale, mouthOpen]);

  // Pause infinite animations when app goes to background to prevent CPU drain
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        cancelAnimation(bodyBob);
        cancelAnimation(eyeScale);
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => { sub.remove(); };
  }, [bodyBob, eyeScale]);

  useEffect(() => {
    return () => {
      cancelAnimation(bodyBob); cancelAnimation(eyeScale); cancelAnimation(mouthOpen);
      cancelAnimation(bubbleOpacity); cancelAnimation(bubbleScale); cancelAnimation(progressWidth);
    };
  }, [bodyBob, eyeScale, mouthOpen, bubbleOpacity, bubbleScale, progressWidth]);

  const headProps = useAnimatedProps(() => ({ cy: 14 + bodyBob.value }));
  const bodyProps = useAnimatedProps(() => ({ cy: 30 + bodyBob.value }));
  const leftEyeProps = useAnimatedProps(() => ({ r: 0.9 * eyeScale.value }));
  const rightEyeProps = useAnimatedProps(() => ({ r: 0.9 * eyeScale.value }));
  const mouthProps = useAnimatedProps(() => ({
    d: mouthOpen.value > 0.5
      ? `M21 ${16 - mouthOpen.value} Q24 ${19 + mouthOpen.value} 27 ${16 - mouthOpen.value}`
      : `M21 15.5 Q24 18 27 15.5`,
  }));
  const bubbleAnimStyle = useAnimatedStyle(() => ({
    opacity: bubbleOpacity.value,
    transform: [{ scale: bubbleScale.value }],
  }));
  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%` as unknown as DimensionValue,
  }));
  const progressLabelStyle = useAnimatedStyle(() => ({
    opacity: rawProgress.value > 0.05 ? 1 : 0,
  }));

  const babyColor = isComplete ? theme.colors.success[400] : theme.colors.primary[400];
  const sw = 2;

  const currentStage = STAGES[Math.min(step, 3)];

  return (
    <View style={styles.card}>
      <View style={styles.babyRow}>
        <View style={styles.babyFaceWrap}>
          <Svg width={56} height={56} viewBox="0 0 48 48" fill="none">
            <Defs>
              <RadialGradient id="sbHead" cx="40%" cy="35%" r="65%">
                <Stop offset="0%" stopColor="#FFE4D0" />
                <Stop offset="60%" stopColor="#F4C4A8" />
                <Stop offset="100%" stopColor="#E0A884" />
              </RadialGradient>
              <RadialGradient id="sbBody" cx="50%" cy="30%" r="70%">
                <Stop offset="0%" stopColor="#FFFFFF" />
                <Stop offset="50%" stopColor={babyColor} />
                <Stop offset="100%" stopColor="rgba(0,0,0,0.15)" />
              </RadialGradient>
              <LinearGradient id="sbHair" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#B07A4F" />
                <Stop offset="100%" stopColor="#8B5E3C" />
              </LinearGradient>
            </Defs>
            <AnimatedEllipse cx="24" rx="13" ry="6.5" fill="url(#sbBody)" animatedProps={bodyProps} />
            <AnimatedCircle cx="24" r="7.5" fill="url(#sbHead)" stroke="#E0A884" strokeWidth={0.6} animatedProps={headProps} />
            <Path d="M16 11 Q18 5 24 5.5 Q30 5 32 11 Q28 8 24 8.5 Q20 8 16 11 Z" fill="url(#sbHair)" />
            <Circle cx="19" cy="16" r="2" fill="#FF9999" opacity={0.5} />
            <Circle cx="29" cy="16" r="2" fill="#FF9999" opacity={0.5} />
            <AnimatedCircle cx="21" cy="13.5" fill="#2D2D2D" animatedProps={leftEyeProps} />
            <AnimatedCircle cx="27" cy="13.5" fill="#2D2D2D" animatedProps={rightEyeProps} />
            <AnimatedPath stroke="#C47070" strokeWidth={1.2} strokeLinecap="round" fill="none" animatedProps={mouthProps} />
          </Svg>
        </View>
        <Animated.View style={[styles.speechBubble, bubbleAnimStyle]}>
          <Text style={styles.speechBubbleText}>{currentStage.bubble}</Text>
        </Animated.View>
      </View>

      <Text style={styles.stageLabel}>{isComplete ? STAGES[3].label : currentStage.label}</Text>
      <Text style={styles.subtext}>{text}</Text>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progressBarStyle]} />
      </View>
      <Animated.Text style={[styles.progressPct, progressLabelStyle]}>{Math.round(rawProgress.value * 100)}%</Animated.Text>

      <View style={styles.stageDots}>
        {STAGES.map((s, i) => {
          const reached = step >= i + 1 || (isComplete && i === 3);
          return (
            <View key={i} style={[styles.stageDot, reached && styles.stageDotActive]} />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: 10,
    width: '88%',
    maxWidth: 340,
    ...theme.shadows.elevated,
  },
  babyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  babyFaceWrap: {
    width: 56,
    height: 56,
  },
  speechBubble: {
    backgroundColor: theme.colors.primary[500],
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    maxWidth: 160,
  },
  speechBubbleText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  stageLabel: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtext: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: theme.colors.primary[500],
  },
  progressPct: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  stageDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.dark.border,
  },
  stageDotActive: {
    backgroundColor: theme.colors.primary[500],
  },
});
