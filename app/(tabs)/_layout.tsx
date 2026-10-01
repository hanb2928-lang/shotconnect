import { lazy, Suspense, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { Tabs } from 'expo-router';
import { theme } from '@/lib/theme';
import { PanelRightClose, PanelRightOpen } from 'lucide-react-native';
import { InspectorPanel, type BoundAffiliateLink } from '@/components/InspectorPanel';
import { InspectorContext, type InspectorContextValue, type InspectorMode, type ToonStyle, type ArtStyle, type InspectorCutData } from '@/lib/inspectorContext';
import type { ToonCharacter } from '@/components/PhotoToonUpload';

const ScrollableTabBar = lazy(() =>
  import('@/components/ScrollableTabBar').then((m) => ({ default: m.ScrollableTabBar })),
);

function TabBarFallback() {
  return null;
}

const isWeb = Platform.OS === 'web';

// Light palette — app defaults to studio-light theme
const C = theme.colors.light;

export default function TabLayout() {
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [boundLinks, setBoundLinks] = useState<BoundAffiliateLink[]>([]);
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [cuts, setCuts] = useState<InspectorCutData[]>([]);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>('affiliate');
  const [toonCharacter, setToonCharacter] = useState<ToonCharacter | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('veteran');
  const [toneLevel, setToneLevel] = useState(50);
  const [toonStyle, setToonStyle] = useState<ToonStyle>('color');
  const [artStyle, setArtStyle] = useState<ArtStyle>('digital-webtoon');
  const [batchToonTrigger, setBatchToonTrigger] = useState(0);
  const [batchTooning, setBatchTooning] = useState(false);
  const toggleInspector = useCallback(() => setInspectorOpen((v) => !v), []);
  const triggerBatchToon = useCallback(() => setBatchToonTrigger((n) => n + 1), []);

  const handleUpdateCut = useCallback((id: string, updates: Partial<Omit<InspectorCutData, 'id'>>) => {
    setCuts((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const selectedCutIndex = selectedCutId
    ? cuts.findIndex((c) => c.id === selectedCutId)
    : -1;

  const handleLinkBound = useCallback((link: BoundAffiliateLink) => {
    setBoundLinks((prev) => [...prev.filter((b) => b.productId !== link.productId), link]);
  }, []);

  const ctxValue: InspectorContextValue = {
    boundLinks,
    selectedCutId,
    setSelectedCutId,
    cuts,
    setCuts,
    onUpdateCut: handleUpdateCut,
    selectedCutIndex,
    inspectorMode,
    setInspectorMode,
    toonCharacter,
    setToonCharacter,
    selectedPresetId,
    setSelectedPresetId,
    toneLevel,
    setToneLevel,
    toonStyle,
    setToonStyle,
    artStyle,
    setArtStyle,
    batchToonTrigger,
    triggerBatchToon,
    batchTooning,
    setBatchTooning,
  };

  return (
    <InspectorContext.Provider value={ctxValue}>
      <View style={styles.workspaceRoot}>
        {/* Center canvas — full-width, no sidebar */}
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
            <Tabs.Screen name="assets" />
            <Tabs.Screen name="marketing" options={{ href: null }} />
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
                    <PanelRightClose size={18} color={C.textDim} strokeWidth={2} />
                  </Pressable>
                </View>
                <View style={styles.inspectorContent}>
                  <InspectorPanel
                    visible
                    onClose={toggleInspector}
                    currentCutLabel={selectedCutIndex >= 0 ? `${selectedCutIndex + 1}번째 컷 편집 모드` : '현재 워크스페이스'}
                    selectedCut={selectedCutIndex >= 0 ? cuts[selectedCutIndex] : undefined}
                    onUpdateCut={handleUpdateCut}
                    onLinkBound={handleLinkBound}
                    inspectorMode={inspectorMode}
                    toonCharacter={toonCharacter}
                    onCharacterCreated={setToonCharacter}
                    selectedPresetId={selectedPresetId}
                    onPresetSelect={setSelectedPresetId}
                    toneLevel={toneLevel}
                    onToneChange={setToneLevel}
                    toonStyle={toonStyle}
                    onToonStyleChange={setToonStyle}
                    artStyle={artStyle}
                    onArtStyleChange={setArtStyle}
                    onBatchToonApply={triggerBatchToon}
                    batchTooning={batchTooning}
                  />
                </View>
              </View>
            ) : (
              <Pressable onPress={toggleInspector} style={styles.inspectorExpandBtn} hitSlop={12}>
                <PanelRightOpen size={18} color={C.textDim} strokeWidth={2} />
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
    backgroundColor: C.bg,
    height: isWeb ? ('100vh' as any) : '100%',
  },
  tabsWrapper: {
    flex: 1,
    height: '100%',
  },
  fallback: {
    width: 0,
  },
  inspector: {
    backgroundColor: C.surface,
    borderLeftWidth: 1,
    borderLeftColor: C.border,
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
    height: '100%',
  },
  inspectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  inspectorTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: C.text,
  },
  inspectorContent: {
    flex: 1,
    height: '100%',
  },
  inspectorExpandBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
