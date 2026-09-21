import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import type {
  BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/lib/theme';
import { useI18n } from '@/hooks/useI18n';
import {
  Camera,
  Wand2,
  Folder,
  type LucideIcon,
} from 'lucide-react-native';

const TAB_ICONS: Record<string, LucideIcon> = {
  index: Camera,
  marketing: Wand2,
  assets: Folder,
};

const TAB_KEYS: Record<string, string> = {
  index: 'tab.camera',
  marketing: 'tab.create',
  assets: 'tab.library',
};

const DISABLED_TABS = new Set<string>(['marketing']);

const HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 };

export type TabBadgeMap = Record<string, boolean>;

export function ScrollableTabBar({ state, navigation, badges }: BottomTabBarProps & { badges?: TabBadgeMap }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const bottomPadding = Math.max(insets.bottom, 0);

  const visibleRoutes = state.routes.filter((route) => TAB_ICONS[route.name] !== undefined);

  return (
    <View style={[styles.container, { paddingBottom: 8 + bottomPadding }]}>
      <View style={styles.tabRow}>
        {visibleRoutes.map((route) => {
          const routeIndex = state.routes.findIndex((r) => r.name === route.name);
          const isFocused = state.index === routeIndex;
          const Icon = TAB_ICONS[route.name];
          const label = t(TAB_KEYS[route.name] || '', route.name);
          const hasBadge = badges?.[route.name] === true;
          const isDisabled = DISABLED_TABS.has(route.name);

          const onPress = () => {
            if (isDisabled) {
              Alert.alert('준비 중', '현재 준비 중인 기능입니다.');
              return;
            }

            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : isDisabled ? { disabled: true } : {}}
              onPress={onPress}
              activeOpacity={isDisabled ? 1 : 0.6}
              hitSlop={HIT_SLOP}
              style={styles.tabItem}
            >
              <View style={[styles.iconWrap, isFocused && !isDisabled && styles.iconWrapActive]}>
                <Icon
                  size={26}
                  color={isDisabled ? theme.colors.dark.textFaint : isFocused ? theme.colors.primary[400] : theme.colors.dark.textDim}
                  strokeWidth={isFocused && !isDisabled ? 2.5 : 2.2}
                  fill={isFocused && !isDisabled ? theme.colors.primary[400] + '3C' : 'transparent'}
                />
                {isDisabled && <View style={styles.disabledBadge}><Text style={styles.disabledBadgeText}>준비중</Text></View>}
                {hasBadge && !isDisabled && <View style={styles.tabBadgeDot} />}
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  isFocused && !isDisabled && styles.tabLabelActive,
                  isDisabled && styles.tabLabelDisabled,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {label}
              </Text>
              {isFocused && !isDisabled && <View style={styles.activeBar} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderTopColor: 'rgba(76, 125, 255, 0.12)',
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: 8,
    zIndex: 9000,
    elevation: 24,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    maxWidth: 120,
    alignItems: 'center',
    paddingVertical: 6,
    minHeight: 48,
    justifyContent: 'center',
  },
  iconWrap: {
    width: 54,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.full,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(76, 125, 255, 0.18)',
  },
  tabBadgeDot: {
    position: 'absolute',
    top: 4,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.error[400],
    borderWidth: 1.5,
    borderColor: theme.colors.dark.surface,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textFaint,
    marginTop: 6,
  },
  tabLabelActive: {
    color: theme.colors.primary[400],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  tabLabelDisabled: {
    opacity: 0.4,
  },
  disabledBadge: {
    position: 'absolute',
    top: 2,
    right: -2,
    backgroundColor: theme.colors.dark.border,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: theme.colors.dark.surface,
  },
  disabledBadgeText: {
    fontSize: 7,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textFaint,
    letterSpacing: 0.3,
  },
  activeBar: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.primary[400],
    marginTop: 4,
  },
});
