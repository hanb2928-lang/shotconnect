import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator, Linking, RefreshControl } from 'react-native';
import { ShoppingBag, ExternalLink, Link2 } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { theme } from '@/lib/theme';
import { getLinkInBioBySlug, getProductsForLinkInBio, type LinkInBioPage, type LinkInBioProduct } from '@/lib/linkInBio';

export default function LinkInBioPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [page, setPage] = useState<LinkInBioPage | null>(null);
  const [products, setProducts] = useState<LinkInBioProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async (isRefresh: boolean = false) => {
    if (!slug) {
      setLoading(false);
      return;
    }
    try {
      if (isRefresh) setRefreshing(true);

      // Parallel fetch: page metadata + products can start as soon as we have the slug
      // For the first load, we need the page first to get scan_ids
      // But we can prefetch images in parallel once products are loaded
      const p = await getLinkInBioBySlug(slug);
      if (!p) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setPage(p);

      const prods = await getProductsForLinkInBio(p.scan_ids);
      setProducts(prods);

      // Prefetch images for faster rendering
      prods.forEach((prod) => {
        if (prod.image_url && Image.prefetch) {
          Image.prefetch(prod.image_url).catch(() => {});
        }
      });
    } catch {
      // silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleImageLoad = useCallback((scanId: string) => {
    setImageLoaded((prev) => ({ ...prev, [scanId]: true }));
  }, []);

  const handleRefresh = useCallback(() => {
    loadData(true);
  }, [loadData]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent[400]} />
        <Text style={styles.loadingText}>페이지를 불러오는 중...</Text>
      </View>
    );
  }

  if (!page) {
    return (
      <View style={styles.centerContainer}>
        <Link2 size={48} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
        <Text style={styles.notFoundTitle}>페이지를 찾을 수 없어요</Text>
        <Text style={styles.notFoundDesc}>링크를 다시 확인해주세요.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.accent[400]} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          <ShoppingBag size={24} color="#fff" strokeWidth={2} />
        </View>
        <Text style={styles.pageTitle}>{page.title}</Text>
        {page.bio ? <Text style={styles.pageBio}>{page.bio}</Text> : null}
        <Text style={styles.productCount}>상품 {products.length}개</Text>
      </View>

      {/* Product grid */}
      <View style={styles.grid}>
        {products.map((product) => (
          <TouchableOpacity
            key={product.scan_id}
            style={styles.card}
            onPress={() => {
              const url = product.short_url || product.affiliate_url;
              if (url) Linking.openURL(url).catch(() => {});
            }}
            activeOpacity={0.8}
          >
            <View style={styles.cardImageWrap}>
              <Image
                source={{ uri: product.image_url }}
                style={styles.cardImage}
                resizeMode="cover"
                onLoad={() => handleImageLoad(product.scan_id)}
              />
              {!imageLoaded[product.scan_id] && (
                <View style={styles.imagePlaceholder}>
                  <ActivityIndicator size="small" color={theme.colors.dark.textFaint} />
                </View>
              )}
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={2}>{product.product_name || '상품'}</Text>
              {product.price_estimate ? (
                <Text style={styles.cardPrice}>{product.price_estimate}</Text>
              ) : null}
              <View style={styles.cardLinkRow}>
                <ExternalLink size={11} color={theme.colors.accent[400]} strokeWidth={2} />
                <Text style={styles.cardLinkText}>구매하러 가기</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {products.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>아직 등록된 상품이 없어요.</Text>
        </View>
      )}

      <Text style={styles.footer}>숏커넥트로 생성됨</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  scrollContent: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    gap: 8,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.accent[500],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  pageBio: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  productCount: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.accent[400],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 12,
  },
  card: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  cardImageWrap: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    padding: 12,
    gap: 4,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    lineHeight: 18,
  },
  cardPrice: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.accent[400],
  },
  cardLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  cardLinkText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.accent[400],
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  notFoundTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  notFoundDesc: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 30,
  },
});
