import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Share as RNShare } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { Share2, Baby, ArrowRight, ExternalLink, Sparkles, Copy, Check } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { BabyIcon } from '@/components/BabyIcon';
import { useAffiliateToast } from '@/components/AffiliateToast';
import { getShareDisclosureForPlatforms } from '@/lib/disclosure';
import { getUserSettings } from '@/lib/settings';
import * as Clipboard from 'expo-clipboard';

interface SocialShortFormShareProps {
  shareText: string;
  affiliateUrl: string | null;
  shortUrl?: string | null;
  affiliatePlatforms?: string[];
}

const INTRO_PHRASES = [
  '이거 대박인데?',
  '이거 꼭 사야 해!',
  '숨은 명템 발견!',
  '이 가격 실화?',
];

export function SocialShortFormShare({
  shareText,
  affiliateUrl,
  shortUrl,
  affiliatePlatforms = [],
}: SocialShortFormShareProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedIntro, setSelectedIntro] = useState(0);
  const [showOutro, setShowOutro] = useState(true);
  const [autoDisclosure, setAutoDisclosure] = useState(true);
  const { showAffiliateToast } = useAffiliateToast();

  const expandAnim = useSharedValue(0);
  const babyBounce = useSharedValue(0);
  const sparkleRot = useSharedValue(0);
  const introOpacity = useSharedValue(0);

  useEffect(() => {
    let mounted = true;
    getUserSettings().then((s) => { if (mounted && s) setAutoDisclosure(s.auto_disclosure ?? true); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const toggleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    expandAnim.value = withTiming(next ? 1 : 0, { duration: 300, easing: Easing.out(Easing.cubic) });
    if (next) {
      babyBounce.value = withSequence(
        withTiming(-8, { duration: 200, easing: Easing.out(Easing.back(1.5)) }),
        withTiming(0, { duration: 300, easing: Easing.bounce }),
      );
      sparkleRot.value = withRepeat(
        withTiming(360, { duration: 2000 }),
        -1,
        false,
      );
      introOpacity.value = withTiming(1, { duration: 400 });
    } else {
      babyBounce.value = withTiming(0, { duration: 200 });
      sparkleRot.value = withTiming(0, { duration: 200 });
      introOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [expanded, expandAnim, babyBounce, sparkleRot, introOpacity]);

  const handleShare = useCallback(async () => {
    const intro = INTRO_PHRASES[selectedIntro];
    const outro = showOutro ? '\n\n더 많은 혜택은 클릭!' : '';
    const link = shortUrl || affiliateUrl;
    const linkLine = link ? `\n\n${link}` : '';
    const disclosureText = getShareDisclosureForPlatforms(affiliatePlatforms, autoDisclosure);
    const disclosureLine = disclosureText ? `\n\n${disclosureText}` : '';
    const fullText = `${intro}\n\n${shareText}${linkLine}${outro}${disclosureLine}`;

    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(fullText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // fallback ignore
      }
    } else {
      try {
        await RNShare.share({ message: fullText });
      } catch {
        // user cancelled
      }
    }
  }, [selectedIntro, showOutro, shortUrl, affiliateUrl, shareText, affiliatePlatforms, autoDisclosure]);

  const handleCopyLink = useCallback(async () => {
    const link = shortUrl || affiliateUrl;
    if (!link) return;
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      } else {
        await Clipboard.setStringAsync(link);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [shortUrl, affiliateUrl]);

  const handleOpenLink = useCallback(() => {
    const link = shortUrl || affiliateUrl;
    if (link) showAffiliateToast(link);
  }, [shortUrl, affiliateUrl, showAffiliateToast]);

  const expandStyle = useAnimatedStyle(() => ({
    height: expandAnim.value * 280,
    opacity: expandAnim.value,
  }));

  const babyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: babyBounce.value }],
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sparkleRot.value}deg` }],
  }));

  const introStyle = useAnimatedStyle(() => ({
    opacity: introOpacity.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${expandAnim.value * 180}deg` }],
  }));

  const outroStyle = useAnimatedStyle(() => ({
    opacity: showOutro ? 1 : 0.3,
    transform: [{ scale: showOutro ? 1 : 0.95 }],
  }));

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={toggleExpand} activeOpacity={0.7}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <Baby size={16} color={theme.colors.accent[400]} strokeWidth={2} />
          </View>
          <Text style={styles.headerTitle}>숏폼 인트로/아웃트로 추가</Text>
        </View>
        <Animated.Text style={[styles.chevron, chevronStyle]}>▼</Animated.Text>
      </TouchableOpacity>

      <Animated.View style={[styles.expandWrap, expandStyle]} pointerEvents={expanded ? 'auto' : 'none'}>
        <View style={styles.previewArea}>
          <Animated.View style={[styles.babyIntro, babyStyle]}>
            <BabyIcon size={28} color={theme.colors.primary[300]} strokeWidth={2} />
            <Animated.View style={[styles.sparkle, sparkleStyle]} pointerEvents="none">
              <Sparkles size={14} color={theme.colors.warning[400]} strokeWidth={2.5} />
            </Animated.View>
          </Animated.View>
          <Animated.View style={introStyle}>
            <Text style={styles.introPhrase}>"{INTRO_PHRASES[selectedIntro]}"</Text>
          </Animated.View>
        </View>

        <Text style={styles.sectionLabel}>인트로 문구 선택</Text>
        <View style={styles.phraseRow}>
          {INTRO_PHRASES.map((phrase, i) => (
            <TouchableOpacity
              key={phrase}
              style={[styles.phrasePill, selectedIntro === i && styles.phrasePillActive]}
              onPress={() => setSelectedIntro(i)}
              activeOpacity={0.7}
            >
              <Text style={[styles.phraseText, selectedIntro === i && styles.phraseTextActive]}>
                {phrase}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>아웃트로 스티커</Text>
        <View style={styles.outroRow}>
          <TouchableOpacity
            style={[styles.outroToggle, showOutro && styles.outroToggleActive]}
            onPress={() => setShowOutro(!showOutro)}
            activeOpacity={0.7}
          >
            <View style={[styles.toggleKnob, showOutro && styles.toggleKnobActive]} />
          </TouchableOpacity>
          <Text style={styles.outroLabel}>{showOutro ? '켜짐' : '꺼짐'}</Text>
          <Animated.View style={[styles.outroPreview, outroStyle]}>
            <BabyIcon size={14} color={theme.colors.primary[600]} strokeWidth={2} />
            <Text style={styles.outroPreviewText}>더 많은 혜택은 클릭!</Text>
            <ArrowRight size={10} color={theme.colors.primary[500]} strokeWidth={2.5} />
          </Animated.View>
        </View>

        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
          <Share2 size={16} color="#fff" strokeWidth={2.5} />
          <Text style={styles.shareBtnText}>숏폼 공유 문구 생성</Text>
        </TouchableOpacity>

        {(shortUrl || affiliateUrl) && (
          <View style={styles.linkRow}>
            <TouchableOpacity style={styles.linkCopyBtn} onPress={handleCopyLink} activeOpacity={0.7}>
              {copied ? (
                <Check size={14} color={theme.colors.success[400]} strokeWidth={2.5} />
              ) : (
                <Copy size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
              )}
              <Text style={[styles.linkCopyText, copied && { color: theme.colors.success[400] }]}>
                {copied ? '복사됨!' : '링크 복사'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkOpenBtn} onPress={handleOpenLink} activeOpacity={0.7}>
              <ExternalLink size={14} color={theme.colors.primary[300]} strokeWidth={2} />
              <Text style={styles.linkOpenText}>링크 열기</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.accent[500] + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  chevron: {
    fontSize: 12,
    color: theme.colors.dark.textDim,
  },
  expandWrap: {
    overflow: 'hidden',
  },
  previewArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  babyIntro: {
    position: 'relative',
  },
  sparkle: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
  introPhrase: {
    flex: 1,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.primary[300],
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 8,
    marginTop: 4,
  },
  phraseRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  phrasePill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  phrasePillActive: {
    backgroundColor: theme.colors.primary[600] + '20',
    borderColor: theme.colors.primary[500],
  },
  phraseText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  phraseTextActive: {
    color: theme.colors.primary[300],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  outroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  outroToggle: {
    width: 36,
    height: 20,
    borderRadius: 999,
    backgroundColor: theme.colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  outroToggleActive: {
    backgroundColor: theme.colors.primary[600],
  },
  toggleKnob: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: theme.colors.neutral[200],
    alignSelf: 'flex-start',
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
    backgroundColor: '#fff',
  },
  outroLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  outroPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    ...theme.shadows.card,
  },
  outroPreviewText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[700],
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    ...theme.shadows.card,
  },
  shareBtnText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  linkRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: theme.spacing.sm,
  },
  linkCopyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  linkCopyText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  linkOpenBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500] + '15',
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '30',
  },
  linkOpenText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
  },
});
