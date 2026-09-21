import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Coins, Plus } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { getCreditBalance, type CreditBalance } from '@/lib/credits';

interface CreditBalanceBadgeProps {
  onPress?: () => void;
  compact?: boolean;
  layout?: 'horizontal' | 'stacked';
}

export function CreditBalanceBadge({ onPress, compact = false, layout = 'horizontal' }: CreditBalanceBadgeProps) {
  const [balance, setBalance] = useState<CreditBalance | null>(null);

  const loadBalance = useCallback(async () => {
    try {
      const data = await getCreditBalance();
      setBalance(data);
    } catch {
      // keep last known balance on transient error
    }
  }, []);

  useEffect(() => {
    loadBalance();
    const interval = setInterval(loadBalance, 15000);
    return () => clearInterval(interval);
  }, [loadBalance]);

  const isLow = balance !== null && balance.balance <= 3;
  const isStacked = layout === 'stacked';

  if (isStacked) {
    return (
      <TouchableOpacity
        style={[styles.stackedContainer, isLow && styles.containerLow]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View style={styles.stackedIconRow}>
          <Coins size={20} color={isLow ? theme.colors.error[400] : theme.colors.warning[400]} strokeWidth={2} />
          <View style={[styles.plusIcon, styles.plusIconStacked]}>
            <Plus size={11} color="#fff" strokeWidth={2.5} />
          </View>
        </View>
        <Text style={[styles.stackedBalance, isLow && styles.balanceLow]}>
          {balance ? `${balance.balance.toLocaleString()} 크레딧` : '... 크레딧'}
        </Text>
        <Text style={styles.stackedLabel}>크레딧 충전</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.container, compact && styles.containerCompact, isLow && styles.containerLow]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Coins size={compact ? 14 : 16} color={isLow ? theme.colors.error[400] : theme.colors.warning[400]} strokeWidth={2} />
      <Text style={[styles.balance, isLow && styles.balanceLow]}>
        {balance ? balance.balance.toLocaleString() : '...'}
      </Text>
      {!compact && <Text style={styles.unit}>크레딧 충전</Text>}
      <View style={[styles.plusIcon, compact && styles.plusIconCompact]}>
        <Plus size={compact ? 10 : 12} color="#fff" strokeWidth={2.5} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  containerCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  containerLow: {
    backgroundColor: theme.colors.error[500] + '15',
  },
  balance: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  balanceLow: {
    color: theme.colors.error[400],
  },
  unit: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  plusIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  plusIconCompact: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  // Stacked layout (icon on top, text below)
  stackedContainer: {
    alignItems: 'center',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    gap: 4,
    marginTop: theme.spacing.sm,
  },
  stackedIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  plusIconStacked: {
    marginLeft: 0,
  },
  stackedBalance: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  stackedLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
});
