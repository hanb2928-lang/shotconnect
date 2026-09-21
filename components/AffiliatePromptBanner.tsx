import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
} from 'react-native';
import { ShoppingBag, Link2, ChevronRight, Check, CircleAlert as AlertCircle } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import type { AffiliateLink } from '@/types/database';

interface AffiliatePromptBannerProps {
  productName: string;
  autoLinks: AffiliateLink[];
  hasCustomLink: boolean;
  partnerIdsConfigured: boolean;
  onConnectLink: () => void;
}

export function AffiliatePromptBanner({
  productName,
  autoLinks,
  hasCustomLink,
  partnerIdsConfigured,
  onConnectLink,
}: AffiliatePromptBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (hasCustomLink && !dismissed) {
      setDismissed(true);
    }
  }, [hasCustomLink, dismissed]);

  if (dismissed || hasCustomLink) return null;

  const handleDismiss = () => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setDismissed(true);
  };

  const hasLinks = autoLinks.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <ShoppingBag size={20} color={theme.colors.primary[400]} strokeWidth={2} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>제휴 링크 연결로 수익화 시작</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {productName
              ? `'${productName}' 검색 링크가 준비됐어요. 내 제휴 링크를 붙여넣으면 단축 URL과 스티커가 자동 생성됩니다.`
              : '내 제휴 링크를 붙여넣으면 단축 URL과 스티커가 자동 생성됩니다.'}
          </Text>
        </View>
        <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss} activeOpacity={0.6}>
          <Text style={styles.dismissText}>나중에</Text>
        </TouchableOpacity>
      </View>

      {!partnerIdsConfigured && (
        <View style={styles.noticeRow}>
          <AlertCircle size={13} color={theme.colors.warning[400]} strokeWidth={2} />
          <Text style={styles.noticeText}>
            파트너스 ID 미설정 — 설정에서 쿠팡/네이버/토스 ID를 등록하면 자동으로 추적 링크가 생성됩니다.
          </Text>
        </View>
      )}

      {hasLinks && (
        <View style={styles.linkChips}>
          {autoLinks.slice(0, 3).map((link) => (
            <View key={link.platform} style={styles.linkChip}>
              <Link2 size={11} color={theme.colors.primary[300]} strokeWidth={2} />
              <Text style={styles.linkChipText} numberOfLines={1}>{link.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onConnectLink}
          activeOpacity={0.8}
        >
          <Link2 size={16} color="#fff" strokeWidth={2} />
          <Text style={styles.primaryBtnText}>제휴 링크 연결하기</Text>
          <ChevronRight size={16} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary[500] + '30',
    ...theme.shadows.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 20,
  },
  dismissBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  dismissText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textFaint,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: theme.colors.warning[500] + '15',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.warning[400],
    lineHeight: 18,
  },
  linkChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  linkChipText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    maxWidth: 120,
  },
  actionRow: {
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary[400],
    paddingVertical: 12,
    borderRadius: theme.radius.md,
  },
  primaryBtnText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },

});
