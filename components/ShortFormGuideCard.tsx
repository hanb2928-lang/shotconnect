import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Lightbulb, Zap, Wand as Wand2, Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { friendlyError } from '@/lib/errors';
import { SHORTFORM_GUIDE_URL, supabaseAnonKey } from '@/lib/supabase';

export interface GuideTip {
  title: string;
  description: string;
}

export interface GuideHook {
  text: string;
  angle: string;
}

export interface ShortFormGuide {
  tips: GuideTip[];
  hooks: GuideHook[];
  concept: string;
}

interface ShortFormGuideCardProps {
  productName: string;
  productCategory: string;
  priceEstimate: string;
  oneLiner: string;
  productAdvantages: string[];
  onApplyHook: (hook: string) => void;
  appliedHook: string | null;
}

export function ShortFormGuideCard({
  productName,
  productCategory,
  priceEstimate,
  oneLiner,
  productAdvantages,
  onApplyHook,
  appliedHook,
}: ShortFormGuideCardProps) {
  const [guide, setGuide] = useState<ShortFormGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const fetchGuide = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        SHORTFORM_GUIDE_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseAnonKey}`,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({
            productName,
            productCategory,
            priceEstimate,
            oneLiner,
            productAdvantages,
          }),
        },
      );
      if (!resp.ok) throw new Error('가이드 생성에 실패했습니다');
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      if (!data.tips || !Array.isArray(data.tips)) throw new Error('가이드 응답 형식이 올바르지 않습니다');
      setGuide(data as ShortFormGuide);
    } catch (err) {
      setError(friendlyError(err, '가이드를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [productName, productCategory, priceEstimate, oneLiner, productAdvantages]);

  useEffect(() => {
    if (!productName) return;
    fetchGuide();
  }, [fetchGuide, productName]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <Lightbulb size={18} color={theme.colors.accent[400]} strokeWidth={2} />
          </View>
          <View>
            <Text style={styles.title}>숏폼 제작 가이드</Text>
            <Text style={styles.subtitle}>AI 맞춤형 제작 팁 & 추천 후킹</Text>
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
          {loading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={theme.colors.accent[400]} />
              <Text style={styles.loadingText}>AI가 가이드를 만드는 중...</Text>
            </View>
          )}

          {error && !loading && (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={fetchGuide} activeOpacity={0.7}>
                <Text style={styles.retryText}>다시 시도</Text>
              </TouchableOpacity>
            </View>
          )}

          {guide && !loading && (
            <>
              {guide.concept ? (
                <View style={styles.conceptBox}>
                  <Text style={styles.conceptLabel}>추천 콘셉트</Text>
                  <Text style={styles.conceptText}>{guide.concept}</Text>
                </View>
              ) : null}

              {guide.tips.length > 0 && (
                <View style={styles.sectionWrap}>
                  <Text style={styles.sectionTitle}>제작 팁</Text>
                  {guide.tips.map((tip, i) => (
                    <View key={i} style={styles.tipRow}>
                      <View style={styles.tipNumber}>
                        <Text style={styles.tipNumberText}>{i + 1}</Text>
                      </View>
                      <View style={styles.tipContent}>
                        <Text style={styles.tipTitle}>{tip.title}</Text>
                        <Text style={styles.tipDesc}>{tip.description}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {guide.hooks.length > 0 && (
                <View style={styles.sectionWrap}>
                  <Text style={styles.sectionTitle}>추천 후킹 문구</Text>
                  {guide.hooks.map((hook, i) => {
                    const isApplied = appliedHook === hook.text;
                    return (
                      <View key={i} style={styles.hookCard}>
                        <View style={styles.hookTextWrap}>
                          <Zap size={14} color={theme.colors.warning[400]} strokeWidth={2} />
                          <Text style={styles.hookText}>{hook.text}</Text>
                        </View>
                        <Text style={styles.hookAngle}>{hook.angle}</Text>
                        <TouchableOpacity
                          style={[styles.applyBtn, isApplied && styles.applyBtnActive]}
                          onPress={() => onApplyHook(hook.text)}
                          activeOpacity={0.7}
                        >
                          {isApplied ? (
                            <>
                              <Check size={14} color="#fff" strokeWidth={2.5} />
                              <Text style={styles.applyBtnTextActive}>적용됨</Text>
                            </>
                          ) : (
                            <>
                              <Wand2 size={14} color={theme.colors.accent[300]} strokeWidth={2} />
                              <Text style={styles.applyBtnText}>이 가이드대로 만들기</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.accent[500] + '30',
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  iconWrap: {
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
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  errorWrap: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  errorText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    textAlign: 'center',
  },
  retryText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
  },
  conceptBox: {
    backgroundColor: theme.colors.accent[500] + '15',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  conceptLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
    marginBottom: 4,
  },
  conceptText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
    lineHeight: 20,
  },
  sectionWrap: {
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.textDim,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  tipRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  tipNumber: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent[500] + '25',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipNumberText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.accent[300],
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 2,
  },
  tipDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
  },
  hookCard: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  hookTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  hookText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    flex: 1,
  },
  hookAngle: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginBottom: theme.spacing.sm,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500] + '18',
    borderWidth: 1.5,
    borderColor: theme.colors.accent[400] + '50',
  },
  applyBtnActive: {
    backgroundColor: theme.colors.accent[500],
    borderColor: theme.colors.accent[500],
  },
  applyBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[300],
  },
  applyBtnTextActive: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
});
