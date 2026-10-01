import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Pressable,
  Image,
} from 'react-native';
import {
  Sparkles,
  Check,
  ChevronDown,
  User,
  Sliders,
  Upload,
  X,
  Palette,
  Brush,
  Zap,
  ImageIcon,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import type { ToonCharacter } from '@/components/PhotoToonUpload';
import { TOON_PERSONA_PRESETS } from '@/components/PhotoToonUpload';
import type { ToonStyle, ArtStyle } from '@/lib/inspectorContext';
import type { InspectorCutData } from '@/lib/inspectorContext';
import { applyToonFilter } from '@/lib/toonFilter';

const isWeb = Platform.OS === 'web';

interface InspectorPanelProps {
  visible: boolean;
  onClose: () => void;
  currentCutLabel?: string;
  toonCharacter?: ToonCharacter | null;
  onCharacterCreated?: (char: ToonCharacter) => void;
  selectedPresetId?: string;
  onPresetSelect?: (id: string) => void;
  toneLevel?: number;
  onToneChange?: (level: number) => void;
  toonStyle?: ToonStyle;
  onToonStyleChange?: (style: ToonStyle) => void;
  artStyle?: ArtStyle;
  onArtStyleChange?: (style: ArtStyle) => void;
  selectedCut?: InspectorCutData;
  onUpdateCut?: (id: string, updates: Partial<Omit<InspectorCutData, 'id'>>) => void;
  onBatchToonApply?: () => void;
  batchTooning?: boolean;
}

export function InspectorPanel({
  visible,
  onClose,
  currentCutLabel,
  toonCharacter = null,
  onCharacterCreated,
  selectedPresetId = 'veteran',
  onPresetSelect,
  toneLevel = 50,
  onToneChange,
  toonStyle = 'color',
  onToonStyleChange,
  artStyle = 'digital-webtoon',
  onArtStyleChange,
  selectedCut,
  onUpdateCut,
  onBatchToonApply,
  batchTooning = false,
}: InspectorPanelProps) {
  // ─── Face upload state (persona mode) ───
  const [faces, setFaces] = useState<ToonCharacter[]>([]);
  const [faceDragOver, setFaceDragOver] = useState(false);

  const handleFaceFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rawUri = reader.result as string;
      // Apply toon filter to transform the photo into a manga-style face
      let toonedUri = rawUri;
      try {
        toonedUri = await applyToonFilter(rawUri, {
          toneLevel,
          style: toonStyle,
          artStyle,
          edgeThreshold: 40,
          posterizeLevels: 4,
          dotSize: 3,
        });
      } catch {
        // Fall back to raw image if filter fails
      }
      const newFace: ToonCharacter = {
        id: `face_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        imageUrl: toonedUri,
        presetId: selectedPresetId,
        toneLevel,
      };
      setFaces((prev) => [...prev, newFace]);
      onCharacterCreated?.(newFace);
    };
    reader.readAsDataURL(file);
  }, [selectedPresetId, toneLevel, toonStyle, artStyle, onCharacterCreated]);

  const handleFacePick = useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files) {
        Array.from(target.files).forEach((f) => handleFaceFile(f));
      }
    };
    input.click();
  }, [handleFaceFile]);

  const handleFaceDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFaceDragOver(false);
    if (e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach((f) => handleFaceFile(f));
    }
  }, [handleFaceFile]);

  const handleFaceRemove = useCallback((id: string) => {
    setFaces((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleFaceSelect = useCallback((face: ToonCharacter) => {
    onCharacterCreated?.(face);
  }, [onCharacterCreated]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Sparkles size={16} color={theme.colors.primary[400]} strokeWidth={2.5} />
          </View>
          <View>
            <Text style={styles.headerTitle}>인스펙터</Text>
            <Text style={styles.headerSub}>
              {currentCutLabel ?? '현재 컷'} · 캐릭터 & 만화 스타일
            </Text>
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <ChevronDown size={18} color={theme.colors.light.textDim} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Selected Cut Info Bar ─── */}
        {selectedCut && (
          <View style={styles.selectedCutBar}>
            <View style={styles.selectedCutBadge}>
              <Text style={styles.selectedCutBadgeText}>{selectedCut.label}</Text>
            </View>
            {selectedCut.imageUrl ? (
              <Image
                source={{ uri: selectedCut.imageUrl }}
                style={styles.selectedCutThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.selectedCutThumbEmpty}>
                <ImageIcon size={14} color={theme.colors.light.textFaint} strokeWidth={1.5} />
              </View>
            )}
            <View style={styles.selectedCutInfo}>
              <Text style={styles.selectedCutLinkLabel} numberOfLines={1}>
                {selectedCut.imageUrl ? '이미지 등록됨' : '이미지 미등록'}
              </Text>
              <Text style={styles.selectedCutBubblePreview} numberOfLines={1}>
                {selectedCut.speechBubble || '말풍선 미입력'}
              </Text>
            </View>
          </View>
        )}
        {/* ─── Character & Style Settings (always visible at top) ─── */}
        <View style={styles.personaModeWrap}>
          <View style={styles.personaHeader}>
            <View style={styles.personaHeaderIcon}>
              <User size={16} color={theme.colors.primary[400]} strokeWidth={2.5} />
            </View>
            <View>
              <Text style={styles.personaHeaderTitle}>캐릭터 & 만화 스타일</Text>
              <Text style={styles.personaHeaderSub}>캐릭터 사진 업로드 · 컬러/흑백 · 일괄 적용</Text>
            </View>
          </View>

          {/* Character preview */}
          {toonCharacter ? (
            <View style={styles.personaPreviewCard}>
              <Image
                source={{ uri: toonCharacter.imageUrl }}
                style={styles.personaPreviewImg}
                resizeMode="cover"
              />
              <View style={styles.personaPreviewInfo}>
                <Text style={styles.personaPreviewLabel}>적용된 캐릭터</Text>
                <Text style={styles.personaPreviewPreset}>
                  {TOON_PERSONA_PRESETS.find((p) => p.id === toonCharacter.presetId)?.emoji}{' '}
                  {TOON_PERSONA_PRESETS.find((p) => p.id === toonCharacter.presetId)?.label}
                </Text>
                <Text style={styles.personaPreviewTone}>톤 강도: {toonCharacter.toneLevel}%</Text>
              </View>
              <View style={styles.personaPreviewBadge}>
                <Check size={12} color="#fff" strokeWidth={2.5} />
              </View>
            </View>
          ) : (
            <View style={styles.personaEmptyCard}>
              <User size={24} color={theme.colors.light.textFaint} strokeWidth={1.5} />
              <Text style={styles.personaEmptyText}>아래 업로더에서 캐릭터 얼굴 사진을</Text>
              <Text style={styles.personaEmptyText}>추가하여 만화 캐릭터를 생성하세요</Text>
            </View>
          )}

          {/* Face photo uploader */}
          <Text style={styles.personaSectionLabel}>캐릭터 얼굴 사진 업로드</Text>
          <TouchableOpacity
            style={[styles.faceDropzone, faceDragOver && styles.faceDropzoneActive]}
            onPress={handleFacePick}
            activeOpacity={0.7}
            {...({
              onDrop: handleFaceDrop,
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); setFaceDragOver(true); },
              onDragLeave: () => setFaceDragOver(false),
            } as any)}
          >
            <Upload size={20} color={theme.colors.primary[400]} strokeWidth={2} />
            <Text style={styles.faceDropzoneText}>클릭 또는 드래그하여 얼굴 사진 추가</Text>
            <Text style={styles.faceDropzoneHint}>JPG, PNG · 여러 장 동시 업로드 가능</Text>
          </TouchableOpacity>

          {/* Face thumbnail grid */}
          {faces.length > 0 && (
            <View style={styles.faceGrid}>
              {faces.map((face) => {
                const isActive = toonCharacter?.id === face.id;
                return (
                  <View key={face.id} style={styles.faceThumbWrap}>
                    <TouchableOpacity
                      style={[styles.faceThumb, isActive && styles.faceThumbActive]}
                      onPress={() => handleFaceSelect(face)}
                      activeOpacity={0.7}
                    >
                      <Image
                        source={{ uri: face.imageUrl }}
                        style={styles.faceThumbImg}
                        resizeMode="cover"
                      />
                      {isActive && (
                        <View style={styles.faceThumbBadge}>
                          <Check size={10} color="#fff" strokeWidth={3} />
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.faceThumbRemove}
                      onPress={() => handleFaceRemove(face.id)}
                      activeOpacity={0.7}
                    >
                      <X size={8} color="#fff" strokeWidth={3} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Preset selector */}
          <Text style={styles.personaSectionLabel}>페르소나 프리셋</Text>
          <View style={styles.personaPresetList}>
            {TOON_PERSONA_PRESETS.map((preset) => {
              const selected = preset.id === selectedPresetId;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[
                    styles.personaPresetRow,
                    selected && { borderColor: preset.toneColor, backgroundColor: preset.toneColor + '12' },
                  ]}
                  onPress={() => onPresetSelect?.(preset.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.personaPresetEmoji}>{preset.emoji}</Text>
                  <View style={styles.personaPresetInfo}>
                    <Text style={[styles.personaPresetName, selected && { color: preset.toneColor }]}>
                      {preset.label}
                    </Text>
                    <Text style={styles.personaPresetDesc}>{preset.desc}</Text>
                  </View>
                  {selected && (
                    <Check size={16} color={preset.toneColor} strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tone slider */}
          <View style={styles.personaToneSection}>
            <View style={styles.personaToneHeader}>
              <Sliders size={14} color={theme.colors.primary[400]} strokeWidth={2} />
              <Text style={styles.personaToneLabel}>톤앤매너 강도</Text>
              <Text style={styles.personaToneValue}>{toneLevel}%</Text>
            </View>
            <View style={styles.personaToneTrack}>
              <View style={[styles.personaToneFill, { width: `${toneLevel}%` }]} />
            </View>
            <View style={styles.personaToneMarks}>
              {([0, 25, 50, 75, 100] as const).map((mark) => (
                <TouchableOpacity
                  key={mark}
                  style={styles.personaToneMarkBtn}
                  onPress={() => onToneChange?.(mark)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.personaToneDot, toneLevel === mark && styles.personaToneDotActive]} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.personaToneLabels}>
              <Text style={styles.personaToneLabelSmall}>원본</Text>
              <Text style={styles.personaToneLabelSmall}>과장</Text>
            </View>
          </View>

          {/* Toon style toggle: Color / Mono */}
          <View style={styles.toonStyleSection}>
            <View style={styles.toonStyleHeader}>
              <Palette size={14} color={theme.colors.primary[400]} strokeWidth={2} />
              <Text style={styles.toonStyleLabel}>만화 스타일</Text>
            </View>
            <View style={styles.toonStyleToggle}>
              <TouchableOpacity
                style={[styles.toonStyleBtn, toonStyle === 'color' && styles.toonStyleBtnActive]}
                onPress={() => onToonStyleChange?.('color')}
                activeOpacity={0.7}
              >
                <Text style={[styles.toonStyleBtnText, toonStyle === 'color' && styles.toonStyleBtnTextActive]}>
                  컬러 웹툰풍
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toonStyleBtn, toonStyle === 'mono' && styles.toonStyleBtnActive]}
                onPress={() => onToonStyleChange?.('mono')}
                activeOpacity={0.7}
              >
                <Text style={[styles.toonStyleBtnText, toonStyle === 'mono' && styles.toonStyleBtnTextActive]}>
                  흑백 망점 스케치
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Art style selector — 3 distinctive drawing styles */}
          <View style={styles.artStyleSection}>
            <View style={styles.toonStyleHeader}>
              <Brush size={14} color={theme.colors.primary[400]} strokeWidth={2} />
              <Text style={styles.toonStyleLabel}>만화 화풍</Text>
            </View>
            <View style={styles.artStyleGrid}>
              {([
                { id: 'digital-webtoon', emoji: '🎨', label: '디지털 웹툰풍', desc: '깔끔·선명 라인' },
                { id: 'analog-manga', emoji: '✒️', label: '아날로그 극화체', desc: '거친 펜선·묵직' },
                { id: 'vintage-sketch', emoji: '✏️', label: '빈티지 카툰', desc: '손그림 스케치 톤' },
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.artStyleChip, artStyle === opt.id && styles.artStyleChipActive]}
                  onPress={() => onArtStyleChange?.(opt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.artStyleEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.artStyleLabel, artStyle === opt.id && styles.artStyleLabelActive]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.artStyleDesc}>{opt.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Batch apply to all cuts — prominent electric purple button */}
          <TouchableOpacity
            style={[styles.batchApplyBtn, batchTooning && styles.batchApplyBtnDisabled]}
            onPress={() => onBatchToonApply?.()}
            disabled={batchTooning}
            activeOpacity={0.85}
          >
            {batchTooning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Zap size={16} color="#fff" strokeWidth={2.5} />
            )}
            <Text style={styles.batchApplyBtnText}>
              {batchTooning ? '일괄 변환 중...' : '만화 캐릭터 생성 및 타일 컷 일괄 적용'}
            </Text>
          </TouchableOpacity>

          <View style={styles.inspectorDivider} />
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: theme.colors.primary[500] + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.light.text,
  },
  headerSub: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textFaint,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
    height: '100%',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexGrow: 1,
  },
  // ─── Section Header ───
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.03)',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: theme.colors.primary[500] + '14',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.light.text,
  },
  sectionBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: theme.colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  sectionBody: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    gap: 10,
  },
  sectionDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textFaint,
    lineHeight: 16,
    marginTop: 4,
  },
  // ─── Search ───
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.text,
    padding: 0,
  },
  searchBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 8,
    backgroundColor: theme.colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnDisabled: {
    opacity: 0.4,
  },
  searchBtnText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  partnerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  partnerStatusText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textFaint,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textDim,
  },
  resultsList: {
    gap: 6,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.light.text,
    lineHeight: 16,
  },
  resultPrice: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[400],
  },
  resultActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  webLinkBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bindBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 6,
    backgroundColor: theme.colors.primary[500] + '18',
  },
  bindBtnActive: {
    backgroundColor: theme.colors.success[500],
  },
  bindBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
  },
  bindBtnTextActive: {
    color: '#fff',
  },
  // ─── Bound links ───
  boundSection: {
    marginTop: 8,
    gap: 6,
  },
  boundSectionTitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.light.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  boundCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.primary[500] + '0C',
    borderWidth: 1,
    borderColor: theme.colors.primary[500] + '20',
  },
  boundCardInfo: {
    flex: 1,
    gap: 2,
  },
  boundName: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.light.text,
  },
  boundUrl: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textFaint,
  },
  boundSubId: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[400],
  },
  boundCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ─── Sub ID ───
  subIdList: {
    gap: 6,
  },
  subIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  subIdChannel: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: theme.colors.primary[500] + '18',
  },
  subIdChannelText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
  },
  subIdValue: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.text,
  },
  subIdAddRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  subIdInput: {
    flex: 1,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.text,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: theme.colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnDisabled: {
    opacity: 0.3,
  },
  // ─── AI Prompt ───
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  modelLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.light.textDim,
  },
  modelOptions: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  modelChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  modelChipActive: {
    backgroundColor: theme.colors.primary[500] + '20',
    borderColor: theme.colors.primary[500] + '40',
  },
  modelChipText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textDim,
  },
  modelChipTextActive: {
    color: theme.colors.primary[400],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  promptWrap: {
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    minHeight: 100,
  },
  promptInput: {
    padding: 12,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.text,
    lineHeight: 18,
    minHeight: 100,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  toggleTrack: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    justifyContent: 'center',
    padding: 2,
  },
  toggleTrackActive: {
    backgroundColor: theme.colors.primary[500],
    borderColor: theme.colors.primary[500],
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.light.textDim,
    transform: [{ translateX: 0 }],
  },
  toggleThumbActive: {
    backgroundColor: '#fff',
    transform: [{ translateX: 16 }],
  },
  toggleInfo: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.light.text,
  },
  toggleDesc: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textFaint,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.colors.primary[500],
    marginTop: 4,
  },
  publishBtnActive: {
    opacity: 0.7,
  },
  publishBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  apiKeyStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  apiKeyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  apiKeyDotActive: {
    backgroundColor: theme.colors.success[400],
  },
  apiKeyDotInactive: {
    backgroundColor: theme.colors.light.textFaint,
  },
  apiKeyStatusText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textFaint,
    marginLeft: 4,
  },
  // ─── Persona Mode ───
  // Selected cut info bar
  selectedCutBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  selectedCutBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#A855F715',
  },
  selectedCutBadgeText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#A855F7',
  },
  selectedCutThumb: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  selectedCutThumbEmpty: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCutInfo: {
    flex: 1,
    gap: 2,
  },
  selectedCutLinkLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#475569',
  },
  selectedCutBubblePreview: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: '#94A3B8',
  },
  personaModeWrap: {
    gap: 12,
  },
  personaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  personaHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: theme.colors.primary[500] + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  personaHeaderTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.light.text,
  },
  personaHeaderSub: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textFaint,
    marginTop: 2,
  },
  personaPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: theme.colors.primary[500] + '30',
  },
  personaPreviewImg: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  personaPreviewInfo: {
    flex: 1,
    gap: 3,
  },
  personaPreviewLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textFaint,
  },
  personaPreviewPreset: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.light.text,
  },
  personaPreviewTone: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[400],
  },
  personaPreviewBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.success[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  personaEmptyCard: {
    alignItems: 'center',
    gap: 8,
    padding: 20,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    borderStyle: 'dashed',
  },
  personaEmptyText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textFaint,
    textAlign: 'center',
  },
  personaSectionLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.light.textDim,
    marginTop: 4,
  },
  personaPresetList: {
    gap: 6,
  },
  personaPresetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    backgroundColor: '#f5f5f5',
  },
  personaPresetEmoji: {
    fontSize: 18,
  },
  personaPresetInfo: {
    flex: 1,
    gap: 2,
  },
  personaPresetName: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.light.text,
  },
  personaPresetDesc: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textFaint,
  },
  personaToneSection: {
    gap: 6,
    marginTop: 4,
  },
  personaToneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  personaToneLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.light.textDim,
  },
  personaToneValue: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
  },
  personaToneTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  personaToneFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: theme.colors.primary[500],
  },
  personaToneMarks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginTop: -4,
  },
  personaToneMarkBtn: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  personaToneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.15)',
  },
  personaToneDotActive: {
    backgroundColor: theme.colors.primary[400],
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  personaToneLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  personaToneLabelSmall: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textFaint,
  },
  // Toon style toggle
  toonStyleSection: {
    marginTop: 14,
    gap: 8,
  },
  toonStyleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toonStyleLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.light.textDim,
  },
  toonStyleToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  toonStyleBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toonStyleBtnActive: {
    borderColor: '#A855F7',
    backgroundColor: '#A855F715',
  },
  toonStyleBtnText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#475569',
  },
  toonStyleBtnTextActive: {
    color: '#A855F7',
  },
  // Art style selector
  artStyleSection: {
    marginTop: 14,
    gap: 8,
  },
  artStyleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  artStyleChip: {
    flex: 1,
    minWidth: '47%',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  artStyleChipActive: {
    borderColor: '#A855F7',
    backgroundColor: '#A855F715',
  },
  artStyleEmoji: {
    fontSize: 18,
  },
  artStyleLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#475569',
    textAlign: 'center',
  },
  artStyleLabelActive: {
    color: '#A855F7',
  },
  artStyleDesc: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: '#94A3B8',
    textAlign: 'center',
  },
  // Batch apply button
  batchApplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#A855F7',
    marginTop: 12,
  },
  batchApplyBtnDisabled: {
    opacity: 0.5,
  },
  batchApplyBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  personaApplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderRadius: 10,
    backgroundColor: theme.colors.success[500],
    marginTop: 4,
  },
  personaApplyBtnDisabled: {
    opacity: 0.4,
  },
  personaApplyBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  // ─── Face uploader ───
  faceDropzone: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.light.border,
    backgroundColor: '#FAFAFB',
    marginBottom: 12,
  },
  faceDropzoneActive: {
    borderColor: theme.colors.primary[400],
    backgroundColor: theme.colors.primary[500] + '0A',
  },
  faceDropzoneText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.light.textDim,
  },
  faceDropzoneHint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.light.textFaint,
  },
  faceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  faceThumbWrap: {
    position: 'relative',
  },
  faceThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  faceThumbActive: {
    borderColor: theme.colors.primary[400],
  },
  faceThumbImg: {
    width: '100%',
    height: '100%',
  },
  faceThumbBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.success[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceThumbRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.error[400],
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  inspectorDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
    marginTop: 14,
  },
});
