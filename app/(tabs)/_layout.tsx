import { lazy, Suspense, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { Tabs } from 'expo-router';
import { theme } from '@/lib/theme';
import { PanelRightClose, PanelRightOpen } from 'lucide-react-native';
import { InspectorPanel, type BoundAffiliateLink } from '@/components/InspectorPanel';
import { InspectorContext, type InspectorContextValue, type InspectorMode } from '@/lib/inspectorContext';
import type { ToonCharacter } from '@/components/PhotoToonUpload';

const ScrollableTabBar = lazy(() =>
  import('@/components/ScrollableTabBar').then((m) => ({ default: m.ScrollableTabBar })),
);

function TabBarFallback() {
  return <View style={styles.fallback} />;
}

const isWeb = Platform.OS === 'web';

export default function TabLayout() {
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [boundLinks, setBoundLinks] = useState<BoundAffiliateLink[]>([]);
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>('affiliate');
  const [toonCharacter, setToonCharacter] = useState<ToonCharacter | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('veteran');
  const [toneLevel, setToneLevel] = useState(50);
  const toggleInspector = useCallback(() => setInspectorOpen((v) => !v), []);

  const handleLinkBound = useCallback((link: BoundAffiliateLink) => {
    setBoundLinks((prev) => [...prev.filter((b) => b.productId !== link.productId), link]);
  }, []);

  const ctxValue: InspectorContextValue = {
    boundLinks,
    selectedCutId,
    setSelectedCutId,
    inspectorMode,
    setInspectorMode,
    toonCharacter,
    setToonCharacter,
    selectedPresetId,
    setSelectedPresetId,
    toneLevel,
    setToneLevel,
  };

  return (
    <InspectorContext.Provider value={ctxValue}>
      <View style={styles.workspaceRoot}>
        {/* Center canvas — flex: 1 to fill space between sidebar and inspector */}
        <View style={styles.tabsWrapper}>
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
        </View>

        {/* Right inspector — collapsible, web only */}
        {isWeb && (
          <View style={[styles.inspector, inspectorOpen ? styles.inspectorOpen : styles.inspectorCollapsed]}>
            {inspectorOpen ? (
              <View style={styles.inspectorInner}>
                <View style={styles.inspectorHeader}>
                  <Text style={styles.inspectorTitle}>다이나믹 인스펙터</Text>
                  <Pressable onPress={toggleInspector} hitSlop={12}>
                    <PanelRightClose size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
                  </Pressable>
                </View>
                <View style={styles.inspectorContent}>
                  <InspectorPanel
                    visible
                    onClose={toggleInspector}
                    currentCutLabel={selectedCutId ? `만화 컷 ${selectedCutId}` : '현재 워크스페이스'}
                    onLinkBound={handleLinkBound}
                    inspectorMode={inspectorMode}
                    toonCharacter={toonCharacter}
                    selectedPresetId={selectedPresetId}
                    onPresetSelect={setSelectedPresetId}
                    toneLevel={toneLevel}
                    onToneChange={setToneLevel}
                  />
                </View>
              </View>
            ) : (
              <Pressable onPress={toggleInspector} style={styles.inspectorExpandBtn} hitSlop={12}>
                <PanelRightOpen size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
              </Pressable>
            )}
          </View>
        )}
      </View>
    </InspectorContext.Provider>
  );
}

const styles = StyleSheet.create({
  workspaceRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#121214',
    height: '100%',
  },
  tabsWrapper: {
    flex: 1,
  },
  fallback: {
    width: 64,
    backgroundColor: '#18181B',
  },
  inspector: {
    backgroundColor: '#18181B',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    height: '100%',
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
  inspectorInner: {
    flex: 1,
  },
  inspectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  inspectorTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  inspectorContent: {
    flex: 1,
  },
  inspectorExpandBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
