import { lazy, Suspense } from 'react';
import { View, StyleSheet } from 'react-native';
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

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      tabBar={(props) => (
        <Suspense fallback={<TabBarFallback />}>
          <ScrollableTabBar {...props} badges={{}} />
        </Suspense>
      )}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="marketing" />
      <Tabs.Screen name="assets" />
      {/* Hidden tabs — kept in route config but not shown in tab bar */}
      <Tabs.Screen name="affiliate" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fallback: {
    height: 64,
    backgroundColor: theme.colors.dark.surface,
    borderTopColor: 'rgba(76, 125, 255, 0.12)',
    borderTopWidth: 1,
  },
});
