import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import type { ViewStyle } from 'react-native';
import { ArrowRight, ExternalLink } from 'lucide-react-native';
import { BabyIcon } from '@/components/BabyIcon';
import { theme } from '@/lib/theme';
import { useAffiliateToast } from '@/components/AffiliateToast';

export type StickerStyle = 'pill' | 'rounded' | 'minimal' | 'neon';

export const STICKER_STYLES: { label: string; value: StickerStyle }[] = [
  { label: '캡슐', value: 'pill' },
  { label: '라운드', value: 'rounded' },
  { label: '네온', value: 'neon' },
  { label: '미니멀', value: 'minimal' },
];

const BASE_SIZE = 48;

interface StickerLinkProps {
  url: string;
  label?: string;
  shortUrl?: string;
  stickerStyle?: StickerStyle;
  size?: number;
}

export function StickerLink({
  url,
  label = '구매하기',
  shortUrl = '',
  stickerStyle = 'pill',
  size = BASE_SIZE,
}: StickerLinkProps) {
  const scale = size / BASE_SIZE;
  const isNeon = stickerStyle === 'neon';
  const isMinimal = stickerStyle === 'minimal';
  const { showAffiliateToast } = useAffiliateToast();

  const iconSize = Math.round(10 * scale);
  const arrowSize = Math.round(8 * scale);
  const fontSize = Math.max(8, Math.round(10 * scale));
  const padH = Math.round(10 * scale);
  const padV = Math.round(6 * scale);
  const gap = Math.max(3, Math.round(4 * scale));

  const openLink = () => {
    const target = shortUrl || url;
    if (target) {
      showAffiliateToast(target);
    }
  };

  return (
    <TouchableOpacity
      style={getContainerStyle(stickerStyle, scale, padH, padV)}
      onPress={openLink}
      activeOpacity={0.7}
    >
      <BabyIcon
        size={iconSize + 4}
        color={isNeon ? theme.colors.accent[300] : isMinimal ? theme.colors.neutral[500] : theme.colors.primary[600]}
        strokeWidth={2}
      />
      <Text
        style={[
          styles.labelText,
          isNeon && styles.labelTextNeon,
          isMinimal && styles.labelTextMinimal,
          { fontSize },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <ArrowRight
        size={arrowSize}
        color={isNeon ? theme.colors.accent[300] : isMinimal ? theme.colors.neutral[400] : theme.colors.primary[500]}
        strokeWidth={2.5}
      />
    </TouchableOpacity>
  );
}

function getContainerStyle(
  style: StickerStyle,
  scale: number,
  padH: number,
  padV: number,
): ViewStyle[] {
  const base: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Math.max(3, Math.round(4 * scale)),
    paddingHorizontal: padH,
    paddingVertical: padV,
    zIndex: 10,
  };

  switch (style) {
    case 'rounded':
      return [styles.containerBase, base, {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: Math.round(10 * scale),
        ...theme.shadows.card,
      }];
    case 'neon':
      return [styles.containerBase, base, {
        borderRadius: Math.round(10 * scale),
        backgroundColor: 'rgba(10, 15, 30, 0.88)',
        borderWidth: 1 * scale,
        borderColor: theme.colors.accent[400],
      }];
    case 'minimal':
      return [styles.containerBase, base, {
        borderRadius: Math.round(6 * scale),
        backgroundColor: 'rgba(255, 255, 255, 0.82)',
        paddingHorizontal: Math.round(8 * scale),
        paddingVertical: Math.round(5 * scale),
      }];
    case 'pill':
    default:
      return [styles.containerBase, base, {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 999,
        ...theme.shadows.card,
      }];
  }
}

const styles = StyleSheet.create({
  containerBase: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelText: {
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[700],
    letterSpacing: 0.2,
  },
  labelTextNeon: {
    color: theme.colors.accent[300],
  },
  labelTextMinimal: {
    color: theme.colors.neutral[600],
    fontFamily: theme.typography.fontFamily.medium,
  },
});

interface StickerControlProps {
  enabled: boolean;
  onToggle: () => void;
  stickerStyle: StickerStyle;
  onStyleChange: (style: StickerStyle) => void;
  size: number;
  onSizeChange: (size: number) => void;
  aiRecommended?: boolean;
}

export function StickerLinkControls({
  enabled,
  onToggle,
  stickerStyle,
  onStyleChange,
  size,
  onSizeChange,
  aiRecommended = false,
}: StickerControlProps) {
  return (
    <View style={controlStyles.wrap}>
      <View style={controlStyles.headerRow}>
        <ExternalLink size={14} color={theme.colors.accent[400]} strokeWidth={2} />
        <Text style={controlStyles.headerTitle}>스티커 링크</Text>
        {aiRecommended ? (
          <View style={controlStyles.aiBadge}>
            <Text style={controlStyles.aiBadgeText}>AI 추천</Text>
          </View>
        ) : null}
      </View>
      <Text style={controlStyles.descText}>
        이미지 위에 심플한 구매 링크 스티커를 올려요
      </Text>

      <View style={controlStyles.toggleRow}>
        <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={controlStyles.toggleSwitch}>
          <View style={[controlStyles.toggleKnob, enabled && controlStyles.toggleKnobActive]} />
        </TouchableOpacity>
        <Text style={controlStyles.toggleLabel}>{enabled ? '켜짐' : '꺼짐'}</Text>
      </View>

      {enabled && (
        <View style={controlStyles.optionsWrap}>
          <View style={controlStyles.optionRow}>
            <Text style={controlStyles.optionLabel}>스타일</Text>
            <View style={controlStyles.pillGroup}>
              {STICKER_STYLES.map((s) => (
                <TouchableOpacity
                  key={s.value}
                  style={[
                    controlStyles.pill,
                    stickerStyle === s.value && controlStyles.pillActive,
                    stickerStyle === s.value && s.value === 'neon' && controlStyles.pillActiveNeon,
                  ]}
                  onPress={() => onStyleChange(s.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      controlStyles.pillText,
                      stickerStyle === s.value && controlStyles.pillTextActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={controlStyles.optionRow}>
            <Text style={controlStyles.optionLabel}>크기</Text>
            <View style={controlStyles.pillGroup}>
              {[
                { label: 'S', value: 40 },
                { label: 'M', value: 48 },
                { label: 'L', value: 56 },
              ].map((s) => (
                <TouchableOpacity
                  key={s.value}
                  style={[
                    controlStyles.pill,
                    size === s.value && controlStyles.pillActive,
                  ]}
                  onPress={() => onSizeChange(s.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      controlStyles.pillText,
                      size === s.value && controlStyles.pillTextActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const controlStyles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent[400],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  aiBadge: {
    backgroundColor: theme.colors.accent[500] + '20',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  aiBadgeText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[300],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  toggleSwitch: {
    width: 38,
    height: 22,
    borderRadius: 999,
    backgroundColor: theme.colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: theme.colors.neutral[200],
    alignSelf: 'flex-start',
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
    backgroundColor: '#fff',
  },
  toggleLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  descText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 6,
  },
  optionsWrap: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionLabel: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  pillGroup: {
    flexDirection: 'row',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 3,
    gap: 2,
  },
  pill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
  },
  pillActive: {
    backgroundColor: theme.colors.primary[600],
  },
  pillActiveNeon: {
    backgroundColor: theme.colors.accent[500],
  },
  pillText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  pillTextActive: {
    color: '#fff',
  },
});
