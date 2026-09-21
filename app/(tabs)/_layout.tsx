import { lazy, Suspense } from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';

const ScrollableTabBar = lazy(() =>
  import('@/components/ScrollableTabBar').then((m) => ({ default: m.ScrollableTabBar })),
);

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      tabBar={(props) => (
        <Suspense fallback={<View style={{ height: 0 }} />}>
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
