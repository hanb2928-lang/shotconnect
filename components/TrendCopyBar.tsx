import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Flame, Zap, Check, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { TREND_COPY_FUNCTION_URL, supabaseAnonKey } from '@/lib/supabase';
import * as Clipboard from 'expo-clipboard';
import type { PlatformKey } from '@/types/database';

interface TrendCopy {
  phrase: string;
  context: string;
  platforms: string[];
}

interface TrendCopyBarProps {
  productName: string;
  productCategory: string;
  tags: string[];
  platform: PlatformKey;
  onApplyTrend?: (phrase: string) => void;
}

export function TrendCopyBar({ productName, productCategory, tags, platform, onApplyTrend }: TrendCopyBarProps) {
  const [trends, setTrends] = useState<TrendCopy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);

  const fetchTrends = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (productCategory) params.set('productCategory', productCategory);
      if (productName) params.set('productName', productName);
      if (tags.length > 0) params.set('tags', tags.join(','));
      if (platform) params.set('platform', platform);

      const resp = await fetch(`${TREND_COPY_FUNCTION_URL}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.trends && Array.isArray(data.trends)) {
          setTrends(data.trends);
        } else {
          setError(true);
        }
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [productName, productCategory, tags, platform]);

  useEffect(() => {
    if (productName || productCategory) {
      fetchTrends();
    }
  }, [fetchTrends]);

  const handleApply = useCallback((phrase: string, index: number) => {
    onApplyTrend?.(phrase);
    setAppliedIndex(index);
    setTimeout(() => setAppliedIndex(null), 2500);
  }, [onApplyTrend]);

  const handleCopy = useCallback(async (phrase: string, index: number) => {
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(phrase);
      } else {
        await Clipboard.setStringAsync(phrase);
      }
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // clipboard failed silently
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Flame size={16} color={theme.colors.accent[400]} strokeWidth={2} />
            <Text style={styles.headerTitle}>오늘의 핫 트렌드 카피</Text>
          </View>
          <ActivityIndicator size="small" color={theme.colors.accent[400]} />
        </View>
        <Text style={styles.loadingText}>실시간 유행어를 분석 중...</Text>
      </View>
    );
  }

  if (error || trends.length === 0) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <View style={styles.headerLeft}>
          <Flame size={16} color={theme.colors.accent[400]} strokeWidth={2} />
          <Text style={styles.headerTitle}>오늘의 핫 트렌드 카피</Text>
          <View style={styles.liveBadge}>
            <TrendingUp size={9} color="#fff" strokeWidth={2.5} />
            <Text style={styles.liveBadgeText}>실시간</Text>
          </View>
        </View>
        {expanded ? (
          <ChevronUp size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
        ) : (
          <ChevronDown size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
        )}
      </TouchableOpacity>

      {expanded && (
        <>
          <Text style={styles.description}>
            이 주 인스타·숏폼에서 반응이 좋은 후킹 문구예요. 클릭 한 번으로 적용하거나 복사하세요
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trendScroll}>
            {trends.map((trend, i) => {
              const isApplied = appliedIndex === i;
              const isCopied = copiedIndex === i;
              return (
                <View key={i} style={styles.trendCard}>
                  <Text style={styles.trendPhrase} numberOfLines={3}>{trend.phrase}</Text>
                  <Text style={styles.trendContext}>{trend.context}</Text>
                  <View style={styles.trendActions}>
                    <TouchableOpacity
                      style={[styles.trendBtn, isApplied && styles.trendBtnApplied]}
                      onPress={() => handleApply(trend.phrase, i)}
                      activeOpacity={0.7}
                    >
                      {isApplied ? (
                        <Check size={11} color={theme.colors.success[400]} strokeWidth={2.5} />
                      ) : (
                        <Zap size={11} color={theme.colors.accent[400]} strokeWidth={2} />
                      )}
                      <Text style={[styles.trendBtnText, isApplied && { color: theme.colors.success[400] }]}>
                        {isApplied ? '적용됨' : '적용'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trendBtn, isCopied && styles.trendBtnCopied]}
                      onPress={() => handleCopy(trend.phrase, i)}
                      activeOpacity={0.7}
                    >
                      {isCopied ? (
                        <Check size={11} color={theme.colors.success[400]} strokeWidth={2.5} />
                      ) : (
                        <Check size={11} color={theme.colors.dark.textDim} strokeWidth={2} />
                      )}
                      <Text style={[styles.trendBtnText, isCopied && { color: theme.colors.success[400] }]}>
                        {isCopied ? '복사됨' : '복사'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </>
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
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.accent[500],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  liveBadgeText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  loadingText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 8,
  },
  description: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
  trendScroll: {
    flexDirection: 'row',
  },
  trendCard: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginRight: theme.spacing.sm,
    width: 220,
    borderWidth: 1,
    borderColor: theme.colors.accent[400] + '20',
  },
  trendPhrase: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    lineHeight: 20,
    marginBottom: 6,
  },
  trendContext: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.accent[400],
    marginBottom: 10,
  },
  trendActions: {
    flexDirection: 'row',
    gap: 6,
  },
  trendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.bg,
  },
  trendBtnApplied: {
    backgroundColor: theme.colors.success[500] + '15',
  },
  trendBtnCopied: {
    backgroundColor: theme.colors.success[500] + '15',
  },
  trendBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
});
