import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { theme } from '@/lib/theme';
import { CrawlingBaby } from '@/components/CrawlingBaby';

type LoadingScreenProps = {
  message?: string;
  fullScreen?: boolean;
};

export function LoadingScreen({ message = '불러오는 중...', fullScreen = true }: LoadingScreenProps) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);
  const wave1 = useSharedValue(0);
  const wave2 = useSharedValue(0);
  const wave3 = useSharedValue(0);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.6, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );

    const waveConfig = { duration: 1600, easing: Easing.inOut(Easing.sin) };
    wave1.value = withRepeat(withTiming(1, waveConfig), -1, false);
    wave2.value = withRepeat(withTiming(1, { ...waveConfig, duration: 1800 }), -1, false);
    wave3.value = withRepeat(withTiming(1, { ...waveConfig, duration: 2000 }), -1, false);

    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      cancelAnimation(wave1);
      cancelAnimation(wave2);
      cancelAnimation(wave3);
    };
  }, [pulseScale, pulseOpacity, wave1, wave2, wave3]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const wave1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: wave1.value * 40 - 20 }],
    opacity: 0.15 + wave1.value * 0.15,
  }));

  const wave2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: wave2.value * 50 - 25 }],
    opacity: 0.1 + wave2.value * 0.15,
  }));

  const wave3Style = useAnimatedStyle(() => ({
    transform: [{ translateX: wave3.value * 60 - 30 }],
    opacity: 0.08 + wave3.value * 0.12,
  }));

  return (
    <View style={[styles.container, !fullScreen && styles.inline]}>
      <View style={styles.babyWrap}>
        <Animated.View style={[styles.pulseRing, pulseStyle]} />
        <View style={styles.waveRow}>
          <Animated.View style={[styles.waveBar, styles.waveBar1, wave1Style]} />
          <Animated.View style={[styles.waveBar, styles.waveBar2, wave2Style]} />
          <Animated.View style={[styles.waveBar, styles.waveBar3, wave3Style]} />
        </View>
        <View style={styles.babyInner}>
          <CrawlingBaby size={56} color={theme.colors.primary[400]} crawlWidth={80} speed={1600} />
        </View>
      </View>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  inline: {
    flex: undefined,
    paddingVertical: theme.spacing.xl,
  },
  babyWrap: {
    width: 180,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: theme.colors.primary[400],
  },
  waveRow: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  waveBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
  },
  waveBar1: {
    backgroundColor: theme.colors.primary[400],
  },
  waveBar2: {
    backgroundColor: theme.colors.accent[400],
  },
  waveBar3: {
    backgroundColor: theme.colors.primary[300],
  },
  babyInner: {
    zIndex: 1,
  },
  text: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
});
