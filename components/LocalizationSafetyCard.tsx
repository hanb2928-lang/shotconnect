import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Shield, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Globe, Sparkles } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  COUNTRY_REGULATIONS,
  checkTabooWords,
  calculateSuitabilityScore,
  buildLegalTags,
  getTranscreationPreset,
  type CountryCode,
  type ToneMode,
  type SuitabilityFactor,
} from '@/lib/localizationSafety';

interface LocalizationSafetyCardProps {
  caption: string;
  countryCode: CountryCode;
  onToneChange?: (tone: ToneMode) => void;
  onCountryChange?: (country: CountryCode) => void;
  disclosureEnabled?: boolean;
  transcreationApplied?: boolean;
  nativeToneMatch?: boolean;
}

const TONE_CHIPS: { key: ToneMode; label: string; emoji: string }[] = [
  { key: 'praise', label: '칭찬형', emoji: '👍' },
  { key: 'honest', label: '솔직 후기형', emoji: '🤝' },
  { key: 'info', label: '정보 전달형', emoji: '📊' },
];

export function LocalizationSafetyCard({
  caption,
  countryCode,
  onToneChange,
  onCountryChange,
  disclosureEnabled = true,
  transcreationApplied = false,
  nativeToneMatch = false,
}: LocalizationSafetyCardProps) {
  const [selectedTone, setSelectedTone] = useState<ToneMode>('honest');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(countryCode);

  const factors: SuitabilityFactor = useMemo(() => {
    const violations = checkTabooWords(caption, selectedCountry);
    return {
      legalCompliant: disclosureEnabled,
      hasDisclosure: disclosureEnabled,
      tabooViolations: violations.length,
      transcreationApplied,
      nativeToneMatch,
    };
  }, [caption, selectedCountry, disclosureEnabled, transcreationApplied, nativeToneMatch]);

  const result = useMemo(() => calculateSuitabilityScore(factors), [factors]);

  const reg = COUNTRY_REGULATIONS[selectedCountry];
  const preset = getTranscreationPreset(selectedCountry);

  const levelConfig = {
    unsafe: { icon: AlertTriangle, color: theme.colors.error[400], bg: theme.colors.error[500] + '15' },
    caution: { icon: AlertTriangle, color: theme.colors.warning[400], bg: theme.colors.warning[500] + '15' },
    safe: { icon: CheckCircle, color: theme.colors.success[400], bg: theme.colors.success[500] + '15' },
    optimal: { icon: Sparkles, color: theme.colors.accent[400], bg: theme.colors.accent[500] + '15' },
  };
  const cfg = levelConfig[result.level];
  const Icon = cfg.icon;

  const handleToneSelect = useCallback((tone: ToneMode) => {
    setSelectedTone(tone);
    onToneChange?.(tone);
  }, [onToneChange]);

  const handleCountrySelect = useCallback((country: CountryCode) => {
    setSelectedCountry(country);
    onCountryChange?.(country);
  }, [onCountryChange]);

  const countries = Object.values(COUNTRY_REGULATIONS);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Shield size={18} color={cfg.color} strokeWidth={2} />
        <Text style={styles.headerTitle}>현지 적합성 스코어</Text>
      </View>

      {/* Country selector */}
      <Text style={styles.sectionLabel}>대상 국가</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.countryScroll}>
        {countries.map((c) => (
          <TouchableOpacity
            key={c.code}
            style={[styles.countryChip, selectedCountry === c.code && styles.countryChipActive]}
            onPress={() => handleCountrySelect(c.code)}
            activeOpacity={0.7}
          >
            <Text style={styles.countryFlag}>{c.flag}</Text>
            <Text style={[styles.countryLabel, selectedCountry === c.code && styles.countryLabelActive]}>
              {c.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Score display */}
      <View style={styles.scoreRow}>
        <View style={[styles.scoreWrap, { backgroundColor: cfg.bg }]}>
          <Icon size={16} color={cfg.color} strokeWidth={2} />
          <Text style={[styles.scoreNum, { color: cfg.color }]}>{result.score}</Text>
          <Text style={styles.scoreUnit}>/100</Text>
        </View>
        <View style={styles.scoreBars}>
          <View style={styles.scoreBarSection}>
            <Text style={styles.scoreBarLabel}>법적 안전성</Text>
            <View style={styles.scoreBarBg}>
              <View style={[styles.scoreBarFill, { width: `${result.legalScore}%`, backgroundColor: theme.colors.success[400] }]} />
            </View>
            <Text style={styles.scoreBarValue}>{result.legalScore}/50</Text>
          </View>
          <View style={styles.scoreBarSection}>
            <Text style={styles.scoreBarLabel}>문화 적합성</Text>
            <View style={styles.scoreBarBg}>
              <View style={[styles.scoreBarFill, { width: `${result.culturalScore}%`, backgroundColor: theme.colors.accent[400] }]} />
            </View>
            <Text style={styles.scoreBarValue}>{result.culturalScore}/50</Text>
          </View>
        </View>
      </View>

      {/* Message */}
      <View style={[styles.messageBox, { backgroundColor: cfg.bg }]}>
        <Text style={[styles.messageText, { color: cfg.color }]}>{result.message}</Text>
      </View>

      {/* Badges */}
      {result.badges.length > 0 && (
        <View style={styles.badgesRow}>
          {result.badges.map((badge, i) => (
            <View key={i} style={styles.badge}>
              <CheckCircle size={10} color={theme.colors.success[400]} strokeWidth={2.5} />
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Regulation info */}
      <View style={styles.regBox}>
        <Globe size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
        <Text style={styles.regText}>
          {reg.flag} {reg.name} · {reg.regulationName}
        </Text>
      </View>
      <View style={styles.legalTagsBox}>
        <Text style={styles.legalTagsLabel}>법적 필수 태그:</Text>
        <Text style={styles.legalTagsValue}>{buildLegalTags(selectedCountry)}</Text>
      </View>

      {/* Transcreation info */}
      {preset && (
        <View style={styles.transBox}>
          <Sparkles size={12} color={theme.colors.accent[400]} strokeWidth={2} />
          <Text style={styles.transText}>
            현지 톤: {preset.toneName} — "{preset.examplePhrase}"
          </Text>
        </View>
      )}

      {/* Tone chips */}
      <Text style={styles.sectionLabel}>현지 어조 1-탭 전환</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toneScroll}>
        {TONE_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip.key}
            style={[styles.toneChip, selectedTone === chip.key && styles.toneChipActive]}
            onPress={() => handleToneSelect(chip.key)}
            activeOpacity={0.7}
          >
            <Text style={styles.toneEmoji}>{chip.emoji}</Text>
            <Text style={[styles.toneLabel, selectedTone === chip.key && styles.toneLabelActive]}>
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Suggestions */}
      {result.suggestions.length > 0 && (
        <View style={styles.suggestionsBox}>
          {result.suggestions.map((s, i) => (
            <View key={i} style={styles.suggestionItem}>
              <AlertTriangle size={10} color={theme.colors.warning[400]} strokeWidth={2} />
              <Text style={styles.suggestionText}>{s}</Text>
            </View>
          ))}
        </View>
      )}
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
    marginBottom: theme.spacing.md,
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 6,
    marginTop: theme.spacing.sm,
  },
  countryScroll: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginRight: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  countryChipActive: {
    borderColor: theme.colors.accent[400],
    backgroundColor: theme.colors.accent[500] + '15',
  },
  countryFlag: {
    fontSize: 14,
  },
  countryLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  countryLabelActive: {
    color: theme.colors.accent[300],
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: theme.spacing.md,
  },
  scoreWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
  },
  scoreNum: {
    fontSize: 24,
    fontFamily: theme.typography.fontFamily.bold,
  },
  scoreUnit: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  scoreBars: {
    flex: 1,
    gap: 6,
  },
  scoreBarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreBarLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    width: 60,
  },
  scoreBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.dark.surfaceLight,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  scoreBarValue: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    width: 40,
  },
  messageBox: {
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: theme.spacing.sm,
  },
  messageText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    lineHeight: 17,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.success[500] + '15',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.success[400],
  },
  regBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginBottom: 4,
  },
  regText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  legalTagsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginBottom: 4,
  },
  legalTagsLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  legalTagsValue: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.warning[400],
  },
  transBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500] + '10',
    marginBottom: theme.spacing.sm,
  },
  transText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  toneScroll: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  toneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginRight: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  toneChipActive: {
    borderColor: theme.colors.accent[400],
    backgroundColor: theme.colors.accent[500] + '15',
  },
  toneEmoji: {
    fontSize: 14,
  },
  toneLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  toneLabelActive: {
    color: theme.colors.accent[300],
  },
  suggestionsBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 10,
    marginTop: theme.spacing.sm,
    gap: 4,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  suggestionText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.warning[400],
    lineHeight: 15,
  },
});
