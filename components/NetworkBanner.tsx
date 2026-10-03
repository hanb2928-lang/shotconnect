import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useI18n } from '@/hooks/useI18n';
import { theme } from '@/lib/theme';

type BannerKind = 'offline' | 'online' | 'unstable' | null;

export function NetworkBanner() {
  const status = useNetworkStatus();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<BannerKind>(null);
  const fadeAnim = useRef(new Animated.Value(0));
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    if (status === 'offline' || status === 'unstable') {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setBanner(status);
      Animated.timing(fadeAnim.current, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (status === 'online' && (prevStatusRef.current === 'offline' || prevStatusRef.current === 'unstable')) {
      setBanner('online');
      Animated.timing(fadeAnim.current, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      hideTimerRef.current = setTimeout(() => {
        Animated.timing(fadeAnim.current, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setBanner(null));
        hideTimerRef.current = null;
      }, 3000);
    }

    prevStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!banner) return null;

  const bannerColors: Record<string, string> = {
    offline: theme.colors.error[600],
    unstable: theme.colors.warning[500],
    online: theme.colors.success[600],
  };
  const backgroundColor = bannerColors[banner] ?? theme.colors.error[600];

  const bannerText: Record<string, string> = {
    offline: t('network.offline'),
    unstable: t('network.unstable'),
    online: t('network.online'),
  };
  const text = bannerText[banner] ?? t('network.offline');

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { backgroundColor, opacity: fadeAnim.current, paddingTop: insets.top + 8 }]}
    >
      <View style={styles.content}>
        <View style={[styles.dot, { backgroundColor: '#fff' }]}>
          <View style={[styles.dotInner, { backgroundColor }]} />
        </View>
        <Text style={styles.text}>{text}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingBottom: 14,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  text: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#ffffff',
    letterSpacing: 0.2,
  },
});
