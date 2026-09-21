import * as React from 'react';
import { Image, View, StyleSheet } from 'react-native';

type BabyIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const babyImage = require('@/assets/images/baby-crawl.webp');

export function BabyIcon({ size = 24, color, strokeWidth }: BabyIconProps) {
  return (
    <Image
      source={babyImage}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel="아기 캐릭터"
    />
  );
}
