import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { ShoppingBag, Globe, Send, Plane, Hop as Home, ShoppingBasket, Mountain, Ticket, TreePalm as Palmtree } from 'lucide-react-native';
import { theme } from '@/lib/theme';

export type AffiliatePlatformKey =
  | 'Coupang'
  | 'Toss'
  | 'BrandConnect'
  | 'OliveYoung'
  | 'Zigzag'
  | 'TodayHouse'
  | 'Kurly'
  | 'AliExpress'
  | 'Amazon'
  | 'MyRealTrip'
  | 'Klook'
  | 'Custom';

interface AffiliatePlatformSwitchProps {
  selected: AffiliatePlatformKey;
  onSelect: (key: AffiliatePlatformKey) => void;
}

const PLATFORMS: { key: AffiliatePlatformKey; label: string; icon: typeof ShoppingBag; color: string }[] = [
  { key: 'Coupang', label: '쿠팡', icon: ShoppingBag, color: '#FF3E3E' },
  { key: 'Toss', label: '토스', icon: Send, color: '#0064FF' },
  { key: 'BrandConnect', label: '네이버', icon: Globe, color: '#03C75A' },
  { key: 'OliveYoung', label: '올리브영', icon: ShoppingBasket, color: '#1A1A1A' },
  { key: 'Zigzag', label: '지그재그', icon: ShoppingBag, color: '#FF4C00' },
  { key: 'TodayHouse', label: '오늘의집', icon: Home, color: '#35C5F0' },
  { key: 'Kurly', label: '컬리', icon: ShoppingBasket, color: '#5F0080' },
  { key: 'AliExpress', label: '알리', icon: Globe, color: '#FF4747' },
  { key: 'Amazon', label: '아마존', icon: Globe, color: '#FF9900' },
  { key: 'MyRealTrip', label: '마이리얼트립', icon: Palmtree, color: '#FF6B35' },
  { key: 'Klook', label: '클룩', icon: Ticket, color: '#FF5722' },
];

export function AffiliatePlatformSwitch({ selected, onSelect }: AffiliatePlatformSwitchProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>제휴 플랫폼 선택</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRowScroll}>
      <View style={styles.tabRow}>
        {PLATFORMS.map(({ key, label, icon: Icon, color }) => {
          const isActive = selected === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tab, isActive && styles.tabActive, isActive && { borderColor: color + '60' }]}
              onPress={() => onSelect(key)}
              activeOpacity={0.7}
            >
              <Icon
                size={15}
                color={isActive ? color : theme.colors.dark.textDim}
                strokeWidth={2}
              />
              <Text
                style={[styles.tabText, isActive && { color }]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  tabRowScroll: {
    paddingBottom: 4,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tab: {
    minWidth: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: theme.colors.dark.surface,
  },
  tabText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    flexShrink: 1,
  },
});
