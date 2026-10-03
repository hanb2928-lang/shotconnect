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
import { useBootState } from '@/hooks/useBootState';
import { useBootReady } from '@/hooks/useBootReady';
import { initStorage } from '@/lib/storage';
import { theme } from '@/lib/theme';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BootFallback } from '@/components/BootFallback';
import { LoadingScreen } from '@/components/LoadingScreen';
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
import { sweepStaleOfflineCache } from '@/lib/offlineCache';
import { runBootSweep } from '@/lib/bootSweeper';
import { installProactiveMemoryFlush } from '@/lib/proactiveMemoryFlush';
import { registerDefaultFlushHandlers } from '@/lib/flushHandlers';

installGlobalErrorHandlers();

// Defer all heavy init to after first render so the splash → app
// transition is not blocked by IndexedDB warmup, pressure monitoring
// setup, or flush handler registration. requestIdleCallback schedules
// the work in the browser's idle phase; setTimeout(0) is the fallback
// for environments without ric (native, older browsers).
function scheduleIdle(fn: () => void): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(fn);
  } else {
    setTimeout(fn, 0);
  }
}

scheduleIdle(() => {
  installMediaCacheLifecycleHook();
  startPressureMonitoring();
  registerDefaultFlushHandlers();
  installProactiveMemoryFlush();
});

// GC sweeps run after the app is fully interactive. They clean up
// orphaned Blob URLs, temp files, stale IndexedDB media cache, and
// stale LocalStorage offline cache from previous sessions.
scheduleIdle(() => {
  sweepTempFiles().catch(() => {});
  sweepStaleOfflineCache().catch(() => {});
  runBootSweep().catch(() => {});
});

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sweepTempFiles().catch(() => {});
      sweepStaleOfflineCache().catch(() => {});
    }
  });
} else if (Platform.OS !== 'web') {
  const RUNTIME_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(() => {
    sweepTempFiles().catch(() => {});
  }, RUNTIME_SWEEP_INTERVAL_MS);
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
    // Clear the stale boot marker so the reloaded page starts a fresh
    // boot sequence instead of skipping the splash due to an old marker.
    window.sessionStorage.removeItem('shotconnect-boot-session');
    window.sessionStorage.removeItem('shotconnect-boot-version');
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
  const { phase: bootPhase, isFreshBoot, markBooted } = useBootState();
  const [ready, setReady] = useState<ReadyState>('loading');
  const [fontTimedOut, setFontTimedOut] = useState(false);
  const [bootKey] = useState(() => `shotconnect-${Date.now()}`);
  const initStartedRef = useRef(false);
  const splashHiddenRef = useRef(false);
  const bootReadyMarkedRef = useRef(false);

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

  // Font timeout: if fonts don't resolve in 1s, proceed with system fonts.
  // On web, font-display:swap (injected below) already lets text render
  // with system fonts while the web font loads, so this timeout is a
  // safety net rather than the primary strategy.
  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const id = setTimeout(() => setFontTimedOut(true), 1000);
    return () => clearTimeout(id);
  }, [fontsLoaded, fontError]);

  // Web: inject font-display:swap so the browser renders text with system
  // fonts immediately and swaps in the custom font once it loads. This
  // eliminates FOIT (flash of invisible text) and removes font loading
  // from the critical boot path.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const styleId = 'font-display-swap';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = '@font-face { font-display: swap; }';
    document.head.appendChild(style);
  }, []);

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
        new Promise<void>((resolve) => setTimeout(resolve, 1000)),
      ]);

      const webTask = (async () => {
        purgeLegacyWebSession();
        if (isFreshBoot) refreshStalePreview();
      })();

      await Promise.all([storageTask, webTask]);
    })();

    const hardTimeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));

    Promise.race([initPromise, hardTimeout]).finally(() => {
      setReady('app');
      markBooted();
    });
  }, [hideSplash, markBooted, isFreshBoot]);

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

  const fontsReady = fontsLoaded || !!fontError || fontTimedOut;
  const { isBootReady } = useBootReady({ fontsReady, bootPhase });

  const isReady = isBootReady && ready !== 'loading';

  // Smooth splash → app transition using requestAnimationFrame.
  // Without this, hiding the native splash and mounting AppShell happen
  // in the same render cycle — the splash fade and the DOM reflow from
  // AppShell's canvas/layout work compete for the same frame, causing a
  // visible jank. Double rAF separates them into clean paint phases:
  //   Frame 1: hide native splash → LoadingScreen is already painted underneath
  //   Frame 2: browser has composited the frame without the splash overlay
  //   Frame 3: mount AppShell — reflow happens on a settled compositor
  const [shellReady, setShellReady] = useState(false);
  useEffect(() => {
    if (!isReady || shellReady) return;
    if (bootReadyMarkedRef.current) return;
    bootReadyMarkedRef.current = true;

    if (Platform.OS === 'web' && typeof requestAnimationFrame !== 'undefined') {
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        hideSplash();
        raf2 = requestAnimationFrame(() => setShellReady(true));
      });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }

    hideSplash();
    setShellReady(true);
  }, [isReady, shellReady, hideSplash]);

  return (
    <ErrorBoundary>
      <I18nProvider>
        <AppThemeProvider>
          <AffiliateToastProvider>
            <SafeAreaProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <View key={bootKey} style={{ flex: 1 }}>
                  {!shellReady && <LoadingScreen fullScreen />}
                  {shellReady && (
                    <>
                      <AppShell />
                      <Suspense fallback={<BootFallback />}><NetworkBanner /></Suspense>
                      <Suspense fallback={<BootFallback />}><VideoJobRecoveryToast /></Suspense>
                    </>
                  )}
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
