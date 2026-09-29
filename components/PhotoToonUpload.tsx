import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {
  Camera,
  Upload,
  Sparkles,
  Check,
  X,
  RefreshCw,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { applyToonFilter } from '@/lib/toonFilter';

export interface ToonPersonaPreset {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  toneColor: string;
}

export const TOON_PERSONA_PRESETS: ToonPersonaPreset[] = [
  { id: 'veteran', label: '현장 36년 부장', emoji: '😤', desc: '불평불만 가득하지만 일은 완벽히', toneColor: '#F59E0B' },
  { id: 'intern', label: '열정 인턴', emoji: '🤩', desc: '모든 게 신기하고 감탄 연발', toneColor: '#10B981' },
  { id: 'bgrade', label: 'B급 감성 캐릭터', emoji: '😎', desc: '오글하고 유쾌한 밈 감성', toneColor: '#EF4444' },
  { id: 'cool', label: '쿨한 크리에이터', emoji: '🧊', desc: '담백하고 감각적인 트렌드 세터', toneColor: '#3B82F6' },
  { id: 'grandma', label: '친절한 동네 할머니', emoji: '🌸', desc: '따뜻하고 정겨운 추천 멘트', toneColor: '#EC4899' },
  { id: 'tech', label: 'IT 전문가', emoji: '🤓', desc: '데이터 기반 분석형 리뷰', toneColor: '#8B5CF6' },
];

export interface ToonCharacter {
  id: string;
  imageUrl: string;
  presetId: string;
  toneLevel: number;
}

interface PhotoToonUploadProps {
  onCharacterCreated?: (character: ToonCharacter) => void;
  selectedPresetId?: string;
  onPresetSelect?: (presetId: string) => void;
  toneLevel?: number;
  onToneChange?: (level: number) => void;
}

export function PhotoToonUpload({
  onCharacterCreated,
  selectedPresetId = 'veteran',
  onPresetSelect,
  toneLevel = 50,
  onToneChange,
}: PhotoToonUploadProps) {
  const [uploadedUri, setUploadedUri] = useState<string | null>(null);
  const [tooning, setTooning] = useState(false);
  const [toonedUri, setToonedUri] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드 가능합니다');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const uri = reader.result as string;
      setUploadedUri(uri);
      setToonedUri(null);
    };
    reader.onerror = () => setError('파일을 불러올 수 없습니다');
    reader.readAsDataURL(file);
  }, []);

  const handlePickFile = useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        handleFile(target.files[0]);
      }
    };
    input.click();
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleToonify = useCallback(async () => {
    if (!uploadedUri) return;
    setTooning(true);
    setError(null);
    try {
      const toonedResult = await applyToonFilter(uploadedUri, {
        toneLevel,
        edgeThreshold: 40,
        posterizeLevels: 4,
        dotSize: 3,
      });
      setToonedUri(toonedResult);
      const preset = TOON_PERSONA_PRESETS.find((p) => p.id === selectedPresetId);
      if (preset && onCharacterCreated) {
        onCharacterCreated({
          id: `char_${Date.now()}`,
          imageUrl: toonedResult,
          presetId: selectedPresetId,
          toneLevel,
        });
      }
    } catch {
      setError('만화 캐릭터 생성 중 오류가 발생했습니다');
    }
    setTooning(false);
  }, [uploadedUri, selectedPresetId, toneLevel, onCharacterCreated]);

  const handleReset = useCallback(() => {
    setUploadedUri(null);
    setToonedUri(null);
    setError(null);
  }, []);

  const currentPreset = TOON_PERSONA_PRESETS.find((p) => p.id === selectedPresetId);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Camera size={16} color={theme.colors.primary[400]} strokeWidth={2.5} />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>사진으로 만화 캐릭터 만들기</Text>
          <Text style={styles.headerSub}>본인, 팀원 또는 현장 사진을 업로드하세요</Text>
        </View>
      </View>

      {/* Upload / Preview area */}
      {!uploadedUri ? (
        Platform.OS === 'web' ? (
          <TouchableOpacity onPress={handlePickFile} activeOpacity={0.7} style={[styles.dropzone, dragOver && styles.dropzoneActive]}>
            <View
              style={styles.dropzoneInner}
              {...({
                onDrop: handleDrop,
                onDragOver: handleDragOver,
                onDragLeave: handleDragLeave,
              } as any)}
            >
              <View style={styles.dropzoneIcon}>
                <Upload size={28} color={theme.colors.primary[400]} strokeWidth={2} />
              </View>
              <Text style={styles.dropzoneTitle}>사진을 드래그하거나 클릭</Text>
              <Text style={styles.dropzoneHint}>JPG, PNG · 최대 10MB</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handlePickFile} activeOpacity={0.7} style={[styles.dropzone, dragOver && styles.dropzoneActive]}>
            <View style={styles.dropzoneInner}>
              <View style={styles.dropzoneIcon}>
                <Upload size={28} color={theme.colors.primary[400]} strokeWidth={2} />
              </View>
              <Text style={styles.dropzoneTitle}>탭하여 사진 선택</Text>
              <Text style={styles.dropzoneHint}>JPG, PNG</Text>
            </View>
          </TouchableOpacity>
        )
      ) : (
        <View style={styles.previewWrap}>
          <Image
            source={{ uri: toonedUri || uploadedUri }}
            style={styles.previewImage}
            resizeMode="cover"
          />
          {tooning && (
            <View style={styles.tooningOverlay}>
              <ActivityIndicator size="large" color={theme.colors.primary[400]} />
              <Text style={styles.tooningText}>만화 스타일 변환 중...</Text>
            </View>
          )}
          {toonedUri && !tooning && (
            <View style={styles.toonedBadge}>
              <Check size={12} color="#fff" strokeWidth={2.5} />
              <Text style={styles.toonedBadgeText}>만화 캐릭터 완성</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.previewResetBtn}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <X size={16} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}

      {/* Persona preset chips */}
      <View style={styles.presetSection}>
        <Text style={styles.presetLabel}>캐릭터 페르소나</Text>
        <View style={styles.presetChips}>
          {TOON_PERSONA_PRESETS.map((preset) => {
            const selected = preset.id === selectedPresetId;
            return (
              <TouchableOpacity
                key={preset.id}
                style={[
                  styles.presetChip,
                  selected && { borderColor: preset.toneColor, backgroundColor: preset.toneColor + '15' },
                ]}
                onPress={() => onPresetSelect?.(preset.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.presetEmoji}>{preset.emoji}</Text>
                <Text
                  style={[styles.presetChipText, selected && { color: preset.toneColor }]}
                  numberOfLines={1}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {currentPreset && (
          <Text style={styles.presetDesc}>{currentPreset.emoji} {currentPreset.desc}</Text>
        )}
      </View>

      {/* Tone slider */}
      <View style={styles.toneSection}>
        <View style={styles.toneHeader}>
          <Text style={styles.toneLabel}>톤앤매너 강도</Text>
          <Text style={styles.toneValue}>{toneLevel}%</Text>
        </View>
        <View style={styles.toneSliderTrack}>
          <View
            style={[styles.toneSliderFill, { width: `${toneLevel}%` }]}
          />
          {[0, 25, 50, 75, 100].map((mark) => (
            <TouchableOpacity
              key={mark}
              style={[styles.toneMark, { left: `${mark}%` }]}
              onPress={() => onToneChange?.(mark)}
              activeOpacity={0.7}
            >
              <View style={[styles.toneDot, toneLevel === mark && styles.toneDotActive]} />
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.toneLabels}>
          <Text style={styles.toneLabelSmall}>원본</Text>
          <Text style={styles.toneLabelSmall}>과장</Text>
        </View>
      </View>

      {/* Action button */}
      {uploadedUri && !toonedUri && (
        <TouchableOpacity
          style={[styles.toonifyBtn, tooning && styles.toonifyBtnDisabled]}
          onPress={handleToonify}
          disabled={tooning}
          activeOpacity={0.85}
        >
          {tooning ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Sparkles size={16} color="#fff" strokeWidth={2.5} />
          )}
          <Text style={styles.toonifyBtnText}>
            {tooning ? '변환 중...' : '만화 캐릭터로 변환'}
          </Text>
        </TouchableOpacity>
      )}

      {toonedUri && (
        <TouchableOpacity
          style={styles.applyBtn}
          onPress={() => onCharacterCreated?.({
            id: `char_${Date.now()}`,
            imageUrl: toonedUri,
            presetId: selectedPresetId,
            toneLevel,
          })}
          activeOpacity={0.85}
        >
          <Check size={16} color="#fff" strokeWidth={2.5} />
          <Text style={styles.applyBtnText}>캐릭터 고정 및 숏툰 적용</Text>
        </TouchableOpacity>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <X size={14} color={theme.colors.error[400]} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#1F1F23',
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: theme.colors.primary[500] + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  headerSub: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 2,
  },
  dropzone: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18181B',
  },
  dropzoneActive: {
    borderColor: theme.colors.primary[400],
    backgroundColor: theme.colors.primary[500] + '08',
  },
  dropzoneTouchable: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropzoneInner: {
    alignItems: 'center',
    gap: 8,
  },
  dropzoneIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary[500] + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropzoneTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  dropzoneHint: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  previewWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    height: 160,
    position: 'relative',
    backgroundColor: '#18181B',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  tooningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 15, 30, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  tooningText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  toonedBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: theme.colors.success[500],
  },
  toonedBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  previewResetBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(10, 15, 30, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetSection: {
    gap: 8,
  },
  presetLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  presetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#18181B',
  },
  presetEmoji: {
    fontSize: 14,
  },
  presetChipText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  presetDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    lineHeight: 16,
  },
  toneSection: {
    gap: 6,
  },
  toneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toneLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  toneValue: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
  },
  toneSliderTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#18181B',
    position: 'relative',
  },
  toneSliderFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 3,
    backgroundColor: theme.colors.primary[500],
  },
  toneMark: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    marginLeft: -8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  toneDotActive: {
    backgroundColor: theme.colors.primary[400],
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  toneLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toneLabelSmall: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  toonifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderRadius: 10,
    backgroundColor: theme.colors.primary[500],
  },
  toonifyBtnDisabled: {
    opacity: 0.6,
  },
  toonifyBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderRadius: 10,
    backgroundColor: theme.colors.success[500],
  },
  applyBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.error[500] + '15',
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
});
