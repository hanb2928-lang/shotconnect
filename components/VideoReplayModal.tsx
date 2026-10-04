import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { X, Download, Share2, Play, Volume2, VolumeX } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { CachedImage } from '@/components/CachedImage';
import { NativeVideoPlayer } from '@/components/NativeVideoPlayer';
import { friendlyError } from '@/lib/errors';
import type { ArchiveItem } from '@/lib/archive';

interface VideoReplayModalProps {
  visible: boolean;
  item: ArchiveItem | null;
  onClose: () => void;
}

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

function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${month}.${day}`;
}

export function VideoReplayModal({ visible, item, onClose }: VideoReplayModalProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { height: screenHeight } = Dimensions.get('window');

  useEffect(() => {
    if (visible) {
      setIsPlaying(true);
      setMuted(true);
      setVideoReady(false);
      setVideoError(false);
      setDownloadToast(null);
    }
  }, [visible, item?.id]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setDownloadToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setDownloadToast(null), 3000);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!item) return;
    const videoUrl = item.videoUrl;
    if (!videoUrl) return;
    setDownloading(true);
    try {
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = videoUrl;
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
      const downloadRes = await FileSystem.downloadAsync(videoUrl, localUri);
      if (downloadRes.status !== 200) {
        throw new Error(`다운로드 실패 (${downloadRes.status})`);
      }
      const mediaAsset = await MediaLibrary.createAssetAsync(downloadRes.uri);
      try {
        await MediaLibrary.createAlbumAsync('숏커넥트 영상', mediaAsset, false);
      } catch { /* scoped storage — asset still saved */ }
      showToast('기기 갤러리에 저장되었습니다.');
    } catch (err) {
      showToast(friendlyError(err, '다운로드에 실패했습니다. 다시 시도해주세요.'));
    } finally {
      setDownloading(false);
    }
  }, [item, showToast]);

  const handleShare = useCallback(async () => {
    if (!item) return;
    const videoUrl = item.videoUrl;
    if (!videoUrl) return;
    try {
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = videoUrl;
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
      const downloadRes = await FileSystem.downloadAsync(videoUrl, localUri);
      if (downloadRes.status !== 200) {
        throw new Error(`파일 준비 실패 (${downloadRes.status})`);
      }
      await Sharing.shareAsync(downloadRes.uri, {
        mimeType: 'video/mp4',
        dialogTitle: `${item.productName || item.title || '숏폼'} 공유`,
      });
    } catch (err) {
      showToast(friendlyError(err, '공유에 실패했습니다. 다시 시도해주세요.'));
    }
  }, [item, showToast]);

  if (!item) return null;
  const videoUrl = item.videoUrl;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { maxHeight: screenHeight * 0.92 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {item.productName || item.title || '제품'}
              </Text>
              <Text style={styles.headerDate}>{formatDate(item.createdAt)}</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7} hitSlop={12}>
              <X size={22} color={theme.colors.dark.text} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Video area */}
          <View style={styles.videoArea}>
            {videoUrl && !videoError ? (
              Platform.OS === 'web' ? (
                <video
                  key={item.id}
                  src={videoUrl}
                  autoPlay
                  loop
                  muted={muted}
                  playsInline
                  onLoadedData={() => setVideoReady(true)}
                  onError={() => setVideoError(true)}
                  style={styles.webVideo}
                />
              ) : (
                <>
                  <NativeVideoPlayer
                    videoUri={videoUrl}
                    isPlaying={isPlaying}
                    onLoad={() => setVideoReady(true)}
                    onError={() => setVideoError(true)}
                    style={styles.nativeVideo}
                  />
                  {!videoReady && (
                    <View style={styles.videoLoadingOverlay}>
                      <ActivityIndicator size="large" color={theme.colors.primary[400]} />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.playToggle}
                    onPress={() => setIsPlaying((p) => !p)}
                    activeOpacity={0.7}
                  >
                    <Play size={20} color="#fff" strokeWidth={2.5} style={{ opacity: isPlaying ? 0.4 : 1 }} />
                  </TouchableOpacity>
                </>
              )
            ) : videoError ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>영상을 불러올 수 없습니다.</Text>
                <Text style={styles.errorSubtext}>네트워크 연결을 확인하고 다시 시도해주세요.</Text>
              </View>
            ) : (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary[400]} />
              </View>
            )}

            {/* Mute toggle (web only — native player is always muted) */}
            {Platform.OS === 'web' && videoUrl && !videoError && (
              <TouchableOpacity
                style={styles.muteBtn}
                onPress={() => setMuted((m) => !m)}
                activeOpacity={0.7}
              >
                {muted ? (
                  <VolumeX size={18} color="#fff" strokeWidth={2} />
                ) : (
                  <Volume2 size={18} color="#fff" strokeWidth={2} />
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Metadata */}
          <View style={styles.metaSection}>
            {item.oneLiner ? (
              <Text style={styles.oneLiner} numberOfLines={2}>{item.oneLiner}</Text>
            ) : null}
            {item.motionTemplate ? (
              <View style={styles.templateRow}>
                <Text style={styles.templateLabel}>모션 템플릿</Text>
                <Text style={styles.templateValue}>{item.motionTemplate}</Text>
              </View>
            ) : null}
            {item.productCategory ? (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{item.productCategory}</Text>
              </View>
            ) : null}
          </View>

          {/* Action buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.downloadBtn]}
              onPress={handleDownload}
              disabled={downloading || !videoUrl}
              activeOpacity={0.8}
            >
              {downloading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Download size={18} color="#fff" strokeWidth={2.5} />
              )}
              <Text style={styles.actionBtnTextWhite}>
                {downloading ? '저장 중...' : '기기 저장'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.shareBtn]}
              onPress={handleShare}
              disabled={!videoUrl}
              activeOpacity={0.8}
            >
              <Share2 size={18} color={theme.colors.primary[400]} strokeWidth={2.5} />
              <Text style={styles.actionBtnText}>공유하기</Text>
            </TouchableOpacity>
          </View>
        </View>

        {downloadToast && (
          <View style={styles.toastContainer}>
            <Text style={styles.toastText}>{downloadToast}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.dark.border,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  headerDate: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoArea: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 420,
    backgroundColor: '#000',
    position: 'relative',
  },
  webVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as 'cover',
  },
  nativeVideo: {
    flex: 1,
  },
  videoLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 20,
  },
  errorText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  errorSubtext: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  playToggle: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  muteBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metaSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  oneLiner: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  templateLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textFaint,
  },
  templateValue: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary[400] + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  downloadBtn: {
    backgroundColor: theme.colors.primary[500],
  },
  shareBtn: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '40',
  },
  actionBtnTextWhite: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
  },
  toastContainer: {
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(20, 20, 22, 0.95)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  toastText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
    textAlign: 'center',
  },
});
