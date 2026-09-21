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
} from 'react-native';
import {
  LayoutGrid,
  Plus,
  Trash2,
  Copy,
  Check,
  X,
  FileText,
  Hash,
  Sparkles,
  Type,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useSubTabBarHeight } from '@/hooks/useSubTabBarHeight';
import { useSafeTop } from '@/hooks/useSafeTop';
import { fetchSnippets, addSnippet, deleteSnippet } from '@/lib/marketingSnippets';
import type { MarketingSnippet } from '@/types/database';

const SNIPPET_TYPES = [
  { key: 'copy' as const, label: '마케팅 문구', icon: FileText, color: theme.colors.primary[400] },
  { key: 'hashtag' as const, label: '해시태그', icon: Hash, color: theme.colors.accent[400] },
  { key: 'hook' as const, label: '후킹 문장', icon: Sparkles, color: theme.colors.warning[400] },
];

const TEMPLATES = [
  { id: 'cardnews', title: '카드뉴스 템플릿', desc: '5장 이미지 + 제목 + CTA', icon: LayoutGrid, color: theme.colors.primary[400] },
  { id: 'detail', title: '상세페이지 템플릿', desc: '상품 특징 + 리뷰 + 구매 링크', icon: FileText, color: theme.colors.accent[400] },
  { id: 'shortform', title: '숏폼 스크립트', desc: '15~30초 후킹 스크립트', icon: Sparkles, color: theme.colors.warning[400] },
];

export default function AssetsScreen() {
  const tabBarHeight = useSubTabBarHeight();
  const safeTop = useSafeTop();
  const [snippets, setSnippets] = useState<MarketingSnippet[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [snippetType, setSnippetType] = useState<MarketingSnippet['snippet_type']>('copy');

  const load = useCallback(async () => {
    try {
      const data = await fetchSnippets();
      setSnippets(data);
    } catch {
      setSnippets([]);
    } finally {
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

  const handleCopy = async (snippet: MarketingSnippet) => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(snippet.content);
      } else {
        const { default: Clipboard } = await import('expo-clipboard');
        await Clipboard.setStringAsync(snippet.content);
      }
      setCopiedId(snippet.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard failed
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSnippet(id);
      setSnippets((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // ignore
    }
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleTemplatePress = (tplId: string) => {
    const tpl = TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    const presets: Record<string, { type: MarketingSnippet['snippet_type']; title: string; content: string }> = {
      cardnews: { type: 'copy', title: '카드뉴스 제작', content: '[1장] 문제 제기: ___\n[2장] 해결책: ___\n[3장] 상품 특징: ___\n[4장] 사용 전/후 비교: ___\n[5장] CTA: 지금 확인하기 →' },
      detail: { type: 'copy', title: '상세페이지 문구', content: '상품명: ___\n핵심 특징 3가지:\n1. ___\n2. ___\n3. ___\n실제 사용 후기: ___\n구매 링크: ___' },
      shortform: { type: 'hook', title: '숏폼 후킹 스크립트', content: '0~3초: "이거 모르면 손해!"\n3~7초: 상품 핵심 매력 한 줄\n7~15초: Before & After 시각적 변화\n15~30초: CTA + 제휴 링크 안내' },
    };
    const preset = presets[tplId];
    if (preset) {
      setSnippetType(preset.type);
      setTitle(preset.title);
      setContent(preset.content);
      setShowAdd(true);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await addSnippet(title.trim(), content.trim(), snippetType);
      if (result) {
        setSnippets((prev) => [result, ...prev]);
        setShowAdd(false);
        setTitle('');
        setContent('');
        setSnippetType('copy');
      } else {
        setSaveError('저장에 실패했습니다. 다시 시도해주세요.');
      }
    } catch {
      setSaveError('저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const getTypeMeta = (type: MarketingSnippet['snippet_type']) => {
    return SNIPPET_TYPES.find((t) => t.key === type) || SNIPPET_TYPES[0];
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
        <Text style={styles.headerTitle}>마케팅 소재</Text>
        <Text style={styles.headerSubtext}>
          템플릿과 마케팅 문구를 관리하고 재사용하세요
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
        <Text style={styles.sectionTitle}>소재 템플릿</Text>
        <Text style={styles.sectionDesc}>
          제휴 상품 판매에 특화된 템플릿으로 빠르게 콘텐츠를 제작하세요
        </Text>

        <View style={styles.templateGrid}>
          {TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <TouchableOpacity
                key={tpl.id}
                style={styles.templateCard}
                activeOpacity={0.7}
                onPress={() => handleTemplatePress(tpl.id)}
              >
                <View style={[styles.templateIcon, { backgroundColor: tpl.color + '20' }]}>
                  <Icon size={22} color={tpl.color} strokeWidth={2} />
                </View>
                <Text style={styles.templateTitle}>{tpl.title}</Text>
                <Text style={styles.templateDesc}>{tpl.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>마케팅 문구 보관함</Text>
          <TouchableOpacity
            style={styles.addSmallBtn}
            onPress={() => setShowAdd(true)}
            activeOpacity={0.7}
          >
            <Plus size={16} color={theme.colors.primary[400]} strokeWidth={2.5} />
            <Text style={styles.addSmallBtnText}>추가</Text>
          </TouchableOpacity>
        </View>

        {snippets.length === 0 ? (
          <View style={styles.emptyState}>
            <Type size={56} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>저장된 문구가 없습니다</Text>
            <Text style={styles.emptyText}>
              자주 사용하는 마케팅 문구, 해시태그, 후킹 문장을 저장해 두세요.
            </Text>
          </View>
        ) : (
          <View style={styles.snippetList}>
            {snippets.map((snippet) => {
              const meta = getTypeMeta(snippet.snippet_type);
              const Icon = meta.icon;
              return (
                <View key={snippet.id} style={styles.snippetCard}>
                  <View style={styles.snippetHeader}>
                    <View style={[styles.snippetTypeBadge, { backgroundColor: meta.color + '20' }]}>
                      <Icon size={12} color={meta.color} strokeWidth={2} />
                      <Text style={[styles.snippetTypeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDelete(snippet.id)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Trash2 size={15} color={theme.colors.error[400]} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.snippetTitle}>{snippet.title}</Text>
                  <Text style={styles.snippetContent} numberOfLines={4}>{snippet.content}</Text>
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={() => handleCopy(snippet)}
                    activeOpacity={0.7}
                  >
                    {copiedId === snippet.id ? (
                      <Check size={14} color={theme.colors.success[400]} strokeWidth={2} />
                    ) : (
                      <Copy size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
                    )}
                    <Text style={styles.copyBtnText}>
                      {copiedId === snippet.id ? '복사됨' : '복사하기'}
                    </Text>
                  </TouchableOpacity>
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
              <Text style={styles.modalTitle}>새 문구 추가</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={22} color={theme.colors.dark.textDim} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>유형</Text>
            <View style={styles.typeRow}>
              {SNIPPET_TYPES.map((t) => {
                const Icon = t.icon;
                const isActive = snippetType === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.typeChip, isActive && { borderColor: t.color, backgroundColor: t.color + '15' }]}
                    onPress={() => setSnippetType(t.key)}
                    activeOpacity={0.7}
                  >
                    <Icon size={14} color={t.color} strokeWidth={2} />
                    <Text style={[styles.typeChipText, isActive && { color: t.color }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.inputLabel}>제목</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="예: 여름 스킨케어 후킹"
              placeholderTextColor={theme.colors.dark.textFaint}
            />

            <Text style={styles.inputLabel}>내용</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={content}
              onChangeText={setContent}
              placeholder="마케팅 문구를 입력하세요..."
              placeholderTextColor={theme.colors.dark.textFaint}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {saveError && (
              <Text style={styles.saveErrorText}>{saveError}</Text>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || !title.trim() || !content.trim()}
              activeOpacity={0.7}
            >
              <Text style={styles.saveBtnText}>{saving ? '저장 중...' : '저장하기'}</Text>
            </TouchableOpacity>
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
  sectionTitle: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
    marginBottom: theme.spacing.md,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: theme.spacing.lg,
  },
  templateCard: {
    width: '48%',
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  templateIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  templateTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 4,
  },
  templateDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  addSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500] + '15',
    borderWidth: 1.5,
    borderColor: theme.colors.primary[400] + '40',
  },
  addSmallBtnText: {
    fontSize: 12,
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
  snippetList: {
    gap: 10,
  },
  snippetCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  snippetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  snippetTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  snippetTypeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
  },
  snippetTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 6,
  },
  snippetContent: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 19,
    marginBottom: 10,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  copyBtnText: {
    fontSize: 12,
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
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
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
  typeChipText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
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
  textArea: {
    minHeight: 80,
    paddingTop: 12,
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
  saveErrorText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    marginTop: 8,
    textAlign: 'center',
  },
});
