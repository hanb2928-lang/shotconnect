import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { History, Trash2, Tag, ShoppingBag, WifiOff } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import type { Scan } from '@/types/database';
import { useSubTabBarHeight } from '@/hooks/useSubTabBarHeight';
import { useSafeTop } from '@/hooks/useSafeTop';
import { getCached, setCached, getStaleCached } from '@/lib/offlineCache';
import { SkeletonList } from '@/components/Skeleton';
import { ErrorRetryBanner } from '@/components/ErrorRetryBanner';

type ScanListItem = Pick<Scan, 'id' | 'image_url' | 'title' | 'summary' | 'product_name' | 'product_category' | 'price_estimate' | 'one_liner' | 'tags' | 'created_at'>;

const CACHE_KEY = 'scan_history';

export default function HistoryScreen() {
  const router = useRouter();
  const tabBarHeight = useSubTabBarHeight();
  const safeTop = useSafeTop();
  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingCache, setUsingCache] = useState(false);

  const fetchScans = useCallback(async (force = false) => {
    if (!force) {
      const cached = await getCached<ScanListItem[]>(CACHE_KEY);
      if (cached && cached.length > 0) {
        setScans(cached);
        setUsingCache(true);
        setLoading(false);
      }
    }

    try {
      const { data, error: err } = await supabase
        .from('scans')
        .select('id,image_url,title,summary,product_name,product_category,price_estimate,one_liner,tags,created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (err) {
        const stale = await getStaleCached<ScanListItem[]>(CACHE_KEY);
        if (stale && stale.length > 0) {
          setScans(stale);
          setUsingCache(true);
          setError(null);
        } else {
          setError(err.message);
        }
      } else {
        const items = (data || []) as ScanListItem[];
        setScans(items);
        setUsingCache(false);
        setError(null);
        await setCached(CACHE_KEY, items);
      }
    } catch {
      const stale = await getStaleCached<ScanListItem[]>(CACHE_KEY);
      if (stale && stale.length > 0) {
        setScans(stale);
        setUsingCache(true);
        setError(null);
      } else {
        setError('네트워크 연결을 확인해주세요');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchScans(true);
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const { error: err } = await supabase.from('scans').delete().eq('id', id);
      if (err) {
        setError(err.message);
      } else {
        setScans((prev) => prev.filter((s) => s.id !== id));
        setCached(CACHE_KEY, scans.filter((s) => s.id !== id));
      }
    } catch {
      setError('삭제 중 오류가 발생했어요');
    }
    setDeletingId(null);
  };

  const formatDate = useCallback((iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
          <Text style={styles.headerTitle}>스캔 히스토리</Text>
        </View>
        <SkeletonList count={5} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
        <Text style={styles.headerTitle}>스캔 히스토리</Text>
        <Text style={styles.headerSubtext}>
          {scans.length}개의 스캔
        </Text>
      </View>

      {error && (
        <ErrorRetryBanner
          message={error}
          onRetry={() => { setError(null); fetchScans(true); }}
          retrying={refreshing}
        />
      )}

      {usingCache && !error && (
        <View style={styles.cacheBanner}>
          <WifiOff size={12} color={theme.colors.warning[400]} strokeWidth={2} />
          <Text style={styles.cacheText}>오프라인 · 저장된 데이터 표시 중</Text>
        </View>
      )}

      {scans.length === 0 ? (
        <View style={styles.emptyState}>
          <History size={56} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>아직 스캔이 없습니다</Text>
          <Text style={styles.emptyText}>
            카메라 탭에서 사진을 찍거나 업로드하면 AI 분석 결과가 여기에 표시됩니다.
          </Text>
        </View>
      ) : (
        <FlatList
          data={scans}
          keyExtractor={(item) => item.id}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary[400]} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 24 }]}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/result/[id]', params: { id: item.id } })}
            >
              <Image source={{ uri: item.image_url }} style={styles.cardImage} />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.product_name || item.title || '제품 스캔'}
                </Text>
                {item.one_liner ? (
                  <Text style={styles.cardOneLiner} numberOfLines={1}>
                    {item.one_liner}
                  </Text>
                ) : (
                  <Text style={styles.cardSummary} numberOfLines={2}>
                    {item.summary || '요약 정보 없음'}
                  </Text>
                )}
                <View style={styles.cardMetaRow}>
                  {item.price_estimate ? (
                    <View style={styles.priceBadge}>
                      <ShoppingBag size={10} color={theme.colors.primary[300]} strokeWidth={2} />
                      <Text style={styles.priceBadgeText}>{item.price_estimate}</Text>
                    </View>
                  ) : null}
                  {(item.tags?.length ?? 0) > 0 && (
                    <View style={styles.tagRow}>
                      {(item.tags || []).slice(0, 2).map((tag, i) => (
                        <View key={i} style={styles.tag}>
                          <Tag size={9} color={theme.colors.primary[300]} strokeWidth={2} />
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
                activeOpacity={0.7}
              >
                <Trash2 size={18} color={theme.colors.error[400]} strokeWidth={2} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
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
    paddingTop: 12,
    paddingBottom: theme.spacing.md,
  },
  headerTitle: {
    fontSize: theme.typography.title,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  headerSubtext: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 4,
  },
  cacheBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.warning[500] + '15',
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.warning[400],
  },
  cacheText: {
    color: theme.colors.warning[400],
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginTop: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 24,
  },
  listContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  cardImage: {
    width: 90,
    height: 90,
    resizeMode: 'cover',
  },
  cardBody: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  cardTitle: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  cardOneLiner: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
    marginTop: 3,
  },
  cardSummary: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 4,
    lineHeight: 18,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.primary[500] + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
  },
  priceBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  tagRow: {
    flexDirection: 'row',
    gap: 4,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: theme.colors.dark.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
  },
  tagText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  cardDate: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 6,
  },
  deleteButton: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
