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
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import {
  Grid2x2,
  Plus,
  Link2,
  Check,
  Trash2,
  X,
  Sparkles,
  Image as ImageIcon,
  ArrowRight,
  Upload,
  Zap,
  BookOpen,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import type { BoundAffiliateLink } from '@/components/InspectorPanel';
import { TOON_PERSONA_PRESETS, type ToonCharacter } from '@/components/PhotoToonUpload';
import { useInspectorContext } from '@/lib/inspectorContext';

export interface ToonCut {
  id: string;
  label: string;
  speechBubble: string;
  affiliateLink: BoundAffiliateLink | null;
  imageUrl: string | null;
}

interface CaptureSlot {
  id: string;
  uri: string;
}

interface ToonModeEditorProps {
  visible: boolean;
  onClose: () => void;
  onPublish?: (cuts: ToonCut[]) => void;
  onCutSelected?: (cutId: string) => void;
  boundLinks?: BoundAffiliateLink[];
  toonCharacter?: ToonCharacter | null;
  onCharacterCreated?: (char: ToonCharacter) => void;
}

const MAX_SLOTS = 10;
const MAX_CUTS = 12;

let cutCounter = 0;
function makeCutId(): string {
  cutCounter += 1;
  return `toon_cut_${Date.now()}_${cutCounter}`;
}

let slotCounter = 0;
function makeSlotId(): string {
  slotCounter += 1;
  return `slot_${Date.now()}_${slotCounter}`;
}

const PSYCHOLOGY_TONES = [
  { id: 'raw', label: '날것의 심리자극', emoji: '🧠' },
  { id: 'fomo', label: 'FOMO 유발', emoji: '🔥' },
  { id: 'curiosity', label: '호기증폭', emoji: '🤔' },
  { id: 'empathy', label: '공감대폭발', emoji: '💛' },
];

// Dark charcoal manga color palette
const INK = '#E4E4E7';
const PAPER = '#1F1F23';
const PAPER_DARK = '#18181B';
const INK_LIGHT = '#A1A1AA';
const WHITE = '#ffffff';
const BG_PAGE = '#121214';
const BORDER = 'rgba(255, 255, 255, 0.08)';
const TEXT_DARK = '#E4E4E7';
const TEXT_DIM = '#A1A1AA';
const TEXT_FAINT = '#71717A';
const ACCENT = '#A855F7';

export function ToonModeEditor({
  visible,
  onClose,
  onPublish,
  onCutSelected,
  boundLinks = [],
  toonCharacter = null,
  onCharacterCreated,
}: ToonModeEditorProps) {
  const inspectorCtx = useInspectorContext();
  const { width: winW } = useWindowDimensions();
  const [slots, setSlots] = useState<CaptureSlot[]>([]);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState(inspectorCtx.selectedPresetId);
  const [psychoTone, setPsychoTone] = useState('raw');
  const [cuts, setCuts] = useState<ToonCut[]>(() =>
    Array.from({ length: 4 }, (_, i) => ({
      id: makeCutId(),
      label: `${i + 1}컷`,
      speechBubble: i === 0 ? '이거 보셨어요?' : '',
      affiliateLink: null,
      imageUrl: null,
    })),
  );
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [editingBubbleId, setEditingBubbleId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // ─── Slot handlers ───
  const handleSlotFile = useCallback((index: number, file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const uri = reader.result as string;
      setSlots((prev) => {
        if (prev.find((_, i) => i === index)) {
          return prev.map((s, i) => i === index ? { ...s, uri } : s);
        }
        if (prev.length >= MAX_SLOTS) return prev;
        return [...prev, { id: makeSlotId(), uri }];
      });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSlotPick = useCallback((index: number) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) handleSlotFile(index, target.files[0]);
    };
    input.click();
  }, [handleSlotFile]);

  const handleSlotDrop = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlot(null);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleSlotFile(index, e.dataTransfer.files[0]);
  }, [handleSlotFile]);

  const handleSlotRemove = useCallback((index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ─── Cut handlers ───
  const handleAddCut = useCallback(() => {
    setCuts((prev) => {
      if (prev.length >= MAX_CUTS) return prev;
      return [...prev, {
        id: makeCutId(),
        label: `${prev.length + 1}컷`,
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
    inspectorCtx.setInspectorMode('affiliate');
  }, [onCutSelected, inspectorCtx]);

  const handleUpdateBubble = useCallback((id: string, text: string) => {
    setCuts((prev) => prev.map((c) => c.id === id ? { ...c, speechBubble: text } : c));
  }, []);

  const handleBindToCut = useCallback((cutId: string, link: BoundAffiliateLink) => {
    setCuts((prev) => prev.map((c) => c.id === cutId ? { ...c, affiliateLink: link } : c));
  }, []);

  const lastBoundIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (boundLinks.length === 0 || !selectedCutId) return;
    const latest = boundLinks[boundLinks.length - 1];
    if (latest.productId !== lastBoundIdRef.current) {
      lastBoundIdRef.current = latest.productId;
      handleBindToCut(selectedCutId, latest);
    }
  }, [boundLinks, selectedCutId, handleBindToCut]);

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    if (toonCharacter?.imageUrl) {
      setCuts((prev) => prev.map((c) => ({ ...c, imageUrl: c.imageUrl || toonCharacter.imageUrl })));
    }
    const preset = TOON_PERSONA_PRESETS.find((p) => p.id === selectedPresetId);
    if (preset && onCharacterCreated) {
      onCharacterCreated({
        id: `char_${Date.now()}`,
        imageUrl: toonCharacter?.imageUrl || slots[0]?.uri || '',
        presetId: selectedPresetId,
        toneLevel: inspectorCtx.toneLevel,
      });
    }
    setGenerating(false);
  }, [generating, toonCharacter, slots, selectedPresetId, inspectorCtx.toneLevel, onCharacterCreated]);

  const handlePublish = useCallback(() => { onPublish?.(cuts); }, [cuts, onPublish]);

  // Responsive column count: 4 cols on very wide, 3 on wide, 2 on narrow
  const cutCols = winW > 1200 ? 4 : winW > 700 ? 3 : 2;
  const cutGap = 12;
  const cutCardWidth = `calc((100% - ${cutGap * (cutCols - 1)}px) / ${cutCols})`;

  const selectedCut = cuts.find((c) => c.id === selectedCutId) ?? null;
  const currentPreset = TOON_PERSONA_PRESETS.find((p) => p.id === selectedPresetId);

  return (
    <View style={[styles.container, { backgroundColor: BG_PAGE }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: PAPER_DARK, borderBottomColor: BORDER }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: ACCENT + '15' }]}>
            <BookOpen size={18} color={ACCENT} strokeWidth={2.5} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: TEXT_DARK }]}>아날로그 만화 숏툰 에디터</Text>
            <Text style={[styles.headerSub, { color: TEXT_FAINT }]}>실제 만화책 같은 손그림 텍스처 · 리얼 말풍선</Text>
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <X size={20} color={TEXT_FAINT} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── STEP 1: Capture Slots (top fixed) ─── */}
        <View style={[styles.stepSection, { backgroundColor: PAPER_DARK, borderColor: BORDER }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: ACCENT }]}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <Text style={[styles.stepTitle, { color: TEXT_DARK }]}>제휴 쇼핑 캡처 입력</Text>
            <Text style={[styles.stepCount, { color: TEXT_FAINT }]}>{slots.length}/{MAX_SLOTS}장</Text>
          </View>

          <View style={styles.slotScrollContent}>
            {slots.map((slot, i) => (
              <View key={slot.id} style={[styles.slotCard, { borderColor: BORDER }]}>
                <Image source={{ uri: slot.uri }} style={styles.slotImage} resizeMode="cover" />
                <View style={styles.slotOverlay}>
                  <Text style={styles.slotIndex}>{i + 1}</Text>
                  <TouchableOpacity style={styles.slotRemove} onPress={() => handleSlotRemove(i)} activeOpacity={0.7}>
                    <X size={10} color="#fff" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {slots.length < MAX_SLOTS && (
              <TouchableOpacity
                style={[styles.slotCard, styles.slotAdd, {
                  borderColor: dragOverSlot === slots.length ? ACCENT : BORDER,
                  backgroundColor: dragOverSlot === slots.length ? ACCENT + '08' : PAPER,
                }]}
                onPress={() => handleSlotPick(slots.length)}
                activeOpacity={0.7}
                {...({ onDrop: (e: React.DragEvent) => handleSlotDrop(slots.length, e), onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverSlot(slots.length); }, onDragLeave: () => setDragOverSlot(null) } as any)}
              >
                <Upload size={20} color={TEXT_FAINT} strokeWidth={2} />
                <Text style={[styles.slotAddText, { color: TEXT_FAINT }]}>추가</Text>
              </TouchableOpacity>
            )}
            {Array.from({ length: Math.max(0, MAX_SLOTS - slots.length - 1) }, (_, i) => (
              <View key={`empty-${i}`} style={[styles.slotCard, styles.slotPlaceholder, { borderColor: BORDER }]} />
            ))}
          </View>
          <Text style={[styles.stepHint, { color: TEXT_FAINT }]}>
            상품 사진, 영수증, 자재 등을 드래그하거나 클릭하여 순서대로 쌓으세요
          </Text>
        </View>

        {/* ─── STEP 2: Persona & Tone ─── */}
        <View style={[styles.stepSection, { backgroundColor: PAPER_DARK, borderColor: BORDER }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: ACCENT }]}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <Text style={[styles.stepTitle, { color: TEXT_DARK }]}>페르소나 & 심리자극</Text>
          </View>
          <View style={styles.chipRow}>
              {TOON_PERSONA_PRESETS.map((preset) => {
                const sel = preset.id === selectedPresetId;
                return (
                  <TouchableOpacity
                    key={preset.id}
                    style={[styles.personaChip, { borderColor: sel ? preset.toneColor : BORDER, backgroundColor: sel ? preset.toneColor + '12' : PAPER }]}
                    onPress={() => { setSelectedPresetId(preset.id); inspectorCtx.setSelectedPresetId(preset.id); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.chipEmoji}>{preset.emoji}</Text>
                    <Text style={[styles.chipLabel, { color: sel ? preset.toneColor : TEXT_DIM }]} numberOfLines={1}>{preset.label}</Text>
                  </TouchableOpacity>
                );
              })}
          </View>
          <View style={styles.psychoRow}>
            {PSYCHOLOGY_TONES.map((tone) => {
              const sel = tone.id === psychoTone;
              return (
                <TouchableOpacity
                  key={tone.id}
                  style={[styles.psychoChip, { borderColor: sel ? ACCENT : BORDER, backgroundColor: sel ? ACCENT + '12' : PAPER }]}
                  onPress={() => setPsychoTone(tone.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipEmoji}>{tone.emoji}</Text>
                  <Text style={[styles.chipLabel, { color: sel ? ACCENT : TEXT_DIM }]} numberOfLines={1}>{tone.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ─── STEP 3: Analog Manga Grid ─── */}
        <View style={[styles.stepSection, { backgroundColor: PAPER_DARK, borderColor: BORDER }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: ACCENT }]}>
              <Text style={styles.stepBadgeText}>3</Text>
            </View>
            <Text style={[styles.stepTitle, { color: TEXT_DARK }]}>만화 숏툰 타일 그리드</Text>
            <Text style={[styles.stepCount, { color: TEXT_FAINT }]}>{cuts.length}/{MAX_CUTS}컷</Text>
          </View>

          <TouchableOpacity
            style={[styles.generateBtn, { backgroundColor: ACCENT }, generating && styles.generateBtnDisabled]}
            onPress={handleGenerate}
            disabled={generating}
            activeOpacity={0.85}
          >
            {generating ? <ActivityIndicator size="small" color="#fff" /> : <Zap size={16} color="#fff" strokeWidth={2.5} />}
            <Text style={styles.generateBtnText}>{generating ? '생성 중...' : '만화 숏툰 자동 생성'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addPageBtn, { borderColor: BORDER }]}
            onPress={handleAddCut}
            disabled={cuts.length >= MAX_CUTS}
            activeOpacity={0.7}
          >
            <Plus size={15} color={ACCENT} strokeWidth={2.5} />
            <Text style={[styles.addPageBtnText, { color: ACCENT }, cuts.length >= MAX_CUTS && { opacity: 0.3 }]}>
              컷 추가 ({cuts.length}/{MAX_CUTS})
            </Text>
          </TouchableOpacity>

          {/* ─── Analog manga tile grid ─── */}
          <View style={styles.cutGrid}>
            {cuts.map((cut) => {
              const isSelected = cut.id === selectedCutId;
              return (
                <Pressable
                  key={cut.id}
                  style={[
                    styles.cutCard,
                    { width: cutCardWidth as unknown as number },
                    isSelected && styles.cutCardSelected,
                  ]}
                  onPress={() => handleSelectCut(cut.id)}
                >
                  {/* Cut number badge — top-left, ink style */}
                  <View style={styles.cutNumberBadge}>
                    <Text style={styles.cutNumberText}>{cut.label}</Text>
                  </View>

                  {/* Delete button */}
                  <TouchableOpacity
                    style={styles.cutDeleteBtn}
                    onPress={() => handleRemoveCut(cut.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={11} color={theme.colors.error[400]} strokeWidth={2} />
                  </TouchableOpacity>

                  {/* Manga panel — paper texture background */}
                  <View style={styles.cutPanel}>
                    {toonCharacter?.imageUrl || cut.imageUrl ? (
                      <Image
                        source={{ uri: toonCharacter?.imageUrl || cut.imageUrl! }}
                        style={styles.cutPanelImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.cutPanelEmpty}>
                        <ImageIcon size={24} color={INK_LIGHT} strokeWidth={1.5} />
                      </View>
                    )}

                    {/* ─── Real speech bubble overlay ─── */}
                    {editingBubbleId === cut.id ? (
                      <View style={styles.bubbleFloat}>
                        <View style={styles.bubbleFloatShape}>
                          <TextInput
                            style={styles.bubbleFloatInput}
                            value={cut.speechBubble}
                            onChangeText={(t) => handleUpdateBubble(cut.id, t)}
                            onBlur={() => setEditingBubbleId(null)}
                            autoFocus
                            placeholder="말풍선 입력..."
                            placeholderTextColor={INK_LIGHT}
                            multiline
                          />
                        </View>
                        <View style={styles.bubbleTail} />
                      </View>
                    ) : (
                      <Pressable
                        style={styles.bubbleFloat}
                        onPress={() => setEditingBubbleId(cut.id)}
                      >
                        <View style={styles.bubbleFloatShape}>
                          <Text style={styles.bubbleFloatText} numberOfLines={3}>
                            {cut.speechBubble || '말풍선 입력...'}
                          </Text>
                        </View>
                        <View style={styles.bubbleTail} />
                      </Pressable>
                    )}
                  </View>

                  {/* Affiliate link badge — bottom */}
                  {cut.affiliateLink && cut.affiliateLink.productId ? (
                    <View style={styles.linkBadgeBound}>
                      <Link2 size={11} color={theme.colors.success[600]} strokeWidth={2.5} />
                      <Text style={styles.linkBadgeBoundText} numberOfLines={1}>{cut.affiliateLink.productName}</Text>
                      <Check size={11} color={theme.colors.success[600]} strokeWidth={2.5} />
                    </View>
                  ) : (
                    <View style={styles.linkBadgeEmpty}>
                      <Link2 size={11} color={TEXT_FAINT} strokeWidth={2} />
                      <Text style={styles.linkBadgeEmptyText}>
                        {isSelected ? '우측 인스펙터에서 바인딩' : '제휴 링크 없음'}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Selected cut detail */}
          {selectedCut && (
            <View style={[styles.detailPanel, { backgroundColor: PAPER, borderColor: BORDER }]}>
              <Text style={[styles.detailTitle, { color: ACCENT }]}>{selectedCut.label} 편집 중</Text>
              <Text style={[styles.detailHint, { color: TEXT_DIM }]}>
                우측 인스펙터에서 쿠팡 파트너스 상품을 검색하고 "바인딩" 버튼을 누르면 이 컷에 제휴 링크가 자동 연결됩니다.
              </Text>
              {selectedCut.affiliateLink && selectedCut.affiliateLink.productId && (
                <View style={[styles.detailLinkCard, { backgroundColor: PAPER_DARK, borderColor: BORDER }]}>
                  <View style={styles.detailLinkInfo}>
                    <Text style={[styles.detailLinkName, { color: TEXT_DARK }]} numberOfLines={1}>{selectedCut.affiliateLink.productName}</Text>
                    <Text style={[styles.detailLinkUrl, { color: TEXT_FAINT }]} numberOfLines={1}>{selectedCut.affiliateLink.url}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.detailLinkRemove}
                    onPress={() => handleBindToCut(selectedCut.id, { productId: '', productName: '', platform: '', url: '', subId: '' })}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={14} color={theme.colors.error[400]} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={[styles.publishBtn, { backgroundColor: ACCENT }]} onPress={handlePublish} activeOpacity={0.85}>
            <Sparkles size={16} color="#fff" strokeWidth={2.5} />
            <Text style={styles.publishBtnText}>만화 콘텐츠 확정 & 발행</Text>
            <ArrowRight size={16} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const isWeb = Platform.OS === 'web';

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 32, height: 32, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 15, fontFamily: theme.typography.fontFamily.semiBold },
  headerSub: { fontSize: 11, fontFamily: theme.typography.fontFamily.regular, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14 },
  // Step section
  stepSection: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBadge: { width: 24, height: 24, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  stepBadgeText: { fontSize: 12, fontFamily: theme.typography.fontFamily.bold, color: '#fff' },
  stepTitle: { flex: 1, fontSize: 14, fontFamily: theme.typography.fontFamily.semiBold },
  stepCount: { fontSize: 12, fontFamily: theme.typography.fontFamily.medium },
  stepHint: { fontSize: 11, fontFamily: theme.typography.fontFamily.regular, lineHeight: 16 },
  // Slots — flex wrap for wide layout
  slotScrollContent: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotCard: { width: 80, height: 80, borderRadius: 10, borderWidth: 1.5, overflow: 'hidden', position: 'relative' },
  slotImage: { width: '100%', height: '100%' },
  slotOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 4 },
  slotIndex: { fontSize: 10, fontFamily: theme.typography.fontFamily.bold, color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  slotRemove: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  slotAdd: { justifyContent: 'center', alignItems: 'center', gap: 4, borderStyle: 'dashed' },
  slotAddText: { fontSize: 10, fontFamily: theme.typography.fontFamily.medium },
  slotPlaceholder: { borderStyle: 'dashed', opacity: 0.3 },
  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  personaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  psychoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  psychoChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  chipEmoji: { fontSize: 14 },
  chipLabel: { fontSize: 12, fontFamily: theme.typography.fontFamily.medium },
  // Generate
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12 },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { fontSize: 14, fontFamily: theme.typography.fontFamily.semiBold, color: '#fff' },
  addPageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 10, borderWidth: 1.5 },
  addPageBtnText: { fontSize: 13, fontFamily: theme.typography.fontFamily.medium },
  // ─── Analog manga cut grid ───
  cutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cutCard: {
    // Width is set dynamically via inline style; this is the fallback
    width: '48%',
    minHeight: 220,
    borderRadius: 4,
    borderWidth: 2.5,
    borderColor: INK,
    backgroundColor: PAPER,
    overflow: 'hidden',
    position: 'relative',
  },
  cutCardSelected: {
    borderColor: ACCENT,
    borderWidth: 3,
    shadowColor: ACCENT,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  // Cut number — top-left ink badge
  cutNumberBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#2a2a2e',
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 3,
  },
  cutNumberText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#E4E4E7',
  },
  cutDeleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
  },
  // Manga panel interior — paper texture
  cutPanel: {
    flex: 1,
    backgroundColor: PAPER,
    position: 'relative',
    margin: 2,
    marginTop: 18,
  },
  cutPanelImage: {
    width: '100%',
    height: '100%',
    opacity: 0.92,
  },
  cutPanelEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PAPER_DARK,
  },
  // ─── Real speech bubble ───
  bubbleFloat: {
    position: 'absolute',
    top: 8,
    right: 8,
    maxWidth: '72%',
    zIndex: 2,
  },
  bubbleFloatShape: {
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E4E4E7',
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 32,
    justifyContent: 'center',
  },
  bubbleFloatText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#1a1a1a',
    lineHeight: 16,
  },
  bubbleFloatInput: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#1a1a1a',
    padding: 0,
    minHeight: 20,
    lineHeight: 16,
  },
  // Bubble tail — triangle pointing down-left
  bubbleTail: {
    position: 'absolute',
    bottom: -8,
    left: 16,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#E4E4E7',
  },
  // Affiliate badge
  linkBadgeBound: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: theme.colors.success[500] + '15',
  },
  linkBadgeBoundText: { flex: 1, fontSize: 10, fontFamily: theme.typography.fontFamily.medium, color: theme.colors.success[600] },
  linkBadgeEmpty: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5 },
  linkBadgeEmptyText: { flex: 1, fontSize: 10, fontFamily: theme.typography.fontFamily.regular, color: TEXT_FAINT },
  // Detail panel
  detailPanel: { padding: 14, borderRadius: 10, borderWidth: 1, gap: 8 },
  detailTitle: { fontSize: 13, fontFamily: theme.typography.fontFamily.semiBold },
  detailHint: { fontSize: 11, fontFamily: theme.typography.fontFamily.regular, lineHeight: 17 },
  detailLinkCard: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  detailLinkInfo: { flex: 1, gap: 2 },
  detailLinkName: { fontSize: 12, fontFamily: theme.typography.fontFamily.medium },
  detailLinkUrl: { fontSize: 10, fontFamily: theme.typography.fontFamily.regular },
  detailLinkRemove: { width: 28, height: 28, borderRadius: 7, backgroundColor: 'rgba(239, 68, 68, 0.08)', justifyContent: 'center', alignItems: 'center' },
  // Publish
  publishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, marginTop: 4 },
  publishBtnText: { fontSize: 14, fontFamily: theme.typography.fontFamily.semiBold, color: '#fff' },
});
