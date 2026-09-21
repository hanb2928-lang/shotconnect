import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  RefreshControl,
  Platform,
  Linking,
} from 'react-native';
import {
  Link2,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  X,
  ShoppingBag,
  Send,
  Globe,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useSubTabBarHeight } from '@/hooks/useSubTabBarHeight';
import { useSafeTop } from '@/hooks/useSafeTop';
import { fetchLinkBookmarks, addLinkBookmark, deleteLinkBookmark } from '@/lib/linkBookmarks';
import { validateAffiliateUrl } from '@/lib/affiliate';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { ErrorRetryBanner } from '@/components/ErrorRetryBanner';
import { friendlyError } from '@/lib/errors';
import * as Clipboard from 'expo-clipboard';
import type { LinkBookmark } from '@/types/database';

const PLATFORM_OPTIONS = [
  { key: 'Coupang', label: '쿠팡', icon: ShoppingBag, color: '#FF3E3E' },
  { key: 'Toss', label: '토스', icon: Send, color: '#0064FF' },
  { key: 'BrandConnect', label: '네이버', icon: Globe, color: '#03C75A' },
  { key: 'Other', label: '기타', icon: Link2, color: '#64748b' },
] as const;

export default function LinksScreen() {
  const tabBarHeight = useSubTabBarHeight();
  const safeTop = useSafeTop();
  const [bookmarks, setBookmarks] = useState<LinkBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showQR, setShowQR] = useState<LinkBookmark | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState<string>('Coupang');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchLinkBookmarks();
      setBookmarks(data);
    } catch (err) {
      setLoadError(friendlyError(err, '링크 목록을 불러오지 못했습니다. 네트워크 연결을 확인해주세요.'));
      setBookmarks([]);
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
    load();
  };

  const handleCopy = async (bookmark: LinkBookmark) => {
    const copyText = bookmark.short_url || bookmark.url;
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(copyText);
      } else {
        const { default: Clipboard } = await import('expo-clipboard');
        await Clipboard.setStringAsync(copyText);
      }
      setCopiedId(bookmark.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard failed
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLinkBookmark(id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    } catch {
      // ignore
    }
  };

  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlWarning, setUrlWarning] = useState<string | null>(null);

  const handleSave = async () => {
    if (!label.trim() || !url.trim()) return;
    const validation = validateAffiliateUrl(url);
    if (!validation.valid) {
      setUrlError(validation.error);
      setUrlWarning(null);
      return;
    }
    setUrlError(null);
    setUrlWarning(validation.warning);
    setSaving(true);
    try {
      const result = await addLinkBookmark(label.trim(), url.trim(), platform);
      if (result) {
        setBookmarks((prev) => [result, ...prev]);
        setShowAdd(false);
        setLabel('');
        setUrl('');
        setPlatform('Coupang');
      } else {
        setLoadError('링크 저장에 실패했습니다. 다시 시도해주세요.');
      }
    } catch {
      setLoadError('링크 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const getPlatformMeta = (key: string) => {
    return PLATFORM_OPTIONS.find((p) => p.key === key) || PLATFORM_OPTIONS[3];
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
        <Text style={styles.headerTitle}>링크 관리</Text>
        <Text style={styles.headerSubtext}>
          제휴 링크를 저장하고 단축 URL·QR코드로 공유하세요
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
        {loadError && (
          <ErrorRetryBanner message={loadError} onRetry={load} retrying={loading} />
        )}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAdd(true)}
          activeOpacity={0.7}
        >
          <Plus size={18} color={theme.colors.primary[400]} strokeWidth={2} />
          <Text style={styles.addButtonText}>새 링크 추가</Text>
        </TouchableOpacity>

        {bookmarks.length === 0 ? (
          <View style={styles.emptyState}>
            <Link2 size={56} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>저장된 링크가 없습니다</Text>
            <Text style={styles.emptyText}>
              제휴 링크를 추가하면 단축 URL과 QR코드가 자동으로 생성됩니다.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {bookmarks.map((bookmark) => {
              const meta = getPlatformMeta(bookmark.platform);
              const Icon = meta.icon;
              return (
                <View key={bookmark.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.platformIcon, { backgroundColor: meta.color + '20' }]}>
                      <Icon size={16} color={meta.color} strokeWidth={2} />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardLabel} numberOfLines={1}>{bookmark.label}</Text>
                      <Text style={styles.cardPlatform}>{meta.label}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDelete(bookmark.id)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Trash2 size={16} color={theme.colors.error[400]} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>

                  {bookmark.short_url ? (
                    <Text style={styles.shortUrl} numberOfLines={1}>{bookmark.short_url}</Text>
                  ) : (
                    <Text style={styles.cardUrl} numberOfLines={1}>{bookmark.url}</Text>
                  )}

                  <View style={styles.cardStats}>
                    <Text style={styles.clickCount}>클릭 {bookmark.click_count}회</Text>
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleCopy(bookmark)}
                      activeOpacity={0.7}
                    >
                      {copiedId === bookmark.id ? (
                        <Check size={14} color={theme.colors.success[400]} strokeWidth={2} />
                      ) : (
                        <Copy size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
                      )}
                      <Text style={styles.actionBtnText}>
                        {copiedId === bookmark.id ? '복사됨' : '복사'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => setShowQR(bookmark)}
                      activeOpacity={0.7}
                    >
                      <QrCode size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
                      <Text style={styles.actionBtnText}>QR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => Linking.openURL(bookmark.short_url || bookmark.url).catch(() => {})}
                      activeOpacity={0.7}
                    >
                      <ExternalLink size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
                      <Text style={styles.actionBtnText}>열기</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>새 링크 추가</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={22} color={theme.colors.dark.textDim} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>라벨</Text>
            <TextInput
              style={styles.input}
              value={label}
              onChangeText={setLabel}
              placeholder="예: 스킨케어 세트 링크"
              placeholderTextColor={theme.colors.dark.textFaint}
            />

            <Text style={styles.inputLabel}>URL</Text>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={(text) => { setUrl(text); setUrlError(null); setUrlWarning(null); }}
              placeholder="https://..."
              placeholderTextColor={theme.colors.dark.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            {urlError && (
              <Text style={styles.urlErrorText}>{urlError}</Text>
            )}
            {urlWarning && !urlError && (
              <Text style={styles.urlWarningText}>{urlWarning}</Text>
            )}

            <Text style={styles.inputLabel}>플랫폼</Text>
            <View style={styles.platformRow}>
              {PLATFORM_OPTIONS.map((p) => {
                const Icon = p.icon;
                const isActive = platform === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[styles.platformChip, isActive && { borderColor: p.color, backgroundColor: p.color + '15' }]}
                    onPress={() => setPlatform(p.key)}
                    activeOpacity={0.7}
                  >
                    <Icon size={14} color={p.color} strokeWidth={2} />
                    <Text style={[styles.platformChipText, isActive && { color: p.color }]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || !label.trim() || !url.trim()}
              activeOpacity={0.7}
            >
              <Text style={styles.saveBtnText}>{saving ? '저장 중...' : '저장하기'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!showQR} transparent animationType="fade" onRequestClose={() => setShowQR(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.qrSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>QR코드</Text>
              <TouchableOpacity onPress={() => setShowQR(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={22} color={theme.colors.dark.textDim} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            {showQR && (
              <View style={styles.qrContainer}>
                <QRCodeDisplay value={showQR.short_url || showQR.url} size={200} />
                <Text style={styles.qrLabel}>{showQR.label}</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500] + '15',
    borderWidth: 1.5,
    borderColor: theme.colors.primary[400] + '40',
    marginBottom: theme.spacing.md,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
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
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  platformIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  cardPlatform: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  shortUrl: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
    marginBottom: 6,
  },
  cardUrl: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginBottom: 6,
  },
  cardStats: {
    marginBottom: 8,
  },
  clickCount: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  actionBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: theme.colors.dark.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  qrSheet: {
    backgroundColor: theme.colors.dark.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  inputLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  platformRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  platformChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  platformChipText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary[500],
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  urlErrorText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 15,
  },
  urlWarningText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.warning[400],
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 15,
  },
  qrContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  qrLabel: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginTop: 12,
  },
});
