import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, AppState, type AppStateStatus } from 'react-native';
import Svg, { Circle, Path, Ellipse, Defs, RadialGradient, Stop, LinearGradient } from 'react-native-svg';
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
import { Sparkles, Camera, Scan, Film, Trophy, ShoppingBag } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useMascotSettings, shouldShowMascot } from '@/hooks/useMascotSettings';

type ProgressStep = 0 | 1 | 2 | 3;

interface ProgressBarBabyRunProps {
  progressSV: SharedValue<number>;
  step: ProgressStep;
  text: string;
}

const MILESTONES = [
  { icon: Camera, label: '촬영' },
  { icon: Scan, label: '분석' },
  { icon: Film, label: '편집' },
  { icon: Trophy, label: '완료' },
];

const TRACK_WIDTH = 240;
const BABY_SIZE = 44;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export function ProgressBarBabyRun({ progressSV, step, text }: ProgressBarBabyRunProps) {
  const mascot = useMascotSettings();
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
  const prevStep = useRef<ProgressStep>(0);

  const isComplete = step >= 3;
  const babyColor = isComplete ? theme.colors.success[400] : theme.colors.primary[400];
  const maxRange = TRACK_WIDTH - BABY_SIZE - 8;

  const targetX = useDerivedValue(() => {
    if (isComplete) return maxRange;
    return Math.max(0, Math.min(progressSV.value, 1)) * maxRange;
  });

  useEffect(() => {
    babyX.value = withTiming(targetX.value, { duration: 500, easing: Easing.inOut(Easing.quad) });
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
      cancelAnimation(bodyBob);
      cancelAnimation(armLeft);
      cancelAnimation(armRight);
      cancelAnimation(legLeft);
      cancelAnimation(legRight);
      cancelAnimation(headBob);
      return;
    }

    const halfCycle = 700;
    bodyBob.value = withRepeat(withSequence(withTiming(-1.5, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: halfCycle, easing: Easing.inOut(Easing.sin) })), -1, false);
    armLeft.value = withRepeat(withSequence(withTiming(1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }), withTiming(-1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) })), -1, false);
    armRight.value = withRepeat(withSequence(withTiming(-1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }), withTiming(1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) })), -1, false);
    legLeft.value = withRepeat(withSequence(withTiming(1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }), withTiming(-1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) })), -1, false);
    legRight.value = withRepeat(withSequence(withTiming(-1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }), withTiming(1, { duration: halfCycle, easing: Easing.inOut(Easing.sin) })), -1, false);
    headBob.value = withRepeat(withSequence(withTiming(-0.8, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: halfCycle, easing: Easing.inOut(Easing.sin) })), -1, false);
  }, [isComplete, babyX, bodyBob, armLeft, armRight, legLeft, legRight, headBob, eyeScale, mouthOpen, sparkleOpacity]);

  useEffect(() => {
    if (step !== prevStep.current && step > 0 && step <= 3) {
      sparkleOpacity.value = withSequence(withTiming(1, { duration: 150 }), withTiming(0, { duration: 500 }));
    }
    prevStep.current = step;
  }, [step, sparkleOpacity]);

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
      cancelAnimation(babyX); cancelAnimation(bodyBob); cancelAnimation(armLeft);
      cancelAnimation(armRight); cancelAnimation(legLeft); cancelAnimation(legRight);
      cancelAnimation(headBob); cancelAnimation(eyeScale); cancelAnimation(mouthOpen);
      cancelAnimation(sparkleOpacity);
    };
  }, [babyX, bodyBob, armLeft, armRight, legLeft, legRight, headBob, eyeScale, mouthOpen, sparkleOpacity]);

  const babyContainerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: babyX.value }] }));
  const headProps = useAnimatedProps(() => ({ cy: 14 + headBob.value }));
  const bodyProps = useAnimatedProps(() => ({ cy: 30 + bodyBob.value }));
  const leftArmProps = useAnimatedProps(() => { const o = armLeft.value * 4; return { d: `M14 28 Q${10 + o} ${23 - o} ${12 + o} ${18 - o}` }; });
  const rightArmProps = useAnimatedProps(() => { const o = armRight.value * 4; return { d: `M34 28 Q${38 + o} ${23 - o} ${36 + o} ${18 - o}` }; });
  const leftLegProps = useAnimatedProps(() => { const o = legLeft.value * 4; return { d: `M20 35 Q${17 + o} ${40 + o} ${15 + o} ${44 + o}` }; });
  const rightLegProps = useAnimatedProps(() => { const o = legRight.value * 4; return { d: `M28 35 Q${31 + o} ${40 + o} ${33 + o} ${44 + o}` }; });
  const leftEyeProps = useAnimatedProps(() => ({ r: 0.9 * eyeScale.value }));
  const rightEyeProps = useAnimatedProps(() => ({ r: 0.9 * eyeScale.value }));
  const mouthProps = useAnimatedProps(() => ({
    d: mouthOpen.value > 0.5 ? `M21 ${16 - mouthOpen.value} Q24 ${19 + mouthOpen.value} 27 ${16 - mouthOpen.value}` : `M21 15.5 Q24 18 27 15.5`,
  }));
  const sparkleStyle = useAnimatedStyle(() => ({ opacity: sparkleOpacity.value }));

  const sw = 2;

  if (!shouldShowMascot(mascot)) {
    const progressPct = isComplete ? 100 : Math.round(Math.max(0, Math.min(progressSV.value, 1)) * 100);
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{isComplete ? '완료!' : '제작 중...'}</Text>
        <View style={styles.minimalTrackWrap}>
          <View style={styles.minimalTrackBg}>
            <Animated.View style={[styles.minimalTrackFill, { width: `${progressPct}%` }]} />
          </View>
          {MILESTONES.map((m, i) => {
            const pos = (i / (MILESTONES.length - 1)) * 100;
            const reached = step >= i + 1 || isComplete;
            const MIcon = m.icon;
            return (
              <View key={i} style={[styles.minimalMilestone, { left: `${pos}%` }]}>
                <View style={[styles.milestoneDot, reached && styles.milestoneDotReached]}>
                  <MIcon size={12} color={reached ? '#fff' : theme.colors.dark.textFaint} strokeWidth={2.5} />
                </View>
              </View>
            );
          })}
        </View>
        <Text style={styles.subtext}>{text}</Text>
        {isComplete && (
          <View style={styles.trophyRow}>
            <Trophy size={18} color={theme.colors.warning[400]} strokeWidth={2} />
            <Text style={styles.trophyText}>콘텐츠 완성</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{isComplete ? '완료!' : '제작 중...'}</Text>
      <View style={styles.trackWrap}>
        <View style={styles.trackBg}>
          {MILESTONES.map((_, i) => {
            const pos = (i / (MILESTONES.length - 1)) * (TRACK_WIDTH - 20) + 10;
            const reached = step >= i + 1 || isComplete;
            const MIcon = MILESTONES[i].icon;
            return (
              <View key={i} style={[styles.milestone, { left: pos }]}>
                <View style={[styles.milestoneDot, reached && styles.milestoneDotReached]}>
                  <MIcon size={12} color={reached ? '#fff' : theme.colors.dark.textFaint} strokeWidth={2.5} />
                </View>
                <Text style={[styles.milestoneLabel, reached && styles.milestoneLabelReached]}>{MILESTONES[i].label}</Text>
              </View>
            );
          })}
        </View>
        <Animated.View style={[styles.babyWrap, babyContainerStyle]}>
          <Svg width={BABY_SIZE} height={BABY_SIZE} viewBox="0 0 48 48" fill="none">
            <Defs>
              <RadialGradient id="brHead" cx="40%" cy="35%" r="65%">
                <Stop offset="0%" stopColor="#FFE4D0" />
                <Stop offset="60%" stopColor="#F4C4A8" />
                <Stop offset="100%" stopColor="#E0A884" />
              </RadialGradient>
              <RadialGradient id="brBody" cx="50%" cy="30%" r="70%">
                <Stop offset="0%" stopColor="#FFFFFF" />
                <Stop offset="50%" stopColor={babyColor} />
                <Stop offset="100%" stopColor="rgba(0,0,0,0.15)" />
              </RadialGradient>
              <LinearGradient id="brHair" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#B07A4F" />
                <Stop offset="100%" stopColor="#8B5E3C" />
              </LinearGradient>
            </Defs>
            <AnimatedEllipse cx="24" rx="13" ry="6.5" fill="url(#brBody)" animatedProps={bodyProps} />
            <AnimatedPath stroke="#F4C4A8" strokeWidth={3.2} strokeLinecap="round" fill="none" animatedProps={leftArmProps} />
            <AnimatedPath stroke="#F4C4A8" strokeWidth={3.2} strokeLinecap="round" fill="none" animatedProps={rightArmProps} />
            <AnimatedPath stroke="#F4C4A8" strokeWidth={3} strokeLinecap="round" fill="none" animatedProps={leftLegProps} />
            <AnimatedPath stroke="#F4C4A8" strokeWidth={3} strokeLinecap="round" fill="none" animatedProps={rightLegProps} />
            <AnimatedCircle cx="24" r="7.5" fill="url(#brHead)" stroke="#E0A884" strokeWidth={0.6} animatedProps={headProps} />
            <Path d="M16 11 Q18 5 24 5.5 Q30 5 32 11 Q28 8 24 8.5 Q20 8 16 11 Z" fill="url(#brHair)" />
            <Circle cx="19" cy="16" r="2" fill="#FF9999" opacity={0.5} />
            <Circle cx="29" cy="16" r="2" fill="#FF9999" opacity={0.5} />
            <AnimatedCircle cx="21" cy="13.5" fill="#2D2D2D" animatedProps={leftEyeProps} />
            <AnimatedCircle cx="27" cy="13.5" fill="#2D2D2D" animatedProps={rightEyeProps} />
            <AnimatedPath stroke="#C47070" strokeWidth={1.2} strokeLinecap="round" fill="none" animatedProps={mouthProps} />
          </Svg>
          {!isComplete && (
            <View style={styles.shoppingBagWrap}>
              <ShoppingBag size={10} color={theme.colors.warning[400]} strokeWidth={2.5} />
            </View>
          )}
          <Animated.View style={[styles.sparkle, sparkleStyle]} pointerEvents="none">
            <Sparkles size={14} color={theme.colors.warning[400]} strokeWidth={2.5} />
          </Animated.View>
        </Animated.View>
      </View>
      <Text style={styles.subtext}>{text}</Text>
      {isComplete && (
        <View style={styles.trophyRow}>
          <Trophy size={18} color={theme.colors.warning[400]} strokeWidth={2} />
          <Text style={styles.trophyText}>결승선 통과! 콘텐츠 완성</Text>
        </View>
      )}
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
    maxWidth: 360,
    ...theme.shadows.elevated,
  },
  title: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  trackWrap: {
    width: TRACK_WIDTH,
    height: 64,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    width: '100%',
    height: 2,
    backgroundColor: theme.colors.dark.border,
    borderRadius: 1,
    position: 'absolute',
    top: 28,
  },
  milestone: {
    position: 'absolute',
    alignItems: 'center',
    top: -10,
  },
  milestoneDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.dark.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  milestoneDotReached: {
    backgroundColor: theme.colors.primary[600],
    borderColor: theme.colors.primary[600],
  },
  milestoneLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 4,
  },
  milestoneLabelReached: {
    color: theme.colors.primary[300],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  babyWrap: {
    position: 'absolute',
    left: 4,
    top: 8,
  },
  minimalTrackWrap: {
    width: TRACK_WIDTH,
    height: 44,
    justifyContent: 'center',
    position: 'relative',
  },
  minimalTrackBg: {
    width: '100%',
    height: 4,
    backgroundColor: theme.colors.dark.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  minimalTrackFill: {
    height: 4,
    backgroundColor: theme.colors.primary[500],
    borderRadius: 2,
  },
  minimalMilestone: {
    position: 'absolute',
    top: -2,
    transform: [{ translateX: -12 }],
  },
  shoppingBagWrap: {
    position: 'absolute',
    right: -4,
    top: 4,
  },
  sparkle: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
  subtext: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  trophyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  trophyText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
  },
});
