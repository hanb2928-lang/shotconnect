import { useState, useCallback } from 'react';
import { SafeLazyLoad } from '@/components/ErrorBoundary';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Film, ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { theme } from '@/lib/theme';
import { useSafeTop } from '@/hooks/useSafeTop';
import { useTabBarHeight } from '@/hooks/useTabBarHeight';
import { ArchiveSection } from '@/components/ArchiveSection';

function VideosScreenInner() {
  const router = useRouter();
  const safeTop = useSafeTop();
  const tabBarHeight = useTabBarHeight();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <Film size={20} color={theme.colors.primary[400]} strokeWidth={2.2} />
            <Text style={styles.title}>My Videos</Text>
          </View>
          <Text style={styles.subtitle}>생성한 AI 숏폼을 언제든 다시 감상하세요</Text>
        </View>
      </View>
      <View style={{ flex: 1, paddingBottom: tabBarHeight }}>
        <ArchiveSection embedded />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerLeft: {
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
});

export default function VideosScreen() {
  return (
    <SafeLazyLoad>
      <VideosScreenInner />
    </SafeLazyLoad>
  );
}
