import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Linking, Platform } from 'react-native';
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
import { activateKeepAwakeAsync } from 'expo-keep-awake';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { initStorage } from '@/lib/storage';
import { preloadTemplates } from '@/lib/templateRegistry';
import { theme } from '@/lib/theme';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AffiliateToastProvider } from '@/components/AffiliateToast';
import { NetworkBanner } from '@/components/NetworkBanner';
import { VideoJobRecoveryToast } from '@/components/VideoJobRecoveryToast';
import { I18nProvider, useI18n } from '@/hooks/useI18n';
import { AppThemeProvider } from '@/hooks/useAppTheme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { installGlobalErrorHandlers } from '@/lib/errorLogger';

installGlobalErrorHandlers();

SplashScreen.preventAutoHideAsync();

type ReadyState = 'loading' | 'app' | 'error';

const LOADING_TEXT = '로딩 중...';
const ERROR_TITLE = '문제가 발생했어요';
const ERROR_DESC = '예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
const RETRY_TEXT = '다시 시도';

function useSafeKeepAwake() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    activateKeepAwakeAsync('screen').catch(() => {});
    return () => {};
  }, []);
}

function AppShell() {
  const { t } = useI18n();

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }}>
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
  useSafeKeepAwake();
  const [ready, setReady] = useState<ReadyState>('loading');
  const [fontTimedOut, setFontTimedOut] = useState(false);
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

  // Font timeout: if fonts don't resolve in 6s, proceed with system fonts
  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const id = setTimeout(() => setFontTimedOut(true), 6000);
    return () => clearTimeout(id);
  }, [fontsLoaded, fontError]);

  // Init effect: runs exactly once, independent of font state
  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    const timeoutId = setTimeout(() => {
      setReady('app');
      hideSplash();
    }, 8000);

    (async () => {
      try {
        await Promise.race([
          initStorage(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('storage timeout')), 5000)),
        ]);
      } catch {
        // storage init failed — app can still run with in-memory state
      }

      preloadTemplates().catch(() => {});

      clearTimeout(timeoutId);
      setReady('app');
      hideSplash();
    })();

    return () => clearTimeout(timeoutId);
  }, [hideSplash]);

  // Deep link handling
  useEffect(() => {
    const handleDeepLink = (url: string) => {
      if (!url) return;
      if (url.includes('auth/callback') || url.includes('access_token') || url.includes('error=')) {
        WebBrowser.dismissBrowser();
      }
    };

    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    return () => {
      sub.remove();
    };
  }, []);

  const fontsReady = fontsLoaded || fontError || fontTimedOut;

  // Font loading gate — shows spinner until fonts resolve or timeout
  if (!fontsReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.dark.bg, gap: theme.spacing.md }}>
        <ActivityIndicator size="large" color={theme.colors.primary[400]} />
        <Text style={{ fontSize: 14, color: theme.colors.dark.textDim }}>{LOADING_TEXT}</Text>
      </View>
    );
  }

  // Init loading gate — shows loading screen until storage/template init completes
  if (ready === 'loading') {
    return <LoadingScreen message={LOADING_TEXT} />;
  }

  // Error gate — init failed completely
  if (ready === 'error') {
    const retryInit = () => {
      initStartedRef.current = false;
      setReady('loading');
    };
    return (
      <ErrorBoundary>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.dark.bg, paddingHorizontal: 40, gap: 12 }}>
          <Text style={{ fontSize: 18, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.dark.text, marginBottom: 4 }}>
            {ERROR_TITLE}
          </Text>
          <Text style={{ fontSize: 14, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, textAlign: 'center', lineHeight: 22 }}>
            {ERROR_DESC}
          </Text>
          <TouchableOpacity
            style={{ marginTop: 12, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10, backgroundColor: theme.colors.primary[500] }}
            onPress={retryInit}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 15, fontFamily: theme.typography.fontFamily.bold, color: '#fff' }}>{RETRY_TEXT}</Text>
          </TouchableOpacity>
        </View>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <I18nProvider>
        <AppThemeProvider>
          <AffiliateToastProvider>
            <SafeAreaProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <AppShell />
                <NetworkBanner />
                <VideoJobRecoveryToast />
                <StatusBar style="light" />
              </GestureHandlerRootView>
            </SafeAreaProvider>
          </AffiliateToastProvider>
        </AppThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
