import { useState, useCallback, useRef, useEffect, useMemo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
  Dimensions,
  Animated as RNAnimated,
} from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { LazySection } from '@/components/LazySection';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type ScanMode = 'single' | 'multi' | 'template';

export type MediaType = 'image' | 'video' | 'both';

export type FeatureTile = {
  key: string;
  label: string;
  description?: string;
  icon: ReactNode;
  category: string;
  modes?: ScanMode[];
  mediaType?: MediaType;
  render: () => ReactNode;
};

export type FeatureCategory = {
  key: string;
  label: string;
  tiles: FeatureTile[];
};

type Props = {
  categories: FeatureCategory[];
  scanMode?: ScanMode;
  focusTileKey?: string | null;
  onFocusConsumed?: () => void;
  mediaFilter?: MediaType;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_GAP = theme.spacing.sm;
const CARD_MIN_WIDTH = Math.max(150, (SCREEN_WIDTH - theme.spacing.lg * 2 - CARD_GAP * 2) / 3);

export function FeatureTileGrid({ categories, scanMode, focusTileKey, onFocusConsumed, mediaFilter }: Props) {
  const [activeCategory, setActiveCategory] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const tabScrollRef = useRef<ScrollView>(null);
  const indicatorX = useRef(new RNAnimated.Value(0)).current;
  const isFirstRender = useRef(true);

  const selectCategory = useCallback((index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveCategory(index);
  }, []);

  const toggle = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  const filteredCategories = useMemo(() => {
    return categories
      .map((cat) => ({
        ...cat,
        tiles: cat.tiles.filter((tile) => {
          if (scanMode && tile.modes && !tile.modes.includes(scanMode)) return false;
          if (mediaFilter && tile.mediaType && tile.mediaType !== 'both' && tile.mediaType !== mediaFilter) return false;
          return true;
        }),
      }))
      .filter((cat) => cat.tiles.length > 0);
  }, [categories, scanMode, mediaFilter]);

  const currentCategory = filteredCategories[activeCategory] ?? filteredCategories[0];

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
    }
    if (currentCategory && currentCategory.tiles.length > 0) {
      setExpandedKey(currentCategory.tiles[0].key);
    }
  }, [currentCategory]);

  useEffect(() => {
    if (!focusTileKey) return;
    const catIndex = filteredCategories.findIndex((cat) =>
      cat.tiles.some((t) => t.key === focusTileKey),
    );
    if (catIndex < 0) return;
    if (catIndex !== activeCategory) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setActiveCategory(catIndex);
    }
    setExpandedKey(focusTileKey);
    onFocusConsumed?.();
  }, [focusTileKey]);

  return (
    <View style={styles.wrap}>
      <View style={styles.tabBarContainer}>
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarScroll}
        >
          {filteredCategories.map((category, index) => {
            const isActive = index === activeCategory;
            return (
              <TouchableOpacity
                key={category.key}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => selectCategory(index)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.tabLabel, isActive && styles.tabLabelActive]}
                  numberOfLines={1}
                >
                  {category.label}
                </Text>
                <View style={[styles.tabDot, isActive && styles.tabDotActive]} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.gridContainer}>
        <View style={styles.cardGrid}>
          {currentCategory.tiles.map((tile) => {
            const isExpanded = expandedKey === tile.key;
            return (
              <TouchableOpacity
                key={tile.key}
                style={[
                  styles.card,
                  isExpanded && styles.cardExpanded,
                  expandedKey && !isExpanded && styles.cardDimmed,
                ]}
                onPress={() => toggle(tile.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.cardIconWrap, isExpanded && styles.cardIconWrapActive]}>
                  {tile.icon}
                </View>
                <View style={styles.cardTextWrap}>
                  <Text
                    style={[styles.cardLabel, isExpanded && styles.cardLabelActive]}
                    numberOfLines={1}
                  >
                    {tile.label}
                  </Text>
                  {tile.description ? (
                    <Text style={styles.cardDesc} numberOfLines={1}>
                      {tile.description}
                    </Text>
                  ) : null}
                </View>
                <ChevronDown
                  size={14}
                  color={isExpanded ? theme.colors.primary[300] : theme.colors.dark.textFaint}
                  strokeWidth={2.5}
                  style={isExpanded ? styles.chevronRotated : undefined}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {expandedKey && (
          <LazySection delayMs={50}>
            <View style={styles.expandedPanel}>
              {currentCategory.tiles
                .filter((t) => t.key === expandedKey)
                .map((t) => (
                  <View key={t.key}>
                    {t.description ? (
                      <Text style={styles.expandedDesc}>{t.description}</Text>
                    ) : null}
                    {t.render()}
                  </View>
                ))}
            </View>
          </LazySection>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: theme.spacing.md,
  },
  tabBarContainer: {
    flexDirection: 'row',
  },
  tabBarScroll: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingVertical: 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surface,
    ...theme.shadows.card,
  },
  tabActive: {
    backgroundColor: theme.colors.primary[500] + '18',
    borderWidth: 1.5,
    borderColor: theme.colors.primary[400] + '60',
  },
  tabLabel: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  tabLabelActive: {
    color: theme.colors.primary[300],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  tabDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.dark.textFaint,
  },
  tabDotActive: {
    backgroundColor: theme.colors.primary[400],
  },
  gridContainer: {
    gap: theme.spacing.sm,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minWidth: CARD_MIN_WIDTH,
    flex: 1,
    ...theme.shadows.card,
  },
  cardTextWrap: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
  },
  cardExpanded: {
    backgroundColor: theme.colors.primary[500] + '15',
    borderWidth: 1.5,
    borderColor: theme.colors.primary[400] + '50',
  },
  cardDimmed: {
    opacity: 0.5,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardIconWrapActive: {
    backgroundColor: theme.colors.primary[500] + '25',
  },
  cardLabel: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  cardDesc: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    lineHeight: 13,
  },
  cardLabelActive: {
    color: theme.colors.primary[300],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  chevronRotated: {
    transform: [{ rotate: '180deg' }],
  },
  expandedPanel: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.elevated,
  },
  expandedDesc: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
    marginBottom: theme.spacing.sm,
  },
});
