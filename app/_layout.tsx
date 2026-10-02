import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Linking, Platform, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SplashScreen } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { initStorage } from '@/lib/storage';
import { theme } from '@/lib/theme';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AffiliateToastProvider } from '@/components/AffiliateToast';
const NetworkBanner = lazy(() =>
  import('@/components/NetworkBanner').then((m) => ({ default: m.NetworkBanner })),
);
const VideoJobRecoveryToast = lazy(() =>
  import('@/components/VideoJobRecoveryToast').then((m) => ({ default: m.VideoJobRecoveryToast })),
);
import { I18nProvider, useI18n } from '@/hooks/useI18n';
import { AppThemeProvider } from '@/hooks/useAppTheme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { installGlobalErrorHandlers } from '@/lib/errorLogger';
import { installMediaCacheLifecycleHook } from '@/lib/mediaCache';
import { startPressureMonitoring } from '@/lib/devicePerformance';
import { sweepTempFiles } from '@/lib/tempFileManager';

installGlobalErrorHandlers();
installMediaCacheLifecycleHook();
startPressureMonitoring();

// Run a temp file GC sweep 5s after boot — non-blocking, best-effort.
// Cleans up orphaned Blob URLs and temp files from a previous session.
setTimeout(() => { sweepTempFiles().catch(() => {}); }, 5000);

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sweepTempFiles().catch(() => {});
    }
  });
}

SplashScreen.preventAutoHideAsync();

// Kick off storage init at module scope so it runs in parallel with
// font loading and React's first render, rather than waiting for the
// first useEffect to fire.
const earlyStoragePromise = initStorage();

// Disable font scaling globally to prevent layout overflow when users
// increase system font size (Accessibility > Large Text). This ensures
// all Text and TextInput elements keep their designed font sizes.
const TextCtor = Text as unknown as { defaultProps?: Record<string, unknown> };
const TextInputCtor = TextInput as unknown as { defaultProps?: Record<string, unknown> };
if (!TextCtor.defaultProps) TextCtor.defaultProps = {};
TextCtor.defaultProps.allowFontScaling = false;
if (!TextInputCtor.defaultProps) TextInputCtor.defaultProps = {};
TextInputCtor.defaultProps.allowFontScaling = false;

type ReadyState = 'loading' | 'app' | 'error';

const LOADING_TEXT = '로딩 중...';
const ERROR_TITLE = '문제가 발생했어요';
const ERROR_DESC = '예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
const RETRY_TEXT = '다시 시도';
const SHOTCONNECT_PREVIEW_VERSION = '20261001-shotconnect-v2';

function purgeLegacyWebSession(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const legacyPattern = /shopformer|샵포머/i;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
        (key): key is string => key !== null && legacyPattern.test(key),
      );
      keys.forEach((key) => storage.removeItem(key));
    } catch {
      // Restricted storage should not prevent the app from starting.
    }
  }
}

function refreshStalePreview(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const stored = window.sessionStorage.getItem('shotconnect-preview-version');
    if (stored === SHOTCONNECT_PREVIEW_VERSION) return;
    // Write the new version first, then reload. If the write throws
    // (restricted sessionStorage in a sandboxed iframe), abort — a
    // reload would loop forever since the version can never persist.
    window.sessionStorage.setItem('shotconnect-preview-version', SHOTCONNECT_PREVIEW_VERSION);
    // Verify the write actually persisted before reloading.
    if (window.sessionStorage.getItem('shotconnect-preview-version') !== SHOTCONNECT_PREVIEW_VERSION) return;
    window.location.reload();
  } catch {
    // Restricted session storage — skip reload to avoid infinite loop.
  }
}

function AppShell() {
  const { t } = useI18n();

  return (
    <Stack screenOptions={{ headerShown: false, animation: Platform.OS === 'web' ? 'fade' : 'slide_from_right', gestureEnabled: Platform.OS !== 'web' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="editor" options={{ headerShown: false }} />
      <Stack.Screen
        name="guide"
        options={{
          headerShown: true,
          headerTitle: t('guide.title'),
          headerStyle: { backgroundColor: theme.colors.dark.surface },
          headerTintColor: theme.colors.dark.text,
          headerTitleStyle: { fontFamily: theme.typography.fontFamily.bold },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          headerShown: true,
          headerTitle: t('settings.title'),
          headerStyle: { backgroundColor: theme.colors.dark.surface },
          headerTintColor: theme.colors.dark.text,
          headerTitleStyle: { fontFamily: theme.typography.fontFamily.bold },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen name="auth/callback" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  useFrameworkReady();
  const [ready, setReady] = useState<ReadyState>('loading');
  const [fontTimedOut, setFontTimedOut] = useState(false);
  const [bootKey] = useState(() => `shotconnect-${Date.now()}`);
  const initStartedRef = useRef(false);
  const splashHiddenRef = useRef(false);

  const [fontsLoaded, fontError] = useFonts({
    'PlusJakartaSans-Regular': PlusJakartaSans_400Regular,
    'PlusJakartaSans-Medium': PlusJakartaSans_500Medium,
    'PlusJakartaSans-SemiBold': PlusJakartaSans_600SemiBold,
    'PlusJakartaSans-Bold': PlusJakartaSans_700Bold,
  });

  const hideSplash = useCallback(() => {
    if (!splashHiddenRef.current) {
      splashHiddenRef.current = true;
      SplashScreen.hideAsync();
    }
  }, []);

  // Font timeout: if fonts don't resolve in 3s, proceed with system fonts
  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const id = setTimeout(() => setFontTimedOut(true), 3000);
    return () => clearTimeout(id);
  }, [fontsLoaded, fontError]);

  // Init effect: runs exactly once. The finally block is the sole
  // trigger for setReady('app'). A hard 4s outer timeout prevents
  // a hung native module from blocking the app forever.
  // Storage init was already kicked off at module scope — here we
  // await it in parallel with the web-only session purge and preview
  // refresh, which are independent and can overlap.
  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    const initPromise = (async () => {
      const storageTask = Promise.race([
        earlyStoragePromise,
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);

      const webTask = (async () => {
        purgeLegacyWebSession();
        refreshStalePreview();
      })();

      await Promise.all([storageTask, webTask]);
    })();

    const hardTimeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));

    Promise.race([initPromise, hardTimeout]).finally(() => {
      setReady('app');
      hideSplash();
    });
  }, [hideSplash]);

  // Deep link handling
  useEffect(() => {
    const handleDeepLink = (url: string) => {
      if (!url) return;
      if (url.includes('auth/callback') || url.includes('access_token') || url.includes('error=')) {
        WebBrowser.dismissBrowser();
      }
    };

    let sub: { remove: () => void } | null = null;
    if (typeof Linking.addEventListener === 'function') {
      sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    }
    if (typeof Linking.getInitialURL === 'function') {
      Linking.getInitialURL().then((url) => {
        if (url) handleDeepLink(url);
      }).catch(() => {});
    }

    return () => {
      sub?.remove();
    };
  }, []);

  const fontsReady = fontsLoaded || fontError || fontTimedOut;
  const isReady = fontsReady && ready !== 'loading';

  return (
    <ErrorBoundary>
      <I18nProvider>
        <AppThemeProvider>
          <AffiliateToastProvider>
            <SafeAreaProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <View key={bootKey} style={{ flex: 1 }}>
                  <AppShell />
                  <Suspense fallback={null}><NetworkBanner /></Suspense>
                  <Suspense fallback={null}><VideoJobRecoveryToast /></Suspense>
                  <StatusBar style="light" />
                </View>
              </GestureHandlerRootView>
            </SafeAreaProvider>
          </AffiliateToastProvider>
        </AppThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
