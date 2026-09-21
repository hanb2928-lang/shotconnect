import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Hash, Copy, Check, TrendingUp, Shuffle } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import * as Clipboard from 'expo-clipboard';
import type { PlatformKey } from '@/types/database';
import { mutateHashtags } from '@/lib/humanLikeEngine';

interface HashtagCopyBarProps {
  hashtags: string[];
  productCategory: string;
  platform: PlatformKey;
}

const CATEGORY_BASE_TAGS: Record<string, string[]> = {
  fashion: ['오늘뭐입지', '데일리룩', '가성비옷', '옷장필수템', '착붙템', '코디', '스타일링', '패션템'],
  beauty: ['글로시메이크업', '수분광', '데일리메이크업', '스킨케어', '뷰티템', '선크림', '립틴트', '쿠션'],
  electronics: ['가성비가전', '데스크셋업', '오디오', '이어버드', '스마트워치', '노이즈캔슬링', '블루투스', '디지털템'],
  home: ['자취방꾸미기', '인테리어', '감성템', '주방템', '청소기', '공기청정기', '텀블러', '홈스타일링'],
  sports: ['홈트', '요가', '런닝', '캠핑', '등산', '헬스', '요가매트', '러닝화'],
};

const UNIVERSAL_TAGS = ['소상공인마케팅', '꿀템추천', '내돈내산', '오늘의픽', '가성비템', '인생템', '재구매', '추천템'];

const PLATFORM_TAG_LIMITS: Record<PlatformKey, number> = {
  naverBlog: 15,
  shortform: 8,
  instagram: 12,
  threads: 6,
  twitter: 5,
  pinterest: 10,
  smartstore: 8,
};

function matchCategoryKey(category: string): string | null {
  const lower = category.toLowerCase();
  for (const [key, keywords] of Object.entries({
    fashion: ['패션', '의류', '옷', 'cloth', 'jacket', 'shirt', 'sneakers', '신발', '스니커즈'],
    beauty: ['뷰티', '화장', 'cosmetic', 'makeup', '쿠션', '클렌징', '세럼', '스킨케어'],
    electronics: ['디지털', '가전', '전자', 'electronic', '이어버드', '블루투스'],
    home: ['생활', '주방', 'home', '인테리어', '도마', '청소기', '에어프라이어'],
    sports: ['스포츠', '레저', 'sport', '런닝', '요가', '헬스', '캠핑'],
  })) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) return key;
  }
  return null;
}

export function HashtagCopyBar({ hashtags, productCategory, platform }: HashtagCopyBarProps) {
  const [copied, setCopied] = useState(false);
  const [mixed, setMixed] = useState(false);
  const [mixCount, setMixCount] = useState(0);

  const baseHashtags = useMemo(() => {
    const limit = PLATFORM_TAG_LIMITS[platform] ?? 10;
    const existing = new Set(hashtags.map((h) => h.toLowerCase()));

    const catKey = matchCategoryKey(productCategory);
    const categoryTags = catKey ? (CATEGORY_BASE_TAGS[catKey] || []) : [];

    const combined: string[] = [...hashtags];

    for (const tag of categoryTags) {
      if (combined.length >= limit) break;
      if (!existing.has(tag.toLowerCase())) {
        combined.push(tag);
        existing.add(tag.toLowerCase());
      }
    }

    for (const tag of UNIVERSAL_TAGS) {
      if (combined.length >= limit) break;
      if (!existing.has(tag.toLowerCase())) {
        combined.push(tag);
        existing.add(tag.toLowerCase());
      }
    }

    return combined.slice(0, limit);
  }, [hashtags, productCategory, platform]);

  const optimizedHashtags = useMemo(() => {
    if (!mixed) return baseHashtags;
    const limit = PLATFORM_TAG_LIMITS[platform] ?? 10;
    const essentialCount = Math.min(2, hashtags.length);
    const essential = baseHashtags.slice(0, essentialCount);
    const pool = baseHashtags.slice(essentialCount);
    return mutateHashtags(essential, pool, limit);
  }, [baseHashtags, mixed, mixCount, hashtags.length, platform]);

  const handleMix = useCallback(() => {
    setMixed(true);
    setMixCount((c) => c + 1);
  }, []);

  const handleCopyAll = useCallback(async () => {
    const text = optimizedHashtags.map((h) => `#${h}`).join(' ');
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        await Clipboard.setStringAsync(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard failed silently
    }
  }, [optimizedHashtags]);

  if (optimizedHashtags.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Hash size={16} color={theme.colors.primary[300]} strokeWidth={2} />
          <Text style={styles.headerTitle}>해시태그 최적화</Text>
          <View style={styles.optimizedBadge}>
            <TrendingUp size={9} color="#fff" strokeWidth={2.5} />
            <Text style={styles.optimizedBadgeText}>SEO 최적화</Text>
          </View>
        </View>
        <Text style={styles.countText}>{optimizedHashtags.length}개</Text>
      </View>

      <Text style={styles.description}>
        제품 카테고리별 인기 해시태그를 자동 조합했어요. 한 번에 복사해서 바로 붙여넣으세요
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScroll}>
        {optimizedHashtags.map((tag, i) => (
          <View key={i} style={styles.tagPill}>
            <Text style={styles.tagText}>#{tag}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.copyAllBtn, copied && styles.copyAllBtnDone, { flex: 1 }]}
          onPress={handleCopyAll}
          activeOpacity={0.8}
        >
          {copied ? (
            <Check size={16} color={theme.colors.success[400]} strokeWidth={2.5} />
          ) : (
            <Copy size={16} color="#fff" strokeWidth={2} />
          )}
          <Text style={[styles.copyAllBtnText, copied && { color: theme.colors.success[400] }]}>
            {copied ? '복사 완료!' : '해시태그 복사'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mixBtn, mixed && styles.mixBtnActive]}
          onPress={handleMix}
          activeOpacity={0.7}
        >
          <Shuffle size={14} color={mixed ? theme.colors.accent[400] : theme.colors.dark.textDim} strokeWidth={2} />
          <Text style={[styles.mixBtnText, mixed && { color: theme.colors.accent[400] }]}>
            {mixed ? `믹스${mixCount > 0 ? ` ${mixCount}` : ''}` : '무작위 믹스'}
          </Text>
        </TouchableOpacity>
      </View>
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
  optimizedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.primary[500],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  optimizedBadgeText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  countText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  description: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
  tagScroll: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  tagPill: {
    backgroundColor: theme.colors.primary[500] + '15',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '20',
  },
  tagText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
  },
  copyAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    ...theme.shadows.card,
  },
  copyAllBtnDone: {
    backgroundColor: theme.colors.success[500] + '15',
    borderWidth: 1.5,
    borderColor: theme.colors.success[400],
  },
  copyAllBtnText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  mixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  mixBtnActive: {
    borderColor: theme.colors.accent[400],
    backgroundColor: theme.colors.accent[500] + '12',
  },
  mixBtnText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
});
