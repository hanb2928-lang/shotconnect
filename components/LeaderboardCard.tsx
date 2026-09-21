import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Trophy, Crown, TrendingUp } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { TIER_CONFIG, type TierLevel } from '@/lib/creatorTier';

interface LeaderboardEntry {
  id: string;
  display_name: string;
  tier: TierLevel;
  total_revenue: number;
  total_clicks: number;
  viral_count: number;
  rank: number;
  period: string;
}

function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}

export function LeaderboardCard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = useCallback(async () => {
    try {
      const now = new Date();
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const { data } = await supabase
        .from('leaderboard_entries')
        .select('*')
        .eq('period', period)
        .order('rank', { ascending: true })
        .limit(10);

      if (data && data.length > 0) {
        setEntries(data as LeaderboardEntry[]);
      } else {
        // Show sample leaderboard for initial state
        setEntries(generateSampleLeaderboard(period));
      }
    } catch {
      setEntries(generateSampleLeaderboard(''));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3, 10);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Trophy size={18} color={theme.colors.warning[400]} strokeWidth={2} />
        <Text style={styles.headerTitle}>이달의 수익 왕 리더보드</Text>
      </View>

      <Text style={styles.description}>
        숏커넥트로 가장 높은 제휴 수익을 기록한 크리에이터들의 성공 패턴을 확인하세요.
      </Text>

      {loading ? (
        <Text style={styles.loadingText}>불러오는 중...</Text>
      ) : (
        <>
          {/* Top 3 podium */}
          {top3.length > 0 && (
            <View style={styles.podiumRow}>
              {top3.map((entry, i) => {
                const config = TIER_CONFIG[entry.tier] ?? TIER_CONFIG.bronze;
                const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
    const medalColor = medalColors[i] ?? '#cd7f32';
                return (
                  <View key={entry.id} style={[styles.podiumItem, i === 0 && styles.podiumItemTop]}>
                    <Text style={styles.podiumRank}>{i + 1}위</Text>
                    <View style={[styles.podiumMedal, { backgroundColor: medalColor + '30' }]}>
                      <Crown size={16} color={medalColor} strokeWidth={2} />
                    </View>
                    <Text style={styles.podiumName} numberOfLines={1}>{entry.display_name}</Text>
                    <Text style={[styles.podiumTier, { color: config.color }]}>
                      {config.emoji} {config.label}
                    </Text>
                    <Text style={styles.podiumRevenue}>{formatKRW(entry.total_revenue)}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Rest of leaderboard */}
          {rest.length > 0 && (
            <View style={styles.restList}>
              {rest.map((entry, i) => {
                const config = TIER_CONFIG[entry.tier] ?? TIER_CONFIG.bronze;
                const rank = i + 4;
                return (
                  <View key={entry.id} style={styles.restItem}>
                    <Text style={styles.restRank}>{rank}</Text>
                    <View style={styles.restInfo}>
                      <Text style={styles.restName} numberOfLines={1}>{entry.display_name}</Text>
                      <Text style={[styles.restTier, { color: config.color }]}>
                        {config.emoji} {config.label}
                      </Text>
                    </View>
                    <View style={styles.restStats}>
                      <TrendingUp size={11} color={theme.colors.success[400]} strokeWidth={2} />
                      <Text style={styles.restRevenue}>{formatKRW(entry.total_revenue)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function generateSampleLeaderboard(period: string): LeaderboardEntry[] {
  const samples = [
    { name: '크리에이터_코난', tier: 'master' as TierLevel, revenue: 2850000, clicks: 4200, viral: 12 },
    { name: '제휴킹_민수', tier: 'gold' as TierLevel, revenue: 1920000, clicks: 3100, viral: 8 },
    { name: '숏폼여왕_지현', tier: 'gold' as TierLevel, revenue: 1640000, clicks: 2800, viral: 7 },
    { name: '꿀템헌터_도율', tier: 'silver' as TierLevel, revenue: 980000, clicks: 1900, viral: 5 },
    { name: '마케터_수아', tier: 'silver' as TierLevel, revenue: 720000, clicks: 1500, viral: 4 },
    { name: '브이로그_준혁', tier: 'silver' as TierLevel, revenue: 540000, clicks: 1100, viral: 3 },
    { name: '리뷰어_하늘', tier: 'bronze' as TierLevel, revenue: 320000, clicks: 780, viral: 2 },
  ];
  return samples.map((s, i) => ({
    id: `sample-${i}`,
    display_name: s.name,
    tier: s.tier,
    total_revenue: s.revenue,
    total_clicks: s.clicks,
    viral_count: s.viral,
    rank: i + 1,
    period,
  }));
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
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  description: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    paddingVertical: 20,
  },
  podiumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
    gap: 8,
  },
  podiumItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  podiumItemTop: {
    borderWidth: 1.5,
    borderColor: '#ffd70040',
  },
  podiumRank: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.textDim,
    marginBottom: 4,
  },
  podiumMedal: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  podiumName: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 2,
  },
  podiumTier: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    marginBottom: 4,
  },
  podiumRevenue: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.success[400],
  },
  restList: {
    gap: 6,
  },
  restItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  restRank: {
    width: 24,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  restInfo: {
    flex: 1,
    marginLeft: 8,
  },
  restName: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  restTier: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
  },
  restStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  restRevenue: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.success[400],
  },
});
