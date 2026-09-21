import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { Sparkles, Check, Image as ImageIcon } from 'lucide-react-native';
import { theme } from '@/lib/theme';

export type BackgroundStyle = 'studio' | 'retail' | 'natural' | 'gradient' | 'none';

interface BackgroundOption {
  key: BackgroundStyle;
  label: string;
  description: string;
  icon: string;
}

const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { key: 'studio', label: '스튜디오', description: '깔끔한 화이트 배경', icon: '📸' },
  { key: 'retail', label: '매장', description: '매장 분위기 연출', icon: '🏬' },
  { key: 'natural', label: '자연광', description: '자연스러운 야외 느낌', icon: '🌿' },
  { key: 'gradient', label: '그라디언트', description: '감성 그라데이션', icon: '🎨' },
];

interface BackgroundPickerProps {
  visible: boolean;
  onSelect: (style: BackgroundStyle) => Promise<void>;
  onSkip: () => void;
  processing: boolean;
}

export function BackgroundPicker({ visible, onSelect, onSkip, processing }: BackgroundPickerProps) {
  const [selectedStyle, setSelectedStyle] = useState<BackgroundStyle | null>(null);

  const handleSelect = useCallback(
    (style: BackgroundStyle) => {
      if (processing) return;
      setSelectedStyle(style);
      onSelect(style);
    },
    [onSelect, processing],
  );

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Sparkles size={20} color={theme.colors.accent[400]} strokeWidth={2} />
        <Text style={styles.title}>AI 배경 선택</Text>
      </View>
      <Text style={styles.subtitle}>
        배경이 제거된 상품을 새 배경 위에 자연스럽게 올려드릴게요. 마음에 드는 스타일을 골라보세요.
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.optionRow}
      >
        {BACKGROUND_OPTIONS.map((opt) => {
          const isSelected = selectedStyle === opt.key;
          const bgSource =
            Platform.OS === 'web'
              ? `/bg-${opt.key}.webp`
              : { uri: `bg-${opt.key}.webp` };

          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.optionCard, isSelected && styles.optionCardSelected]}
              onPress={() => handleSelect(opt.key)}
              disabled={processing}
              activeOpacity={0.7}
            >
              <View style={styles.thumbWrap}>
                <Image source={bgSource as any} style={styles.thumbImage} resizeMode="cover" />
                {isSelected && (
                  <View style={styles.selectedBadge}>
                    <Check size={14} color="#fff" strokeWidth={3} />
                  </View>
                )}
                {processing && isSelected && (
                  <View style={styles.processingOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionLabel}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.description}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={styles.skipButton}
        onPress={onSkip}
        disabled={processing}
        activeOpacity={0.7}
      >
        <ImageIcon size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
        <Text style={styles.skipText}>배경 없이 그대로 사용</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 22,
  },
  optionRow: {
    gap: theme.spacing.sm,
    paddingVertical: 4,
  },
  optionCard: {
    width: 120,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardSelected: {
    borderColor: theme.colors.accent[400],
  },
  thumbWrap: {
    width: '100%',
    height: 90,
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.accent[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 15, 30, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionInfo: {
    padding: theme.spacing.sm,
    gap: 2,
  },
  optionLabel: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  optionDesc: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm,
    marginTop: 4,
  },
  skipText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
});
