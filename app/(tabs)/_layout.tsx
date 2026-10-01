import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { theme } from '@/lib/theme';

const C = theme.colors.light;

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="assets" options={{ href: null }} />
      <Tabs.Screen name="marketing" options={{ href: null }} />
      <Tabs.Screen name="affiliate" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
});
