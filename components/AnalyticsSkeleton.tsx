import { View, StyleSheet } from 'react-native';
import { theme } from '@/lib/theme';
import { Skeleton } from './Skeleton';
import { useSafeTop } from '@/hooks/useSafeTop';
import { useTabBarHeight } from '@/hooks/useTabBarHeight';

export function AnalyticsSkeleton() {
  const safeTop = useSafeTop();
  const tabBarHeight = useTabBarHeight();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
        <Skeleton width="50%" height={24} borderRadius={6} />
        <View style={{ height: 6 }} />
        <Skeleton width="70%" height={14} />
      </View>

      {/* Hero row */}
      <View style={styles.heroRow}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.heroCard}>
            <Skeleton width={28} height={28} borderRadius={8} />
            <View style={{ height: 8 }} />
            <Skeleton width="50%" height={10} />
            <View style={{ height: 4 }} />
            <Skeleton width="70%" height={20} />
          </View>
        ))}
      </View>

      {/* Funnel section */}
      <View style={styles.section}>
        <Skeleton width={100} height={12} />
        <View style={{ height: 10 }} />
        <View style={styles.funnelCard}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.funnelRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Skeleton width={28} height={28} borderRadius={8} />
                <View>
                  <Skeleton width={50} height={11} />
                  <View style={{ height: 4 }} />
                  <Skeleton width={40} height={16} />
                </View>
              </View>
              <Skeleton width={80} height={5} borderRadius={3} />
              <Skeleton width={28} height={10} />
            </View>
          ))}
        </View>
      </View>

      {/* Metrics row */}
      <View style={styles.metricsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.metricCard}>
            <Skeleton width={70} height={10} />
            <View style={{ height: 6 }} />
            <Skeleton width={50} height={20} />
            <View style={{ height: 4 }} />
            <Skeleton width={60} height={9} />
          </View>
        ))}
      </View>

      {/* Chart section */}
      <View style={styles.section}>
        <Skeleton width={120} height={12} />
        <View style={{ height: 10 }} />
        <View style={styles.chartCard}>
          <View style={styles.barChartRow}>
            {Array.from({ length: 14 }).map((_, i) => (
              <View key={i} style={styles.barCol}>
                <Skeleton width="100%" height={60 + (i % 4) * 15} borderRadius={4} />
                <Skeleton width={12} height={8} />
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Bottom sections */}
      <View style={[styles.section, { paddingBottom: tabBarHeight + 24 }]}>
        <Skeleton width={140} height={12} />
        <View style={{ height: 10 }} />
        <View style={styles.bottomCard}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.bottomRow}>
              <Skeleton width={36} height={36} borderRadius={6} />
              <View style={{ flex: 1, gap: 4 }}>
                <Skeleton width="60%" height={12} />
                <Skeleton width="40%" height={10} />
              </View>
              <Skeleton width={50} height={20} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.dark.bg },
  header: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md },
  heroRow: { flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.lg },
  heroCard: { flex: 1, backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.lg, padding: theme.spacing.md },
  section: { paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.lg },
  funnelCard: { backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: theme.spacing.md },
  funnelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricsRow: { flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.lg },
  metricCard: { flex: 1, backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.lg, padding: theme.spacing.md },
  chartCard: { backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.lg, padding: theme.spacing.md },
  barChartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 120 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  bottomCard: { backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: theme.spacing.sm },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: 6 },
});
