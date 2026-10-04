import { useState, useCallback, useEffect, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import { Film, Download, Share2, ChevronRight, Inbox, Play } from 'lucide-react-native';
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
import { CachedImage } from '@/components/CachedImage';
import { VideoReplayModal } from '@/components/VideoReplayModal';
import { friendlyError } from '@/lib/errors';
import { touchStorageObject } from '@/lib/storageLifecycle';

let _mediaLibrary: typeof import('expo-media-library') | null = null;
async function getMediaLibrary() {
  if (!_mediaLibrary) _mediaLibrary = await import('expo-media-library');
  return _mediaLibrary;
}

let _fileSystem: typeof import('expo-file-system/legacy') | null = null;
async function getFileSystem() {
  if (!_fileSystem) _fileSystem = await import('expo-file-system/legacy');
  return _fileSystem;
}

let _sharing: typeof import('expo-sharing') | null = null;
async function getSharing() {
  if (!_sharing) _sharing = await import('expo-sharing');
  return _sharing;
}

interface ArchiveSectionProps {
  embedded?: boolean;
}

export function ArchiveSection({ embedded = false }: ArchiveSectionProps) {
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const mounted = useMountedRef();
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<ArchiveSort>('recent');
  const [error, setError] = useState<string | null>(null);
  const [replayItem, setReplayItem] = useState<ArchiveItem | null>(null);
  const [replayVisible, setReplayVisible] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const loadFirstPage = useCallback(async (showRefreshing = false) => {
    try {
      setError(null);
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        const cached = await fetchArchiveListCached();
        if (!mounted.current) return;
        if (cached) {
          setItems(cached.items);
          setTotal(cached.total);
          setHasMore(cached.hasMore);
        }
      }

      const result = await fetchArchiveList(0, sort);
      if (!mounted.current) return;
      setItems(result.items);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setPage(0);
    } catch {
      if (!mounted.current) return;
      setError('보관함을 불러올 수 없습니다.');
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
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
      if (!mounted.current) return;
      setItems((prev) => [...prev, ...result.items]);
      setHasMore(result.hasMore);
      setPage(next);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, page, sort]);

  const handleRefresh = () => loadFirstPage(true);

  const handleReplay = (item: ArchiveItem) => {
    setReplayItem(item);
    setReplayVisible(true);
    touchStorageObject(item.id, 'videos', item.videoUrl, 'video').catch(() => {});
  };

  const handleCloseReplay = () => {
    setReplayVisible(false);
    setReplayItem(null);
  };

  const handleDownload = useCallback(async (item: ArchiveItem) => {
    if (!item.videoUrl) return;
    setDownloadingId(item.id);
    touchStorageObject(item.id, 'videos', item.videoUrl, 'video').catch(() => {});
    try {
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = item.videoUrl;
        a.download = `${item.productName || item.title || 'shortform'}-${item.id.slice(0, 8)}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('다운로드를 시작했습니다.');
        return;
      }
      const MediaLibrary = await getMediaLibrary();
      const FileSystem = await getFileSystem();
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '기기 갤러리 저장을 위해 권한을 허용해주세요.');
        return;
      }
      const localUri = `${FileSystem.cacheDirectory}shortform-${item.id.slice(0, 8)}-${Date.now()}.mp4`;
      const downloadRes = await FileSystem.downloadAsync(item.videoUrl, localUri);
      if (downloadRes.status !== 200) {
        throw new Error(`다운로드 실패 (${downloadRes.status})`);
      }
      const mediaAsset = await MediaLibrary.createAssetAsync(downloadRes.uri);
      try {
        await MediaLibrary.createAlbumAsync('숏커넥트 영상', mediaAsset, false);
      } catch { /* scoped storage */ }
      showToast('기기 갤러리에 저장되었습니다.');
    } catch (err) {
      showToast(friendlyError(err, '다운로드에 실패했습니다.'));
    } finally {
      setDownloadingId(null);
    }
  }, [showToast]);

  const handleShare = useCallback(async (item: ArchiveItem) => {
    if (!item.videoUrl) return;
    touchStorageObject(item.id, 'videos', item.videoUrl, 'video').catch(() => {});
    try {
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = item.videoUrl;
        a.download = `${item.productName || item.title || 'shortform'}-${item.id.slice(0, 8)}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('영상을 다운로드하여 공유할 수 있습니다.');
        return;
      }
      const Sharing = await getSharing();
      const FileSystem = await getFileSystem();
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        showToast('이 기기에서는 공유를 지원하지 않습니다.');
        return;
      }
      const localUri = `${FileSystem.cacheDirectory}share-${item.id.slice(0, 8)}-${Date.now()}.mp4`;
      const downloadRes = await FileSystem.downloadAsync(item.videoUrl, localUri);
      if (downloadRes.status !== 200) {
        throw new Error(`파일 준비 실패 (${downloadRes.status})`);
      }
      await Sharing.shareAsync(downloadRes.uri, {
        mimeType: 'video/mp4',
        dialogTitle: `${item.productName || item.title || '숏폼'} 공유`,
      });
    } catch (err) {
      showToast(friendlyError(err, '공유에 실패했습니다.'));
    }
  }, [showToast]);

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

  const bottomPad = (embedded ? tabBarHeight : tabBarHeight) + 24;

  return (
    <View style={styles.container}>
      {!embedded && (
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
      )}

      {embedded && (
        <View style={styles.sortBar}>
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
          {total > 0 && <Text style={styles.countText}>총 {total}개</Text>}
        </View>
      )}

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
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.cardMain}
              onPress={() => handleReplay(item)}
              activeOpacity={0.8}
            >
              <View style={styles.thumbnailWrap}>
                <CachedImage uri={item.imageUrl} style={styles.thumbnail} />
                <View style={styles.playOverlay}>
                  <Play size={14} color="#fff" strokeWidth={2.5} fill="#fff" />
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
                {item.motionTemplate ? (
                  <Text style={styles.cardTemplate} numberOfLines={1}>
                    {item.motionTemplate}
                  </Text>
                ) : null}
                <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleDownload(item)}
                disabled={downloadingId === item.id || !item.videoUrl}
                activeOpacity={0.7}
              >
                {downloadingId === item.id ? (
                  <ActivityIndicator size="small" color={theme.colors.primary[400]} />
                ) : (
                  <Download size={16} color={theme.colors.primary[400]} strokeWidth={2} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleShare(item)}
                disabled={!item.videoUrl}
                activeOpacity={0.7}
              >
                <Share2 size={16} color={theme.colors.accent[400]} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push({ pathname: '/result/[id]', params: { id: item.id } })}
                activeOpacity={0.7}
              >
                <ChevronRight size={18} color={theme.colors.dark.textFaint} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
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
        contentContainerStyle={{ paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      />

      <VideoReplayModal
        visible={replayVisible}
        item={replayItem}
        onClose={handleCloseReplay}
      />

      {toast && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
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
  sortBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
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
  countText: {
    fontSize: 12,
    color: theme.colors.dark.textFaint,
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
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  cardTemplate: {
    fontSize: 10,
    color: theme.colors.primary[300],
    marginTop: 1,
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
  toastContainer: {
    position: 'absolute',
    bottom: 80,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(20, 20, 22, 0.95)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    zIndex: 100,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.dark.text,
    textAlign: 'center',
  },
});
