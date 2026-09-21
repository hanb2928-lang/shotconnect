import { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  useAnimatedStyle,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

type CrawlingBabyProps = {
  size?: number;
  color?: string;
  crawlWidth?: number;
  speed?: number;
};

const babyImage = require('@/assets/images/baby-crawl.webp');

export function CrawlingBaby({
  size = 64,
  color = '#5b9bd5',
  crawlWidth = 120,
  speed = 1800,
}: CrawlingBabyProps) {
  const bodyBob = useSharedValue(0);
  const translateX = useSharedValue(0);

  useEffect(() => {
    const halfCycle = speed / 2;

    bodyBob.value = withRepeat(
      withSequence(
        withTiming(-2, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );

    const crawlDuration = speed * 4;
    translateX.value = withRepeat(
      withSequence(
        withTiming(crawlWidth, { duration: crawlDuration, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: crawlDuration, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(bodyBob);
      cancelAnimation(translateX);
    };
  }, [bodyBob, translateX, speed, crawlWidth]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: bodyBob.value },
    ],
  }));

  return (
    <Animated.View style={containerStyle}>
      <Image
        source={babyImage}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="아기 캐릭터"
      />
    </Animated.View>
  );
}
