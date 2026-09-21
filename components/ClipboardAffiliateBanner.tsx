import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  LayoutAnimation,
} from 'react-native';
import { ClipboardPaste, Check, X } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { theme } from '@/lib/theme';

interface ClipboardAffiliateBannerProps {
  onInsert: (url: string) => void;
  currentUrl: string;
}

const AFFILIATE_DOMAINS = [
  'coupang.com',
  'partners.coupang.com',
  'cr.link',
  'link.coupang.com',
  'tosssharing',
  'sharelink.toss.im',
  'toss.im',
  'brandconnect.naver.com',
  'naver.com',
  'shopping.naver.com',
  'oliveyoung.co.kr',
  'ohou.se',
  'kurly.com',
  'market.kurly.com',
  'myrealtrip.com',
  'klook.com',
  '11st.co.kr',
  'gmarket.co.kr',
  'smartstore.naver.com',
];

function isAffiliateUrl(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
  return AFFILIATE_DOMAINS.some((d) => lower.includes(d));
}

function detectPlatform(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('coupang')) return '쿠팡';
  if (lower.includes('toss')) return '토스';
  if (lower.includes('naver') || lower.includes('brandconnect')) return '네이버';
  if (lower.includes('oliveyoung')) return '올리브영';
  if (lower.includes('ohou')) return '오늘의집';
  if (lower.includes('kurly')) return '컬리';
  if (lower.includes('myrealtrip')) return '마이리얼트립';
  if (lower.includes('klook')) return '클룩';
  if (lower.includes('11st')) return '11번가';
  if (lower.includes('gmarket')) return 'G마켓';
  return '제휴';
}

export function ClipboardAffiliateBanner({ onInsert, currentUrl }: ClipboardAffiliateBannerProps) {
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const checkClipboard = useCallback(async () => {
    try {
      let text: string | null = null;
      if (Platform.OS === 'web') {
        if (navigator.clipboard?.readText) {
          text = await navigator.clipboard.readText().catch(() => null);
        }
      } else {
        text = await Clipboard.getStringAsync();
      }
      if (text && isAffiliateUrl(text) && text.trim() !== currentUrl.trim()) {
        setClipboardUrl(text.trim());
        setDismissed(false);
      }
    } catch {
      // clipboard read failed (permissions, etc.) — silently skip
    }
  }, [currentUrl]);

  useEffect(() => {
    const timer = setTimeout(() => {
      checkClipboard();
    }, 600);
    return () => clearTimeout(timer);
  }, [checkClipboard]);

  const handleInsert = () => {
    if (clipboardUrl) {
      onInsert(clipboardUrl);
    }
    setClipboardUrl(null);
    setDismissed(true);
  };

  const handleDismiss = () => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setDismissed(true);
    setClipboardUrl(null);
  };

  if (!clipboardUrl || dismissed) return null;

  const platformName = detectPlatform(clipboardUrl);

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <ClipboardPaste size={18} color={theme.colors.accent[400]} strokeWidth={2} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>클립보드에서 {platformName} 제휴 링크 감지</Text>
        <Text style={styles.urlText} numberOfLines={1}>{clipboardUrl}</Text>
      </View>
      <TouchableOpacity style={styles.insertBtn} onPress={handleInsert} activeOpacity={0.8}>
        <Check size={14} color="#fff" strokeWidth={2.5} />
        <Text style={styles.insertBtnText}>입력</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss} activeOpacity={0.7}>
        <X size={16} color={theme.colors.dark.textFaint} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.accent[500] + '40',
    ...theme.shadows.card,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  urlText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  insertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.accent[500],
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.sm,
    flexShrink: 0,
  },
  insertBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  dismissBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
});
