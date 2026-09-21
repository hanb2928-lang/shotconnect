import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SlidersHorizontal } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import type { TonePreset } from '@/lib/creatorPersona';
import { TONE_PRESETS } from '@/lib/creatorPersona';

export interface SnapMixOption {
  key: string;
  label: string;
  emoji: string;
}

const MOOD_OPTIONS: SnapMixOption[] = [
  { key: 'honest', label: '솔직/비판적', emoji: '🔥' },
  { key: 'humor', label: '팩트 폭격 유머', emoji: '⚡' },
  { key: 'emotional', label: '감성 브이로그', emoji: '🌿' },
  { key: 'expert', label: '전문가 분석', emoji: '📊' },
  { key: 'casual', label: '친근 일상', emoji: '💬' },
];

const PERSPECTIVE_OPTIONS: SnapMixOption[] = [
  { key: 'user', label: '실사용자 시점', emoji: '🙋' },
  { key: 'comparer', label: '비교 시점', emoji: '⚖️' },
  { key: 'newbie', label: '초보자 시점', emoji: '🌱' },
  { key: 'saver', label: '가성비 시점', emoji: '💰' },
  { key: 'gift', label: '선물 시점', emoji: '🎁' },
];

interface SnapMixTunerProps {
  onToneChange?: (tone: TonePreset) => void;
  onPerspectiveChange?: (perspective: string) => void;
  initialTone?: TonePreset;
}

export function SnapMixTuner({ onToneChange, onPerspectiveChange, initialTone }: SnapMixTunerProps) {
  const [selectedTone, setSelectedTone] = useState<TonePreset>(initialTone ?? 'casual');
  const [selectedPerspective, setSelectedPerspective] = useState('user');

  const handleToneSelect = useCallback((tone: TonePreset) => {
    setSelectedTone(tone);
    onToneChange?.(tone);
  }, [onToneChange]);

  const handlePerspectiveSelect = useCallback((p: string) => {
    setSelectedPerspective(p);
    onPerspectiveChange?.(p);
  }, [onPerspectiveChange]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SlidersHorizontal size={16} color={theme.colors.accent[400]} strokeWidth={2} />
        <Text style={styles.headerTitle}>Snap-Mix 1초 튜닝</Text>
      </View>

      <Text style={styles.description}>
        클릭 한 번으로 무드와 시점을 즉시 바꿀 수 있습니다. 동일한 상품도 완전히 다른 시각으로 재구성됩니다.
      </Text>

      {/* Mood/Tone chips */}
      <Text style={styles.sectionLabel}>톤앤매너 스위처</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {MOOD_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.chip, selectedTone === opt.key && styles.chipActive]}
            onPress={() => handleToneSelect(opt.key as TonePreset)}
            activeOpacity={0.7}
          >
            <Text style={styles.chipEmoji}>{opt.emoji}</Text>
            <Text style={[styles.chipLabel, selectedTone === opt.key && styles.chipLabelActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Perspective chips */}
      <Text style={styles.sectionLabel}>시점 전환</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {PERSPECTIVE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.chip, selectedPerspective === opt.key && styles.chipActive]}
            onPress={() => handlePerspectiveSelect(opt.key)}
            activeOpacity={0.7}
          >
            <Text style={styles.chipEmoji}>{opt.emoji}</Text>
            <Text style={[styles.chipLabel, selectedPerspective === opt.key && styles.chipLabelActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
    marginBottom: theme.spacing.sm,
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  description: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 6,
  },
  chipScroll: {
    flexDirection: 'row',
    marginHorizontal: -4,
    marginBottom: theme.spacing.sm,
  },
  chip: {
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
  chipActive: {
    borderColor: theme.colors.accent[400],
    backgroundColor: theme.colors.accent[500] + '15',
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  chipLabelActive: {
    color: theme.colors.accent[300],
  },
});
