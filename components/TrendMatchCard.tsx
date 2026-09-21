import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Music2, Clapperboard, Type, Zap, Copy, Check, ChevronDown, ChevronUp, TrendingUp, Headphones } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { friendlyError } from '@/lib/errors';
import { TREND_MATCH_URL, supabaseAnonKey } from '@/lib/supabase';
import * as Clipboard from 'expo-clipboard';

export interface TrendTemplate {
  name: string;
  description: string;
  bgmMood: string;
  bgmTempo: string;
  subtitleStyle: string;
  transitionStyle: string;
  hashtagSuggestions: string[];
}

interface TrendMatchCardProps {
  productCategory: string;
  productName?: string;
  platform?: string;
  onApplyHashtags?: (tags: string[]) => void;
}

const DEFAULT_TEMPLATES: TrendTemplate[] = [
  {
    name: '트렌디 줌인',
    description: '제품의 핵심을 빠른 줌인으로 보여주는 숏폼 스타일',
    bgmMood: '업비트 신스팝',
    bgmTempo: '120-140 BPM',
    subtitleStyle: '대형 볼드 중앙 + 팝업',
    transitionStyle: '줌 인 + 와이프',
    hashtagSuggestions: ['trending', 'shorts', '릴스', 'fyp'],
  },
  {
    name: '감성 무비',
    description: '제품의 질감과 분위기를 차분하게 담는 감성 숏폼',
    bgmMood: '잔잔한 R&B / Lo-fi',
    bgmTempo: '70-90 BPM',
    subtitleStyle: '미니멀 하단 + 페이드',
    transitionStyle: '크로스 디졸브',
    hashtagSuggestions: ['aesthetic', '감성', 'mood', 'cinematic'],
  },
  {
    name: '가격 충격 컷',
    description: '빠른 전환으로 제품의 장점을 강하게 강조하는 스타일',
    bgmMood: '업비트 EDM',
    bgmTempo: '130-150 BPM',
    subtitleStyle: '팝업 카운터 + 글리치',
    transitionStyle: '플래시 + 와이프',
    hashtagSuggestions: ['deal', '추천', 'musthave', 'finds'],
  },
];

export function TrendMatchCard({ productCategory, productName, platform, onApplyHashtags }: TrendMatchCardProps) {
  const [templates, setTemplates] = useState<TrendTemplate[]>([]);
  const [insight, setInsight] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [appliedHashtagIdx, setAppliedHashtagIdx] = useState<number | null>(null);

  const fetchTrends = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(TREND_MATCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ productCategory, productName, platform }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        let errDetail = '';
        try {
          const errBody = await resp.json();
          errDetail = errBody?.error || '';
        } catch {
          // response body wasn't JSON
        }
        throw new Error(errDetail || `트렌드 분석에 실패했습니다 (${resp.status})`);
      }
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      const nextTemplates: TrendTemplate[] = Array.isArray(data.templates)
        ? data.templates.slice(0, 3).map((template: Partial<TrendTemplate>) => ({
            name: String(template.name || '추천 템플릿'),
            description: String(template.description || '제품의 특징을 보여주는 숏폼 구성'),
            bgmMood: String(template.bgmMood || '업비트 팝'),
            bgmTempo: String(template.bgmTempo || '100-120 BPM'),
            subtitleStyle: String(template.subtitleStyle || '볼드 자막'),
            transitionStyle: String(template.transitionStyle || '빠른 컷 전환'),
            hashtagSuggestions: Array.isArray(template.hashtagSuggestions)
              ? template.hashtagSuggestions.map((tag) => String(tag)).slice(0, 5)
              : [],
          }))
        : [];
      setTemplates(nextTemplates.length > 0 ? nextTemplates : DEFAULT_TEMPLATES);
      setInsight(typeof data.categoryInsight === 'string' ? data.categoryInsight : '제품의 핵심 장점을 빠르게 보여주는 구성이 효과적이에요.');
    } catch (err) {
      setTemplates(DEFAULT_TEMPLATES);
      setInsight('기본 트렌드 템플릿을 표시하고 있어요.');
      const isTimeout = err instanceof Error && (err.name === 'AbortError' || (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError'));
      setError(isTimeout
        ? '트렌드 분석 응답이 지연되었습니다. 잠시 후 다시 시도해주세요.'
        : friendlyError(err, '트렌드 분석에 실패했습니다. 잠시 후 다시 시도해주세요.'));
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [productCategory, productName, platform]);

  useEffect(() => {
    if (!productCategory) return;
    fetchTrends();
  }, [fetchTrends, productCategory]);

  const handleCopyTemplate = async (template: TrendTemplate, index: number) => {
    const text = [
      `템플릿: ${template.name}`,
      `분위기: ${template.description}`,
      `BGM: ${template.bgmMood} (${template.bgmTempo})`,
      `자막: ${template.subtitleStyle}`,
      `전환: ${template.transitionStyle}`,
      `해시태그: ${template.hashtagSuggestions.map((h) => `#${h}`).join(' ')}`,
    ].join('\n');
    try {
      await Clipboard.setStringAsync(text);
      setCopiedIdx(index);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // clipboard failed
    }
  };

  const handleApplyHashtags = (tags: string[], index: number) => {
    if (onApplyHashtags) {
      onApplyHashtags(tags);
      setAppliedHashtagIdx(index);
      setTimeout(() => setAppliedHashtagIdx(null), 2000);
    }
  };

  const moodColors: string[] = [
    theme.colors.accent[400],
    theme.colors.primary[400],
    theme.colors.warning[400],
  ];

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <Headphones size={18} color={theme.colors.primary[400]} strokeWidth={2} />
          </View>
          <View>
            <Text style={styles.title}>인기 밈·음원 트렌드 매칭</Text>
            <Text style={styles.subtitle}>카테고리별 숏폼 BGM & 자막 스타일 추천</Text>
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
              <ActivityIndicator size="small" color={theme.colors.primary[400]} />
              <Text style={styles.loadingText}>AI가 트렌드를 분석하는 중...</Text>
            </View>
          )}

          {error && !loading && (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={fetchTrends} activeOpacity={0.7}>
                <Text style={styles.retryText}>다시 시도</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && templates.length > 0 && (
            <>
              {insight ? (
                <View style={styles.insightBox}>
                  <TrendingUp size={14} color={theme.colors.primary[400]} strokeWidth={2} />
                  <Text style={styles.insightText}>{insight}</Text>
                </View>
              ) : null}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templateScroll}>
                {templates.map((template, i) => {
                  const accentColor = moodColors[i % moodColors.length];
                  return (
                    <View key={i} style={[styles.templateCard, { borderLeftColor: accentColor }]}>
                      <Text style={styles.templateName}>{template.name}</Text>
                      <Text style={styles.templateDesc}>{template.description}</Text>

                      <View style={styles.detailRow}>
                        <Music2 size={12} color={accentColor} strokeWidth={2} />
                        <Text style={styles.detailText}>BGM: {template.bgmMood}</Text>
                      </View>
                      <Text style={styles.detailSub}>{template.bgmTempo}</Text>

                      <View style={styles.detailRow}>
                        <Type size={12} color={accentColor} strokeWidth={2} />
                        <Text style={styles.detailText}>자막: {template.subtitleStyle}</Text>
                      </View>

                      <View style={styles.detailRow}>
                        <Clapperboard size={12} color={accentColor} strokeWidth={2} />
                        <Text style={styles.detailText}>전환: {template.transitionStyle}</Text>
                      </View>

                      {template.hashtagSuggestions.length > 0 && (
                        <View style={styles.hashtagWrap}>
                          {template.hashtagSuggestions.map((tag, j) => (
                            <View key={j} style={styles.hashtagPill}>
                              <Text style={styles.hashtagPillText}>#{tag}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={[styles.actionBtn, { borderColor: accentColor + '40' }]}
                          onPress={() => handleCopyTemplate(template, i)}
                          activeOpacity={0.7}
                        >
                          {copiedIdx === i ? (
                            <Check size={13} color={theme.colors.success[400]} strokeWidth={2.5} />
                          ) : (
                            <Copy size={13} color={accentColor} strokeWidth={2} />
                          )}
                          <Text style={[styles.actionBtnText, { color: copiedIdx === i ? theme.colors.success[400] : accentColor }]}>
                            {copiedIdx === i ? '복사됨' : '복사'}
                          </Text>
                        </TouchableOpacity>

                        {onApplyHashtags && template.hashtagSuggestions.length > 0 && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { borderColor: accentColor + '40' }]}
                            onPress={() => handleApplyHashtags(template.hashtagSuggestions, i)}
                            activeOpacity={0.7}
                          >
                            {appliedHashtagIdx === i ? (
                              <Check size={13} color={theme.colors.success[400]} strokeWidth={2.5} />
                            ) : (
                              <Zap size={13} color={accentColor} strokeWidth={2} />
                            )}
                            <Text style={[styles.actionBtnText, { color: appliedHashtagIdx === i ? theme.colors.success[400] : accentColor }]}>
                              {appliedHashtagIdx === i ? '추가됨' : '해시태그 추가'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
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
    borderColor: theme.colors.primary[500] + '25',
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
    backgroundColor: theme.colors.primary[500] + '20',
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
    color: theme.colors.primary[400],
  },
  insightBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: theme.colors.primary[500] + '12',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  insightText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
    lineHeight: 18,
  },
  templateScroll: {
    flexDirection: 'row',
  },
  templateCard: {
    width: 240,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginRight: theme.spacing.sm,
    borderLeftWidth: 3,
  },
  templateName: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginBottom: 4,
  },
  templateDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
    marginBottom: theme.spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginBottom: 2,
  },
  detailText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
    lineHeight: 16,
  },
  detailSub: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginLeft: 17,
    marginBottom: 6,
  },
  hashtagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: theme.spacing.sm,
  },
  hashtagPill: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '20',
  },
  hashtagPillText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: theme.spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    flex: 1,
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
});
