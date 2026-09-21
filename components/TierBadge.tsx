import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Crown, ChevronRight } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { getOrCreateTier, getTierProgress, TIER_CONFIG, type CreatorTier } from '@/lib/creatorTier';

export function TierBadge() {
  const [tier, setTier] = useState<CreatorTier | null>(null);

  useEffect(() => {
    (async () => {
      const t = await getOrCreateTier();
      setTier(t);
    })();
  }, []);

  if (!tier) return null;

  const config = TIER_CONFIG[tier.tier_level];
  const progress = getTierProgress(tier);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.tierIconWrap, { backgroundColor: config.color + '30' }]}>
          <Crown size={16} color={config.color} strokeWidth={2} />
        </View>
        <View style={styles.tierInfo}>
          <Text style={styles.tierLabel}>크리에이터 등급</Text>
          <Text style={[styles.tierName, { color: config.color }]}>
            {config.emoji} {config.label}
          </Text>
        </View>
      </View>

      {/* Progress to next tier */}
      {progress.next !== null && (
        <View style={styles.progressSection}>
          <View style={styles.progressBarBg}>
            <View
              style={[styles.progressBarFill, {
                width: `${progress.percent}%`,
                backgroundColor: config.color,
              }]}
            />
          </View>
          <Text style={styles.progressText}>
            {progress.pointsToNext}포인트 남음 → {TIER_CONFIG[config.nextTier!].emoji} {TIER_CONFIG[config.nextTier!].label}
          </Text>
        </View>
      )}

      {/* Perks */}
      <View style={styles.perksRow}>
        {config.perks.map((perk, i) => (
          <View key={i} style={styles.perkChip}>
            <ChevronRight size={10} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.perkText}>{perk}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.spacing.sm,
  },
  tierIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierInfo: {
    flex: 1,
  },
  tierLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  tierName: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
  },
  progressSection: {
    marginBottom: theme.spacing.sm,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  perksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  perkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  perkText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
});
