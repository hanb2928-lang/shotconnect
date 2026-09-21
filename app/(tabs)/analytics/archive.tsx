import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { theme } from '@/lib/theme';
import { ArchiveSection } from '@/components/ArchiveSection';
import { useSafeTop } from '@/hooks/useSafeTop';

export default function ArchiveScreen() {
  const router = useRouter();
  const safeTop = useSafeTop();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: safeTop + 8 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ChevronLeft size={22} color={theme.colors.dark.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>숏폼 보관함</Text>
        <View style={styles.backBtn} />
      </View>
      <ArchiveSection />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.dark.text,
  },
});
