import { View, StyleSheet } from 'react-native';
import { theme } from '@/lib/theme';
import { Skeleton } from './Skeleton';
import { useSafeTop } from '@/hooks/useSafeTop';
import { useTabBarHeight } from '@/hooks/useTabBarHeight';

const CARD_GAP = 12;
const CARD_WIDTH = (Dimensions.get('window').width - 48 - CARD_GAP) / 2;

import { Dimensions } from 'react-native';

export function AssetsSkeleton() {
  const safeTop = useSafeTop();
  const tabBarHeight = useTabBarHeight();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
        <Skeleton width="60%" height={24} borderRadius={6} />
        <View style={{ height: 6 }} />
        <Skeleton width="40%" height={14} />
      </View>

      {/* Tip cards placeholder */}
      <View style={styles.tipRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.tipCard}>
            <Skeleton width={32} height={32} borderRadius={8} />
            <Skeleton width="70%" height={12} />
            <Skeleton width="90%" height={10} />
          </View>
        ))}
      </View>

      {/* SNS hub placeholder */}
      <View style={styles.snsHub}>
        <Skeleton width="80%" height={14} />
        <View style={{ height: 6 }} />
        <Skeleton width="95%" height={11} />
        <View style={styles.snsRow}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.snsBadge}>
              <Skeleton width={48} height={48} borderRadius={12} />
              <Skeleton width={40} height={11} />
            </View>
          ))}
        </View>
      </View>

      {/* Sort bar placeholder */}
      <View style={styles.sortBar}>
        <Skeleton width={60} height={12} />
        <View style={styles.sortBtnRow}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={60} height={26} borderRadius={13} />
          ))}
        </View>
      </View>

      {/* Grid placeholder */}
      <View style={[styles.grid, { paddingBottom: tabBarHeight + 24 }]}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={[styles.gridCard, { marginRight: CARD_GAP, marginBottom: CARD_GAP }]}>
            <Skeleton width="100%" height={CARD_WIDTH} borderRadius={12} />
            <View style={styles.gridCardBody}>
              <Skeleton width="70%" height={12} />
              <View style={{ height: 6 }} />
              <Skeleton width="50%" height={10} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.dark.bg },
  header: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  tipRow: { flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
  tipCard: { flex: 1, backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.dark.border, padding: 10, gap: 4 },
  snsHub: { paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md, gap: 4 },
  snsRow: { flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginTop: 8 },
  snsBadge: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: theme.radius.lg, borderWidth: 1.5, borderColor: theme.colors.dark.border, backgroundColor: theme.colors.dark.surface },
  sortBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm },
  sortBtnRow: { flexDirection: 'row', gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: theme.spacing.lg },
  gridCard: { width: CARD_WIDTH, backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.lg, overflow: 'hidden' },
  gridCardBody: { padding: theme.spacing.sm, gap: 4 },
});
