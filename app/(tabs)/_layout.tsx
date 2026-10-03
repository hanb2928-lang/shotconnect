import { lazy, Suspense } from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { BootFallback } from '@/components/BootFallback';

const ScrollableTabBar = lazy(() =>
  import('@/components/ScrollableTabBar').then((m) => ({ default: m.ScrollableTabBar })),
);

export default function TabLayout() {
  return (
    <View style={styles.workspaceRoot}>
        <View style={styles.tabsWrapper}>
          <Tabs
            initialRouteName="index"
            tabBar={(props) => (
              <Suspense fallback={<BootFallback />}>
                <ScrollableTabBar {...props} badges={{}} />
              </Suspense>
            )}
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
            }}
          >
            <Tabs.Screen name="index" />
            <Tabs.Screen name="marketing" />
            <Tabs.Screen name="assets" />
            <Tabs.Screen name="affiliate" options={{ href: null }} />
            <Tabs.Screen name="analytics" options={{ href: null }} />
          </Tabs>
        </View>

      </View>
  );
}

const styles = StyleSheet.create({
  workspaceRoot: {
    flex: 1,
    height: '100%',
  },
  tabsWrapper: {
    flex: 1,
    height: '100%',
  },
});
