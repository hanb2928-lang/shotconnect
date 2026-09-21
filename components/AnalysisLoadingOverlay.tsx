import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, AppState, type AppStateStatus } from 'react-native';
import Svg, { Circle, Path, Ellipse } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useDerivedValue,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import { Sparkles, Scan, Save, Check } from 'lucide-react-native';
import { theme } from '@/lib/theme';

type ProgressStep = 0 | 1 | 2 | 3;

interface AnalysisLoadingOverlayProps {
  progressSV: SharedValue<number>;
  step: ProgressStep;
  text: string;
  stepLabels?: [string, string, string];
}

const STEP_ICONS = [Scan, Sparkles, Save] as const;
const STEP_TEXTS_DEFAULT: [string, string, string] = ['촬영', '분석', '저장'];

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export function AnalysisLoadingOverlay({
  progressSV,
  step,
  text,
  stepLabels = STEP_TEXTS_DEFAULT,
}: AnalysisLoadingOverlayProps) {
  const babyX = useSharedValue(0);
  const bodyBob = useSharedValue(0);
  const armLeft = useSharedValue(0);
  const armRight = useSharedValue(0);
  const legLeft = useSharedValue(0);
  const legRight = useSharedValue(0);
  const headBob = useSharedValue(0);
  const eyeScale = useSharedValue(1);
  const mouthOpen = useSharedValue(0);
  const sparkleOpacity = useSharedValue(0);
  const sparkleRotate = useSharedValue(0);
  const prevStep = useRef<ProgressStep>(0);

  const isComplete = step >= 3;
  const babyColor = isComplete ? theme.colors.success[400] : theme.colors.primary[400];
  const crawlRange = 180;

  const targetX = useDerivedValue(() => {
    if (isComplete) return crawlRange;
    return Math.max(0, Math.min(progressSV.value, 1)) * crawlRange;
  });

  useEffect(() => {
    babyX.value = withTiming(targetX.value, { duration: 600, easing: Easing.inOut(Easing.quad) });
  }, [targetX.value, babyX]);

  useEffect(() => {
    if (isComplete) {
      mouthOpen.value = withSequence(
        withTiming(3, { duration: 150 }),
        withTiming(0, { duration: 200 }),
        withTiming(2.5, { duration: 120 }),
        withTiming(0, { duration: 300 }),
      );
      eyeScale.value = withSequence(
        withTiming(0.3, { duration: 100 }),
        withTiming(1, { duration: 150 }),
        withTiming(0.3, { duration: 100 }),
        withTiming(1, { duration: 200 }),
      );
      sparkleOpacity.value = withSequence(
        withTiming(1, { duration: 200 }),
        withTiming(0, { duration: 600 }),
      );
      sparkleRotate.value = withSequence(
        withTiming(180, { duration: 400 }),
        withTiming(360, { duration: 400 }),
      );
      cancelAnimation(bodyBob);
      cancelAnimation(armLeft);
      cancelAnimation(armRight);
      cancelAnimation(legLeft);
      cancelAnimation(legRight);
      cancelAnimation(headBob);
      return;
    }

    const halfCycle = 800;
    bodyBob.value = withRepeat(
      withSequence(
        withTiming(-1.5, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
    armLeft.value = withRepeat(
      withSequence(
        withTiming(1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
    armRight.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
    legLeft.value = withRepeat(
      withSequence(
        withTiming(1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
    legRight.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
    headBob.value = withRepeat(
      withSequence(
        withTiming(-0.8, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
  }, [isComplete, babyX, bodyBob, armLeft, armRight, legLeft, legRight, headBob, eyeScale, mouthOpen, sparkleOpacity, sparkleRotate]);

  useEffect(() => {
    if (step !== prevStep.current && step > 0 && step < 3) {
      sparkleOpacity.value = withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(0, { duration: 500 }),
      );
      sparkleRotate.value = withSequence(
        withTiming(120, { duration: 300 }),
        withTiming(0, { duration: 400 }),
      );
    }
    prevStep.current = step;
  }, [step, sparkleOpacity, sparkleRotate]);

  // Pause infinite animations when app goes to background to prevent CPU drain
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        cancelAnimation(bodyBob);
        cancelAnimation(armLeft);
        cancelAnimation(armRight);
        cancelAnimation(legLeft);
        cancelAnimation(legRight);
        cancelAnimation(headBob);
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => { sub.remove(); };
  }, [bodyBob, armLeft, armRight, legLeft, legRight, headBob]);

  useEffect(() => {
    return () => {
      cancelAnimation(babyX);
      cancelAnimation(bodyBob);
      cancelAnimation(armLeft);
      cancelAnimation(armRight);
      cancelAnimation(legLeft);
      cancelAnimation(legRight);
      cancelAnimation(headBob);
      cancelAnimation(eyeScale);
      cancelAnimation(mouthOpen);
      cancelAnimation(sparkleOpacity);
      cancelAnimation(sparkleRotate);
    };
  }, [babyX, bodyBob, armLeft, armRight, legLeft, legRight, headBob, eyeScale, mouthOpen, sparkleOpacity, sparkleRotate]);

  const babyContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: babyX.value }],
  }));

  const headProps = useAnimatedProps(() => ({
    cy: 14 + headBob.value,
  }));
  const bodyProps = useAnimatedProps(() => ({
    cy: 30 + bodyBob.value,
  }));
  const leftArmProps = useAnimatedProps(() => {
    const o = armLeft.value * 4;
    return { d: `M14 28 Q${10 + o} ${23 - o} ${12 + o} ${18 - o}` };
  });
  const rightArmProps = useAnimatedProps(() => {
    const o = armRight.value * 4;
    return { d: `M34 28 Q${38 + o} ${23 - o} ${36 + o} ${18 - o}` };
  });
  const leftLegProps = useAnimatedProps(() => {
    const o = legLeft.value * 4;
    return { d: `M20 35 Q${17 + o} ${40 + o} ${15 + o} ${44 + o}` };
  });
  const rightLegProps = useAnimatedProps(() => {
    const o = legRight.value * 4;
    return { d: `M28 35 Q${31 + o} ${40 + o} ${33 + o} ${44 + o}` };
  });
  const leftEyeProps = useAnimatedProps(() => ({
    r: 0.9 * eyeScale.value,
  }));
  const rightEyeProps = useAnimatedProps(() => ({
    r: 0.9 * eyeScale.value,
  }));
  const mouthProps = useAnimatedProps(() => ({
    d: mouthOpen.value > 0.5
      ? `M21 ${16 - mouthOpen.value} Q24 ${19 + mouthOpen.value} 27 ${16 - mouthOpen.value}`
      : `M21 15.5 Q24 18 27 15.5`,
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: sparkleOpacity.value,
    transform: [{ rotate: `${sparkleRotate.value}deg` }],
  }));

  const sw = 2;

  return (
    <View style={styles.card}>
      <View style={styles.babyTrackWrap}>
        <View style={styles.babyTrack}>
          <View style={styles.babyTrackLine} />
          <View style={styles.babyStartDot} />
          <View style={styles.babyEndDot} />
        </View>
        <Animated.View style={[styles.babyWrap, babyContainerStyle]}>
          <Svg width={48} height={48} viewBox="0 0 48 48" fill="none">
            <AnimatedCircle cx="24" r="7" stroke={babyColor} strokeWidth={sw} fill="none" animatedProps={headProps} />
            <AnimatedPath stroke={babyColor} strokeWidth={sw * 0.7} strokeLinecap="round" fill="none" animatedProps={mouthProps} />
            <AnimatedCircle cx="21.5" cy="13" fill={babyColor} animatedProps={leftEyeProps} />
            <AnimatedCircle cx="26.5" cy="13" fill={babyColor} animatedProps={rightEyeProps} />
            <Circle cx="19" cy="16" r="1.2" fill={babyColor} opacity={0.3} />
            <Circle cx="29" cy="16" r="1.2" fill={babyColor} opacity={0.3} />
            <AnimatedEllipse cx="24" rx="12" ry="5" stroke={babyColor} strokeWidth={sw} fill="none" animatedProps={bodyProps} />
            <AnimatedPath stroke={babyColor} strokeWidth={sw * 0.8} strokeLinecap="round" fill="none" animatedProps={leftArmProps} />
            <AnimatedPath stroke={babyColor} strokeWidth={sw * 0.8} strokeLinecap="round" fill="none" animatedProps={rightArmProps} />
            <AnimatedPath stroke={babyColor} strokeWidth={sw * 0.8} strokeLinecap="round" fill="none" animatedProps={leftLegProps} />
            <AnimatedPath stroke={babyColor} strokeWidth={sw * 0.8} strokeLinecap="round" fill="none" animatedProps={rightLegProps} />
          </Svg>
          <Animated.View style={[styles.sparkle, sparkleStyle]} pointerEvents="none">
            <Sparkles size={16} color={theme.colors.warning[400]} strokeWidth={2.5} />
          </Animated.View>
        </Animated.View>
      </View>

      <Text style={styles.title}>{isComplete ? '분석 완료!' : '제품 분석 중'}</Text>
      <Text style={styles.subtext}>{text}</Text>

      <View style={styles.stepsRow}>
        {STEP_ICONS.map((Icon, i) => {
          const stepNum = i + 1;
          const active = step >= stepNum;
          const IconToRender = active ? Check : Icon;
          return (
            <View key={i} style={styles.stepItem}>
              <View style={[styles.stepCircle, active && styles.stepCircleActive]}>
                <IconToRender
                  size={12}
                  color={active ? '#fff' : theme.colors.dark.textFaint}
                  strokeWidth={2.5}
                />
              </View>
              {i < 2 && (
                <View style={[styles.stepConnector, step >= stepNum + 1 && styles.stepConnectorActive]} />
              )}
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>
                {stepLabels[i]}
              </Text>
            </View>
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
    gap: theme.spacing.md,
    width: '88%',
    maxWidth: 340,
    ...theme.shadows.elevated,
  },
  babyTrackWrap: {
    width: 220,
    height: 56,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  babyTrack: {
    width: '100%',
    height: 56,
    justifyContent: 'center',
  },
  babyTrackLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 38,
    height: 2,
    backgroundColor: theme.colors.dark.border,
    borderRadius: 1,
  },
  babyStartDot: {
    position: 'absolute',
    left: 4,
    top: 34,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.dark.border,
  },
  babyEndDot: {
    position: 'absolute',
    right: 4,
    top: 34,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.success[400] + '40',
    borderWidth: 2,
    borderColor: theme.colors.success[400],
  },
  babyWrap: {
    position: 'absolute',
    left: 8,
    top: 4,
  },
  sparkle: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  title: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtext: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    marginTop: theme.spacing.xs,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  stepCircleActive: {
    backgroundColor: theme.colors.primary[600],
    borderColor: theme.colors.primary[600],
  },
  stepConnector: {
    width: 28,
    height: 2,
    backgroundColor: theme.colors.dark.border,
    marginHorizontal: 2,
  },
  stepConnectorActive: {
    backgroundColor: theme.colors.primary[500],
  },
  stepLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    position: 'absolute',
    top: 30,
    width: 26,
    textAlign: 'center',
  },
  stepLabelActive: {
    color: theme.colors.primary[300],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
});
