import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { TrendingUp, MousePointerClick, Link2, Bookmark, ChartBar as BarChart3, Trophy } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useSubTabBarHeight } from '@/hooks/useSubTabBarHeight';
import { useSafeTop } from '@/hooks/useSafeTop';
import { fetchDashboardSummary, type DashboardSummary } from '@/lib/affiliateDashboard';
import { ErrorRetryBanner } from '@/components/ErrorRetryBanner';
import { friendlyError } from '@/lib/errors';

export default function DashboardScreen() {
  const tabBarHeight = useSubTabBarHeight();
  const safeTop = useSafeTop();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchDashboardSummary();
      setSummary(data);
    } catch (err) {
      setSummary(null);
      setLoadError(friendlyError(err, '성과 데이터를 불러오지 못했습니다. 네트워크 연결을 확인해주세요.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const maxMonthly = summary
    ? Math.max(...summary.monthlyRevenue.map((m) => m.amount), 1)
    : 1;
  const maxPlatform = summary
    ? Math.max(...summary.platformRevenue.map((p) => p.amount), 1)
    : 1;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
        <Text style={styles.headerTitle}>성과 분석</Text>
        <Text style={styles.headerSubtext}>
          제휴 링크 클릭과 수익을 한눈에 확인하세요
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary[400]} />
        }
      >
        {loading ? (
          <View style={styles.loadingState}>
            <BarChart3 size={48} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
            <Text style={styles.loadingText}>데이터를 불러오는 중...</Text>
          </View>
        ) : loadError ? (
          <ErrorRetryBanner message={loadError} onRetry={load} />
        ) : !summary ? (
          <View style={styles.loadingState}>
            <BarChart3 size={48} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
            <Text style={styles.loadingText}>데이터를 불러올 수 없습니다</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: theme.colors.success[500] + '20' }]}>
                  <TrendingUp size={18} color={theme.colors.success[400]} strokeWidth={2} />
                </View>
                <Text style={styles.statLabel}>총 수익</Text>
                <Text style={styles.statValue}>
                  {summary.totalRevenue.toLocaleString('ko-KR')}원
                </Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: theme.colors.primary[500] + '20' }]}>
                  <MousePointerClick size={18} color={theme.colors.primary[400]} strokeWidth={2} />
                </View>
                <Text style={styles.statLabel}>총 클릭</Text>
                <Text style={styles.statValue}>{summary.totalClicks}회</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: theme.colors.accent[500] + '20' }]}>
                  <Link2 size={18} color={theme.colors.accent[400]} strokeWidth={2} />
                </View>
                <Text style={styles.statLabel}>단축 링크</Text>
                <Text style={styles.statValue}>{summary.totalLinks}개</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: theme.colors.warning[500] + '20' }]}>
                  <Bookmark size={18} color={theme.colors.warning[400]} strokeWidth={2} />
                </View>
                <Text style={styles.statLabel}>북마크</Text>
                <Text style={styles.statValue}>{summary.totalBookmarks}개</Text>
              </View>
            </View>

            {summary.monthlyRevenue.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>월별 수익 추이</Text>
                <View style={styles.barChart}>
                  {summary.monthlyRevenue.map((item) => {
                    const heightPct = Math.max((item.amount / maxMonthly) * 100, 4);
                    return (
                      <View key={item.month} style={styles.barItem}>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.bar,
                              {
                                height: `${heightPct}%`,
                                backgroundColor: theme.colors.primary[400],
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.barLabel}>
                          {item.month.slice(5)}월
                        </Text>
                        <Text style={styles.barValue}>
                          {item.amount.toLocaleString('ko-KR')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {summary.platformRevenue.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>플랫폼별 수익</Text>
                <View style={styles.platformList}>
                  {summary.platformRevenue.map((item, idx) => {
                    const widthPct = Math.max((item.amount / maxPlatform) * 100, 5);
                    const colors = [
                      theme.colors.primary[400],
                      theme.colors.accent[400],
                      theme.colors.success[400],
                      theme.colors.warning[400],
                      theme.colors.error[400],
                    ];
                    const color = colors[idx % colors.length];
                    return (
                      <View key={item.platform} style={styles.platformRow}>
                        <Text style={styles.platformName} numberOfLines={1}>
                          {item.platform}
                        </Text>
                        <View style={styles.platformBarTrack}>
                          <View
                            style={[styles.platformBar, { width: `${widthPct}%`, backgroundColor: color }]}
                          />
                        </View>
                        <Text style={styles.platformAmount}>
                          {item.amount.toLocaleString('ko-KR')}원
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {summary.topLinks.length > 0 && (
              <View style={styles.chartCard}>
                <View style={styles.topLinksHeader}>
                  <Trophy size={16} color={theme.colors.warning[400]} strokeWidth={2} />
                  <Text style={styles.chartTitle}>클릭 수 TOP 링크</Text>
                </View>
                <View style={styles.topLinksList}>
                  {summary.topLinks.map((link, idx) => (
                    <View key={link.slug} style={styles.topLinkItem}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>{idx + 1}</Text>
                      </View>
                      <View style={styles.topLinkInfo}>
                        <Text style={styles.topLinkUrl} numberOfLines={1}>
                          {link.destination_url}
                        </Text>
                        <Text style={styles.topLinkClicks}>{link.click_count}회 클릭</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {summary.totalRevenue === 0 && summary.totalClicks === 0 && (
              <View style={styles.emptyState}>
                <BarChart3 size={56} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>아직 수익 데이터가 없습니다</Text>
                <Text style={styles.emptyText}>
                  제휴 링크를 공유하고 클릭이 발생하면 여기에 통계가 표시됩니다.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  headerSubtext: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 4,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
  },
  loadingState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: theme.spacing.md,
  },
  statCard: {
    width: '48%',
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  chartCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
    marginBottom: theme.spacing.md,
  },
  chartTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginBottom: 14,
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
    gap: 8,
  },
  barItem: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: '100%',
    height: 80,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: 20,
    borderRadius: 6,
  },
  barLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 6,
  },
  barValue: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
    marginTop: 2,
  },
  platformList: {
    gap: 12,
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  platformName: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
    width: 70,
  },
  platformBarTrack: {
    flex: 1,
    height: 10,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: 5,
    overflow: 'hidden',
  },
  platformBar: {
    height: '100%',
    borderRadius: 5,
  },
  platformAmount: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    width: 80,
    textAlign: 'right',
  },
  topLinksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  topLinksList: {
    gap: 10,
  },
  topLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.warning[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.warning[400],
  },
  topLinkInfo: {
    flex: 1,
  },
  topLinkUrl: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  topLinkClicks: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: theme.spacing.xl,
  },
});
