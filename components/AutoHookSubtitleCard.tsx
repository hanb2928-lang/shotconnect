import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Zap, Sparkles, Type, Check } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  autoSelectHook,
  getHookVariantLabel,
  type HookVariant,
} from '@/lib/autoHookEngine';
import {
  autoStyleSubtitle,
  buildSubtitlePreview,
  getKeywordCategoryLabel,
  getAnimationLabel,
  type KeywordAnimation,
} from '@/lib/dynamicSubtitleEngine';

interface AutoHookSubtitleCardProps {
  productName?: string;
  productCategory?: string;
  customPrompt?: string;
  narrationText?: string;
}

const ANIMATION_COLORS: Record<KeywordAnimation, string> = {
  pop: theme.colors.success[400],
  bounce: theme.colors.warning[400],
  shake: theme.colors.error[400],
  flash: theme.colors.primary[400],
  zoom: theme.colors.accent[400],
};

export function AutoHookSubtitleCard({
  productName,
  productCategory,
  customPrompt,
  narrationText,
}: AutoHookSubtitleCardProps) {
  const { hookResult, subtitleResult, previewParts } = useMemo(() => {
    const hookResult = autoSelectHook({
      productName,
      productCategory,
      customPrompt,
    });
    const fullText = narrationText || hookResult.selected.text;
    const subtitleResult = autoStyleSubtitle(fullText);
    const previewParts = buildSubtitlePreview(fullText);
    return { hookResult, subtitleResult, previewParts };
  }, [productName, productCategory, customPrompt, narrationText]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconWrap}>
          <Sparkles size={14} color={theme.colors.accent[400]} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>AI 완전 자동화: 후크 & 자막</Text>
          <Text style={styles.subtitle}>사용자 선택 없이 AI가 최적 후크와 자막 스타일을 자동 적용</Text>
        </View>
      </View>

      {/* Auto-selected hook */}
      <View style={styles.sectionBox}>
        <View style={styles.sectionHeader}>
          <Zap size={11} color={theme.colors.warning[400]} strokeWidth={2.5} />
          <Text style={styles.sectionTitle}>자동 셀렉트 후크 (Auto-Hook)</Text>
        </View>

        <View style={styles.hookResultBox}>
          <Text style={styles.hookText}>{hookResult.selected.text}</Text>
          <View style={styles.hookMetaRow}>
            <View style={[styles.hookBadge, { backgroundColor: theme.colors.warning[400] + '20' }]}>
              <Text style={[styles.hookBadgeText, { color: theme.colors.warning[400] }]}>
                {getHookVariantLabel(hookResult.selected.variant)}
              </Text>
            </View>
            <View style={[styles.hookBadge, { backgroundColor: theme.colors.accent[400] + '20' }]}>
              <Text style={[styles.hookBadgeText, { color: theme.colors.accent[400] }]}>
                종합 {hookResult.selected.totalScore}
              </Text>
            </View>
          </View>
        </View>

        {/* 3 candidates */}
        <View style={styles.candidatesRow}>
          {hookResult.candidates.map((c) => (
            <View
              key={c.variant}
              style={[
                styles.candidateBox,
                c.variant === hookResult.selected.variant && styles.candidateBoxSelected,
              ]}
            >
              <View style={styles.candidateHeader}>
                <Text style={styles.candidateLabel}>{getHookVariantLabel(c.variant)}</Text>
                {c.variant === hookResult.selected.variant && (
                  <Check size={10} color={theme.colors.success[400]} strokeWidth={2.5} />
                )}
              </View>
              <Text style={styles.candidateScore} numberOfLines={1}>
                리텐션 {c.retentionScore} | 적합도 {c.categoryFit}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.selectionReason}>{hookResult.selectionReason}</Text>
      </View>

      {/* Dynamic subtitle */}
      <View style={styles.sectionBox}>
        <View style={styles.sectionHeader}>
          <Type size={11} color={theme.colors.primary[400]} strokeWidth={2.5} />
          <Text style={styles.sectionTitle}>동적 자막 자동 스타일링 (Dynamic Subtitle)</Text>
        </View>

        {/* Subtitle preview */}
        <View style={styles.subtitlePreviewBox}>
          <Text style={styles.subtitlePreviewText}>
            {previewParts.map((part, i) => {
              if (part.highlightedParts.length > 0) {
                const hp = part.highlightedParts[0];
                return (
                  <Text
                    key={i}
                    style={[styles.subtitleHighlight, { color: hp.color }]}
                  >
                    {hp.text}
                  </Text>
                );
              }
              return <Text key={i} style={styles.subtitlePlain}>{part.plainText}</Text>;
            })}
          </Text>
        </View>

        {/* Keyword tags */}
        {subtitleResult.keywords.length > 0 && (
          <View style={styles.keywordTagsContainer}>
            <Text style={styles.keywordTagsLabel}>자동 식별된 키워드 ({subtitleResult.keywords.length}개)</Text>
            <View style={styles.keywordTagsRow}>
              {subtitleResult.keywords.slice(0, 8).map((kw, i) => (
                <View
                  key={i}
                  style={[styles.keywordTag, { backgroundColor: kw.color + '20', borderLeftColor: kw.color }]}
                >
                  <Text style={[styles.keywordTagText, { color: kw.color }]}>{kw.text}</Text>
                  <Text style={styles.keywordTagAnim}>{getAnimationLabel(kw.animation)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Template info */}
        <View style={styles.templateInfoBox}>
          <View style={styles.templateInfoRow}>
            <Text style={styles.templateInfoLabel}>마스터 템플릿</Text>
            <Text style={styles.templateInfoValue}>{subtitleResult.template.label}</Text>
          </View>
          <View style={styles.templateInfoRow}>
            <Text style={styles.templateInfoLabel}>기본 애니메이션</Text>
            <Text style={styles.templateInfoValue}>{getAnimationLabel(subtitleResult.template.animationDefault)}</Text>
          </View>
          <View style={styles.templateInfoRow}>
            <Text style={styles.templateInfoLabel}>폰트 크기</Text>
            <Text style={styles.templateInfoValue}>{subtitleResult.template.fontSize}pt</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.accent[400] + '20',
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.spacing.sm + 2,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.accent[400] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  sectionBox: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: 10,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  hookResultBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.sm,
    padding: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.warning[400],
  },
  hookText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    lineHeight: 17,
    marginBottom: 6,
  },
  hookMetaRow: {
    flexDirection: 'row',
    gap: 6,
  },
  hookBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hookBadgeText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  candidatesRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  candidateBox: {
    flex: 1,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: 6,
    padding: 6,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  candidateBoxSelected: {
    borderWidth: 1.5,
    borderColor: theme.colors.success[400],
    backgroundColor: theme.colors.success[400] + '10',
  },
  candidateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  candidateLabel: {
    flex: 1,
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  candidateScore: {
    fontSize: 8,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  selectionReason: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 13,
  },
  subtitlePreviewBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.sm,
    padding: 10,
    marginBottom: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  subtitlePreviewText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    lineHeight: 17,
  },
  subtitlePlain: {
    color: theme.colors.dark.text,
  },
  subtitleHighlight: {
    fontFamily: theme.typography.fontFamily.bold,
  },
  keywordTagsContainer: {
    marginBottom: 8,
  },
  keywordTagsLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 4,
  },
  keywordTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  keywordTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderLeftWidth: 2,
  },
  keywordTagText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  keywordTagAnim: {
    fontSize: 7,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  templateInfoBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: 6,
    padding: 8,
    gap: 3,
  },
  templateInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  templateInfoLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  templateInfoValue: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
});
