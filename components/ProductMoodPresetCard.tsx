import { memo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Gem, Flame, Sparkles } from 'lucide-react-native';
import { theme } from '@/lib/theme';

export type ProductMood = 'studio_premium' | 'raw_psychology';

interface Props {
  autoDetectedMood: ProductMood | null;
  mood: ProductMood;
  onMoodChange: (mood: ProductMood) => void;
}

const MOOD_CONFIG: Record<ProductMood, { label: string; desc: string; icon: React.ReactNode; color: string }> = {
  studio_premium: {
    label: '스튜디오 프리미엄',
    desc: '화장품·주얼리·패션·전자기기·홈데코·럭셔리 식품',
    icon: <Gem size={16} color="#fff" strokeWidth={2} />,
    color: theme.colors.primary[500],
  },
  raw_psychology: {
    label: '날것의 심리자극',
    desc: '생활용품·식품·가성비 전자기기·패션 액세서리·다이어트',
    icon: <Flame size={16} color="#fff" strokeWidth={2} />,
    color: theme.colors.warning[500],
  },
};

function ProductMoodPresetCardInner({ autoDetectedMood, mood, onMoodChange }: Props) {
  const [autoBadgeVisible] = useState(!!autoDetectedMood);
  const isAuto = autoBadgeVisible && autoDetectedMood === mood;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>2</Text>
        </View>
        <Text style={styles.title}>상품 무드 프리셋</Text>
        {isAuto && (
          <View style={styles.autoBadge}>
            <Sparkles size={11} color={theme.colors.primary[200]} strokeWidth={2.5} />
            <Text style={styles.autoBadgeText}>AI 자동</Text>
          </View>
        )}
      </View>

      <View style={styles.moodRow}>
        {(Object.keys(MOOD_CONFIG) as ProductMood[]).map((key) => {
          const config = MOOD_CONFIG[key];
          const selected = mood === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.moodChip, selected && { borderColor: config.color, backgroundColor: config.color + '18' }]}
              onPress={() => onMoodChange(key)}
              activeOpacity={0.7}
            >
              <View style={[styles.moodIconWrap, { backgroundColor: selected ? config.color : theme.colors.dark.surfaceLight }]}>
                {config.icon}
              </View>
              <View style={styles.moodTextWrap}>
                <Text style={[styles.moodLabel, selected && { color: theme.colors.dark.text }]}>{config.label}</Text>
                <Text style={styles.moodDesc} numberOfLines={2}>{config.desc}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export const ProductMoodPresetCard = memo(ProductMoodPresetCardInner);

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
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  autoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.primary[500] + '22',
    borderRadius: theme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  autoBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[200],
  },
  moodRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  moodChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  moodIconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moodTextWrap: {
    flex: 1,
    gap: 2,
  },
  moodLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  moodDesc: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    lineHeight: 14,
  },
});
