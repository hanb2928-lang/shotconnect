import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform } from 'react-native';
import { Sparkles, Zap, Lightbulb, TrendingUp, ChevronDown, ChevronUp, Check } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import type { PlatformKey } from '@/types/database';

interface ShortFormTipsCardProps {
  hook: string;
  oneLiner: string;
  productAdvantages: string[];
  caption: string;
  productName: string;
  platform: PlatformKey;
  onApplyPlatform: (platform: PlatformKey) => void;
}

export function ShortFormTipsCard({
  hook,
  oneLiner,
  productAdvantages,
  caption,
  productName,
  platform,
  onApplyPlatform,
}: ShortFormTipsCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [applied, setApplied] = useState(false);

  const tips: { icon: typeof Lightbulb; label: string; value: string }[] = [
    { icon: Zap, label: '추천 후킹 문구', value: hook },
    { icon: Sparkles, label: '한 줄 요약', value: oneLiner },
  ];

  if (productAdvantages.length > 0) {
    tips.push({
      icon: TrendingUp,
      label: '어필 포인트',
      value: productAdvantages.join(' · '),
    });
  }

  if (caption) {
    tips.push({ icon: Lightbulb, label: '추천 캡션', value: caption });
  }

  const handleApply = useCallback(() => {
    if (platform !== 'shortform') {
      onApplyPlatform('shortform');
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  }, [platform, onApplyPlatform]);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={toggleExpand} activeOpacity={0.8}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBadge}>
            <Sparkles size={16} color={theme.colors.accent[400]} strokeWidth={2} />
          </View>
          <View>
            <Text style={styles.title}>이 상품을 위한 숏폼 제작 가이드</Text>
            <Text style={styles.subtitle}>
              {productName ? `${productName} · ` : ''}AI 맞춤 추천
            </Text>
          </View>
        </View>
        {expanded ? (
          <ChevronUp size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
        ) : (
          <ChevronDown size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          <View style={styles.tipsList}>
            {tips.map((tip, i) => {
              const Icon = tip.icon;
              return (
                <View key={i} style={styles.tipRow}>
                  <View style={styles.tipIconWrap}>
                    <Icon size={14} color={theme.colors.accent[400]} strokeWidth={2} />
                  </View>
                  <View style={styles.tipContent}>
                    <Text style={styles.tipLabel}>{tip.label}</Text>
                    <Text style={styles.tipValue}>{tip.value}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.applyButton, applied && styles.applyButtonDone]}
            onPress={handleApply}
            activeOpacity={0.8}
          >
            {applied ? (
              <>
                <Check size={18} color="#fff" strokeWidth={2.5} />
                <Text style={styles.applyTextDone}>숏폼에 반영됨!</Text>
              </>
            ) : (
              <>
                <Zap size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.applyText}>이 가이드대로 숏폼 만들기</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.hintText}>
            버튼을 누르면 숏폼 플랫폼이 자동 선택되고, 아래 만화 숏폼 생성기에 후킹 문구와 어필 포인트가 그대로 반영됩니다.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    ...theme.shadows.card,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  tipsList: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  tipRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  tipIconWrap: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.accent[500] + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipContent: {
    flex: 1,
  },
  tipLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
    marginBottom: 4,
  },
  tipValue: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 20,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500],
    ...theme.shadows.card,
  },
  applyButtonDone: {
    backgroundColor: theme.colors.success[500],
  },
  applyText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  applyTextDone: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  hintText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    lineHeight: 16,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
});
