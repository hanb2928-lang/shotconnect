import { lazy, Suspense, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { Tabs } from 'expo-router';
import { theme } from '@/lib/theme';
import { PanelRightClose, PanelRightOpen } from 'lucide-react-native';

const ScrollableTabBar = lazy(() =>
  import('@/components/ScrollableTabBar').then((m) => ({ default: m.ScrollableTabBar })),
);

function TabBarFallback() {
  return <View style={styles.fallback} />;
}

const isWeb = Platform.OS === 'web';

export default function TabLayout() {
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const toggleInspector = useCallback(() => setInspectorOpen((v) => !v), []);

  return (
    <View style={styles.workspaceRoot}>
      {/* Left sidebar + center canvas — managed by Tabs + custom tabBar */}
      <Tabs
        initialRouteName="index"
        tabBar={(props) => (
          <Suspense fallback={<TabBarFallback />}>
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

      {/* Right inspector — collapsible, web only */}
      {isWeb && (
        <View style={[styles.inspector, inspectorOpen ? styles.inspectorOpen : styles.inspectorCollapsed]}>
          {inspectorOpen ? (
            <>
              <View style={styles.inspectorHeader}>
                <Text style={styles.inspectorTitle}>AI 프롬프트</Text>
                <Pressable onPress={toggleInspector} hitSlop={12}>
                  <PanelRightClose size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
                </Pressable>
              </View>
              <View style={styles.inspectorBody}>
                <Text style={styles.inspectorHint}>
                  프롬프트와 퍼블리싱 옵션은 여기에 표시됩니다.
                </Text>
              </View>
            </>
          ) : (
            <Pressable onPress={toggleInspector} style={styles.inspectorExpandBtn} hitSlop={12}>
              <PanelRightOpen size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  workspaceRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0A0A0B',
  },
  fallback: {
    width: 64,
    backgroundColor: '#131316',
  },
  inspector: {
    backgroundColor: '#131316',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  inspectorOpen: {
    width: 320,
  },
  inspectorCollapsed: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 16,
  },
  inspectorExpandBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inspectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  inspectorTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  inspectorBody: {
    padding: 20,
  },
  inspectorHint: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    lineHeight: 18,
  },
});
