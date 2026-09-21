import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Sparkles, Check, RefreshCw, CircleAlert as AlertCircle, Film, Music, Move, Monitor, Clock } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { friendlyError } from '@/lib/errors';
import type { StyleRecommendation } from '@/lib/styleRecommend';
import { fetchStyleRecommendation } from '@/lib/styleRecommend';
import type { PlatformKey } from '@/types/database';

interface AIStyleCardProps {
  productName: string;
  productCategory: string;
  accentColor: string;
  hook: string;
  oneLiner: string;
  platform: PlatformKey;
  onApply: (rec: StyleRecommendation) => void;
}

const STYLE_LABELS: Record<string, string> = {
  bold: '볼드',
  magazine: '매거진',
  feed: '피드',
  minimal: '미니멀',
};

const MUSIC_LABELS: Record<string, string> = {
  upbeat: '업비트',
  calm: '차분',
  emotional: '감성',
  none: '없음',
};

const MOTION_LABELS: Record<string, string> = {
  kenburns: '켄번즈',
  'zoom-in': '줌인',
  'zoom-out': '줌아웃',
  'slide-in': '슬라이드인',
  'slow-motion': '슬로우모션',
};

const FORMAT_LABELS: Record<string, string> = {
  vertical: '세로 9:16',
  horizontal: '가로 16:9',
};

const HYBRID_LABELS: Record<string, string> = {
  off: '실사 only',
  'photo-to-comic': '실사→만화',
};

export function AIStyleCard({
  productName,
  productCategory,
  accentColor,
  hook,
  oneLiner,
  platform,
  onApply,
}: AIStyleCardProps) {
  const [recommendation, setRecommendation] = useState<StyleRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const autoAppliedRef = useRef(false);
  const appliedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (appliedTimerRef.current) clearTimeout(appliedTimerRef.current);
    };
  }, []);

  const triggerAppliedReset = () => {
    if (appliedTimerRef.current) clearTimeout(appliedTimerRef.current);
    appliedTimerRef.current = setTimeout(() => setApplied(false), 3000);
  };

  const load = useCallback(async () => {
    if (!productName && !productCategory) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setApplied(false);
    autoAppliedRef.current = false;
    try {
      const rec = await fetchStyleRecommendation({
        productName,
        productCategory,
        accentColor,
        hook,
        oneLiner,
        platform,
      });
      setRecommendation(rec);
    } catch (err) {
      setError(friendlyError(err, 'AI 스타일 추천을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.'));
    } finally {
      setLoading(false);
    }
  }, [productName, productCategory, accentColor, hook, oneLiner, platform]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (recommendation && !autoAppliedRef.current) {
      autoAppliedRef.current = true;
      onApply(recommendation);
      setApplied(true);
      triggerAppliedReset();
    }
  }, [recommendation, onApply]);

  const handleApply = () => {
    if (!recommendation) return;
    onApply(recommendation);
    setApplied(true);
    triggerAppliedReset();
  };

  const handleApplyAlternative = (cardStyle: string) => {
    if (!recommendation) return;
    const updated: StyleRecommendation = { ...recommendation, cardStyle: cardStyle as StyleRecommendation['cardStyle'] };
    onApply(updated);
    setRecommendation(updated);
    setApplied(true);
    triggerAppliedReset();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Sparkles size={20} color={theme.colors.primary[400]} />
          <Text style={styles.title}>AI 맞춤 스타일 추천</Text>
        </View>
        <View style={styles.loadingBody}>
          <ActivityIndicator size="small" color={theme.colors.primary[400]} />
          <Text style={styles.loadingText}>AI가 상품에 맞는 최적의 템플릿을 분석 중...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Sparkles size={20} color={theme.colors.primary[400]} />
          <Text style={styles.title}>AI 맞춤 스타일 추천</Text>
        </View>
        <View style={styles.errorBody}>
          <AlertCircle size={18} color={theme.colors.error[400]} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <RefreshCw size={16} color={theme.colors.dark.text} />
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!recommendation) return null;

  const specs = [
    { icon: Film, label: '템플릿', value: STYLE_LABELS[recommendation.cardStyle] || recommendation.cardStyle },
    { icon: Music, label: '음악', value: MUSIC_LABELS[recommendation.musicMood] || recommendation.musicMood },
    { icon: Move, label: '연출', value: MOTION_LABELS[recommendation.motionPreset] || recommendation.motionPreset },
    { icon: Monitor, label: '비율', value: FORMAT_LABELS[recommendation.format] || recommendation.format },
    { icon: Clock, label: '길이', value: `${(recommendation.duration / 1000).toFixed(0)}초` },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Sparkles size={20} color={theme.colors.primary[400]} />
        <Text style={styles.title}>AI 맞춤 스타일 추천</Text>
        <TouchableOpacity style={styles.refreshIcon} onPress={load}>
          <RefreshCw size={16} color={theme.colors.dark.textDim} />
        </TouchableOpacity>
      </View>

      <Text style={styles.reasonText}>{recommendation.reason}</Text>

      <View style={styles.specsRow}>
        {specs.map((spec, i) => {
          const Icon = spec.icon;
          return (
            <View key={i} style={styles.specChip}>
              <Icon size={13} color={accentColor || theme.colors.primary[400]} />
              <Text style={styles.specLabel}>{spec.label}</Text>
              <Text style={styles.specValue}>{spec.value}</Text>
            </View>
          );
        })}
      </View>

      {recommendation.hybridMode !== 'off' && (
        <View style={styles.hybridBadge}>
          <Text style={styles.hybridBadgeText}>
            하이브리드: {HYBRID_LABELS[recommendation.hybridMode]}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.applyBtn, applied && styles.applyBtnDone]}
        onPress={handleApply}
        activeOpacity={0.8}
      >
        {applied ? (
          <>
            <Check size={18} color={theme.colors.success[500]} />
            <Text style={styles.applyBtnDoneText}>적용 완료!</Text>
          </>
        ) : (
          <>
            <Sparkles size={18} color="#fff" />
            <Text style={styles.applyBtnText}>이 스타일로 동영상 만들기</Text>
          </>
        )}
      </TouchableOpacity>

      {recommendation.alternatives.length > 0 && (
        <View style={styles.alternatives}>
          <Text style={styles.alternativesTitle}>마음에 안 드시면 다른 스타일로 바꿀 수 있어요</Text>
          {recommendation.alternatives.map((alt, i) => (
            <TouchableOpacity
              key={i}
              style={styles.altRow}
              onPress={() => handleApplyAlternative(alt.cardStyle)}
              activeOpacity={0.7}
            >
              <View style={styles.altInfo}>
                <Text style={styles.altLabel}>{alt.label}</Text>
                <Text style={styles.altReason}>{alt.reason}</Text>
              </View>
              <Text style={styles.altApply}>적용</Text>
            </TouchableOpacity>
          ))}
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
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    flex: 1,
  },
  refreshIcon: {
    padding: 4,
  },
  loadingBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  loadingText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  errorBody: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  errorText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    flex: 1,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  retryText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  reasonText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 20,
  },
  specsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  specChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  specLabel: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  specValue: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  hybridBadge: {
    alignSelf: 'flex-start',
    backgroundColor: `${theme.colors.accent[400]}22`,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hybridBadgeText: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[300],
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[600],
  },
  applyBtnDone: {
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  applyBtnText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  applyBtnDoneText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.success[500],
  },
  alternatives: {
    gap: 6,
    paddingTop: 4,
  },
  alternativesTitle: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textFaint,
  },
  altRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  altInfo: {
    flex: 1,
    gap: 2,
  },
  altLabel: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  altReason: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
  },
  altApply: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
    paddingHorizontal: 8,
  },
});
