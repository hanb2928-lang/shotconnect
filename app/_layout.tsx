import { useEffect, useRef, useState } from 'react';
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

// Install as early as possible, before any async work
installGlobalErrorHandlers();

SplashScreen.preventAutoHideAsync();

type ReadyState = 'loading' | 'app' | 'error';

function useSafeKeepAwake() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    activateKeepAwakeAsync('screen').catch(() => {});
    return () => { active = false; };
  }, []);
}

export default function RootLayout() {
  useFrameworkReady();
  useSafeKeepAwake();
  const { t } = useI18n();
  const [ready, setReady] = useState<ReadyState>('loading');
  const startedRef = useRef(false);

  const [fontsLoaded, fontError] = useFonts({
    'PlusJakartaSans-Regular': PlusJakartaSans_400Regular,
    'PlusJakartaSans-Medium': PlusJakartaSans_500Medium,
    'PlusJakartaSans-SemiBold': PlusJakartaSans_600SemiBold,
    'PlusJakartaSans-Bold': PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        await initStorage();
        preloadTemplates().catch(() => {});
        if (fontError && !fontsLoaded) {
          setReady('error');
        } else {
          setReady('app');
        }
        SplashScreen.hideAsync();
      } catch {
        startedRef.current = false;
        setReady('error');
        SplashScreen.hideAsync();
      }
    })();
  }, [fontsLoaded, fontError]);

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

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.dark.bg, gap: theme.spacing.md }}>
        <ActivityIndicator size="large" color={theme.colors.primary[400]} />
        <Text style={{ fontSize: 14, color: theme.colors.dark.textDim }}>{t('app.loading')}</Text>
      </View>
    );
  }

  if (ready === 'loading') {
    return <LoadingScreen message={t('app.loading')} />;
  }

  if (ready === 'error') {
  const retryInit = () => {
    startedRef.current = false;
    setReady('loading');
  };
    return (
      <ErrorBoundary>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.dark.bg, paddingHorizontal: 40, gap: 12 }}>
          <Text style={{ fontSize: 18, fontFamily: theme.typography.fontFamily.bold, color: theme.colors.dark.text, marginBottom: 4 }}>
            {t('app.error.title')}
          </Text>
          <Text style={{ fontSize: 14, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, textAlign: 'center', lineHeight: 22 }}>
            {t('app.error.desc')}
          </Text>
          <TouchableOpacity
            style={{ marginTop: 12, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10, backgroundColor: theme.colors.primary[500] }}
            onPress={retryInit}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 15, fontFamily: theme.typography.fontFamily.bold, color: '#fff' }}>{t('app.error.retry')}</Text>
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
