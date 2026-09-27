import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  LayoutAnimation,
  Platform,
  ViewStyle,
} from 'react-native';
import { Sparkles, Diamond, Shirt, Aperture, Sun, Layers, Check } from 'lucide-react-native';
import { theme } from '@/lib/theme';

export type PanelMode = 'auto-3d' | 'ai-blend';

export interface StudioSliderValues {
  facetSparkle: number;
  fabricDetail: number;
  blendStrength: number;
  smartFit: boolean;
}

interface StudioPremiumPanelProps {
  mode: PanelMode;
  onValuesChange?: (values: Partial<StudioSliderValues>) => void;
  productCategory?: string;
}

// ─── Shared sub-components ───────────────────────────────────────────

interface SliderProps {
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

function GoldSlider({ label, value, onValueChange, min = 0, max = 100, step = 1 }: SliderProps) {
  const [measuredWidth, setMeasuredWidth] = useState(120);
  const percent = ((value - min) / (max - min)) * 100;

  const handlePress = (evt: { nativeEvent: { locationX: number } }) => {
    const { locationX } = evt.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / measuredWidth));
    const raw = min + ratio * (max - min);
    const snapped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, Number.isFinite(snapped) ? snapped : min));
    onValueChange(clamped);
  };

  return (
    <View style={styles.sliderRow}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <View style={styles.sliderContainer}>
        <Pressable
          style={styles.sliderTrack}
          onPress={handlePress}
          onLayout={(e) => setMeasuredWidth(e.nativeEvent.layout.width || 120)}
        >
          <View style={[styles.sliderFill, { width: `${percent}%` }]} />
          <View style={[styles.sliderHandle, { left: `${percent}%` }]} />
        </Pressable>
      </View>
      <Text style={styles.sliderValue}>{value}</Text>
    </View>
  );
}

interface ToggleProps {
  label: string;
  hint?: string;
  value: boolean;
  onToggle: () => void;
}

function BlueToggle({ label, hint, value, onToggle }: ToggleProps) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleTextWrap}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint && <Text style={styles.toggleHint}>{hint}</Text>}
      </View>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7} hitSlop={12}>
        <View style={[styles.toggleSwitch, value && styles.toggleSwitchActive]}>
          <View style={[styles.toggleKnob, value && styles.toggleKnobActive]} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}

function GoldChip({ label, selected, onPress, icon }: ChipProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
      onPress={onPress}
    >
      {icon && <View style={styles.chipIcon}>{icon}</View>}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
      {selected && <Check size={12} color={theme.colors.gold[400]} strokeWidth={2.5} />}
    </Pressable>
  );
}

// ─── CASE A: auto-3d (입체컷 오토) ──────────────────────────────────

function Auto3DPanel({ onValuesChange, productCategory }: { onValuesChange?: (values: Partial<StudioSliderValues>) => void; productCategory?: string }) {
  const isJewelry = /jewel|주얼|necklace|목걸이|chain|체인|bracelet|팔찌|earring|귀걸이|ring|반지|watch|시계|gem|보석|diamond|다이아|crystal|크리스탈|pendant|펜던트|bangle/i.test(productCategory ?? "");
  const [facetSparkle, setFacetSparkle] = useState(isJewelry ? 92 : 60);
  const [fabricDetail, setFabricDetail] = useState(isJewelry ? 80 : 45);
  const [smartFit, setSmartFit] = useState(true);
  const [macroShots, setMacroShots] = useState<string[]>(isJewelry ? ['setting', 'clasp', 'texture'] : ['setting']);

  const handleSmartFit = useCallback((v: boolean) => {
    setSmartFit(v);
    onValuesChange?.({ smartFit: v });
  }, [onValuesChange]);

  const handleFacetSparkle = useCallback((v: number) => {
    setFacetSparkle(v);
    onValuesChange?.({ facetSparkle: v });
  }, [onValuesChange]);

  const handleFabricDetail = useCallback((v: number) => {
    setFabricDetail(v);
    onValuesChange?.({ fabricDetail: v });
  }, [onValuesChange]);

  const macroOptions = [
    { id: 'setting', label: '세팅면' },
    { id: 'stitch', label: '박음질선' },
    { id: 'clasp', label: '잠금장치' },
    { id: 'texture', label: '텍스처' },
  ];

  const toggleMacro = (id: string) => {
    setMacroShots((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  return (
    <View style={styles.panelBody}>
      <View style={styles.panelSection}>
        <Text style={styles.panelSectionTitle}>
          <Diamond size={13} color={theme.colors.gold[400]} strokeWidth={2.2} />
          {'  '}광채 및 질감 제어
        </Text>
        <GoldSlider
          label="주얼리 컷 팩싯 강화"
          value={facetSparkle}
          onValueChange={handleFacetSparkle}
        />
        <GoldSlider
          label="패브릭 텍스처 디테일"
          value={fabricDetail}
          onValueChange={handleFabricDetail}
        />
      </View>

      <View style={styles.panelDivider} />

      <View style={styles.panelSection}>
        <Text style={styles.panelSectionTitle}>
          <Shirt size={13} color={theme.colors.primary[400]} strokeWidth={2.2} />
          {'  '}입체 핏 시뮬레이션
        </Text>
        <BlueToggle
          label="스마트 핏 앤 드레이프"
          hint="의류 착용 시 자연스러운 주름과 핏을 자동 보정"
          value={smartFit}
          onToggle={() => handleSmartFit(!smartFit)}
        />
      </View>

      <View style={styles.panelDivider} />

      <View style={styles.panelSection}>
        <Text style={styles.panelSectionTitle}>
          <Aperture size={13} color={theme.colors.gold[400]} strokeWidth={2.2} />
          {'  '}마이크로 각도 포착
        </Text>
        <Text style={styles.panelHint}>세부 디테일 매크로 뷰 — 집중 컷 지정</Text>
        <View style={styles.chipGrid}>
          {macroOptions.map((opt) => (
            <GoldChip
              key={opt.id}
              label={opt.label}
              selected={macroShots.includes(opt.id)}
              onPress={() => toggleMacro(opt.id)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── CASE B: ai-blend (AI 범용 합성) ────────────────────────────────

const LIGHTING_PRESETS = [
  { id: 'pin-spot', label: '핀 스포트', color: '#D4AF37' },
  { id: 'soft-glow', label: '소프트 글로우', color: '#4C7DFF' },
  { id: 'warm-amb', label: '웜 앰비언트', color: '#E8A04F' },
  { id: 'cool-rim', label: '쿨 림 라이트', color: '#2DD4BF' },
];

const LOOKBOOK_PRESETS = [
  { id: 'marble', label: '마블 오브제' },
  { id: 'silk', label: '실크 룸' },
  { id: 'boutique', label: '부티크 매장' },
  { id: 'terrace', label: '테라스 뷰' },
];

function AIBlendPanel({ onValuesChange, productCategory }: { onValuesChange?: (values: Partial<StudioSliderValues>) => void; productCategory?: string }) {
  const isJewelry = /jewel|주얼|necklace|목걸이|chain|체인|bracelet|팔찌|earring|귀걸이|ring|반지|watch|시계|gem|보석|diamond|다이아|crystal|크리스탈|pendant|펜던트|bangle/i.test(productCategory ?? "");
  const [lighting, setLighting] = useState(isJewelry ? 'pin-spot' : 'pin-spot');
  const [lookbook, setLookbook] = useState<string[]>(isJewelry ? ['marble'] : ['marble']);
  const [blendStrength, setBlendStrength] = useState(isJewelry ? 85 : 70);

  const handleBlendStrength = useCallback((v: number) => {
    setBlendStrength(v);
    onValuesChange?.({ blendStrength: v });
  }, [onValuesChange]);

  const toggleLookbook = (id: string) => {
    setLookbook((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  return (
    <View style={styles.panelBody}>
      <View style={styles.panelSection}>
        <Text style={styles.panelSectionTitle}>
          <Sun size={13} color={theme.colors.gold[400]} strokeWidth={2.2} />
          {'  '}스튜디오 조명 연출
        </Text>
        <Text style={styles.panelHint}>럭셔리 핀 스포트라이트 라이팅 프리셋</Text>
        <View style={styles.lightingRow}>
          {LIGHTING_PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              style={({ pressed }) => [
                styles.lightingChip,
                lighting === preset.id && styles.lightingChipSelected,
                pressed && styles.chipPressed,
              ]}
              onPress={() => setLighting(preset.id)}
            >
              <View style={[styles.lightingDot, { backgroundColor: preset.color }]} />
              <Text
                style={[
                  styles.lightingLabel,
                  lighting === preset.id && styles.lightingLabelSelected,
                ]}
              >
                {preset.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.panelDivider} />

      <View style={styles.panelSection}>
        <Text style={styles.panelSectionTitle}>
          <Layers size={13} color={theme.colors.primary[400]} strokeWidth={2.2} />
          {'  '}룩북 배경 매칭
        </Text>
        <View style={styles.chipGrid}>
          {LOOKBOOK_PRESETS.map((preset) => (
            <GoldChip
              key={preset.id}
              label={preset.label}
              selected={lookbook.includes(preset.id)}
              onPress={() => toggleLookbook(preset.id)}
            />
          ))}
        </View>
      </View>

      <View style={styles.panelDivider} />

      <View style={styles.panelSection}>
        <Text style={styles.panelSectionTitle}>
          <Sparkles size={13} color={theme.colors.gold[400]} strokeWidth={2.2} />
          {'  '}소재 혼합 보정
        </Text>
        <GoldSlider
          label="의류·주얼리 경계면 블렌딩 강도"
          value={blendStrength}
          onValueChange={handleBlendStrength}
        />
      </View>
    </View>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────

export function StudioPremiumPanel({ mode, onValuesChange, productCategory }: StudioPremiumPanelProps) {
  return (
    <View style={styles.panelContainer}>
      <View style={styles.panelHeader}>
        <View style={styles.panelBadge}>
          <Diamond size={11} color={theme.colors.gold[400]} strokeWidth={2.5} />
        </View>
        <Text style={styles.panelTitle}>스튜디오 프리미엄 · 패션·주얼리 특화</Text>
      </View>
      {mode === 'auto-3d' ? <Auto3DPanel onValuesChange={onValuesChange} productCategory={productCategory} /> : <AIBlendPanel onValuesChange={onValuesChange} productCategory={productCategory} />}
    </View>
  );
}

// ─── Animated wrapper for expand/collapse ────────────────────────────

interface StudioPremiumAccordionProps {
  visible: boolean;
  mode: PanelMode;
  onValuesChange?: (values: Partial<StudioSliderValues>) => void;
  productCategory?: string;
}

export function StudioPremiumAccordion({ visible, mode, onValuesChange, productCategory }: StudioPremiumAccordionProps) {
  const animateLayout = useCallback(() => {
    if (Platform.OS === 'android') return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, []);

  return (
    <View
      style={[styles.accordionWrap, visible ? styles.accordionOpen : styles.accordionClosed]}
      onLayout={animateLayout}
    >
      {visible && <StudioPremiumPanel mode={mode} onValuesChange={onValuesChange} productCategory={productCategory} />}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Accordion wrapper
  accordionWrap: {
    overflow: 'hidden',
    paddingHorizontal: theme.spacing.lg,
  },
  accordionOpen: {
    opacity: 1,
  },
  accordionClosed: {
    height: 0,
    opacity: 0,
  },
  // Panel container
  panelContainer: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.15)',
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  panelBadge: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
  },
  panelTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.gold[400],
    letterSpacing: 0.2,
  },
  panelBody: {
    gap: 0,
  },
  panelSection: {
    gap: theme.spacing.sm,
  },
  panelSectionTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    letterSpacing: 0.1,
  },
  panelHint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: -4,
  },
  panelDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: theme.spacing.sm,
  },
  // Slider
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  sliderLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 15,
  },
  sliderContainer: {
    width: 120,
  },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.dark.border,
    position: 'relative',
    justifyContent: 'center',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    backgroundColor: theme.colors.gold[400],
  },
  sliderHandle: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.gold[400],
    marginLeft: -8,
    borderWidth: 2,
    borderColor: '#fff',
    top: -5,
  },
  sliderValue: {
    width: 28,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.gold[400],
    textAlign: 'right',
  },
  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  toggleHint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 14,
  },
  toggleSwitch: {
    width: 40,
    height: 23,
    borderRadius: 12,
    backgroundColor: theme.colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchActive: {
    backgroundColor: theme.colors.primary[500],
  },
  toggleKnob: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#fff',
    transform: [{ translateX: 0 }],
  },
  toggleKnobActive: {
    transform: [{ translateX: 17 }],
  },
  // Chips
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.border,
    borderWidth: 1,
    borderColor: 'transparent',
  } as ViewStyle,
  chipSelected: {
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipIcon: {
    marginRight: 2,
  },
  chipText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  chipTextSelected: {
    color: theme.colors.dark.text,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  // Lighting chips
  lightingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  lightingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.border,
    borderWidth: 1,
    borderColor: 'transparent',
  } as ViewStyle,
  lightingChipSelected: {
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  lightingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  lightingLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  lightingLabelSelected: {
    color: theme.colors.dark.text,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
});
