import { View, StyleSheet } from 'react-native';
import { theme } from '@/lib/theme';
import { ToonModeEditor } from '@/components/ToonModeEditor';
import { useInspectorContext } from '@/lib/inspectorContext';
import { CreditPurchaseModal } from '@/components/CreditPurchaseModal';
import { useState } from 'react';

const C = theme.colors.light;

export default function CameraScreen() {
  const inspectorCtx = useInspectorContext();
  const [creditModalVisible, setCreditModalVisible] = useState(false);

  return (
    <View style={styles.container}>
      <ToonModeEditor
        visible
        onClose={() => {}}
        boundLinks={inspectorCtx.boundLinks}
        onCutSelected={(cutId) => inspectorCtx.setSelectedCutId(cutId)}
        toonCharacter={inspectorCtx.toonCharacter}
        onCharacterCreated={(char) => {
          inspectorCtx.setToonCharacter(char);
          inspectorCtx.setInspectorMode('persona');
        }}
      />
      <CreditPurchaseModal
        visible={creditModalVisible}
        onClose={() => setCreditModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
});
