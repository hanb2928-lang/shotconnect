import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { ChartBar as BarChart3, Eye, MousePointerClick, TrendingUp, DollarSign, Clock, Youtube, Instagram, Music2, Globe, Zap, Target, ArrowRight, Calendar, Percent } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useRouter } from 'expo-router';
import { fetchDashboardSummary, formatKRW, type DashboardSummary } from '@/lib/dashboard';
import { getStaleCached, setCached } from '@/lib/offlineCache';

type RangeKey = '7d' | '14d' | '30d';

const RANGE_TABS: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7일' },
  { key: '14d', label: '14일' },
  { key: '30d', label: '30일' },
];

const SHARE_PLATFORM_META: Record<string, { label: string; icon: typeof Youtube; color: string }> = {
  youtube_shorts: { label: '유튜브 숏츠', icon: Youtube, color: '#FF0000' },
  instagram_reels: { label: '인스타그램 릴스', icon: Instagram, color: '#E1306C' },
  tiktok: { label: '틱톡', icon: Music2, color: '#000000' },
  youtube: { label: '유튜브', icon: Youtube, color: '#FF0000' },
  instagram: { label: '인스타그램', icon: Instagram, color: '#E1306C' },
};

function getShareMeta(key: string) {
  return SHARE_PLATFORM_META[key] || { label: key, icon: Globe, color: '#8B5CF6' };
}

export function PerformanceReportCard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<RangeKey>('14d');

  const loadData = useCallback(async () => {
    try {
      const d = await fetchDashboardSummary();
      setData(d);
      await setCached('perf_report', d);
    } catch {
      const stale = await getStaleCached<DashboardSummary>('perf_report');
      if (stale) setData(stale);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const rangeDays = range === '7d' ? 7 : range === '14d' ? 14 : 30;

  const filteredDaily = useMemo(() => {
    if (!data) return [];
    return data.dailyClicks.slice(-Math.min(rangeDays, data.dailyClicks.length));
  }, [data, rangeDays]);

  const filteredRevenue = useMemo(() => {
    if (!data) return [];
    return data.dailyRevenue.slice(-Math.min(rangeDays, data.dailyRevenue.length));
  }, [data, rangeDays]);

  const summary = useMemo(() => {
    if (!data) return { clicks: 0, revenue: 0, conversions: 0, cvr: 0, avgDailyClicks: 0, peakDay: null as null | { date: string; clicks: number } };
    const clicks = filteredDaily.reduce((s, d) => s + d.clicks, 0);
    const revenue = filteredRevenue.reduce((s, d) => s + d.amount, 0);
    const conversions = data.sharePlatformPerformance.reduce((s, p) => s + p.conversions, 0);
    const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
    const avgDailyClicks = filteredDaily.length > 0 ? Math.round(clicks / filteredDaily.length) : 0;
    const peak = filteredDaily.reduce((max, d) => (d.clicks > max.clicks ? d : max), filteredDaily[0] || { date: '', clicks: 0 });
    return { clicks, revenue, conversions, cvr, avgDailyClicks, peakDay: peak.clicks > 0 ? peak : null };
  }, [data, filteredDaily, filteredRevenue]);

  const maxDailyClicks = useMemo(() => {
    if (filteredDaily.length === 0) return 1;
    return Math.max(...filteredDaily.map((d) => d.clicks), 1);
  }, [filteredDaily]);

  const maxDailyRevenue = useMemo(() => {
    if (filteredRevenue.length === 0) return 1;
    return Math.max(...filteredRevenue.map((d) => d.amount), 1);
  }, [filteredRevenue]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <BarChart3 size={18} color={theme.colors.primary[400]} strokeWidth={2} />
            <View>
              <Text style={styles.title}>실적 데이터 리포트</Text>
              <Text style={styles.subtitle}>조회수, 클릭, 전환율을 실시간으로 추적합니다</Text>
            </View>
          </View>
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={theme.colors.primary[400]} />
        </View>
      </View>
    );
  }

  if (!data || (data.totalClicks === 0 && data.totalScans === 0)) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <BarChart3 size={18} color={theme.colors.primary[400]} strokeWidth={2} />
            <View>
              <Text style={styles.title}>실적 데이터 리포트</Text>
              <Text style={styles.subtitle}>조회수, 클릭, 전환율을 실시간으로 추적합니다</Text>
            </View>
          </View>
        </View>
        <View style={styles.emptyState}>
          <Eye size={32} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>아직 실적 데이터가 없습니다</Text>
          <Text style={styles.emptyText}>콘텐츠를 제작하고 공유하면 여기에 조회수와 전환율이 표시됩니다</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <BarChart3 size={18} color={theme.colors.primary[400]} strokeWidth={2} />
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>실적 데이터 리포트</Text>
            <Text style={styles.subtitle}>조회수, 클릭, 전환율을 실시간으로 추적합니다</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh} disabled={refreshing} activeOpacity={0.7}>
          {refreshing ? (
            <ActivityIndicator size={14} color={theme.colors.primary[300]} />
          ) : (
            <Zap size={14} color={theme.colors.primary[300]} strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.rangeRow}>
        {RANGE_TABS.map((tab) => {
          const active = range === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.rangeBtn, active && styles.rangeBtnActive]}
              onPress={() => setRange(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.rangeLabel, active && styles.rangeLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.scrollBody}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary[400]} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrap, { backgroundColor: theme.colors.warning[400] + '20' }]}>
              <MousePointerClick size={14} color={theme.colors.warning[400]} strokeWidth={2} />
            </View>
            <Text style={styles.summaryLabel}>기간 클릭</Text>
            <Text style={styles.summaryValue}>{summary.clicks.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrap, { backgroundColor: theme.colors.success[400] + '20' }]}>
              <DollarSign size={14} color={theme.colors.success[400]} strokeWidth={2} />
            </View>
            <Text style={styles.summaryLabel}>기간 수익</Text>
            <Text style={styles.summaryValueSm}>{summary.revenue > 0 ? formatKRW(summary.revenue) : '—'}</Text>
          </View>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrap, { backgroundColor: theme.colors.accent[400] + '20' }]}>
              <Percent size={14} color={theme.colors.accent[400]} strokeWidth={2} />
            </View>
            <Text style={styles.summaryLabel}>전환율</Text>
            <Text style={styles.summaryValue}>{summary.cvr.toFixed(1)}%</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Calendar size={11} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.metricLabel}>일평균 클릭</Text>
            <Text style={styles.metricValue}>{summary.avgDailyClicks}</Text>
          </View>
          <View style={styles.metricCard}>
            <TrendingUp size={11} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.metricLabel}>최고 클릭일</Text>
            <Text style={styles.metricValue}>{summary.peakDay ? summary.peakDay.clicks : '—'}</Text>
          </View>
          <View style={styles.metricCard}>
            <Target size={11} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.metricLabel}>전환 건수</Text>
            <Text style={styles.metricValue}>{summary.conversions}</Text>
          </View>
        </View>

        {filteredDaily.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>일별 클릭 추이</Text>
            <View style={styles.chartCard}>
              <View style={styles.barChartRow}>
                {filteredDaily.map((item, i) => {
                  const heightPct = (item.clicks / maxDailyClicks) * 100;
                  const day = new Date(item.date).getDate();
                  return (
                    <View key={i} style={styles.barCol}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { height: `${Math.max(heightPct, 2)}%` },
                            item.clicks > 0 && styles.barFillActive,
                          ]}
                        />
                      </View>
                      <Text style={styles.barLabel}>{day}</Text>
                    </View>
                  );
                })}
              </View>
              {summary.peakDay && (
                <View style={styles.peakRow}>
                  <TrendingUp size={11} color={theme.colors.primary[400]} strokeWidth={2} />
                  <Text style={styles.peakText}>
                    최고 클릭일: {new Date(summary.peakDay.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} ({summary.peakDay.clicks}클릭)
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {filteredRevenue.length > 0 && filteredRevenue.some((d) => d.amount > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>일별 수익 추이</Text>
            <View style={styles.chartCard}>
              <View style={styles.barChartRow}>
                {filteredRevenue.map((item, i) => {
                  const heightPct = (item.amount / maxDailyRevenue) * 100;
                  const day = new Date(item.date).getDate();
                  return (
                    <View key={i} style={styles.barCol}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFillRev,
                            { height: `${Math.max(heightPct, 2)}%` },
                            item.amount > 0 && styles.barFillRevActive,
                          ]}
                        />
                      </View>
                      <Text style={styles.barLabel}>{day}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {data.sharePlatformPerformance.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>공유 플랫폼별 실적</Text>
            <View style={styles.platformCard}>
              {data.sharePlatformPerformance.map((item, i) => {
                const meta = getShareMeta(item.platform);
                const Icon = meta.icon;
                const maxClicks = Math.max(...data.sharePlatformPerformance.map((s) => s.clicks), 1);
                const barPct = (item.clicks / maxClicks) * 100;
                return (
                  <View key={i} style={styles.platformRow}>
                    <View style={[styles.platformIcon, { backgroundColor: meta.color + '20' }]}>
                      <Icon size={13} color={meta.color} strokeWidth={2} />
                    </View>
                    <View style={styles.platformInfo}>
                      <View style={styles.platformHeader}>
                        <Text style={styles.platformLabel}>{meta.label}</Text>
                        <Text style={styles.platformClicks}>{item.clicks}클릭</Text>
                      </View>
                      <View style={styles.platformBarTrack}>
                        <View style={[styles.platformBarFill, { width: `${barPct}%`, backgroundColor: meta.color }]} />
                      </View>
                      <View style={styles.platformStatsRow}>
                        <Text style={styles.platformStat}>전환 {item.conversions}건</Text>
                        <Text style={styles.platformStat}>전환율 {item.conversionRate.toFixed(1)}%</Text>
                        <Text style={styles.platformStat}>점유율 {item.pct.toFixed(0)}%</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {data.topContent.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>실적 우수 콘텐츠</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/analytics')} activeOpacity={0.7}>
                <View style={styles.seeAllRow}>
                  <Text style={styles.seeAllText}>전체 보기</Text>
                  <ArrowRight size={12} color={theme.colors.primary[300]} strokeWidth={2} />
                </View>
              </TouchableOpacity>
            </View>
            <View style={styles.topList}>
              {data.topContent.slice(0, 3).map((item, i) => (
                <TouchableOpacity
                  key={item.scan_id}
                  style={styles.topRow}
                  onPress={() => router.push({ pathname: '/result/[id]', params: { id: item.scan_id } })}
                  activeOpacity={0.7}
                >
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{i + 1}</Text>
                  </View>
                  <View style={styles.topInfo}>
                    <Text style={styles.topTitle} numberOfLines={1}>{item.product_name}</Text>
                    <View style={styles.topMetaRow}>
                      <View style={styles.topMetaChip}>
                        <MousePointerClick size={9} color={theme.colors.warning[400]} strokeWidth={2} />
                        <Text style={styles.topMetaText}>{item.clicks} 클릭</Text>
                      </View>
                      {item.revenue > 0 && (
                        <View style={styles.topMetaChip}>
                          <DollarSign size={9} color={theme.colors.success[400]} strokeWidth={2} />
                          <Text style={styles.topMetaText}>{formatKRW(item.revenue)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={styles.topCtr}>{item.ctr.toFixed(0)}%</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <Clock size={10} color={theme.colors.dark.textFaint} strokeWidth={2} />
          <Text style={styles.footerText}>새로고침하여 최신 데이터를 불러올 수 있습니다</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    gap: 10,
    flex: 1,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
    lineHeight: 15,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary[500] + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.bg,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
    alignItems: 'center',
  },
  rangeBtnActive: {
    backgroundColor: theme.colors.primary[500] + '20',
    borderColor: theme.colors.primary[400] + '60',
  },
  rangeLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  rangeLabelActive: {
    color: theme.colors.primary[300],
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
    lineHeight: 16,
  },
  scrollBody: {
    maxHeight: 600,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.lg,
    padding: 12,
  },
  summaryIconWrap: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  summaryValue: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginTop: 2,
  },
  summaryValueSm: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.success[400],
    marginTop: 2,
  },
  metricRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  metricCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexWrap: 'wrap',
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  metricValue: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  section: {
    marginBottom: theme.spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chartCard: {
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.lg,
    padding: 12,
  },
  barChartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 100,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: '100%',
    height: 80,
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 3,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  barFillActive: {
    backgroundColor: theme.colors.primary[500],
  },
  barFillRev: {
    width: '100%',
    borderRadius: 3,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  barFillRevActive: {
    backgroundColor: theme.colors.success[500],
  },
  barLabel: {
    fontSize: 8,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 4,
  },
  peakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  peakText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
  },
  platformCard: {
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.lg,
    padding: 12,
    gap: 10,
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  platformIcon: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  platformInfo: {
    flex: 1,
  },
  platformHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  platformLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  platformClicks: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.warning[400],
  },
  platformBarTrack: {
    height: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: 2,
    marginTop: 4,
    marginBottom: 4,
  },
  platformBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  platformStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  platformStat: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  topList: {
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.lg,
    padding: 12,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.primary[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.primary[400],
  },
  topInfo: {
    flex: 1,
  },
  topTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  topMetaRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 3,
  },
  topMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  topMetaText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  topCtr: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.accent[400],
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  seeAllText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  footerText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
});
