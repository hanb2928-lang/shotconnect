import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import {
  Grid2x2,
  Plus,
  MessageCircle,
  Link2,
  Check,
  Trash2,
  X,
  Sparkles,
  Image as ImageIcon,
  ArrowRight,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import type { BoundAffiliateLink } from '@/components/InspectorPanel';

export interface ToonCut {
  id: string;
  label: string;
  speechBubble: string;
  affiliateLink: BoundAffiliateLink | null;
  imageUrl: string | null;
}

interface ToonModeEditorProps {
  visible: boolean;
  onClose: () => void;
  onPublish?: (cuts: ToonCut[]) => void;
  onCutSelected?: (cutId: string) => void;
  boundLinks?: BoundAffiliateLink[];
}

const DEFAULT_CUTS: Omit<ToonCut, 'id'>[] = [
  { label: '컷 1', speechBubble: '이거 보셨어요?', affiliateLink: null, imageUrl: null },
  { label: '컷 2', speechBubble: '', affiliateLink: null, imageUrl: null },
  { label: '컷 3', speechBubble: '', affiliateLink: null, imageUrl: null },
  { label: '컷 4', speechBubble: '', affiliateLink: null, imageUrl: null },
];

let cutCounter = 0;
function makeCutId(): string {
  cutCounter += 1;
  return `toon_cut_${Date.now()}_${cutCounter}`;
}

export function ToonModeEditor({
  visible,
  onClose,
  onPublish,
  onCutSelected,
  boundLinks = [],
}: ToonModeEditorProps) {
  const [cuts, setCuts] = useState<ToonCut[]>(() =>
    DEFAULT_CUTS.map((c) => ({ ...c, id: makeCutId() })),
  );
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [editingBubbleId, setEditingBubbleId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const handleAddCut = useCallback(() => {
    setCuts((prev) => {
      if (prev.length >= 9) return prev;
      const num = prev.length + 1;
      return [...prev, {
        id: makeCutId(),
        label: `컷 ${num}`,
        speechBubble: '',
        affiliateLink: null,
        imageUrl: null,
      }];
    });
  }, []);

  const handleRemoveCut = useCallback((id: string) => {
    setCuts((prev) => prev.length > 1 ? prev.filter((c) => c.id !== id) : prev);
    setSelectedCutId((prev) => prev === id ? null : prev);
  }, []);

  const handleSelectCut = useCallback((id: string) => {
    setSelectedCutId(id);
    onCutSelected?.(id);
  }, [onCutSelected]);

  const handleUpdateBubble = useCallback((id: string, text: string) => {
    setCuts((prev) => prev.map((c) => c.id === id ? { ...c, speechBubble: text } : c));
  }, []);

  // Auto-bind the latest affiliate link from inspector to the selected cut
  const handleBindToCut = useCallback((cutId: string, link: BoundAffiliateLink) => {
    setCuts((prev) => prev.map((c) => c.id === cutId ? { ...c, affiliateLink: link } : c));
  }, []);

  // When boundLinks changes, auto-bind the newest to the selected cut
  const lastBoundIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (boundLinks.length === 0 || !selectedCutId) return;
    const latest = boundLinks[boundLinks.length - 1];
    if (latest.productId !== lastBoundIdRef.current) {
      lastBoundIdRef.current = latest.productId;
      handleBindToCut(selectedCutId, latest);
    }
  }, [boundLinks, selectedCutId, handleBindToCut]);

  const handlePublish = useCallback(() => {
    onPublish?.(cuts);
  }, [cuts, onPublish]);

  if (!visible) return null;

  const selectedCut = cuts.find((c) => c.id === selectedCutId) ?? null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Grid2x2 size={18} color={theme.colors.primary[500]} strokeWidth={2.5} />
          </View>
          <View>
            <Text style={styles.headerTitle}>만화모드 (Toon Mode)</Text>
            <Text style={styles.headerSub}>만화 컷 그리드로 제휴 마케팅 콘텐츠 제작</Text>
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <X size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolbarBtn} onPress={handleAddCut} activeOpacity={0.7} disabled={cuts.length >= 9}>
            <Plus size={15} color={theme.colors.primary[500]} strokeWidth={2.5} />
            <Text style={[styles.toolbarBtnText, cuts.length >= 9 && styles.toolbarBtnTextDisabled]}>컷 추가</Text>
          </TouchableOpacity>
          <View style={styles.toolbarInfo}>
            <Text style={styles.toolbarInfoText}>{cuts.length}/9 컷</Text>
          </View>
        </View>

        {/* Comic cut grid */}
        <View style={styles.grid}>
          {cuts.map((cut) => {
            const isSelected = cut.id === selectedCutId;
            return (
              <Pressable
                key={cut.id}
                style={[
                  styles.cutCard,
                  isSelected && styles.cutCardSelected,
                ]}
                onPress={() => handleSelectCut(cut.id)}
              >
                {/* Cut header */}
                <View style={styles.cutHeader}>
                  <Text style={styles.cutLabel}>{cut.label}</Text>
                  <TouchableOpacity
                    style={styles.cutRemoveBtn}
                    onPress={() => handleRemoveCut(cut.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={12} color={theme.colors.error[400]} strokeWidth={2} />
                  </TouchableOpacity>
                </View>

                {/* Cut image placeholder */}
                <View style={styles.cutImageArea}>
                  {cut.imageUrl ? null : (
                    <View style={styles.cutImagePlaceholder}>
                      <ImageIcon size={22} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
                      <Text style={styles.cutImageHint}>이미지 추가</Text>
                    </View>
                  )}
                </View>

                {/* Speech bubble */}
                <View style={styles.bubbleArea}>
                  <View style={styles.bubbleRow}>
                    <MessageCircle size={13} color={theme.colors.primary[400]} strokeWidth={2} />
                    {editingBubbleId === cut.id ? (
                      <TextInput
                        style={styles.bubbleInput}
                        value={cut.speechBubble}
                        onChangeText={(t) => handleUpdateBubble(cut.id, t)}
                        onBlur={() => setEditingBubbleId(null)}
                        autoFocus
                        placeholder="말풍선 입력"
                        placeholderTextColor={theme.colors.dark.textFaint}
                        multiline
                      />
                    ) : (
                      <Pressable onPress={() => setEditingBubbleId(cut.id)}>
                        <Text
                          style={styles.bubbleText}
                          numberOfLines={2}
                        >
                          {cut.speechBubble || '말풍선 입력...'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Affiliate link badge */}
                {cut.affiliateLink ? (
                  <View style={styles.linkBadge}>
                    <Link2 size={11} color={theme.colors.success[600]} strokeWidth={2.5} />
                    <Text style={styles.linkBadgeText} numberOfLines={1}>
                      {cut.affiliateLink.productName}
                    </Text>
                    <Check size={11} color={theme.colors.success[600]} strokeWidth={2.5} />
                  </View>
                ) : (
                  <View style={styles.linkBadgeEmpty}>
                    <Link2 size={11} color={theme.colors.dark.textFaint} strokeWidth={2} />
                    <Text style={styles.linkBadgeEmptyText}>
                      {isSelected ? '우측에서 상품 검색 후 바인딩' : '제휴 링크 없음'}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Selected cut detail panel */}
        {selectedCut && (
          <View style={styles.detailPanel}>
            <Text style={styles.detailTitle}>선택된 컷: {selectedCut.label}</Text>
            <Text style={styles.detailHint}>
              우측 인스펙터 패널에서 쿠팡 파트너스 상품을 검색하고 "바인딩" 버튼을 누르면 이 컷에 제휴 링크가 자동 연결됩니다.
            </Text>
            {selectedCut.affiliateLink && (
              <View style={styles.detailLinkCard}>
                <View style={styles.detailLinkInfo}>
                  <Text style={styles.detailLinkName} numberOfLines={1}>{selectedCut.affiliateLink.productName}</Text>
                  <Text style={styles.detailLinkUrl} numberOfLines={1}>{selectedCut.affiliateLink.url}</Text>
                </View>
                <TouchableOpacity
                  style={styles.detailLinkRemove}
                  onPress={() => handleBindToCut(selectedCut.id, {
                    productId: '',
                    productName: '',
                    platform: '',
                    url: '',
                    subId: '',
                  })}
                  activeOpacity={0.7}
                >
                  <Trash2 size={14} color={theme.colors.error[400]} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Publish button */}
        <TouchableOpacity style={styles.publishBtn} onPress={handlePublish} activeOpacity={0.85}>
          <Sparkles size={16} color="#fff" strokeWidth={2.5} />
          <Text style={styles.publishBtnText}>만화 콘텐츠 생성</Text>
          <ArrowRight size={16} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18181B',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: theme.colors.primary[500] + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  headerSub: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: theme.colors.primary[500] + '12',
  },
  toolbarBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[500],
  },
  toolbarBtnTextDisabled: {
    opacity: 0.4,
  },
  toolbarInfo: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toolbarInfoText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cutCard: {
    width: Platform.OS === 'web' ? '48%' : 145,
    minHeight: 170,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#18181B',
    overflow: 'hidden',
  },
  cutCardSelected: {
    borderColor: theme.colors.primary[500],
    shadowColor: theme.colors.primary[500],
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3,
  },
  cutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  cutLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  cutRemoveBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cutImageArea: {
    height: 70,
    backgroundColor: '#1F1F23',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cutImagePlaceholder: {
    alignItems: 'center',
    gap: 4,
  },
  cutImageHint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  bubbleArea: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    minHeight: 38,
    justifyContent: 'center',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  bubbleInput: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    padding: 0,
    minHeight: 20,
    lineHeight: 16,
  },
  bubbleText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
  },
  linkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  linkBadgeText: {
    flex: 1,
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.success[600],
  },
  linkBadgeEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  linkBadgeEmptyText: {
    flex: 1,
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  // Detail panel
  detailPanel: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#1F1F23',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  detailTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[500],
  },
  detailHint: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
  },
  detailLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  detailLinkInfo: {
    flex: 1,
    gap: 2,
  },
  detailLinkName: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  detailLinkUrl: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  detailLinkRemove: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Publish
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary[500],
    marginTop: 16,
    ...theme.shadows.glowPrimary,
  },
  publishBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
});
