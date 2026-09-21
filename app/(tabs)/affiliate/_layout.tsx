import { View, StyleSheet, TouchableOpacity, Text, ScrollView, Platform } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ShoppingBag, Flame, History, Sprout, Link2, LayoutGrid, ChartBar as BarChart3 } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SUBTABS = [
  { key: 'index', label: '제휴', icon: ShoppingBag },
  { key: 'trending', label: '인기', icon: Flame },
  { key: 'history', label: '기록', icon: History },
  { key: 'warmup', label: '육성', icon: Sprout },
  { key: 'links', label: '링크', icon: Link2 },
  { key: 'assets', label: '소재', icon: LayoutGrid },
  { key: 'dashboard', label: '분석', icon: BarChart3 },
] as const;

function SubTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  const currentSegment = pathname.split('/').pop() || 'index';
  const activeKey = currentSegment === 'affiliate' ? 'index' : currentSegment;

  useEffect(() => {
    const activeIndex = SUBTABS.findIndex((t) => t.key === activeKey);
    if (activeIndex >= 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ x: Math.max(0, activeIndex * 76 - 60), animated: true });
    }
  }, [activeKey]);

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 0) }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {SUBTABS.map(({ key, label, icon: Icon }) => {
          const isActive = activeKey === key;
          return (
            <TouchableOpacity
              key={key}
              style={styles.pillItem}
              onPress={() => {
                if (key === 'index') {
                  router.replace('/(tabs)/affiliate');
                } else {
                  router.replace(`/(tabs)/affiliate/${key}`);
                }
              }}
              activeOpacity={0.65}
            >
              <View
                style={[
                  styles.pill,
                  isActive && styles.pillActive,
                ]}
              >
                <Icon
                  size={16}
                  color={isActive ? theme.colors.primary[300] : theme.colors.dark.textDim}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <Text
                  style={[styles.pillLabel, isActive && styles.pillLabelActive]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function AffiliateLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: Platform.select({ ios: 'fade', default: 'none' }),
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="trending" />
        <Stack.Screen name="history" />
        <Stack.Screen name="warmup" />
        <Stack.Screen name="links" />
        <Stack.Screen name="assets" />
        <Stack.Screen name="dashboard" />
      </Stack>
      <SubTabBar />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderTopColor: theme.colors.dark.border,
    borderTopWidth: 1,
    paddingTop: 4,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    ...(Platform.OS === 'web'
      ? { backdropFilter: 'blur(16px)' as unknown as undefined }
      : {}),
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 4,
  },
  pillItem: {
    paddingVertical: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    backgroundColor: 'transparent',
  },
  pillActive: {
    backgroundColor: theme.colors.primary[500] + '24',
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '40',
  },
  pillLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textFaint,
  },
  pillLabelActive: {
    color: theme.colors.primary[300],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
});
