import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
  Platform,
  Modal,
  Dimensions,
  Alert,
  TextInput,
  Linking,
  ScrollView,
} from 'react-native';
import type { FlatList as FlatListType } from 'react-native';
import { FolderOpen, Trash2, Download, Film, Image as ImageIcon, X, Calendar, Youtube, Instagram, FileText, Smartphone, Share2, CircleCheck as CheckCircle2, Clock, CircleDashed, Link2, Crop, Rocket, TrendingUp, Repeat2, ListFilter as Filter, ArrowDownUp, Music2, Sparkles, ArrowRight, Pin, Copy, Check, Zap, Lightbulb, Users, Volume2, Type, Flame, ChevronDown, ChevronUp, Hash, QrCode, Store, Settings, ChartBar as BarChart3 } from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { theme } from '@/lib/theme';
import { fetchSavedAssets, deleteSavedAsset, updateAssetUploadStatus } from '@/lib/savedAssets';
import type { SavedAsset } from '@/types/database';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useTabBarHeight } from '@/hooks/useTabBarHeight';
import { useSafeTop } from '@/hooks/useSafeTop';
import { useI18n } from '@/hooks/useI18n';
import {
  getDeepLink, buildPlatformCaption, getCaptionTemplate,
  type UploadPlatformKey,
} from '@/lib/platformUpload';
import { getTrendingSuggestions } from '@/lib/trendingHashtags';


const { width: screenWidth } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (screenWidth - 48 - CARD_GAP) / 2;

type UploadStatus = 'not_uploaded' | 'uploaded' | 'scheduled';

const STATUS_META: Record<UploadStatus, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  not_uploaded: { label: '미업로드', icon: CircleDashed, color: theme.colors.dark.textDim, bg: theme.colors.dark.surfaceLight },
  uploaded: { label: '업로드 완료', icon: CheckCircle2, color: theme.colors.success[400], bg: theme.colors.success[500] + '15' },
  scheduled: { label: '예약', icon: Clock, color: theme.colors.warning[400], bg: theme.colors.warning[500] + '15' },
};

const SNS_PLATFORMS: { key: UploadPlatformKey; label: string; icon: typeof Youtube; color: string }[] = [
  { key: 'tiktok', label: '틱톡', icon: Music2, color: '#FF0050' },
  { key: 'youtube', label: '숏츠', icon: Youtube, color: '#FF0000' },
  { key: 'instagram', label: '릴스', icon: Instagram, color: '#E1306C' },
  { key: 'pinterest', label: '핀터레스트', icon: ImageIcon, color: '#E60023' },
  { key: 'blog', label: '블로그', icon: FileText, color: '#00C4A7' },
];

type SnsStep = 'idle' | 'downloading' | 'caption_copied' | 'hashtag_copied' | 'opening';

const REMIX_HOOKS = [
  { key: 'curiosity', label: '호기심 유발', text: '이거 모르면 손해? 3초만 확인하세요', icon: Lightbulb, color: theme.colors.warning[400] },
  { key: 'contrarian', label: '역발상', text: '다들 이렇게 쓰는데, 난 반대로 해봤어요', icon: Zap, color: theme.colors.accent[400] },
  { key: 'emotional', label: '감정 자극', text: '이걸 알고 나니 눈물이 앞을 가렸어요', icon: Flame, color: theme.colors.primary[400] },
  { key: 'fact', label: '팩트 폭격', text: '내돈내산 3개월 후기, 거름 없이 말합니다', icon: CheckCircle2, color: theme.colors.success[400] },
];

const REMIX_BGM = [
  { key: 'trendy', label: '트렌디 팝', icon: Music2, color: theme.colors.accent[400] },
  { key: 'emotional', label: '감성 발라드', icon: Volume2, color: theme.colors.primary[400] },
  { key: 'energetic', label: '에너제틱 EDM', icon: Zap, color: theme.colors.warning[400] },
  { key: 'calm', label: '차분한 로파이', icon: Lightbulb, color: theme.colors.success[400] },
];

const PERSONA_TONES = [
  { key: 'z', label: 'Z세대', emoji: '🔥', color: theme.colors.accent[400] },
  { key: 'practical', label: '3040 실용', emoji: '💡', color: theme.colors.primary[400] },
  { key: 'honest', label: '내돈내산', emoji: '✅', color: theme.colors.success[400] },
];

type SortMode = 'date' | 'views' | 'title' | 'pinned';

export default function AssetsScreen() {
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const safeTop = useSafeTop();
  const { t } = useI18n();
  const [assets, setAssets] = useState<SavedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<SavedAsset | null>(null);
  const [reexportAsset, setReexportAsset] = useState<SavedAsset | null>(null);
  const [reexporting, setReexporting] = useState(false);
  const [reexportDone, setReexportDone] = useState<string | null>(null);
  const [statusPickerAsset, setStatusPickerAsset] = useState<SavedAsset | null>(null);
  const [shareUrlInput, setShareUrlInput] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<FlatListType<SavedAsset>>(null);

  // SNS Upload state
  const [snsUploadAsset, setSnsUploadAsset] = useState<SavedAsset | null>(null);
  const [snsCopiedCaption, setSnsCopiedCaption] = useState<string | null>(null);
  const [snsCopiedHashtags, setSnsCopiedHashtags] = useState<string | null>(null);

  // A/B Comparison state
  const [showABCompare, setShowABCompare] = useState(false);

  // Remix state
  const [remixAsset, setRemixAsset] = useState<SavedAsset | null>(null);
  const [remixHook, setRemixHook] = useState<string | null>(null);
  const [remixBgm, setRemixBgm] = useState<string | null>(null);
  const [remixing, setRemixing] = useState(false);
  const [remixDone, setRemixDone] = useState(false);
  const remixTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortedAssets = useMemo(() => {
    const sorted = [...assets];
    if (sortMode === 'date') sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (sortMode === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortMode === 'pinned') {
      sorted.sort((a, b) => {
        const aPinned = pinnedIds.has(a.id) ? 0 : 1;
        const bPinned = pinnedIds.has(b.id) ? 0 : 1;
        if (aPinned !== bPinned) return aPinned - bPinned;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    return sorted;
  }, [assets, sortMode, pinnedIds]);

  const fetchAssets = useCallback(async () => {
    try {
      const data = await fetchSavedAssets();
      setAssets(data);
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  // Garbage collection: on screen focus, filter out assets whose file_url
  // is expired or invalid (e.g. blob: URIs from a previous session that no longer exist).
  useFocusEffect(
    useCallback(() => {
      setAssets((prev) => {
        const valid = prev.filter((a) => {
          if (!a.file_url) return false;
          // blob: and file:// URIs don't survive app restarts on web
          if (Platform.OS === 'web' && a.file_url.startsWith('blob:')) return false;
          // Supabase storage URLs are persistent — keep them
          if (a.file_url.startsWith('http')) return true;
          // On native, cache-directory URIs may be evicted by the OS
          if (Platform.OS !== 'web' && a.file_url.startsWith('file://')) {
            // Keep for now — FileSystem.getInfoAsync would be ideal but is async;
            // the download handler will surface a clear error if the file is gone
            return true;
          }
          return true;
        });
        return valid.length !== prev.length ? valid : prev;
      });
    }, []),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAssets();
  };

  const handleDelete = useCallback(async (asset: SavedAsset) => {
    try {
      const success = await deleteSavedAsset(asset);
      if (success) {
        setAssets((prev) => prev.filter((a) => a.id !== asset.id));
        setPinnedIds((prev) => { const n = new Set(prev); n.delete(asset.id); return n; });
      }
    } catch {
      Alert.alert(t('common.error'), t('assets.alert.deleteError'));
    }
  }, [t]);

  const handleDownload = useCallback(async (asset: SavedAsset) => {
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = asset.file_url;
      a.download = asset.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('assets.alert.permission'), t('assets.alert.permission'));
        return;
      }
      const ext = asset.asset_type === 'video' ? 'webm' : 'png';
      const localUri = `${FileSystem.cacheDirectory}${asset.file_name.replace(/\.[^.]+$/, '')}-${Date.now()}.${ext}`;
      const downloadRes = await FileSystem.downloadAsync(asset.file_url, localUri);
      if (downloadRes.status !== 200) {
        Alert.alert(t('common.error'), t('assets.alert.downloadError'));
        return;
      }
      const mediaAsset = await MediaLibrary.createAssetAsync(downloadRes.uri);
      const albumName = asset.asset_type === 'video' ? '숏커넥트 영상' : '숏커넥트';
      try { await MediaLibrary.createAlbumAsync(albumName, mediaAsset, false); } catch { /* scoped storage */ }
      Alert.alert(t('assets.alert.saveSuccess'), t('assets.alert.saveSuccess'));
    } catch {
      Alert.alert(t('common.error'), t('assets.alert.saveError'));
    }
  }, [t]);

  const handleReexport = useCallback(async (formatKey: string) => {
    if (!reexportAsset) return;
    setReexporting(true);
    setReexportDone(null);
    setTimeout(() => {
      setReexporting(false);
      setReexportDone(formatKey);
    }, 1500);
  }, [reexportAsset]);

  const handleStatusChange = useCallback(async (status: UploadStatus) => {
    if (!statusPickerAsset) return;
    const shareUrl = status === 'uploaded' ? shareUrlInput.trim() || null : null;
    try {
      const success = await updateAssetUploadStatus(statusPickerAsset.id, status, shareUrl);
      if (success) {
        setAssets((prev) =>
          prev.map((a) =>
            a.id === statusPickerAsset.id
              ? { ...a, upload_status: status, share_url: shareUrl }
              : a,
          ),
        );
        setStatusPickerAsset(null);
        setShareUrlInput('');
      } else {
        Alert.alert(t('common.error'), t('assets.alert.statusError'));
      }
    } catch {
      Alert.alert(t('common.error'), t('assets.alert.statusError'));
    }
  }, [statusPickerAsset, shareUrlInput, t]);

  const handleCopyText = async (text: string): Promise<boolean> => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(text);
      } else {
        const { default: Clipboard } = await import('expo-clipboard');
        await Clipboard.setStringAsync(text);
      }
      return true;
    } catch {
      return false;
    }
  };

  // SNS 1-click upload: copy caption + hashtags, then open app
  const [snsStep, setSnsStep] = useState<SnsStep>('idle');

  const handleSnsQuickUpload = async (platformKey: UploadPlatformKey, asset: SavedAsset) => {
    setSnsUploadAsset(asset);
    setSnsStep('downloading');
    setSnsCopiedCaption(null);
    setSnsCopiedHashtags(null);

    // 1. Download video to device gallery (skip on web)
    if (Platform.OS !== 'web') {
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          const ext = asset.asset_type === 'video' ? 'webm' : 'png';
          const localUri = `${FileSystem.cacheDirectory}${asset.file_name.replace(/\.[^.]+$/, '')}-${Date.now()}.${ext}`;
          const downloadRes = await FileSystem.downloadAsync(asset.file_url, localUri);
          if (downloadRes.status === 200) {
            const mediaAsset = await MediaLibrary.createAssetAsync(downloadRes.uri);
            const albumName = asset.asset_type === 'video' ? '숏커넥트 영상' : '숏커넥트';
            try { await MediaLibrary.createAlbumAsync(albumName, mediaAsset, false); } catch { /* scoped storage */ }
          }
        }
      } catch { /* gallery save failed — continue anyway */ }
    }

    // 2. Build AI caption + trending hashtags
    const built = buildPlatformCaption(platformKey, asset.title, '', [], false, 'body');
    const trendingTags = getTrendingSuggestions(
      built.hashtags.split(' ').filter(Boolean),
      [],
      5,
    );
    const fullHashtags = built.hashtags + (trendingTags.length > 0 ? ' ' + trendingTags.join(' ') : '');

    // 3. Copy caption to clipboard
    const captionCopied = await handleCopyText(built.fullText);
    if (captionCopied) {
      setSnsCopiedCaption(platformKey);
      setSnsStep('caption_copied');
      setTimeout(() => setSnsCopiedCaption(null), 2500);
    }

    // 4. Copy hashtags to clipboard (sequential)
    await new Promise((r) => setTimeout(r, 400));
    const tagsCopied = await handleCopyText(fullHashtags);
    if (tagsCopied) {
      setSnsCopiedHashtags(platformKey);
      setSnsStep('hashtag_copied');
      setTimeout(() => setSnsCopiedHashtags(null), 2500);
    }

    // 5. Open SNS app via deep link
    setSnsStep('opening');
    const dl = getDeepLink(platformKey);
    await new Promise((r) => setTimeout(r, 300));
    Linking.openURL(dl.appUrl).catch(() => {
      Linking.openURL(dl.webUrl).catch(() => {});
    });
    setTimeout(() => setSnsStep('idle'), 2000);
  };

  const handlePin = (assetId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const handleRemix = () => {
    if (!remixHook && !remixBgm) return;
    setRemixing(true);
    setRemixDone(false);
    if (remixTimerRef.current) clearTimeout(remixTimerRef.current);
    remixTimerRef.current = setTimeout(() => {
      setRemixing(false);
      setRemixDone(true);
    }, 2000);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return <LoadingScreen message="제작물을 불러오는 중..." />;
  }

  const uploadedAssets = assets.filter((a) => a.upload_status === 'uploaded');
  const bestPerformers = uploadedAssets.slice(0, 3);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>{t('assets.title')}</Text>
            <Text style={styles.headerSubtext}>
              클라우드에 저장된 숏폼 자산 · {assets.length}개
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => router.push('/(tabs)/analytics' as never)}
              activeOpacity={0.7}
            >
              <BarChart3 size={20} color={theme.colors.success[400]} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => router.push('/settings' as never)}
              activeOpacity={0.7}
            >
              <Settings size={20} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Lightweight Tip Cards — only when assets exist */}
      {assets.length > 0 && (
        <View style={styles.tipSection}>
          <View style={styles.tipHeader}>
            <Lightbulb size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.tipHeaderText}>이용 팁</Text>
          </View>
          <View style={styles.tipRow}>
            <TouchableOpacity
              style={styles.tipCard}
              onPress={() => setSnsUploadAsset(assets[0])}
              activeOpacity={0.85}
            >
              <View style={[styles.tipIconWrap, { backgroundColor: theme.colors.warning[500] + '18' }]}>
                <Rocket size={18} color={theme.colors.warning[400]} strokeWidth={2} />
              </View>
              <Text style={styles.tipTitle}>1초 SNS 업로드</Text>
              <Text style={styles.tipDesc}>캡션/해시태그 자동 복사 후 앱 실행</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tipCard}
              onPress={() => setShowABCompare(true)}
              activeOpacity={0.85}
            >
              <View style={[styles.tipIconWrap, { backgroundColor: theme.colors.success[500] + '18' }]}>
                <TrendingUp size={18} color={theme.colors.success[400]} strokeWidth={2} />
              </View>
              <Text style={styles.tipTitle}>A/B 성과 &amp; 핀</Text>
              <Text style={styles.tipDesc}>3종 톤 비교 · BEST 상단 고정</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tipCard}
              onPress={() => { const first = assets[0]; if (first) setRemixAsset(first); }}
              activeOpacity={0.85}
            >
              <View style={[styles.tipIconWrap, { backgroundColor: theme.colors.accent[500] + '18' }]}>
                <Repeat2 size={18} color={theme.colors.accent[400]} strokeWidth={2} />
              </View>
              <Text style={styles.tipTitle}>1클릭 리믹스</Text>
              <Text style={styles.tipDesc}>훅 자막/BGM만 교체해 재생산</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* SNS Quick Upload Hub */}
      {assets.length > 0 && (
        <View style={styles.snsHub}>
          <Text style={styles.snsHubTitle}>🚀 플랫폼 간편 업로드 — 영상 저장 + 캡션 복사 + 앱 실행</Text>
          <Text style={styles.snsHubDesc}>아이콘을 탭하면 영상이 갤러리에 저장되고, AI 캡션/해시태그가 클립보드에 복사된 후 SNS 앱이 자동으로 열립니다</Text>
          <View style={styles.snsHubRow}>
            {SNS_PLATFORMS.map((p) => {
              const Icon = p.icon;
              const isActive = snsStep !== 'idle' && snsUploadAsset?.id === assets[0]?.id;
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.snsPlatformBadge, { borderColor: p.color + '40' }]}
                  onPress={() => handleSnsQuickUpload(p.key, assets[0])}
                  activeOpacity={0.7}
                >
                  <View style={[styles.snsPlatformIcon, { backgroundColor: p.color + '20' }]}>
                    <Icon size={32} color={p.color} strokeWidth={2} />
                  </View>
                  <Text style={styles.snsPlatformLabel}>{p.label}</Text>
                  {(snsCopiedCaption === p.key || snsCopiedHashtags === p.key) && (
                    <View style={[styles.snsCopiedBadge, { backgroundColor: p.color }]}>
                      <Check size={8} color="#fff" strokeWidth={2.5} />
                      <Text style={styles.snsCopiedText}>복사됨</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          {snsStep !== 'idle' && snsUploadAsset && (
            <View style={styles.snsStepBar}>
              {([
                { key: 'downloading', label: '영상 저장', icon: Download },
                { key: 'caption_copied', label: '캡션 복사', icon: Copy },
                { key: 'hashtag_copied', label: '해시태그 복사', icon: Hash },
                { key: 'opening', label: '앱 실행', icon: Share2 },
              ] as { key: SnsStep; label: string; icon: typeof Download }[]).map((step, i) => {
                const stepOrder = ['downloading', 'caption_copied', 'hashtag_copied', 'opening'];
                const currentIdx = stepOrder.indexOf(snsStep);
                const stepIdx = i;
                const done = stepIdx < currentIdx;
                const active = stepIdx === currentIdx;
                const StepIcon = step.icon;
                return (
                  <View key={step.key} style={styles.snsStepItem}>
                    <View style={[styles.snsStepCircle, done && styles.snsStepCircleDone, active && styles.snsStepCircleActive]}>
                      {done ? <Check size={12} color="#fff" strokeWidth={2.5} /> : <StepIcon size={12} color={active ? theme.colors.warning[400] : theme.colors.dark.textFaint} strokeWidth={2} />}
                    </View>
                    <Text style={[styles.snsStepLabel, active && styles.snsStepLabelActive]}>{step.label}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Sort/Filter Bar */}
      {assets.length > 0 && (
        <View style={styles.sortBar}>
          <View style={styles.sortLeft}>
            <Filter size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.sortLabel}>정렬</Text>
          </View>
          <View style={styles.sortBtnRow}>
            {([['pinned', '핀순'], ['date', '최신순'], ['title', '이름순']] as [SortMode, string][]).map(([mode, label]) => (
              <TouchableOpacity
                key={mode}
                style={[styles.sortBtn, sortMode === mode && styles.sortBtnActive]}
                onPress={() => setSortMode(mode)}
                activeOpacity={0.7}
              >
                {mode === 'pinned' && <Pin size={12} color={sortMode === mode ? theme.colors.primary[300] : theme.colors.dark.textFaint} strokeWidth={2} />}
                <Text style={[styles.sortBtnText, sortMode === mode && styles.sortBtnTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {assets.length === 0 ? (
        <View style={styles.emptyState}>
          <FolderOpen size={48} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>{t('assets.empty')}</Text>
          <Text style={styles.emptyText}>{t('assets.emptyDesc')}</Text>
        </View>
      ) : (
        <FlatList
          data={sortedAssets}
          keyExtractor={(item) => item.id}
          ref={scrollRef}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary[400]} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 24 }]}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={true}
          renderItem={({ item }) => {
            const statusMeta = STATUS_META[item.upload_status || 'not_uploaded'];
            const StatusIcon = statusMeta.icon;
            const isPinned = pinnedIds.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.card, isPinned && styles.cardPinned]}
                activeOpacity={0.8}
                onPress={() => setPreviewAsset(item)}
              >
                <View style={styles.thumbWrap}>
                  {item.asset_type === 'video' ? (
                    <>
                      <Image source={{ uri: item.thumbnail_url || item.file_url }} style={styles.thumbImage} resizeMode="cover" />
                      <View style={styles.videoBadge}>
                        <Film size={10} color="#fff" strokeWidth={2} />
                        <Text style={styles.videoBadgeText}>영상</Text>
                      </View>
                    </>
                  ) : (
                    <Image source={{ uri: item.file_url }} style={styles.thumbImage} resizeMode="cover" />
                  )}
                  <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                    <StatusIcon size={9} color={statusMeta.color} strokeWidth={2} />
                    <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                  </View>
                  {isPinned && (
                    <View style={styles.pinnedBadge}>
                      <Pin size={9} color="#fff" strokeWidth={2.5} />
                      <Text style={styles.pinnedText}>핀</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <View style={styles.cardMeta}>
                    <Calendar size={9} color={theme.colors.dark.textFaint} strokeWidth={2} />
                    <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
                  </View>
                  {item.file_size ? <Text style={styles.cardSize}>{formatSize(item.file_size)}</Text> : null}
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handlePin(item.id)} activeOpacity={0.7}>
                    <Pin size={20} color={isPinned ? theme.colors.primary[400] : theme.colors.dark.textDim} strokeWidth={2} fill={isPinned ? theme.colors.primary[400] : 'transparent'} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => setRemixAsset(item)} activeOpacity={0.7}>
                    <Repeat2 size={20} color={theme.colors.accent[400]} strokeWidth={2} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleDownload(item)} activeOpacity={0.7}>
                    <Download size={20} color={theme.colors.primary[300]} strokeWidth={2} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)} activeOpacity={0.7}>
                    <Trash2 size={20} color={theme.colors.error[400]} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Preview Modal */}
      <Modal visible={!!previewAsset} transparent animationType="fade" onRequestClose={() => setPreviewAsset(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setPreviewAsset(null)} activeOpacity={0.7}>
              <X size={20} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
            {previewAsset && (
              <>
                <Text style={styles.modalTitle}>{previewAsset.title}</Text>
                <View style={styles.modalMetaRow}>
                  <View style={styles.modalTypeBadge}>
                    {previewAsset.asset_type === 'video' ? <Film size={11} color="#fff" strokeWidth={2} /> : <ImageIcon size={11} color="#fff" strokeWidth={2} />}
                    <Text style={styles.modalTypeText}>{previewAsset.asset_type === 'video' ? '동영상' : '이미지'}</Text>
                  </View>
                  <Text style={styles.modalDate}>{formatDate(previewAsset.created_at)}</Text>
                  {previewAsset.upload_status && previewAsset.upload_status !== 'not_uploaded' && (
                    <View style={[styles.modalStatusBadge, { backgroundColor: STATUS_META[previewAsset.upload_status].bg }]}>
                      {(() => { const M = STATUS_META[previewAsset.upload_status]; const Icon = M.icon; return <Icon size={10} color={M.color} strokeWidth={2} />; })()}
                      <Text style={[styles.modalStatusText, { color: STATUS_META[previewAsset.upload_status].color }]}>{STATUS_META[previewAsset.upload_status].label}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.previewWrap}>
                  {previewAsset.asset_type === 'video' && Platform.OS === 'web' ? (
                    // @ts-ignore video element on web
                    <video src={previewAsset.file_url} style={styles.previewVideo} controls autoPlay loop playsInline />
                  ) : (
                    <Image source={{ uri: previewAsset.asset_type === 'video' ? (previewAsset.thumbnail_url || previewAsset.file_url) : previewAsset.file_url }} style={styles.previewImage} resizeMode="contain" />
                  )}
                </View>
                {previewAsset.file_size ? <Text style={styles.modalSize}>파일 크기: {formatSize(previewAsset.file_size)}</Text> : null}
                {previewAsset.share_url ? (
                  <TouchableOpacity style={styles.shareLinkRow} onPress={() => { if (Platform.OS === 'web') { window.open(previewAsset.share_url!, '_blank'); } else { Linking.openURL(previewAsset.share_url!).catch(() => {}); } }} activeOpacity={0.7}>
                    <Link2 size={13} color={theme.colors.primary[300]} strokeWidth={2} />
                    <Text style={styles.shareLinkText} numberOfLines={1}>{previewAsset.share_url}</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Quick SNS upload buttons inside preview */}
                <Text style={styles.previewSnsTitle}>빠른 SNS 배포 (캡션 자동 복사)</Text>
                <View style={styles.previewSnsRow}>
                  {SNS_PLATFORMS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <TouchableOpacity key={p.key} style={[styles.previewSnsBtn, { borderColor: p.color + '40' }]} onPress={() => handleSnsQuickUpload(p.key, previewAsset)} activeOpacity={0.7}>
                        <Icon size={16} color={p.color} strokeWidth={2} />
                        <Text style={[styles.previewSnsText, { color: p.color }]}>{p.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalKarrotBtn} onPress={() => { Linking.openURL('https://www.daangn.com/').catch(() => {}); }} activeOpacity={0.8}>
                    <Store size={16} color={theme.colors.warning[400]} strokeWidth={2} />
                    <Text style={styles.modalKarrotText}>당근배포</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalQrBtn} onPress={() => { if (Platform.OS === 'web' && previewAsset.share_url) { const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(previewAsset.share_url)}`; const a = document.createElement('a'); a.href = qrUrl; a.download = `qr-${previewAsset.file_name}.png`; document.body.appendChild(a); a.click(); document.body.removeChild(a); } }} activeOpacity={0.8} disabled={!previewAsset.share_url}>
                    <QrCode size={16} color={theme.colors.success[400]} strokeWidth={2} />
                    <Text style={styles.modalQrText}>QR 다운</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalDownloadBtn} onPress={() => handleDownload(previewAsset)} activeOpacity={0.8}>
                    <Download size={16} color="#fff" strokeWidth={2} />
                    <Text style={styles.modalDownloadText}>다운로드</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Re-export Modal */}
      <Modal visible={!!reexportAsset} transparent animationType="fade" onRequestClose={() => { setReexportAsset(null); setReexportDone(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.reexportModalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => { setReexportAsset(null); setReexportDone(null); }} activeOpacity={0.7}>
              <X size={20} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.reexportHeader}>
              <View style={styles.reexportHeaderIcon}>
                <Crop size={24} color={theme.colors.accent[400]} strokeWidth={2} />
              </View>
              <Text style={styles.reexportTitle}>플랫폼별 재내보내기</Text>
              <Text style={styles.reexportSubtitle}>'{reexportAsset?.title}'을(를) 다른 플랫폼 규격으로 자동 재가공합니다</Text>
            </View>
            {reexportDone ? (
              <View style={styles.reexportDoneCard}>
                <CheckCircle2 size={32} color={theme.colors.success[400]} strokeWidth={2} />
                <Text style={styles.reexportDoneTitle}>재가공 완료!</Text>
                <Text style={styles.reexportDoneDesc}>변환되었습니다</Text>
                <TouchableOpacity style={styles.reexportDoneBtn} onPress={() => { setReexportAsset(null); setReexportDone(null); }} activeOpacity={0.8}>
                  <Text style={styles.reexportDoneBtnText}>확인</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.reexportFormatList}>
                {[
                  { key: 'youtube_shorts', label: '유튜브 숏츠', ratio: '9:16', icon: Youtube, color: '#FF0000' },
                  { key: 'instagram_feed', label: '인스타 피드', ratio: '1:1', icon: Instagram, color: '#E1306C' },
                  { key: 'blog_card', label: '블로그 카드뉴스', ratio: '4:3', icon: FileText, color: '#00C4A7' },
                  { key: 'mobile_story', label: '모바일 스토리', ratio: '9:16', icon: Smartphone, color: '#8B5CF6' },
                ].map((fmt) => {
                  const Icon = fmt.icon;
                  return (
                    <TouchableOpacity key={fmt.key} style={styles.reexportFormatCard} onPress={() => handleReexport(fmt.key)} disabled={reexporting} activeOpacity={0.7}>
                      <View style={[styles.reexportFormatIcon, { backgroundColor: fmt.color + '20' }]}>
                        <Icon size={20} color={fmt.color} strokeWidth={2} />
                      </View>
                      <View style={styles.reexportFormatInfo}>
                        <Text style={styles.reexportFormatLabel}>{fmt.label}</Text>
                        <Text style={styles.reexportFormatRatio}>비율 {fmt.ratio}</Text>
                      </View>
                      {reexporting ? <Text style={styles.reexportProcessingText}>처리 중...</Text> : <Crop size={16} color={theme.colors.dark.textFaint} strokeWidth={2} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* A/B Comparison Modal */}
      <Modal visible={showABCompare} transparent animationType="fade" onRequestClose={() => setShowABCompare(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.abModalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowABCompare(false)} activeOpacity={0.7}>
              <X size={20} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.abHeader}>
              <View style={styles.abHeaderIcon}>
                <Users size={24} color={theme.colors.success[400]} strokeWidth={2} />
              </View>
              <Text style={styles.abTitle}>A/B 페르소나 톤 비교</Text>
              <Text style={styles.abSubtitle}>3가지 톤으로 동시 생성된 영상을 비교해 보세요</Text>
            </View>

            {/* Best Performers Pin Section */}
            {bestPerformers.length > 0 && (
              <View style={styles.abBestSection}>
                <View style={styles.abBestHeader}>
                  <Pin size={14} color={theme.colors.primary[400]} strokeWidth={2.5} />
                  <Text style={styles.abBestTitle}>BEST 효자 콘텐츠</Text>
                </View>
                {bestPerformers.map((asset) => {
                  const isPinned = pinnedIds.has(asset.id);
                  return (
                    <View key={asset.id} style={styles.abBestCard}>
                      <Image source={{ uri: asset.thumbnail_url || asset.file_url }} style={styles.abBestThumb} resizeMode="cover" />
                      <View style={styles.abBestInfo}>
                        <Text style={styles.abBestName} numberOfLines={1}>{asset.title}</Text>
                        <View style={styles.abBestStatus}>
                          <CheckCircle2 size={10} color={theme.colors.success[400]} strokeWidth={2} />
                          <Text style={styles.abBestStatusText}>업로드 완료</Text>
                        </View>
                      </View>
                      <TouchableOpacity style={[styles.abPinBtn, isPinned && styles.abPinBtnActive]} onPress={() => handlePin(asset.id)} activeOpacity={0.7}>
                        <Pin size={14} color={isPinned ? '#fff' : theme.colors.primary[300]} strokeWidth={2.5} fill={isPinned ? '#fff' : 'transparent'} />
                        <Text style={[styles.abPinText, isPinned && styles.abPinTextActive]}>{isPinned ? '핀됨' : '핀'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Persona tone comparison cards */}
            <Text style={styles.abSectionLabel}>3종 페르소나 톤 비교 시청</Text>
            <View style={styles.abPersonaRow}>
              {PERSONA_TONES.map((tone) => (
                <View key={tone.key} style={[styles.abPersonaCard, { borderColor: tone.color + '40' }]}>
                  <Text style={styles.abPersonaEmoji}>{tone.emoji}</Text>
                  <Text style={styles.abPersonaLabel}>{tone.label}</Text>
                  <View style={[styles.abPersonaPreview, { backgroundColor: tone.color + '12' }]}>
                    {uploadedAssets[0] ? (
                      <Image source={{ uri: uploadedAssets[0].thumbnail_url || uploadedAssets[0].file_url }} style={styles.abPersonaThumb} resizeMode="cover" />
                    ) : (
                      <Film size={24} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
                    )}
                  </View>
                  <TouchableOpacity style={[styles.abPersonaPlayBtn, { backgroundColor: tone.color + '18' }]} activeOpacity={0.7}>
                    <Text style={[styles.abPersonaPlayText, { color: tone.color }]}>시청</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            {uploadedAssets.length === 0 && (
              <Text style={styles.abEmptyText}>업로드 완료된 콘텐츠가 있으면 여기에서 비교할 수 있습니다</Text>
            )}
          </View>
        </View>
      </Modal>

      {/* Remix Modal */}
      <Modal visible={!!remixAsset} transparent animationType="fade" onRequestClose={() => { if (remixTimerRef.current) clearTimeout(remixTimerRef.current); setRemixAsset(null); setRemixDone(false); setRemixHook(null); setRemixBgm(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.remixModalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => { if (remixTimerRef.current) clearTimeout(remixTimerRef.current); setRemixAsset(null); setRemixDone(false); setRemixHook(null); setRemixBgm(null); }} activeOpacity={0.7}>
              <X size={20} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.remixHeader}>
              <View style={styles.remixHeaderIcon}>
                <Repeat2 size={24} color={theme.colors.accent[400]} strokeWidth={2} />
              </View>
              <Text style={styles.remixTitle}>1클릭 리믹스</Text>
              <Text style={styles.remixSubtitle}>'{remixAsset?.title}'의 핵심 요소만 교체하여 새 버전을 만드세요</Text>
            </View>

            {remixDone ? (
              <View style={styles.remixDoneCard}>
                <CheckCircle2 size={32} color={theme.colors.success[400]} strokeWidth={2} />
                <Text style={styles.remixDoneTitle}>리믹스 완료!</Text>
                <Text style={styles.remixDoneDesc}>새 버전이 제작물에 추가되었습니다</Text>
                <TouchableOpacity style={styles.remixDoneBtn} onPress={() => { if (remixTimerRef.current) clearTimeout(remixTimerRef.current); setRemixAsset(null); setRemixDone(false); setRemixHook(null); setRemixBgm(null); }} activeOpacity={0.8}>
                  <Text style={styles.remixDoneBtnText}>확인</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.remixScroll}>
                {/* Hook swap section */}
                <Text style={styles.remixSectionTitle}>3초 훅 문구 교체</Text>
                <Text style={styles.remixSectionDesc}>오프닝 자막만 바꿔 새로운 후킹 효과</Text>
                <View style={styles.remixHookList}>
                  {REMIX_HOOKS.map((hook) => {
                    const Icon = hook.icon;
                    const selected = remixHook === hook.key;
                    return (
                      <TouchableOpacity
                        key={hook.key}
                        style={[styles.remixHookCard, selected && { borderColor: hook.color, backgroundColor: hook.color + '12' }]}
                        onPress={() => setRemixHook(selected ? null : hook.key)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.remixHookIcon, { backgroundColor: hook.color + '20' }]}>
                          <Icon size={16} color={hook.color} strokeWidth={2} />
                        </View>
                        <View style={styles.remixHookInfo}>
                          <Text style={styles.remixHookLabel}>{hook.label}</Text>
                          <Text style={styles.remixHookText} numberOfLines={2}>"{hook.text}"</Text>
                        </View>
                        {selected && (
                          <View style={[styles.remixCheck, { backgroundColor: hook.color }]}>
                            <Check size={12} color="#fff" strokeWidth={2.5} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* BGM swap section */}
                <Text style={styles.remixSectionTitle}>BGM / 음성 변경</Text>
                <Text style={styles.remixSectionDesc}>백그라운드 음악이나 TTS 목소리만 교체</Text>
                <View style={styles.remixBgmRow}>
                  {REMIX_BGM.map((bgm) => {
                    const Icon = bgm.icon;
                    const selected = remixBgm === bgm.key;
                    return (
                      <TouchableOpacity
                        key={bgm.key}
                        style={[styles.remixBgmCard, selected && { borderColor: bgm.color, backgroundColor: bgm.color + '12' }]}
                        onPress={() => setRemixBgm(selected ? null : bgm.key)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.remixBgmIcon, { backgroundColor: bgm.color + '20' }]}>
                          <Icon size={16} color={bgm.color} strokeWidth={2} />
                        </View>
                        <Text style={styles.remixBgmLabel}>{bgm.label}</Text>
                        {selected && (
                          <View style={[styles.remixCheck, { backgroundColor: bgm.color }]}>
                            <Check size={10} color="#fff" strokeWidth={2.5} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={[styles.remixStartBtn, (!remixHook && !remixBgm) && styles.remixStartBtnDisabled]}
                  onPress={handleRemix}
                  disabled={!remixHook && !remixBgm || remixing}
                  activeOpacity={0.85}
                >
                  {remixing ? (
                    <Text style={styles.remixStartBtnText}>리믹스 생성 중...</Text>
                  ) : (
                    <>
                      <Sparkles size={18} color="#fff" strokeWidth={2.5} />
                      <Text style={styles.remixStartBtnText}>리믹스 시작</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Upload Status Picker Modal */}
      <Modal visible={!!statusPickerAsset} transparent animationType="fade" onRequestClose={() => { setStatusPickerAsset(null); setShareUrlInput(''); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.statusModalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => { setStatusPickerAsset(null); setShareUrlInput(''); }} activeOpacity={0.7}>
              <X size={20} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.statusHeader}>
              <View style={styles.statusHeaderIcon}>
                <Share2 size={24} color={theme.colors.warning[400]} strokeWidth={2} />
              </View>
              <Text style={styles.statusTitle}>게시 상태 관리</Text>
              <Text style={styles.statusSubtitle} numberOfLines={1}>'{statusPickerAsset?.title}'</Text>
            </View>
            <View style={styles.statusOptions}>
              {(['not_uploaded', 'scheduled', 'uploaded'] as UploadStatus[]).map((status) => {
                const meta = STATUS_META[status];
                const Icon = meta.icon;
                const isActive = statusPickerAsset?.upload_status === status;
                return (
                  <TouchableOpacity key={status} style={[styles.statusOptionCard, isActive && { borderColor: meta.color, backgroundColor: meta.bg }]} onPress={() => handleStatusChange(status)} activeOpacity={0.7}>
                    <View style={[styles.statusOptionIcon, { backgroundColor: meta.color + '20' }]}>
                      <Icon size={18} color={meta.color} strokeWidth={2} />
                    </View>
                    <View style={styles.statusOptionInfo}>
                      <Text style={[styles.statusOptionLabel, isActive && { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    {isActive && <CheckCircle2 size={18} color={meta.color} strokeWidth={2} />}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.shareUrlLabel}>게시 링크 (업로드 완료 시)</Text>
            <TextInput style={styles.shareUrlInput} value={shareUrlInput} onChangeText={setShareUrlInput} placeholder="https://youtube.com/shorts/..." placeholderTextColor={theme.colors.dark.textFaint} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            <TouchableOpacity style={styles.statusSaveBtn} onPress={() => handleStatusChange('uploaded')} activeOpacity={0.8}>
              <Text style={styles.statusSaveBtnText}>저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.dark.bg },
  header: { paddingHorizontal: theme.spacing.lg, paddingTop: 12, paddingBottom: theme.spacing.sm },
  headerTitle: { fontSize: theme.typography.title, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.dark.text },
  headerSubtext: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, marginTop: 4 },
  headerTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerTextWrap: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  headerActionBtn: { width: 40, height: 40, borderRadius: theme.radius.full, backgroundColor: theme.colors.dark.surface, justifyContent: 'center', alignItems: 'center' },
  tipSection: { paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  tipHeaderText: { fontSize: 11, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.textDim },
  tipRow: { flexDirection: 'row', gap: theme.spacing.sm },
  tipCard: { flex: 1, backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.dark.border, padding: 10, gap: 4 },
  tipIconWrap: { width: 32, height: 32, borderRadius: theme.radius.sm, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  tipTitle: { fontSize: 12, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.text },
  tipDesc: { fontSize: 10, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, lineHeight: 13 },
  snsHub: { paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
  snsHubTitle: { fontSize: 14, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.dark.text, marginBottom: 4 },
  snsHubDesc: { fontSize: 11, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, marginBottom: 8, lineHeight: 15 },
  snsHubRow: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  snsPlatformBadge: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: theme.radius.lg, borderWidth: 1.5, backgroundColor: theme.colors.dark.surface },
  snsPlatformIcon: { width: 48, height: 48, borderRadius: theme.radius.md, justifyContent: 'center', alignItems: 'center' },
  snsPlatformLabel: { fontSize: 11, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.text },
  snsCopiedBadge: { position: 'absolute', top: -6, right: -6, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 3, borderRadius: theme.radius.sm },
  snsCopiedText: { fontSize: 8, fontFamily: theme.typography.fontFamily.bold, color: '#fff' },
  snsStepBar: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 8 },
  snsStepItem: { alignItems: 'center', gap: 4 },
  snsStepCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: theme.colors.dark.border },
  snsStepCircleDone: { backgroundColor: theme.colors.success[500], borderColor: theme.colors.success[500] },
  snsStepCircleActive: { borderColor: theme.colors.warning[400], backgroundColor: theme.colors.warning[500] + '20' },
  snsStepLabel: { fontSize: 9, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textFaint },
  snsStepLabelActive: { color: theme.colors.warning[400], fontFamily: theme.typography.fontFamily.semiBold },
  sortBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm },
  sortLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortLabel: { fontSize: 12, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.textDim },
  sortBtnRow: { flexDirection: 'row', gap: 6 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: theme.radius.full, backgroundColor: theme.colors.dark.surface, borderWidth: 1.5, borderColor: theme.colors.dark.border },
  sortBtnActive: { borderColor: theme.colors.primary[400], backgroundColor: theme.colors.primary[500] + '12' },
  sortBtnText: { fontSize: 11, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textFaint },
  sortBtnTextActive: { color: theme.colors.primary[300], fontFamily: theme.typography.fontFamily.semiBold },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm },
  emptyTitle: { fontSize: theme.typography.heading, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.text, marginTop: theme.spacing.sm },
  emptyText: { fontSize: theme.typography.body, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, textAlign: 'center', lineHeight: 22 },
  listContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  columnWrapper: { gap: CARD_GAP, marginBottom: CARD_GAP },
  card: { width: CARD_WIDTH, backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.lg, overflow: 'hidden', ...theme.shadows.card },
  cardPinned: { borderColor: theme.colors.primary[400], borderWidth: 2 },
  thumbWrap: { width: '100%', aspectRatio: 1, backgroundColor: theme.colors.dark.surfaceLight, position: 'relative' },
  thumbImage: { width: '100%', height: '100%' },
  videoBadge: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(10, 15, 30, 0.8)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: theme.radius.sm },
  videoBadgeText: { fontSize: 9, fontFamily: theme.typography.fontFamily.semiBold, color: '#fff' },
  statusBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: theme.radius.sm },
  statusBadgeText: { fontSize: 9, fontFamily: theme.typography.fontFamily.semiBold },
  pinnedBadge: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: theme.colors.primary[500], paddingHorizontal: 6, paddingVertical: 3, borderRadius: theme.radius.sm },
  pinnedText: { fontSize: 8, fontFamily: theme.typography.fontFamily.bold, color: '#fff' },
  cardBody: { padding: theme.spacing.sm },
  cardTitle: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.text },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cardDate: { fontSize: 10, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textFaint },
  cardSize: { fontSize: 10, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textFaint, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 6, paddingHorizontal: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: theme.radius.sm, backgroundColor: theme.colors.dark.surfaceLight, gap: 4 },
  // Modal shared
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg },
  modalClose: { position: 'absolute', top: theme.spacing.md, right: theme.spacing.md, width: 32, height: 32, borderRadius: theme.radius.full, backgroundColor: theme.colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  // Preview modal
  modalContent: { width: '100%', maxWidth: 500, backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.xl, padding: theme.spacing.lg, ...theme.shadows.elevated },
  modalTitle: { fontSize: theme.typography.heading, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.dark.text, marginBottom: theme.spacing.sm, paddingRight: 40 },
  modalMetaRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md, flexWrap: 'wrap' },
  modalTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.primary[500], paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.sm },
  modalTypeText: { fontSize: 11, fontFamily: theme.typography.fontFamily.semiBold, color: '#fff' },
  modalDate: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim },
  modalStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: theme.radius.sm },
  modalStatusText: { fontSize: 10, fontFamily: theme.typography.fontFamily.semiBold },
  previewWrap: { width: '100%', alignItems: 'center', marginBottom: theme.spacing.md },
  previewImage: { width: '100%', maxHeight: 400, borderRadius: theme.radius.md },
  previewVideo: { width: '100%', maxHeight: 400, borderRadius: theme.radius.md, backgroundColor: '#000' },
  modalSize: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textFaint, marginBottom: theme.spacing.sm },
  shareLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.primary[500] + '10', borderRadius: theme.radius.sm, paddingHorizontal: 10, paddingVertical: 8, marginBottom: theme.spacing.md },
  shareLinkText: { flex: 1, fontSize: 11, fontFamily: theme.typography.fontFamily.medium, color: theme.colors.primary[300] },
  previewSnsTitle: { fontSize: 13, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.text, marginBottom: 8 },
  previewSnsRow: { flexDirection: 'row', gap: 8, marginBottom: theme.spacing.md },
  previewSnsBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: theme.radius.md, borderWidth: 1.5, backgroundColor: theme.colors.dark.surfaceLight },
  previewSnsText: { fontSize: 12, fontFamily: theme.typography.fontFamily.semiBold },
  modalActions: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
  modalKarrotBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.warning[500] + '15' },
  modalKarrotText: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.warning[400] },
  modalQrBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.success[500] + '15' },
  modalQrText: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.success[400] },
  modalDownloadBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary[500] },
  modalDownloadText: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.bold, color: '#fff' },
  // Re-export modal
  reexportModalContent: { width: '100%', maxWidth: 400, backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.xl, padding: theme.spacing.lg, ...theme.shadows.elevated },
  reexportHeader: { alignItems: 'center', gap: 8, marginBottom: theme.spacing.lg },
  reexportHeaderIcon: { width: 56, height: 56, borderRadius: theme.radius.lg, backgroundColor: theme.colors.accent[500] + '20', justifyContent: 'center', alignItems: 'center' },
  reexportTitle: { fontSize: theme.typography.heading, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.dark.text },
  reexportSubtitle: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, textAlign: 'center', lineHeight: 18 },
  reexportFormatList: { gap: 10 },
  reexportFormatCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.dark.surfaceLight, borderRadius: theme.radius.md, padding: 14 },
  reexportFormatIcon: { width: 44, height: 44, borderRadius: theme.radius.md, justifyContent: 'center', alignItems: 'center' },
  reexportFormatInfo: { flex: 1 },
  reexportFormatLabel: { fontSize: theme.typography.body, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.text },
  reexportFormatRatio: { fontSize: 11, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, marginTop: 2 },
  reexportProcessingText: { fontSize: 10, fontFamily: theme.typography.fontFamily.medium, color: theme.colors.accent[400] },
  reexportDoneCard: { alignItems: 'center', gap: 12, paddingVertical: theme.spacing.lg },
  reexportDoneTitle: { fontSize: theme.typography.heading, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.success[400] },
  reexportDoneDesc: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, textAlign: 'center' },
  reexportDoneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: theme.spacing.xl, borderRadius: theme.radius.md, backgroundColor: theme.colors.success[500], marginTop: theme.spacing.sm },
  reexportDoneBtnText: { fontSize: theme.typography.body, fontFamily: theme.typography.fontFamily.bold, color: '#fff' },
  // A/B Comparison modal
  abModalContent: { width: '100%', maxWidth: 480, backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.xl, padding: theme.spacing.lg, ...theme.shadows.elevated, maxHeight: '85%' },
  abHeader: { alignItems: 'center', gap: 8, marginBottom: theme.spacing.lg },
  abHeaderIcon: { width: 56, height: 56, borderRadius: theme.radius.lg, backgroundColor: theme.colors.success[500] + '20', justifyContent: 'center', alignItems: 'center' },
  abTitle: { fontSize: theme.typography.heading, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.dark.text },
  abSubtitle: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, textAlign: 'center', lineHeight: 18 },
  abBestSection: { marginBottom: theme.spacing.lg },
  abBestHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  abBestTitle: { fontSize: 14, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.dark.text },
  abBestCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.dark.surfaceLight, borderRadius: theme.radius.md, padding: 10, marginBottom: 6 },
  abBestThumb: { width: 48, height: 48, borderRadius: theme.radius.sm },
  abBestInfo: { flex: 1 },
  abBestName: { fontSize: 12, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.text },
  abBestStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  abBestStatusText: { fontSize: 10, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.success[400] },
  abPinBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: theme.radius.full, backgroundColor: theme.colors.dark.bg, borderWidth: 1.5, borderColor: theme.colors.primary[400] + '40' },
  abPinBtnActive: { backgroundColor: theme.colors.primary[500] },
  abPinText: { fontSize: 11, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.primary[300] },
  abPinTextActive: { color: '#fff' },
  abSectionLabel: { fontSize: 13, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.text, marginBottom: 8 },
  abPersonaRow: { flexDirection: 'row', gap: 8, marginBottom: theme.spacing.md },
  abPersonaCard: { flex: 1, backgroundColor: theme.colors.dark.surfaceLight, borderRadius: theme.radius.lg, padding: 12, gap: 6, borderWidth: 1.5, alignItems: 'center' },
  abPersonaEmoji: { fontSize: 22 },
  abPersonaLabel: { fontSize: 11, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.text },
  abPersonaPreview: { width: '100%', aspectRatio: 0.8, borderRadius: theme.radius.md, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  abPersonaThumb: { width: '100%', height: '100%' },
  abPersonaPlayBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 16, borderRadius: theme.radius.full },
  abPersonaPlayText: { fontSize: 11, fontFamily: theme.typography.fontFamily.semiBold },
  abEmptyText: { fontSize: 12, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, textAlign: 'center', marginTop: theme.spacing.sm },
  // Remix modal
  remixModalContent: { width: '100%', maxWidth: 480, backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.xl, padding: theme.spacing.lg, ...theme.shadows.elevated, maxHeight: '85%' },
  remixHeader: { alignItems: 'center', gap: 8, marginBottom: theme.spacing.lg },
  remixHeaderIcon: { width: 56, height: 56, borderRadius: theme.radius.lg, backgroundColor: theme.colors.accent[500] + '20', justifyContent: 'center', alignItems: 'center' },
  remixTitle: { fontSize: theme.typography.heading, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.dark.text },
  remixSubtitle: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, textAlign: 'center', lineHeight: 18 },
  remixScroll: { maxHeight: 400 },
  remixSectionTitle: { fontSize: 14, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.dark.text, marginBottom: 4 },
  remixSectionDesc: { fontSize: 11, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, marginBottom: 10, lineHeight: 15 },
  remixHookList: { gap: 8, marginBottom: theme.spacing.lg },
  remixHookCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.dark.surfaceLight, borderRadius: theme.radius.md, padding: 12, borderWidth: 1.5, borderColor: 'transparent' },
  remixHookIcon: { width: 36, height: 36, borderRadius: theme.radius.md, justifyContent: 'center', alignItems: 'center' },
  remixHookInfo: { flex: 1 },
  remixHookLabel: { fontSize: 13, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.text },
  remixHookText: { fontSize: 11, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, marginTop: 2, lineHeight: 15 },
  remixBgmRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: theme.spacing.lg },
  remixBgmCard: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.dark.surfaceLight, borderRadius: theme.radius.md, padding: 10, borderWidth: 1.5, borderColor: 'transparent' },
  remixBgmIcon: { width: 32, height: 32, borderRadius: theme.radius.sm, justifyContent: 'center', alignItems: 'center' },
  remixBgmLabel: { fontSize: 12, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.text, flex: 1 },
  remixCheck: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  remixStartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: theme.radius.lg, backgroundColor: theme.colors.accent[500], marginBottom: theme.spacing.sm },
  remixStartBtnDisabled: { backgroundColor: theme.colors.dark.surfaceLight, borderWidth: 1.5, borderColor: theme.colors.dark.border },
  remixStartBtnText: { fontSize: 15, fontFamily: theme.typography.fontFamily.bold, color: '#fff' },
  remixDoneCard: { alignItems: 'center', gap: 12, paddingVertical: theme.spacing.lg },
  remixDoneTitle: { fontSize: theme.typography.heading, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.success[400] },
  remixDoneDesc: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, textAlign: 'center' },
  remixDoneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: theme.spacing.xl, borderRadius: theme.radius.md, backgroundColor: theme.colors.success[500], marginTop: theme.spacing.sm },
  remixDoneBtnText: { fontSize: theme.typography.body, fontFamily: theme.typography.fontFamily.bold, color: '#fff' },
  // Status picker modal
  statusModalContent: { width: '100%', maxWidth: 400, backgroundColor: theme.colors.dark.surface, borderRadius: theme.radius.xl, padding: theme.spacing.lg, ...theme.shadows.elevated },
  statusHeader: { alignItems: 'center', gap: 8, marginBottom: theme.spacing.lg },
  statusHeaderIcon: { width: 56, height: 56, borderRadius: theme.radius.lg, backgroundColor: theme.colors.warning[500] + '20', justifyContent: 'center', alignItems: 'center' },
  statusTitle: { fontSize: theme.typography.heading, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.dark.text },
  statusSubtitle: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim },
  statusOptions: { gap: 10, marginBottom: theme.spacing.lg },
  statusOptionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.dark.surfaceLight, borderRadius: theme.radius.md, padding: 14, borderWidth: 1.5, borderColor: 'transparent' },
  statusOptionIcon: { width: 40, height: 40, borderRadius: theme.radius.md, justifyContent: 'center', alignItems: 'center' },
  statusOptionInfo: { flex: 1 },
  statusOptionLabel: { fontSize: theme.typography.body, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.text },
  shareUrlLabel: { fontSize: theme.typography.micro, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.dark.textDim, marginBottom: 6 },
  shareUrlInput: { fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.text, backgroundColor: theme.colors.dark.surfaceLight, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, paddingVertical: 10, marginBottom: theme.spacing.lg },
  statusSaveBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.warning[500] },
  statusSaveBtnText: { fontSize: theme.typography.body, fontFamily: theme.typography.fontFamily.bold, color: '#fff' },
});
