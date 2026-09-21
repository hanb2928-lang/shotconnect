import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { Link2, Copy, Check, ExternalLink, Plus, X, ShoppingBag } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';
import {
  getOrCreateLinkInBio,
  updateLinkInBio,
  buildLinkInBioUrl,
  type LinkInBioPage,
} from '@/lib/linkInBio';

interface LinkInBioCardProps {
  scanId: string;
  scanTitle: string;
}

export function LinkInBioCard({ scanId, scanTitle }: LinkInBioCardProps) {
  const [page, setPage] = useState<LinkInBioPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [included, setIncluded] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await getOrCreateLinkInBio();
      if (p) {
        setPage(p);
        setIncluded(p.scan_ids.includes(scanId));
        setTitleInput(p.title);
      }
      setLoading(false);
    })();
  }, [scanId]);

  const bioUrl = page ? buildLinkInBioUrl(page.slug) : '';

  const handleToggleInclude = useCallback(async () => {
    if (!page) return;
    setSaving(true);
    const newIds = included
      ? page.scan_ids.filter((id) => id !== scanId)
      : [...page.scan_ids, scanId];
    const updated = await updateLinkInBio(page.id, { scan_ids: newIds });
    if (updated) {
      setPage(updated);
      setIncluded(!included);
    }
    setSaving(false);
  }, [page, included, scanId]);

  const handleSaveTitle = useCallback(async () => {
    if (!page) return;
    setSaving(true);
    const updated = await updateLinkInBio(page.id, { title: titleInput.trim() || '내 상품 모음' });
    if (updated) setPage(updated);
    setEditingTitle(false);
    setSaving(false);
  }, [page, titleInput]);

  const handleCopyUrl = useCallback(async () => {
    if (!bioUrl) return;
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(bioUrl);
      } else {
        await Clipboard.setStringAsync(bioUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard failed
    }
  }, [bioUrl]);

  const handleOpenPage = useCallback(() => {
    if (!bioUrl) return;
    if (Platform.OS === 'web') {
      window.open(bioUrl, '_blank');
    }
  }, [bioUrl]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Link2 size={18} color={theme.colors.accent[400]} strokeWidth={2} />
          <Text style={styles.headerTitle}>링크인바이오 랜딩페이지</Text>
        </View>
        <ActivityIndicator size="small" color={theme.colors.accent[400]} style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Link2 size={18} color={theme.colors.accent[400]} strokeWidth={2} />
        <Text style={styles.headerTitle}>링크인바이오 랜딩페이지</Text>
      </View>

      <Text style={styles.description}>
        인스타그램, 틱톡 본문에 외부 링크를 못 거는 제약에 대비해, 모든 상품을 한 페이지에 모아두는 랜딩페이지를 자동 생성합니다. 프로필 바이오에 이 링크 하나만 넣으세요.
      </Text>

      {/* URL display + copy */}
      <View style={styles.urlBox}>
        <Text style={styles.urlText} numberOfLines={1}>{bioUrl}</Text>
        <View style={styles.urlActions}>
          <TouchableOpacity style={styles.urlBtn} onPress={handleCopyUrl} activeOpacity={0.7}>
            {copied ? (
              <Check size={14} color={theme.colors.success[400]} strokeWidth={2.5} />
            ) : (
              <Copy size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.urlBtn} onPress={handleOpenPage} activeOpacity={0.7}>
            <ExternalLink size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {copied && (
        <Text style={styles.copiedHint}>링크가 복사됐어요. 프로필 바이오에 붙여넣으세요.</Text>
      )}

      {/* Title editor */}
      <View style={styles.titleRow}>
        {editingTitle ? (
          <View style={styles.titleEditRow}>
            <TextInput
              style={styles.titleInput}
              value={titleInput}
              onChangeText={setTitleInput}
              placeholder="랜딩페이지 제목"
              placeholderTextColor={theme.colors.dark.textFaint}
            />
            <TouchableOpacity style={styles.titleSaveBtn} onPress={handleSaveTitle} disabled={saving} activeOpacity={0.7}>
              <Check size={14} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.titleCancelBtn} onPress={() => { setEditingTitle(false); setTitleInput(page?.title ?? ''); }} activeOpacity={0.7}>
              <X size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.titleDisplayRow} onPress={() => setEditingTitle(true)} activeOpacity={0.7}>
            <Text style={styles.pageTitle} numberOfLines={1}>{page?.title ?? '내 상품 모음'}</Text>
            <Text style={styles.editHint}>편집</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Include current scan toggle */}
      <TouchableOpacity
        style={[styles.includeBtn, included && styles.includeBtnActive]}
        onPress={handleToggleInclude}
        disabled={saving}
        activeOpacity={0.7}
      >
        {included ? (
          <Check size={16} color={theme.colors.success[400]} strokeWidth={2.5} />
        ) : (
          <Plus size={16} color={theme.colors.accent[400]} strokeWidth={2} />
        )}
        <Text style={[styles.includeBtnText, included && { color: theme.colors.success[400] }]}>
          {included ? '이 상품이 랜딩페이지에 포함됨' : `이 상품("${scanTitle}")을 랜딩페이지에 추가`}
        </Text>
        {saving && <ActivityIndicator size="small" color={theme.colors.dark.textDim} />}
      </TouchableOpacity>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <ShoppingBag size={14} color={theme.colors.accent[400]} strokeWidth={2} />
          <Text style={styles.statText}>포함된 상품 {page?.scan_ids.length ?? 0}개</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  description: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
  urlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  urlText: {
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.accent[300],
  },
  urlActions: {
    flexDirection: 'row',
    gap: 4,
  },
  urlBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copiedHint: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.success[400],
    marginBottom: theme.spacing.md,
  },
  titleRow: {
    marginTop: theme.spacing.md,
  },
  titleEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleInput: {
    flex: 1,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  titleSaveBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.success[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleCancelBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  editHint: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  includeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: theme.spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500] + '12',
    borderWidth: 1.5,
    borderColor: theme.colors.accent[400] + '40',
  },
  includeBtnActive: {
    backgroundColor: theme.colors.success[500] + '12',
    borderColor: theme.colors.success[400] + '40',
  },
  includeBtnText: {
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  loader: {
    marginTop: theme.spacing.md,
  },
});
