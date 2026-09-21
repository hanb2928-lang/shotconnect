import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { FlaskConical, Check, Youtube, Instagram, Music2, Info, Sparkles } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { VARIANT_FUNCTION_URL, supabaseAnonKey } from '@/lib/supabase';
import { safeFetch } from '@/lib/apiClient';

export type VariantTone = 'informative' | 'humor' | 'emotional';

export interface VariantPanel {
  speech: string;
  sfx: string;
  emotion: string;
}

export interface Variant {
  tone: VariantTone;
  toneLabel: string;
  hook: string;
  caption: string;
  hashtags: string[];
  panels: VariantPanel[];
  narrationText: string;
  recommendedPlatform: string;
}

interface VariantGeneratorProps {
  productName: string;
  productCategory: string;
  priceEstimate: string;
  oneLiner: string;
  productAdvantages: string[];
  hook: string;
  brandPersona?: string | null;
  selectedTone?: VariantTone | null;
  onSelectVariant?: (variant: Variant) => void;
}

const TONE_ICONS: Record<VariantTone, React.ReactNode> = {
  informative: <Youtube size={14} color={theme.colors.accent[400]} strokeWidth={2} />,
  humor: <Music2 size={14} color={theme.colors.warning[400]} strokeWidth={2} />,
  emotional: <Instagram size={14} color={theme.colors.primary[400]} strokeWidth={2} />,
};

const TONE_COLORS: Record<VariantTone, string> = {
  informative: theme.colors.accent[400],
  humor: theme.colors.warning[400],
  emotional: theme.colors.primary[400],
};

export function VariantGenerator({
  productName,
  productCategory,
  priceEstimate,
  oneLiner,
  productAdvantages,
  hook,
  brandPersona,
  selectedTone,
  onSelectVariant,
}: VariantGeneratorProps) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const [localSelectedTone, setLocalSelectedTone] = useState<VariantTone | null>(selectedTone ?? null);

  const canGenerate = useMemo(() => !!productName, [productName]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await safeFetch(VARIANT_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          productName,
          productCategory,
          priceEstimate,
          oneLiner,
          productAdvantages,
          hook,
          brandPersona,
        }),
        timeoutMs: 30000,
      });
      if (response.ok) {
        const data = await response.json();
        if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
          setVariants(data.variants);
          setGenerated(true);
          const first = data.variants[0] as Variant;
          setLocalSelectedTone(first.tone);
          onSelectVariant?.(first);
        } else {
          setError('변형 생성에 실패했어요. 다시 시도해주세요.');
        }
      } else {
        setError('변형 생성 중 오류가 발생했어요.');
      }
    } catch {
      setError('네트워크 오류가 발생했어요. 다시 시도해주세요.');
    }
    setLoading(false);
  }, [canGenerate, loading, productName, productCategory, priceEstimate, oneLiner, productAdvantages, hook, brandPersona, onSelectVariant]);

  const handleSelect = useCallback((variant: Variant) => {
    setLocalSelectedTone(variant.tone);
    onSelectVariant?.(variant);
  }, [onSelectVariant]);

  if (!canGenerate) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <FlaskConical size={16} color={theme.colors.primary[400]} strokeWidth={2} />
          <Text style={styles.title}>A/B 테스트 변형 생성기</Text>
        </View>
        {!generated && !loading && (
          <TouchableOpacity
            style={styles.generateBtn}
            onPress={handleGenerate}
            activeOpacity={0.8}
          >
            <Sparkles size={12} color="#fff" strokeWidth={2} />
            <Text style={styles.generateBtnText}>3가지 톤 동시 생성</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.desc}>
        상품 사진 1장으로 정보 전달형, 유머/밈형, 감성/리뷰형 3가지 버전의 스크립트를 동시에 만들어요. 플랫폼별로 올려보고 어떤 스타일이 제휴 클릭률이 높은지 비교하세요.
      </Text>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={theme.colors.primary[400]} />
          <Text style={styles.loadingText}>3가지 톤의 스크립트를 AI가 동시에 생성 중...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Info size={12} color={theme.colors.error[400]} strokeWidth={2} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleGenerate} activeOpacity={0.7}>
            <Text style={styles.retryText}>재시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {generated && variants.length > 0 && !loading && (
        <View style={styles.variantsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.variantsScroll}>
            {variants.map((variant) => {
              const isSelected = localSelectedTone === variant.tone;
              const accentColor = TONE_COLORS[variant.tone];
              return (
                <TouchableOpacity
                  key={variant.tone}
                  style={[
                    styles.variantCard,
                    isSelected && { borderColor: accentColor, backgroundColor: accentColor + '15' },
                  ]}
                  onPress={() => handleSelect(variant)}
                  activeOpacity={0.8}
                >
                  <View style={styles.variantHeader}>
                    <View style={styles.variantHeaderLeft}>
                      {TONE_ICONS[variant.tone]}
                      <Text style={styles.variantToneLabel}>{variant.toneLabel}</Text>
                    </View>
                    {isSelected && (
                      <View style={[styles.selectedBadge, { backgroundColor: accentColor }]}>
                        <Check size={10} color="#fff" strokeWidth={3} />
                      </View>
                    )}
                  </View>

                  <Text style={styles.variantHook} numberOfLines={2}>{variant.hook}</Text>

                  <Text style={styles.variantCaption} numberOfLines={2}>{variant.caption}</Text>

                  <View style={styles.variantPanels}>
                    {variant.panels.slice(0, 3).map((panel, i) => (
                      <View key={i} style={styles.variantPanelRow}>
                        <View style={[styles.variantPanelNum, { backgroundColor: accentColor }]}>
                          <Text style={styles.variantPanelNumText}>{i + 1}</Text>
                        </View>
                        <Text style={styles.variantPanelSpeech} numberOfLines={2}>{panel.speech}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.variantTagsRow}>
                    {variant.hashtags.slice(0, 3).map((tag, i) => (
                      <View key={i} style={styles.variantTag}>
                        <Text style={styles.variantTagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={[styles.variantPlatformBadge, { backgroundColor: accentColor + '18' }]}>
                    <Text style={[styles.variantPlatformText, { color: accentColor }]}>
                      추천: {variant.recommendedPlatform}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.selectedHintRow}>
            <Info size={11} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.selectedHintText}>
              {localSelectedTone ? '선택한 변형이 만화 숏폼 생성에 적용됩니다. 원하는 톤을 탭하여 변경하세요.' : '원하는 톤을 선택하세요.'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    marginBottom: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  desc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
    marginBottom: 10,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
  },
  generateBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.error[500] + '12',
    borderWidth: 1,
    borderColor: theme.colors.error[500] + '30',
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
  retryBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.error[500] + '20',
  },
  retryText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.error[400],
  },
  variantsWrap: {
    marginTop: 4,
  },
  variantsScroll: {
    flexDirection: 'row',
  },
  variantCard: {
    width: 240,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 12,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  variantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  variantHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  variantToneLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  selectedBadge: {
    width: 18,
    height: 18,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  variantHook: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginBottom: 4,
    lineHeight: 18,
  },
  variantCaption: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginBottom: 8,
    lineHeight: 15,
  },
  variantPanels: {
    gap: 5,
    marginBottom: 8,
  },
  variantPanelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  variantPanelNum: {
    width: 18,
    height: 18,
    borderRadius: theme.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  variantPanelNumText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  variantPanelSpeech: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 15,
  },
  variantTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  variantTag: {
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  variantTagText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  variantPlatformBadge: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  variantPlatformText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  selectedHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  selectedHintText: {
    flex: 1,
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 14,
  },
});
