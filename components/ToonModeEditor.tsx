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
  Upload,
  Zap,
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

  // Step 1: Capture slots
  const [slots, setSlots] = useState<CaptureSlot[]>([]);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

  // Step 2: Persona & tone
  const [selectedPresetId, setSelectedPresetId] = useState(inspectorCtx.selectedPresetId);
  const [psychoTone, setPsychoTone] = useState('raw');

  // Step 3: Comic cuts
  const [cuts, setCuts] = useState<ToonCut[]>(() =>
    Array.from({ length: 4 }, (_, i) => ({
      id: makeCutId(),
      label: `${i + 1}페이지`,
      speechBubble: i === 0 ? '이거 보셨어요?' : '',
      affiliateLink: null,
      imageUrl: null,
    })),
  );
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [editingBubbleId, setEditingBubbleId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // ─── Step 1: Slot handlers ───
  const handleSlotFile = useCallback((index: number, file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const uri = reader.result as string;
      setSlots((prev) => {
        const existing = prev.find((s, i) => i === index);
        if (existing) {
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
      if (target.files && target.files[0]) {
        handleSlotFile(index, target.files[0]);
      }
    };
    input.click();
  }, [handleSlotFile]);

  const handleSlotDrop = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlot(null);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSlotFile(index, e.dataTransfer.files[0]);
    }
  }, [handleSlotFile]);

  const handleSlotRemove = useCallback((index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ─── Step 3: Cut handlers ───
  const handleAddCut = useCallback(() => {
    setCuts((prev) => {
      if (prev.length >= MAX_CUTS) return prev;
      const num = prev.length + 1;
      return [...prev, {
        id: makeCutId(),
        label: `${num}페이지`,
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

  // Auto-bind latest affiliate link to selected cut
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
    // Simulate generation
    await new Promise((resolve) => setTimeout(resolve, 1800));

    // Auto-fill cuts with character image if available
    if (toonCharacter?.imageUrl) {
      setCuts((prev) => prev.map((c) => ({
        ...c,
        imageUrl: c.imageUrl || toonCharacter.imageUrl,
      })));
    }

    // Create persona character object
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

  const handlePublish = useCallback(() => {
    onPublish?.(cuts);
  }, [cuts, onPublish]);

  if (!visible) return null;

  const selectedCut = cuts.find((c) => c.id === selectedCutId) ?? null;
  const currentPreset = TOON_PERSONA_PRESETS.find((p) => p.id === selectedPresetId);
  const currentPsycho = PSYCHOLOGY_TONES.find((t) => t.id === psychoTone);

  // Light theme constants
  const bg = '#ffffff';
  const bgSubtle = '#f8fafc';
  const border = '#e2e8f0';
  const text = '#0f172a';
  const textDim = '#475569';
  const textFaint = '#94a3b8';
  const accent = '#A855F7';

  return (
    <View style={[styles.container, { backgroundColor: bgSubtle }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: bg, borderBottomColor: border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: accent + '15' }]}>
            <Grid2x2 size={18} color={accent} strokeWidth={2.5} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: text }]}>만화 숏툰 마스터 플로우</Text>
            <Text style={[styles.headerSub, { color: textFaint }]}>3단계로 제휴 마케팅 만화 콘텐츠 제작</Text>
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <X size={20} color={textFaint} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── STEP 1: Capture Input Slots ─── */}
        <View style={[styles.stepSection, { backgroundColor: bg, borderColor: border }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: accent }]}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <Text style={[styles.stepTitle, { color: text }]}>제휴 쇼핑 캡처 입력</Text>
            <Text style={[styles.stepCount, { color: textFaint }]}>{slots.length}/{MAX_SLOTS}장</Text>
          </View>

          {/* Horizontal 10-slot grid */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.slotScroll}
            contentContainerStyle={styles.slotScrollContent}
          >
            {/* Filled slots */}
            {slots.map((slot, i) => (
              <View key={slot.id} style={[styles.slotCard, { borderColor: border }]}>
                <Image source={{ uri: slot.uri }} style={styles.slotImage} resizeMode="cover" />
                <View style={styles.slotOverlay}>
                  <Text style={styles.slotIndex}>{i + 1}</Text>
                  <TouchableOpacity
                    style={styles.slotRemove}
                    onPress={() => handleSlotRemove(i)}
                    activeOpacity={0.7}
                  >
                    <X size={10} color="#fff" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Empty add slot */}
            {slots.length < MAX_SLOTS && (
              <TouchableOpacity
                style={[
                  styles.slotCard,
                  styles.slotAdd,
                  {
                    borderColor: dragOverSlot === slots.length ? accent : border,
                    backgroundColor: dragOverSlot === slots.length ? accent + '08' : bgSubtle,
                  },
                ]}
                onPress={() => handleSlotPick(slots.length)}
                activeOpacity={0.7}
                {...({
                  onDrop: (e: React.DragEvent) => handleSlotDrop(slots.length, e),
                  onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverSlot(slots.length); },
                  onDragLeave: () => setDragOverSlot(null),
                } as any)}
              >
                <Upload size={20} color={textFaint} strokeWidth={2} />
                <Text style={[styles.slotAddText, { color: textFaint }]}>추가</Text>
              </TouchableOpacity>
            )}

            {/* Placeholder empty slots to show 10 total */}
            {Array.from({ length: Math.max(0, MAX_SLOTS - slots.length - 1) }, (_, i) => (
              <View key={`empty-${i}`} style={[styles.slotCard, styles.slotPlaceholder, { borderColor: border }]} />
            ))}
          </ScrollView>

          <Text style={[styles.stepHint, { color: textFaint }]}>
            상품 사진, 영수증, 자재 등을 드래그하거나 클릭하여 순서대로 쌓으세요
          </Text>
        </View>

        {/* ─── STEP 2: Persona & Psychology Tone ─── */}
        <View style={[styles.stepSection, { backgroundColor: bg, borderColor: border }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: accent }]}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <Text style={[styles.stepTitle, { color: text }]}>페르소나 & 심리자극 설정</Text>
          </View>

          {/* Persona preset chips — horizontal */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <View style={styles.chipRow}>
              {TOON_PERSONA_PRESETS.map((preset) => {
                const selected = preset.id === selectedPresetId;
                return (
                  <TouchableOpacity
                    key={preset.id}
                    style={[
                      styles.personaChip,
                      {
                        borderColor: selected ? preset.toneColor : border,
                        backgroundColor: selected ? preset.toneColor + '12' : bgSubtle,
                      },
                    ]}
                    onPress={() => {
                      setSelectedPresetId(preset.id);
                      inspectorCtx.setSelectedPresetId(preset.id);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.chipEmoji}>{preset.emoji}</Text>
                    <Text
                      style={[styles.chipLabel, { color: selected ? preset.toneColor : textDim }]}
                      numberOfLines={1}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Psychology tone chips */}
          <View style={styles.psychoRow}>
            {PSYCHOLOGY_TONES.map((tone) => {
              const selected = tone.id === psychoTone;
              return (
                <TouchableOpacity
                  key={tone.id}
                  style={[
                    styles.psychoChip,
                    {
                      borderColor: selected ? accent : border,
                      backgroundColor: selected ? accent + '12' : bgSubtle,
                    },
                  ]}
                  onPress={() => setPsychoTone(tone.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipEmoji}>{tone.emoji}</Text>
                  <Text style={[styles.chipLabel, { color: selected ? accent : textDim }]} numberOfLines={1}>
                    {tone.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {currentPreset && (
            <Text style={[styles.presetDesc, { color: textFaint }]}>
              {currentPreset.emoji} {currentPreset.desc} · {currentPsycho?.emoji} {currentPsycho?.label}
            </Text>
          )}
        </View>

        {/* ─── STEP 3: Generate & 12-page Tile Grid ─── */}
        <View style={[styles.stepSection, { backgroundColor: bg, borderColor: border }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: accent }]}>
              <Text style={styles.stepBadgeText}>3</Text>
            </View>
            <Text style={[styles.stepTitle, { color: text }]}>만화 숏툰 생성</Text>
            <Text style={[styles.stepCount, { color: textFaint }]}>{cuts.length}/{MAX_CUTS}페이지</Text>
          </View>

          {/* Generate button */}
          <TouchableOpacity
            style={[styles.generateBtn, { backgroundColor: accent }, generating && styles.generateBtnDisabled]}
            onPress={handleGenerate}
            disabled={generating}
            activeOpacity={0.85}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Zap size={16} color="#fff" strokeWidth={2.5} />
            )}
            <Text style={styles.generateBtnText}>
              {generating ? '생성 중...' : '만화 숏툰 자동 생성'}
            </Text>
          </TouchableOpacity>

          {/* Add page button */}
          <TouchableOpacity
            style={[styles.addPageBtn, { borderColor: border }]}
            onPress={handleAddCut}
            disabled={cuts.length >= MAX_CUTS}
            activeOpacity={0.7}
          >
            <Plus size={15} color={accent} strokeWidth={2.5} />
            <Text style={[styles.addPageBtnText, { color: accent }, cuts.length >= MAX_CUTS && { opacity: 0.3 }]}>
              페이지 추가 ({cuts.length}/{MAX_CUTS})
            </Text>
          </TouchableOpacity>

          {/* 12-page tile grid */}
          <View style={styles.cutGrid}>
            {cuts.map((cut) => {
              const isSelected = cut.id === selectedCutId;
              return (
                <Pressable
                  key={cut.id}
                  style={[
                    styles.cutCard,
                    {
                      borderColor: isSelected ? accent : border,
                      backgroundColor: bgSubtle,
                    },
                    isSelected && { shadowColor: accent, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
                  ]}
                  onPress={() => handleSelectCut(cut.id)}
                >
                  {/* Cut header */}
                  <View style={[styles.cutHeader, { borderBottomColor: border }]}>
                    <Text style={[styles.cutLabel, { color: textDim }]}>{cut.label}</Text>
                    <TouchableOpacity
                      style={styles.cutRemoveBtn}
                      onPress={() => handleRemoveCut(cut.id)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={12} color={theme.colors.error[400]} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>

                  {/* Cut image */}
                  <View style={[styles.cutImageArea, { backgroundColor: bgSubtle }]}>
                    {toonCharacter?.imageUrl ? (
                      <Image
                        source={{ uri: toonCharacter.imageUrl }}
                        style={styles.cutImageFilled}
                        resizeMode="cover"
                      />
                    ) : cut.imageUrl ? (
                      <Image
                        source={{ uri: cut.imageUrl }}
                        style={styles.cutImageFilled}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.cutImagePlaceholder}>
                        <ImageIcon size={22} color={textFaint} strokeWidth={1.5} />
                        <Text style={[styles.cutImageHint, { color: textFaint }]}>캐릭터 없음</Text>
                      </View>
                    )}
                  </View>

                  {/* Speech bubble */}
                  <View style={[styles.bubbleArea, { borderTopColor: border, borderBottomColor: border }]}>
                    <View style={styles.bubbleRow}>
                      <MessageCircle size={13} color={accent} strokeWidth={2} />
                      {editingBubbleId === cut.id ? (
                        <TextInput
                          style={[styles.bubbleInput, { color: text }]}
                          value={cut.speechBubble}
                          onChangeText={(t) => handleUpdateBubble(cut.id, t)}
                          onBlur={() => setEditingBubbleId(null)}
                          autoFocus
                          placeholder="말풍선 입력"
                          placeholderTextColor={textFaint}
                          multiline
                        />
                      ) : (
                        <Pressable onPress={() => setEditingBubbleId(cut.id)}>
                          <Text style={[styles.bubbleText, { color: textDim }]} numberOfLines={2}>
                            {cut.speechBubble || '말풍선 입력...'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* Affiliate link badge */}
                  {cut.affiliateLink && cut.affiliateLink.productId ? (
                    <View style={[styles.linkBadge, { backgroundColor: theme.colors.success[500] + '12' }]}>
                      <Link2 size={11} color={theme.colors.success[600]} strokeWidth={2.5} />
                      <Text style={[styles.linkBadgeText, { color: theme.colors.success[600] }]} numberOfLines={1}>
                        {cut.affiliateLink.productName}
                      </Text>
                      <Check size={11} color={theme.colors.success[600]} strokeWidth={2.5} />
                    </View>
                  ) : (
                    <View style={styles.linkBadgeEmpty}>
                      <Link2 size={11} color={textFaint} strokeWidth={2} />
                      <Text style={[styles.linkBadgeEmptyText, { color: textFaint }]}>
                        {isSelected ? '우측에서 상품 검색 → 바인딩' : '제휴 링크 없음'}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Selected cut detail */}
          {selectedCut && (
            <View style={[styles.detailPanel, { backgroundColor: bgSubtle, borderColor: border }]}>
              <Text style={[styles.detailTitle, { color: accent }]}>{selectedCut.label} 편집 중</Text>
              <Text style={[styles.detailHint, { color: textDim }]}>
                우측 인스펙터에서 쿠팡 파트너스 상품을 검색하고 "바인딩" 버튼을 누르면 이 페이지에 제휴 링크가 자동 연결됩니다.
              </Text>
              {selectedCut.affiliateLink && selectedCut.affiliateLink.productId && (
                <View style={[styles.detailLinkCard, { backgroundColor: bg, borderColor: border }]}>
                  <View style={styles.detailLinkInfo}>
                    <Text style={[styles.detailLinkName, { color: text }]} numberOfLines={1}>
                      {selectedCut.affiliateLink.productName}
                    </Text>
                    <Text style={[styles.detailLinkUrl, { color: textFaint }]} numberOfLines={1}>
                      {selectedCut.affiliateLink.url}
                    </Text>
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
          <TouchableOpacity
            style={[styles.publishBtn, { backgroundColor: accent }]}
            onPress={handlePublish}
            activeOpacity={0.85}
          >
            <Sparkles size={16} color="#fff" strokeWidth={2.5} />
            <Text style={styles.publishBtnText}>만화 콘텐츠 확정 & 발행</Text>
            <ArrowRight size={16} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  headerSub: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  // ─── Step Section ───
  stepSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadgeText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  stepTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  stepCount: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
  },
  stepHint: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    lineHeight: 16,
  },
  // ─── Step 1: Slots ───
  slotScroll: {
    marginHorizontal: -4,
  },
  slotScrollContent: {
    paddingHorizontal: 4,
    gap: 8,
  },
  slotCard: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: 'hidden',
    position: 'relative',
  },
  slotImage: {
    width: '100%',
    height: '100%',
  },
  slotOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 4,
  },
  slotIndex: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  slotRemove: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotAdd: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    borderStyle: 'dashed',
  },
  slotAddText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
  },
  slotPlaceholder: {
    borderStyle: 'dashed',
    opacity: 0.3,
  },
  // ─── Step 2: Chips ───
  chipScroll: {
    marginHorizontal: -4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  personaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  psychoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  psychoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
  },
  presetDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    lineHeight: 16,
  },
  // ─── Step 3: Generate & Grid ───
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  addPageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  addPageBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
  },
  cutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cutCard: {
    width: Platform.OS === 'web' ? '48%' : 150,
    minHeight: 180,
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  cutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  cutLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
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
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cutImageFilled: {
    width: '100%',
    height: '100%',
  },
  cutImagePlaceholder: {
    alignItems: 'center',
    gap: 4,
  },
  cutImageHint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
  },
  bubbleArea: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    minHeight: 40,
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
    padding: 0,
    minHeight: 20,
    lineHeight: 16,
  },
  bubbleText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    lineHeight: 16,
  },
  linkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  linkBadgeText: {
    flex: 1,
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
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
  },
  // ─── Detail Panel ───
  detailPanel: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  detailTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  detailHint: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    lineHeight: 17,
  },
  detailLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  detailLinkInfo: {
    flex: 1,
    gap: 2,
  },
  detailLinkName: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
  },
  detailLinkUrl: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
  },
  detailLinkRemove: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ─── Publish ───
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 12,
    marginTop: 4,
  },
  publishBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
});
