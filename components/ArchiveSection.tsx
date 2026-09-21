import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Film, Download, Share2, ChevronRight, Inbox } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { theme } from '@/lib/theme';
import {
  fetchArchiveList,
  fetchArchiveListCached,
  type ArchiveItem,
  type ArchiveListResponse,
  type ArchiveSort,
} from '@/lib/archive';
import { useTabBarHeight } from '@/hooks/useTabBarHeight';

export function ArchiveSection() {
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<ArchiveSort>('recent');
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async (showRefreshing = false) => {
    try {
      setError(null);
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        const cached = await fetchArchiveListCached();
        if (cached) {
          setItems(cached.items);
          setTotal(cached.total);
          setHasMore(cached.hasMore);
        }
      }

      const result = await fetchArchiveList(0, sort);
      setItems(result.items);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setPage(0);
    } catch {
      setError('보관함을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [sort]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const result = await fetchArchiveList(next, sort);
      setItems((prev) => [...prev, ...result.items]);
      setHasMore(result.hasMore);
      setPage(next);
    } catch {
      // stop pagination on error
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, page, sort]);

  const handleRefresh = () => loadFirstPage(true);

  const handleItemPress = (id: string) => {
    router.push({ pathname: '/result/[id]', params: { id } });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}.${month}.${day}`;
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={theme.colors.primary[400]} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Inbox size={40} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
        <Text style={styles.emptyText}>아직 제작된 숏폼이 없습니다</Text>
        <Text style={styles.emptySubtext}>영상을 생성하면 이곳에 모여요</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary[400]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Film size={18} color={theme.colors.primary[400]} strokeWidth={2} />
          <Text style={styles.title}>숏폼 보관함</Text>
          {total > 0 && <Text style={styles.countBadge}>{total}</Text>}
        </View>
        <View style={styles.sortRow}>
          <TouchableOpacity
            style={[styles.sortBtn, sort === 'recent' && styles.sortBtnActive]}
            onPress={() => { setSort('recent'); }}
            disabled={sort === 'recent'}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortText, sort === 'recent' && styles.sortTextActive]}>최신순</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortBtn, sort === 'oldest' && styles.sortBtnActive]}
            onPress={() => { setSort('oldest'); }}
            disabled={sort === 'oldest'}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortText, sort === 'oldest' && styles.sortTextActive]}>오래된순</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error && (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleRefresh} activeOpacity={0.8}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => handleItemPress(item.id)}
            activeOpacity={0.8}
          >
            <View style={styles.thumbnailWrap}>
              <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} />
              <View style={styles.playOverlay}>
                <Film size={16} color="#fff" strokeWidth={2} />
              </View>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.productName || item.title || '제품'}
              </Text>
              {item.oneLiner ? (
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {item.oneLiner}
                </Text>
              ) : null}
              <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleItemPress(item.id)}
                activeOpacity={0.7}
              >
                <Download size={16} color={theme.colors.primary[400]} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleItemPress(item.id)}
                activeOpacity={0.7}
              >
                <Share2 size={16} color={theme.colors.accent[400]} strokeWidth={2} />
              </TouchableOpacity>
              <ChevronRight size={18} color={theme.colors.dark.textFaint} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary[400]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.dark.bg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.dark.text,
  },
  countBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary[300],
    backgroundColor: theme.colors.primary[400] + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  sortRow: {
    flexDirection: 'row',
    gap: 4,
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sortBtnActive: {
    backgroundColor: theme.colors.primary[400] + '20',
  },
  sortText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.dark.textFaint,
  },
  sortTextActive: {
    color: theme.colors.primary[300],
  },
  errorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.error[400] + '10',
    marginHorizontal: 16,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.error[400],
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary[400],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.dark.surface,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    padding: 10,
    gap: 12,
  },
  thumbnailWrap: {
    position: 'relative',
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: theme.colors.dark.border,
  },
  playOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.dark.text,
  },
  cardDesc: {
    fontSize: 12,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
  },
  cardDate: {
    fontSize: 11,
    color: theme.colors.dark.textFaint,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.dark.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.dark.textDim,
  },
  emptySubtext: {
    fontSize: 13,
    color: theme.colors.dark.textFaint,
  },
});
