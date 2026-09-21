import { memo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ViewStyle } from 'react-native';
import { Zap, Wrench, Sliders, ChevronDown, ChevronUp, Loader2, Orbit, Layers } from 'lucide-react-native';
import { theme } from '@/lib/theme';

export type GenMode = 'auto_3d' | 'universal_synthesis' | 'manual';

interface ModeOptionToggle {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

interface Props {
  mode: GenMode;
  onModeChange: (mode: GenMode) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  manualPrompt: string;
  onManualPromptChange: (text: string) => void;
  cameraSpeed: number;
  onCameraSpeedChange: (speed: number) => void;
  ttsSyncOffset: number;
  onTtsSyncOffsetChange: (offset: number) => void;
  captionText: string;
  onCaptionTextChange: (text: string) => void;
  modeOptions: ModeOptionToggle[];
}

const MODE_ACCENT = {
  auto_3d: theme.colors.primary[400],
  universal_synthesis: theme.colors.accent[400],
  manual: theme.colors.dark.textDim,
};

function GenerationModePanelInner({
  mode,
  onModeChange,
  isGenerating: isGen,
  onGenerate,
  manualPrompt,
  onManualPromptChange,
  cameraSpeed,
  onCameraSpeedChange,
  ttsSyncOffset,
  onTtsSyncOffsetChange,
  captionText,
  onCaptionTextChange,
  modeOptions,
}: Props) {
  const [manualExpanded, setManualExpanded] = useState(false);
  const accent = MODE_ACCENT[mode] ?? theme.colors.primary[400];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>4</Text>
        </View>
        <Text style={styles.title}>제작 모드 &amp; 실행</Text>
      </View>

      {/* Mode selection cards */}
      <View style={styles.modeCards}>
        <TouchableOpacity
          style={[styles.modeCard, mode === 'auto_3d' && styles.modeCardActive, isGen && styles.modeCardDisabled]}
          onPress={() => onModeChange('auto_3d')}
          activeOpacity={0.7}
          disabled={isGen}
        >
          <View style={styles.modeCardHeader}>
            <View style={[styles.modeIconWrap, mode === 'auto_3d' && styles.modeIconWrapActive]}>
              <Orbit size={18} color={mode === 'auto_3d' ? '#fff' : MODE_ACCENT.auto_3d} strokeWidth={2} />
            </View>
            <View style={styles.modeCardTextWrap}>
              <Text style={[styles.modeCardTitle, mode === 'auto_3d' && styles.modeCardTitleActive]}>
                입체컷 오토
              </Text>
              <Text style={styles.modeCardDesc}>
                정면·좌측·우측·상부를 순차 촬영해 AI 입체적 숏폼 완성
              </Text>
            </View>
          </View>

          {mode === 'auto_3d' && modeOptions.length > 0 && (
            <View style={[styles.modeOptionsPanel, { borderColor: MODE_ACCENT.auto_3d + '30' }]}>
              {modeOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={styles.optionRow}
                  onPress={opt.onToggle}
                  activeOpacity={0.7}
                  disabled={isGen}
                >
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                    <Text style={styles.optionDesc}>{opt.description}</Text>
                  </View>
                  <View style={[styles.toggle, opt.enabled && styles.toggleActive]}>
                    <View style={[styles.toggleKnob, opt.enabled && styles.toggleKnobActive]} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeCard, mode === 'universal_synthesis' && styles.modeCardActive, isGen && styles.modeCardDisabled]}
          onPress={() => onModeChange('universal_synthesis')}
          activeOpacity={0.7}
          disabled={isGen}
        >
          <View style={styles.modeCardHeader}>
            <View style={[styles.modeIconWrap, mode === 'universal_synthesis' && styles.modeIconWrapActiveAccent]}>
              <Layers size={18} color={mode === 'universal_synthesis' ? '#fff' : MODE_ACCENT.universal_synthesis} strokeWidth={2} />
            </View>
            <View style={styles.modeCardTextWrap}>
              <Text style={[styles.modeCardTitle, mode === 'universal_synthesis' && styles.modeCardTitleActive]}>
                AI 범용 합성
              </Text>
              <Text style={styles.modeCardDesc}>
                최소 3컷부터 다각도 촬영 컷으로 제품을 배경·모델에 자연스럽게 합성
              </Text>
            </View>
          </View>

          {mode === 'universal_synthesis' && modeOptions.length > 0 && (
            <View style={[styles.modeOptionsPanel, { borderColor: MODE_ACCENT.universal_synthesis + '30' }]}>
              {modeOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={styles.optionRow}
                  onPress={opt.onToggle}
                  activeOpacity={0.7}
                  disabled={isGen}
                >
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                    <Text style={styles.optionDesc}>{opt.description}</Text>
                  </View>
                  <View style={[styles.toggle, opt.enabled && styles.toggleActiveAccent]}>
                    <View style={[styles.toggleKnob, opt.enabled && styles.toggleKnobActive]} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeCard, mode === 'manual' && styles.modeCardActive, isGen && styles.modeCardDisabled]}
          onPress={() => onModeChange('manual')}
          activeOpacity={0.7}
          disabled={isGen}
        >
          <View style={styles.modeCardHeader}>
            <View style={[styles.modeIconWrap, mode === 'manual' && styles.modeIconWrapActive]}>
              <Wrench size={18} color={mode === 'manual' ? '#fff' : MODE_ACCENT.manual} strokeWidth={2} />
            </View>
            <View style={styles.modeCardTextWrap}>
              <Text style={[styles.modeCardTitle, mode === 'manual' && styles.modeCardTitleActive]}>
                수동 모드
              </Text>
              <Text style={styles.modeCardDesc}>
                프롬프트·카메라·TTS 싱크를 직접 제어하는 상세 편집
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {mode === 'manual' && (
        <View style={[styles.manualPanel, isGen && styles.modeCardDisabled]}>
          <TouchableOpacity
            style={styles.manualToggle}
            onPress={() => setManualExpanded((v) => !v)}
            activeOpacity={0.7}
            disabled={isGen}
          >
            <Text style={styles.manualToggleText}>상세 편집 패널</Text>
            {manualExpanded ? (
              <ChevronUp size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
            ) : (
              <ChevronDown size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
            )}
          </TouchableOpacity>

          {manualExpanded && (
            <View style={styles.manualContent}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>프롬프트</Text>
                <TextInput
                  style={[styles.promptInput, isGen && styles.inputDisabled]}
                  value={manualPrompt}
                  onChangeText={onManualPromptChange}
                  placeholder="AI에게 전달할 제작 지시사항을 입력하세요"
                  placeholderTextColor={theme.colors.dark.textFaint}
                  multiline
                  numberOfLines={3}
                  editable={!isGen}
                />
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.sliderHeader}>
                  <Text style={styles.inputLabel}>카메라 무빙 속도</Text>
                  <Text style={styles.sliderValue}>{cameraSpeed.toFixed(1)}x</Text>
                </View>
                <View style={styles.sliderTrack}>
                  <View style={[styles.sliderFill, { width: `${((cameraSpeed - 0.5) / 2) * 100}%` }]} />
                  {[0.5, 1.0, 1.5, 2.0, 2.5].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[styles.sliderTick, cameraSpeed === val && styles.sliderTickActive]}
                      onPress={() => onCameraSpeedChange(val)}
                      activeOpacity={0.7}
                      disabled={isGen}
                    >
                      <Text style={styles.sliderTickLabel}>{val.toFixed(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.sliderHeader}>
                  <Text style={styles.inputLabel}>TTS 싱크 오프셋</Text>
                  <Text style={styles.sliderValue}>{ttsSyncOffset > 0 ? `+${ttsSyncOffset}` : ttsSyncOffset}ms</Text>
                </View>
                <View style={styles.sliderTrack}>
                  <View style={[styles.sliderFill, { width: `${((ttsSyncOffset + 500) / 1000) * 100}%` }]} />
                  {[-500, -250, 0, 250, 500].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[styles.sliderTick, ttsSyncOffset === val && styles.sliderTickActive]}
                      onPress={() => onTtsSyncOffsetChange(val)}
                      activeOpacity={0.7}
                      disabled={isGen}
                    >
                      <Text style={styles.sliderTickLabel}>{val > 0 ? `+${val}` : val}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>자막 텍스트</Text>
                <TextInput
                  style={[styles.captionInput, isGen && styles.inputDisabled]}
                  value={captionText}
                  onChangeText={onCaptionTextChange}
                  placeholder="화면에 표시할 자막"
                  placeholderTextColor={theme.colors.dark.textFaint}
                  multiline
                  numberOfLines={2}
                  editable={!isGen}
                />
              </View>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.generateBtn, { backgroundColor: accent }, isGen && styles.generateBtnDisabled]}
        onPress={onGenerate}
        disabled={isGen}
        activeOpacity={0.8}
      >
        {isGen ? (
          <Loader2 size={20} color="#fff" strokeWidth={2.5} />
        ) : (
          <Zap size={20} color="#fff" strokeWidth={2.5} />
        )}
        <Text style={styles.generateBtnText}>
          {isGen ? '생성 중...' : mode === 'auto_3d' ? '입체컷 자동 생성' : mode === 'universal_synthesis' ? 'AI 범용 합성 생성' : '수동 설정으로 생성'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export const GenerationModePanel = memo(GenerationModePanelInner);

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadgeText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  title: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  modeCards: {
    gap: theme.spacing.xs,
  },
  modeCard: {
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: 'rgba(76, 125, 255, 0.10)',
    gap: 8,
  },
  modeCardActive: {
    borderColor: theme.colors.primary[500],
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  modeCardDisabled: {
    opacity: 0.5,
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  modeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeIconWrapActive: {
    backgroundColor: theme.colors.primary[500],
  },
  modeIconWrapActiveAccent: {
    backgroundColor: theme.colors.accent[400],
  },
  modeCardTextWrap: {
    flex: 1,
    gap: 3,
  },
  modeCardTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  modeCardTitleActive: {
    color: theme.colors.primary[300],
  },
  modeCardDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: '#A6B0CF',
    lineHeight: 16,
  },
  modeOptionsPanel: {
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(76, 125, 255, 0.10)',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  optionTextWrap: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  optionDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  toggle: {
    width: 36,
    height: 20,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: theme.colors.primary[500],
  },
  toggleActiveAccent: {
    backgroundColor: theme.colors.accent[400],
  },
  toggleKnob: {
    width: 16,
    height: 16,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.textDim,
    alignSelf: 'flex-start',
  },
  toggleKnobActive: {
    backgroundColor: '#fff',
    alignSelf: 'flex-end',
  },
  manualPanel: {
    gap: theme.spacing.xs,
  },
  manualToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  manualToggleText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  manualContent: {
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  promptInput: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    minHeight: 60,
  },
  captionInput: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    minHeight: 40,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderValue: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  sliderTrack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 32,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 4,
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: theme.colors.primary[500] + '22',
    borderRadius: theme.radius.sm,
  },
  sliderTick: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    zIndex: 1,
  },
  sliderTickActive: {
    backgroundColor: theme.colors.primary[500],
  },
  sliderTickLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md + 2,
    borderRadius: theme.radius.lg,
    ...theme.shadows.glowPrimary,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
