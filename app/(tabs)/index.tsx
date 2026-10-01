import { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '@/lib/theme';
import { ToonModeEditor } from '@/components/ToonModeEditor';
import { CreditPurchaseModal } from '@/components/CreditPurchaseModal';
import type { BoundAffiliateLink } from '@/components/InspectorPanel';
import {
  InspectorContext,
  type InspectorContextValue,
  type InspectorMode,
  type ToonStyle,
  type ArtStyle,
  type InspectorCutData,
} from '@/lib/inspectorContext';
import type { ToonCharacter } from '@/components/PhotoToonUpload';

const C = theme.colors.light;

export default function CameraScreen() {
  const [creditModalVisible, setCreditModalVisible] = useState(false);
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

  const handleUpdateCut = useCallback((id: string, updates: Partial<Omit<InspectorCutData, 'id'>>) => {
    setCuts((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const triggerBatchToon = useCallback(() => setBatchToonTrigger((n) => n + 1), []);

  const selectedCutIndex = selectedCutId
    ? cuts.findIndex((c) => c.id === selectedCutId)
    : -1;

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
      <View style={styles.container}>
        <ToonModeEditor
          visible
          onClose={() => {}}
          boundLinks={boundLinks}
          onCutSelected={(cutId) => setSelectedCutId(cutId)}
          toonCharacter={toonCharacter}
          onCharacterCreated={(char) => {
            setToonCharacter(char);
            setInspectorMode('persona');
          }}
        />
        <CreditPurchaseModal
          visible={creditModalVisible}
          onClose={() => setCreditModalVisible(false)}
        />
      </View>
    </InspectorContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
});
