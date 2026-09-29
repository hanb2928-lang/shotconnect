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

// Light theme palette with electric purple accent
const BG_PAGE = '#FAFAFB';
const CARD_SURFACE = '#FFFFFF';
const PAPER = '#F8F8FA';
const INK_LIGHT = '#94A3B8';
const BORDER_SLATE = '#E2E8F0';
const TEXT_DARK = '#1E293B';
const TEXT_DIM = '#475569';
const TEXT_FAINT = '#94A3B8';
const ACCENT = '#A855F7';
const ACCENT_SOFT = '#A855F715';

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

  const handleSlotFile = useCallback((index: number, file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const uri = reader.result as string;
      setSlots((prev) => {
        if (index < prev.length) {
          return prev.map((s, i) => i === index ? { ...s, uri } : s);
        }
        return [...prev, { id: makeSlotId(), uri }];
      });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSlotFiles = useCallback((files: FileList | File[]) => {
    const valid = Array.from(files).filter((f) => f.type.startsWith('image/'));
    valid.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const uri = reader.result as string;
        setSlots((prev) => [...prev, { id: makeSlotId(), uri }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleSlotPick = useCallback((index: number) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (index === -1 && target.files && target.files.length > 0) {
        handleSlotFiles(target.files);
      } else if (target.files && target.files[0]) {
        handleSlotFile(index, target.files[0]);
      }
    };
    input.click();
  }, [handleSlotFile, handleSlotFiles]);

  const handleSlotDrop = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlot(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (index === -1 || index >= slots.length) {
        handleSlotFiles(e.dataTransfer.files);
      } else {
        handleSlotFile(index, e.dataTransfer.files[0]);
      }
    }
  }, [handleSlotFile, handleSlotFiles, slots.length]);

  // Clipboard paste support — paste images directly into the slot area
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageItems: DataTransferItem[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) imageItems.push(items[i]);
      }
      if (imageItems.length === 0) return;
      e.preventDefault();
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const uri = reader.result as string;
            setSlots((prev) => [...prev, { id: makeSlotId(), uri }]);
          };
          reader.readAsDataURL(file);
        }
      });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  const handleSlotRemove = useCallback((index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }, []);

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

  // Wider grids for full-width workspace — 4 cols on wide, 3 on medium, 2 on narrow
  const cutCols = winW > 1400 ? 4 : winW > 800 ? 3 : 2;
  const cutGap = 14;
  const cutCardWidth = `calc((100% - ${cutGap * (cutCols - 1)}px) / ${cutCols})`;

  const selectedCut = cuts.find((c) => c.id === selectedCutId) ?? null;

  return (
    <View style={[styles.container, { backgroundColor: BG_PAGE }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: CARD_SURFACE, borderBottomColor: BORDER_SLATE }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: ACCENT_SOFT }]}>
            <BookOpen size={18} color={ACCENT} strokeWidth={2.5} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: TEXT_DARK }]}>만화 숏툰 에디터</Text>
            <Text style={[styles.headerSub, { color: TEXT_FAINT }]}>손그림 텍스처 · 리얼 말풍선 · 제휴 링크 바인딩</Text>
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
        {/* ─── STEP 1: Capture Slots — slim band, no box ─── */}
        <View style={styles.stepBand}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: ACCENT }]}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <Text style={[styles.stepTitle, { color: TEXT_DARK }]}>캡처 입력</Text>
            <Text style={[styles.stepCount, { color: TEXT_FAINT }]}>{slots.length}장</Text>
          </View>

          <View style={styles.slotRow}>
            {slots.map((slot, i) => (
              <View key={slot.id} style={[styles.slotCard, { borderColor: BORDER_SLATE }]}>
                <Image source={{ uri: slot.uri }} style={styles.slotImage} resizeMode="cover" />
                <View style={styles.slotOverlay}>
                  <Text style={styles.slotIndex}>{i + 1}</Text>
                  <TouchableOpacity style={styles.slotRemove} onPress={() => handleSlotRemove(i)} activeOpacity={0.7}>
                    <X size={10} color="#fff" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.slotCard, styles.slotAdd, {
                borderColor: dragOverSlot === -1 ? ACCENT : BORDER_SLATE,
                backgroundColor: dragOverSlot === -1 ? ACCENT_SOFT : PAPER,
              }]}
              onPress={() => handleSlotPick(-1)}
              activeOpacity={0.7}
              {...({ onDrop: (e: React.DragEvent) => handleSlotDrop(-1, e), onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverSlot(-1); }, onDragLeave: () => setDragOverSlot(null) } as any)}
            >
              <Upload size={20} color={TEXT_FAINT} strokeWidth={2} />
              <Text style={[styles.slotAddText, { color: TEXT_FAINT }]}>추가</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Soft divider between steps */}
        <View style={styles.divider} />

        {/* ─── STEP 2: Persona & Tone — inline strip ─── */}
        <View style={styles.stepBand}>
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
                  style={[styles.personaChip, { borderColor: sel ? ACCENT : BORDER_SLATE, backgroundColor: sel ? ACCENT_SOFT : PAPER }]}
                  onPress={() => { setSelectedPresetId(preset.id); inspectorCtx.setSelectedPresetId(preset.id); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipEmoji}>{preset.emoji}</Text>
                  <Text style={[styles.chipLabel, { color: sel ? ACCENT : TEXT_DIM }]} numberOfLines={1}>{preset.label}</Text>
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
                  style={[styles.psychoChip, { borderColor: sel ? ACCENT : BORDER_SLATE, backgroundColor: sel ? ACCENT_SOFT : PAPER }]}
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

        {/* Soft divider before the main grid */}
        <View style={styles.divider} />

        {/* ─── STEP 3: Manga Tile Grid — the visual centerpiece ─── */}
        <View style={styles.gridSection}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: ACCENT }]}>
              <Text style={styles.stepBadgeText}>3</Text>
            </View>
            <Text style={[styles.stepTitle, { color: TEXT_DARK }]}>만화 타일 그리드</Text>
            <Text style={[styles.stepCount, { color: TEXT_FAINT }]}>{cuts.length}/{MAX_CUTS}컷</Text>
          </View>

          {/* Generate + Add row — inline */}
          <View style={styles.actionRow}>
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
              style={[styles.addPageBtn, { borderColor: ACCENT }]}
              onPress={handleAddCut}
              disabled={cuts.length >= MAX_CUTS}
              activeOpacity={0.7}
            >
              <Plus size={15} color={ACCENT} strokeWidth={2.5} />
              <Text style={[styles.addPageBtnText, { color: ACCENT }, cuts.length >= MAX_CUTS && { opacity: 0.3 }]}>
                컷 추가 ({cuts.length}/{MAX_CUTS})
              </Text>
            </TouchableOpacity>
          </View>

          {/* ─── Manga tile grid ─── */}
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
                  {/* Cut number badge */}
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

                  {/* Manga panel */}
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

                    {/* Speech bubble overlay */}
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

          {/* Selected cut detail — inline */}
          {selectedCut && (
            <View style={[styles.detailPanel, { backgroundColor: PAPER, borderColor: BORDER_SLATE }]}>
              <Text style={[styles.detailTitle, { color: ACCENT }]}>{selectedCut.label} 편집 중</Text>
              <Text style={[styles.detailHint, { color: TEXT_DIM }]}>
                우측 인스펙터에서 쿠팡 파트너스 상품을 검색하고 "바인딩" 버튼을 누르면 이 컷에 제휴 링크가 자동 연결됩니다.
              </Text>
              {selectedCut.affiliateLink && selectedCut.affiliateLink.productId && (
                <View style={[styles.detailLinkCard, { backgroundColor: CARD_SURFACE, borderColor: BORDER_SLATE }]}>
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

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', height: '100%' },
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 32, height: 32, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 15, fontFamily: theme.typography.fontFamily.semiBold },
  headerSub: { fontSize: 11, fontFamily: theme.typography.fontFamily.regular, marginTop: 2 },
  // Scroll — full width, generous padding
  scroll: { flex: 1, height: '100%' },
  scrollContent: { paddingHorizontal: 24, paddingVertical: 20, gap: 0, width: '100%', flexGrow: 1 },
  // Step bands — no boxed borders, just padding for organic flow
  stepBand: { paddingVertical: 16, gap: 10 },
  gridSection: { paddingVertical: 16, gap: 14, flex: 1, minHeight: 0 },
  // Soft divider between steps — subtle hairline, no box
  divider: {
    height: 1,
    backgroundColor: BORDER_SLATE,
    marginHorizontal: 0,
    opacity: 0.6,
  },
  // Step header
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBadge: { width: 22, height: 22, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  stepBadgeText: { fontSize: 11, fontFamily: theme.typography.fontFamily.bold, color: '#fff' },
  stepTitle: { flex: 1, fontSize: 14, fontFamily: theme.typography.fontFamily.semiBold },
  stepCount: { fontSize: 12, fontFamily: theme.typography.fontFamily.medium },
  // Slots
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotCard: { width: 80, height: 80, borderRadius: 10, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  slotImage: { width: '100%', height: '100%' },
  slotOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 4 },
  slotIndex: { fontSize: 10, fontFamily: theme.typography.fontFamily.bold, color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  slotRemove: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  slotAdd: { justifyContent: 'center', alignItems: 'center', gap: 4, borderStyle: 'dashed' },
  slotAddText: { fontSize: 10, fontFamily: theme.typography.fontFamily.medium },
  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  personaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  psychoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  psychoChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  chipEmoji: { fontSize: 14 },
  chipLabel: { fontSize: 12, fontFamily: theme.typography.fontFamily.medium },
  // Action row — generate + add side by side
  actionRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, flex: 1 },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { fontSize: 14, fontFamily: theme.typography.fontFamily.semiBold, color: '#fff' },
  addPageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 16 },
  addPageBtnText: { fontSize: 13, fontFamily: theme.typography.fontFamily.medium },
  // ─── Manga cut grid ───
  cutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cutCard: {
    width: '48%',
    minHeight: 240,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#1E293B',
    backgroundColor: PAPER,
    overflow: 'hidden',
    position: 'relative',
  },
  cutCardSelected: {
    borderColor: ACCENT,
    borderWidth: 2.5,
    shadowColor: ACCENT,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  cutNumberBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 3,
  },
  cutNumberText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#F8F8FA',
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
    backgroundColor: CARD_SURFACE,
  },
  // Speech bubble
  bubbleFloat: {
    position: 'absolute',
    top: 8,
    right: 8,
    maxWidth: '72%',
    zIndex: 2,
  },
  bubbleFloatShape: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#cbd5e1',
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
    borderTopColor: '#cbd5e1',
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
  detailPanel: { padding: 14, borderRadius: 10, borderWidth: 1, gap: 8, marginTop: 4 },
  detailTitle: { fontSize: 13, fontFamily: theme.typography.fontFamily.semiBold },
  detailHint: { fontSize: 11, fontFamily: theme.typography.fontFamily.regular, lineHeight: 17 },
  detailLinkCard: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  detailLinkInfo: { flex: 1, gap: 2 },
  detailLinkName: { fontSize: 12, fontFamily: theme.typography.fontFamily.medium },
  detailLinkUrl: { fontSize: 10, fontFamily: theme.typography.fontFamily.regular },
  detailLinkRemove: { width: 28, height: 28, borderRadius: 7, backgroundColor: 'rgba(239, 68, 68, 0.08)', justifyContent: 'center', alignItems: 'center' },
  // Publish
  publishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, marginTop: 6 },
  publishBtnText: { fontSize: 14, fontFamily: theme.typography.fontFamily.semiBold, color: '#fff' },
});
