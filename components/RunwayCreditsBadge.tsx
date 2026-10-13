import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Zap } from 'lucide-react-native';
import { theme } from '@/lib/theme';

export interface RunwayCreditsBadgeProps {
  credits: number | null;
  loading: boolean;
  isLow: boolean;
  isCritical: boolean;
  threshold: number;
}

export function RunwayCreditsBadge({
  credits,
  loading,
  isLow,
  isCritical,
  threshold,
}: RunwayCreditsBadgeProps) {
  const bgColor = isCritical
    ? theme.colors.error[500] + '20'
    : isLow
      ? theme.colors.warning[500] + '18'
      : theme.colors.dark.surfaceLight;
  const borderColor = isCritical
    ? theme.colors.error[400] + '50'
    : isLow
      ? theme.colors.warning[400] + '40'
      : theme.colors.dark.border;
  const textColor = isCritical
    ? theme.colors.error[400]
    : isLow
      ? theme.colors.warning[400]
      : theme.colors.dark.textDim;
  const iconColor = isCritical
    ? theme.colors.error[400]
    : isLow
      ? theme.colors.warning[400]
      : theme.colors.success[400];

  const label = loading
    ? '잔여 크레딧 확인 중...'
    : credits === null
      ? 'Runway 크레딧 조회 불가'
      : `Runway 잔여 ${credits}개${isLow ? ' · 충전 필요' : ''}`;

  return (
    <View style={[styles.badge, { backgroundColor: bgColor, borderColor }]}>
      <Zap size={12} color={iconColor} strokeWidth={2.5} />
      <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
      {!loading && credits !== null && isLow && (
        <View style={[styles.dot, { backgroundColor: isCritical ? theme.colors.error[400] : theme.colors.warning[400] }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10.5,
    fontFamily: theme.typography.fontFamily.medium,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
  },
});
