import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Package } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import type { DetectedProduct } from '@/types/database';

interface ProductSelectorProps {
  products: DetectedProduct[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function ProductSelector({ products, selectedIndex, onSelect }: ProductSelectorProps) {
  if (products.length <= 1) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Package size={14} color={theme.colors.primary[400]} strokeWidth={2} />
        <Text style={styles.label}>감지된 상품 {products.length}개</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {products.map((product, index) => {
          const isActive = index === selectedIndex;
          return (
            <TouchableOpacity
              key={product.id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onSelect(index)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.tabText, isActive && styles.tabTextActive]}
                numberOfLines={1}
              >
                {product.productName || `상품 ${index + 1}`}
              </Text>
              <Text
                style={[styles.tabCategory, isActive && styles.tabCategoryActive]}
                numberOfLines={1}
              >
                {product.productCategory}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  label: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scrollContent: {
    gap: theme.spacing.sm,
  },
  tab: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minWidth: 100,
    maxWidth: 160,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: theme.colors.primary[500] + '20',
    borderColor: theme.colors.primary[500],
  },
  tabText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  tabTextActive: {
    color: theme.colors.primary[300],
  },
  tabCategory: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 2,
  },
  tabCategoryActive: {
    color: theme.colors.primary[400],
  },
});
