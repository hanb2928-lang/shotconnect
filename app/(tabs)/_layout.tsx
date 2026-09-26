import { lazy, Suspense } from 'react';
import { View, StyleSheet, Platform, Dimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { theme } from '@/lib/theme';

const ScrollableTabBar = lazy(() =>
  import('@/components/ScrollableTabBar').then((m) => ({ default: m.ScrollableTabBar })),
);

function TabBarFallback() {
  return (
    <View style={styles.fallback} />
  );
}

const { width: screenWidth } = Dimensions.get('window');
const isDesktop = Platform.OS === 'web' && screenWidth >= 768;

export default function TabLayout() {
  return (
    <View style={styles.workspaceRoot}>
      <Tabs
        initialRouteName="index"
        tabBar={(props) => (
          <Suspense fallback={<TabBarFallback />}>
            <ScrollableTabBar {...props} badges={{}} />
          </Suspense>
        )}
        screenOptions={{
          headerShown: false,
          tabBarStyle: isDesktop
            ? { display: 'none' as const }
            : undefined,
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="marketing" />
        <Tabs.Screen name="assets" />
        {/* Hidden tabs — kept in route config but not shown in tab bar */}
        <Tabs.Screen name="affiliate" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  workspaceRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.dark.bg,
  },
  fallback: {
    height: 64,
    backgroundColor: theme.colors.dark.surface,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    borderTopWidth: 1,
  },
});
