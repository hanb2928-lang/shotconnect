import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  RefreshControl,
  Modal,
  Platform as RNPlatform,
  Alert,
} from 'react-native';
import { ExternalLink, ShoppingBag, ChevronRight, Flame, Star, Globe, Lightbulb, ArrowUp, ArrowDown, Minus, Sparkles, Copy, Check, X, Youtube, Wand as Wand2, Send, Hop as Home, ShoppingBasket, TreePalm as Palmtree, Ticket } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { supabase, KEYWORD_TRENDS_URL, supabaseAnonKey } from '@/lib/supabase';
import * as Clipboard from 'expo-clipboard';
import { useSubTabBarHeight } from '@/hooks/useSubTabBarHeight';
import { useSafeTop } from '@/hooks/useSafeTop';
import { useRouter } from 'expo-router';

type Marketplace = 'coupang' | 'naver' | 'toss';
type ViewMode = 'products' | 'keywords';

type ProductPlatformKey =
  | 'coupang'
  | 'naver'
  | 'toss'
  | 'oliveyoung'
  | 'ablely'
  | 'zigzag'
  | 'todayhouse'
  | 'kurly'
  | 'aliexpress'
  | 'myrealtrip'
  | 'klook';

const PRODUCT_PLATFORM_META: Record<ProductPlatformKey, { label: string; color: string; icon: typeof ShoppingBag; sub: string }> = {
  coupang: { label: '쿠팡', color: '#FF3E3E', icon: ShoppingBag, sub: '실시간 베스트셀러' },
  naver: { label: '네이버', color: '#03C75A', icon: Globe, sub: '실시간 트렌드' },
  toss: { label: '토스', color: '#0064FF', icon: Send, sub: '토스 쇼핑 인기상품' },
  oliveyoung: { label: '올리브영', color: '#1A1A1A', icon: ShoppingBasket, sub: '뷰티 베스트' },
  ablely: { label: '에이블리', color: '#000000', icon: ShoppingBag, sub: '패션 트렌드' },
  zigzag: { label: '지그재그', color: '#FF4C00', icon: ShoppingBag, sub: '패션 베스트' },
  todayhouse: { label: '오늘의집', color: '#35C5F0', icon: Home, sub: '홈스타일링' },
  kurly: { label: '컬리', color: '#5F0080', icon: ShoppingBasket, sub: '신선식품' },
  aliexpress: { label: '알리', color: '#FF4747', icon: Globe, sub: '글로벌 쇼핑' },
  myrealtrip: { label: '마이리얼트립', color: '#FF6B35', icon: Palmtree, sub: '여행 트렌드' },
  klook: { label: '클룩', color: '#FF5722', icon: Ticket, sub: '여행 액티비티' },
};

const ALL_PRODUCT_PLATFORMS = Object.keys(PRODUCT_PLATFORM_META) as ProductPlatformKey[];

interface TrendingProduct {
  rank: number;
  name: string;
  price: string;
  originalPrice?: string;
  discountRate?: string;
  imageUrl: string;
  link: string;
  category: string;
  shopName?: string;
  marketplace?: Marketplace;
  rating?: number;
  reviewCount?: number;
}

interface TrendingCategory {
  id: string;
  label: string;
  products: TrendingProduct[];
}

interface KeywordItem {
  rank: number;
  keyword: string;
  trend: 'up' | 'down' | 'new' | 'steady';
  changeRate?: string;
  category: string;
  platform: string;
}

interface KeywordGroup {
  platform: string;
  label: string;
  keywords: KeywordItem[];
}

interface ContentIdea {
  title: string;
  angle: string;
  hook: string;
  format: string;
}

const KEYWORD_PLATFORM_META: Record<string, { label: string; color: string; icon: typeof Globe }> = {
  naver: { label: '네이버 쇼핑', color: '#03C75A', icon: Globe },
  youtube: { label: '유튜브', color: '#FF0000', icon: Youtube },
  coupang: { label: '쿠팡', color: '#FF3E3E', icon: ShoppingBag },
  toss: { label: '토스', color: '#0064FF', icon: Send },
  oliveyoung: { label: '올리브영', color: '#1A1A1A', icon: ShoppingBasket },
  ablely: { label: '에이블리', color: '#000000', icon: ShoppingBag },
  zigzag: { label: '지그재그', color: '#FF4C00', icon: ShoppingBag },
  todayhouse: { label: '오늘의집', color: '#35C5F0', icon: Home },
  kurly: { label: '컬리', color: '#5F0080', icon: ShoppingBasket },
  aliexpress: { label: '알리', color: '#FF4747', icon: Globe },
  myrealtrip: { label: '마이리얼트립', color: '#FF6B35', icon: Palmtree },
  klook: { label: '클룩', color: '#FF5722', icon: Ticket },
};

const ALL_KEYWORD_PLATFORMS = Object.keys(KEYWORD_PLATFORM_META);

const TREND_ICON = {
  up: { icon: ArrowUp, color: theme.colors.success[400] },
  down: { icon: ArrowDown, color: theme.colors.error[400] },
  new: { icon: Sparkles, color: theme.colors.accent[400] },
  steady: { icon: Minus, color: theme.colors.dark.textFaint },
};

const productCache = new Map<Marketplace, { data: TrendingCategory[]; ts: number }>();
const PRODUCT_CACHE_TTL = 5 * 60 * 1000;

export default function TrendingScreen() {
  const tabBarHeight = useSubTabBarHeight();
  const router = useRouter();
  const safeTop = useSafeTop();
  const [viewMode, setViewMode] = useState<ViewMode>('products');
  const [marketplace, setMarketplace] = useState<Marketplace>('coupang');
  const [activeProductPlatform, setActiveProductPlatform] = useState<ProductPlatformKey>('coupang');
  const [categories, setCategories] = useState<TrendingCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keyword trends state
  const [keywordGroups, setKeywordGroups] = useState<KeywordGroup[]>([]);
  const [activeKeywordPlatform, setActiveKeywordPlatform] = useState(0);
  const [keywordLoading, setKeywordLoading] = useState(true);
  const [keywordError, setKeywordError] = useState<string | null>(null);

  // Idea modal state
  const [ideaModalVisible, setIdeaModalVisible] = useState(false);
  const [selectedKeyword, setSelectedKeyword] = useState<string>('');
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [copiedIdea, setCopiedIdea] = useState<number | null>(null);

  const fetchTrending = useCallback(async (mp: Marketplace, isRefresh = false) => {
    setError(null);
    if (!isRefresh) {
      const cached = productCache.get(mp);
      if (cached && Date.now() - cached.ts < PRODUCT_CACHE_TTL) {
        setCategories(cached.data);
        setActiveCategory(0);
        setLoading(false);
        return;
      }
    }
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke(`naver-trending?marketplace=${mp}`);

      if (fnError) throw fnError;

      const fetchedCategories: TrendingCategory[] = data?.categories || [];
      if (fetchedCategories.length === 0) throw new Error('인기 상품을 불러올 수 없습니다.');

      productCache.set(mp, { data: fetchedCategories, ts: Date.now() });
      setCategories(fetchedCategories);
      setActiveCategory(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : '인기 상품 로딩 실패');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchKeywordTrends = useCallback(async () => {
    setKeywordLoading(true);
    setKeywordError(null);
    try {
      const resp = await fetch(KEYWORD_TRENDS_URL, {
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      });
      if (!resp.ok) throw new Error('키워드 트렌드 로딩 실패');
      const data = await resp.json();
      setKeywordGroups(data.groups || []);
    } catch (err) {
      setKeywordError(err instanceof Error ? err.message : '키워드 트렌드 로딩 실패');
    } finally {
      setKeywordLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'products') {
      fetchTrending(marketplace);
    } else if (viewMode === 'keywords' && keywordGroups.length === 0) {
      fetchKeywordTrends();
    }
  }, [marketplace, viewMode, fetchTrending, fetchKeywordTrends, keywordGroups.length]);

  const handleMarketplaceChange = (mp: Marketplace) => {
    if (mp === marketplace) return;
    setMarketplace(mp);
  };

  const handleProductPlatformChange = (key: ProductPlatformKey) => {
    setActiveProductPlatform(key);
    if (key === 'coupang' || key === 'naver' || key === 'toss') {
      setMarketplace(key);
    }
  };

  const openProductLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const createContentFromProduct = useCallback(async (product: TrendingProduct) => {
    try {
      const { data, error } = await supabase
        .from('scans')
        .insert({
          image_url: product.imageUrl || '',
          title: product.name,
          product_name: product.name,
          product_category: product.category,
          price_estimate: product.price,
          one_liner: `${product.name} - ${product.price}`,
          template_data: {
            priceLabel: product.price,
            oneLiner: product.name,
            category: product.category,
            accentColor: '#FF6B35',
            hook: `${product.name} 트렌드 상품!`,
            hashtags: ['트렌드', '인기상품', '베스트'],
            productAdvantages: [],
            caption: '',
          },
          shopping_matches: [{
            platform: product.marketplace || 'naver',
            productName: product.name,
            price: product.price,
            url: product.link,
          }],
          affiliate_links: [{
            platform: product.marketplace === 'coupang' ? 'Coupang' : product.marketplace === 'toss' ? 'Toss' : 'BrandConnect',
            label: product.marketplace === 'coupang' ? '쿠팡 파트너스' : product.marketplace === 'toss' ? '토스 쉐어' : '네이버 브랜드커넥트',
            url: product.link,
          }],
        })
        .select('id')
        .single();

      if (error) throw error;
      if (data) {
        router.push(`/result/${data.id}`);
      }
    } catch (err) {
      Alert.alert(
        '생성 실패',
        err instanceof Error ? err.message : '콘텐츠 생성 중 오류가 발생했습니다',
      );
    }
  }, [router]);

  const ideaRequestIdRef = useRef(0);
  const handleKeywordPress = useCallback(async (keyword: string) => {
    const reqId = ++ideaRequestIdRef.current;
    setSelectedKeyword(keyword);
    setIdeaModalVisible(true);
    setIdeasLoading(true);
    setIdeas([]);
    try {
      const resp = await fetch(`${KEYWORD_TRENDS_URL}?ideas=${encodeURIComponent(keyword)}`, {
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      });
      if (!resp.ok) throw new Error('아이디어 생성 실패');
      const data = await resp.json();
      if (reqId !== ideaRequestIdRef.current) return;
      setIdeas(data.ideas || []);
    } catch {
      if (reqId !== ideaRequestIdRef.current) return;
      setIdeas([]);
    }
    if (reqId === ideaRequestIdRef.current) setIdeasLoading(false);
  }, []);

  const handleCopyIdea = useCallback(async (idea: ContentIdea, index: number) => {
    const text = `${idea.title}\n${idea.hook}\n${idea.format} · ${idea.angle}`;
    try {
      if (RNPlatform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        await Clipboard.setStringAsync(text);
      }
      setCopiedIdea(index);
      setTimeout(() => setCopiedIdea(null), 2000);
    } catch {
      // clipboard failed
    }
  }, []);

  const currentCategory = categories[activeCategory];
  const rankBadgeColors = [
    theme.colors.primary[500],
    theme.colors.accent[400],
    theme.colors.accent[500],
    theme.colors.neutral[400],
    theme.colors.neutral[500],
  ];
  const productPm = PRODUCT_PLATFORM_META[activeProductPlatform];
  const productPmColor = productPm.color;
  const isSupportedMarketplace = activeProductPlatform === 'coupang' || activeProductPlatform === 'naver' || activeProductPlatform === 'toss';
  const activePlatformKey = ALL_KEYWORD_PLATFORMS[activeKeywordPlatform];
  const currentKeywordGroup = keywordGroups.find((g) => g.platform === activePlatformKey);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
        <View style={[styles.headerIconWrap, { backgroundColor: viewMode === 'products' ? productPmColor : theme.colors.accent[500] }]}>
          {viewMode === 'products' ? (
            <productPm.icon size={22} color="#fff" strokeWidth={2} />
          ) : (
            <Lightbulb size={22} color="#fff" strokeWidth={2} />
          )}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>
            {viewMode === 'products' ? '오픈마켓 실시간 베스트' : '소재 아이디어 봇'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {viewMode === 'products' ? '가장 많이 팔리는 상품 순위' : '급상승 키워드로 콘텐츠 소재 찾기'}
          </Text>
        </View>
      </View>

      {/* View mode toggle */}
      <View style={styles.viewModeToggleWrap}>
        <TouchableOpacity
          style={[styles.viewModeToggle, viewMode === 'products' && styles.viewModeToggleActive]}
          onPress={() => setViewMode('products')}
          activeOpacity={0.7}
        >
          <Flame size={14} color={viewMode === 'products' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
          <Text style={[styles.viewModeToggleText, viewMode === 'products' && styles.viewModeToggleTextActive]}>
            인기 상품
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeToggle, viewMode === 'keywords' && styles.viewModeToggleActive]}
          onPress={() => setViewMode('keywords')}
          activeOpacity={0.7}
        >
          <Lightbulb size={14} color={viewMode === 'keywords' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
          <Text style={[styles.viewModeToggleText, viewMode === 'keywords' && styles.viewModeToggleTextActive]}>
            소재 아이디어 봇
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'products' ? (
        <>
          {/* All affiliate platforms - compact scrollable icon style */}
          <View style={styles.productPlatformRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.productPlatformScroll}
            >
            {ALL_PRODUCT_PLATFORMS.map((key) => {
              const pm = PRODUCT_PLATFORM_META[key];
              const Icon = pm.icon;
              const isActive = activeProductPlatform === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.productPlatformBtn,
                    isActive && { backgroundColor: pm.color + '20', borderColor: pm.color },
                  ]}
                  onPress={() => handleProductPlatformChange(key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.productPlatformIconWrap, isActive && { backgroundColor: pm.color }]}>
                    <Icon size={12} color={isActive ? '#fff' : pm.color} strokeWidth={2} />
                  </View>
                  <Text
                    style={[
                      styles.productPlatformLabel,
                      isActive && { color: pm.color },
                    ]}
                    numberOfLines={1}
                  >
                    {pm.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            </ScrollView>
          </View>

          {isSupportedMarketplace ? (
            <View style={styles.productsContent}>
          {/* Category tabs - right under platform icons */}
          {categories.length > 0 && (
            <View style={styles.categoryRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScroll}
              >
              {categories.map((cat, index) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryTab, activeCategory === index && styles.categoryTabActive]}
                  onPress={() => setActiveCategory(index)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.categoryTabText, activeCategory === index && styles.categoryTabTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={productPm.color} />
              <Text style={styles.loadingText}>{productPm.label} 불러오는 중...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => fetchTrending(marketplace)}>
                <Text style={styles.retryButtonText}>다시 시도</Text>
              </TouchableOpacity>
            </View>
          ) : (
              <ScrollView
                style={{ flex: 1, minHeight: 0 }}
                contentContainerStyle={[styles.productListContent, { paddingBottom: tabBarHeight + 24 }]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => fetchTrending(marketplace, true)}
                    tintColor={productPm.color}
                    colors={[productPm.color]}
                  />
                }
              >
                {currentCategory?.products.map((product, index) => {
                  const badgeColor = rankBadgeColors[Math.min(index, rankBadgeColors.length - 1)];
                  return (
                    <TouchableOpacity
                      key={`${product.rank}-${index}`}
                      style={styles.productCard}
                      onPress={() => openProductLink(product.link)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.rankBadge, { backgroundColor: badgeColor }]}>
                        <Text style={styles.rankText}>{product.rank}</Text>
                      </View>
                      <View style={styles.productInfo}>
                        <Text style={styles.productName} numberOfLines={1} adjustsFontSizeToFit>{product.name}</Text>
                        <View style={styles.productMetaRow}>
                          {product.rating && (
                            <View style={styles.ratingWrap}>
                              <Star size={12} color={theme.colors.warning[400]} strokeWidth={2} fill={theme.colors.warning[400]} />
                              <Text style={styles.ratingText}>{product.rating}</Text>
                              {product.reviewCount && (
                                <Text style={styles.reviewCount}>({product.reviewCount.toLocaleString()})</Text>
                              )}
                            </View>
                          )}
                          {product.discountRate && (
                            <View style={[styles.discountBadge, { backgroundColor: productPm.color + '20' }]}>
                              <Text style={[styles.discountText, { color: productPm.color }]}>{product.discountRate}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.priceRow}>
                          <Text style={styles.productPrice}>{product.price}</Text>
                          {product.originalPrice && (
                            <Text style={styles.originalPrice}>{product.originalPrice}</Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.productAction}>
                        <TouchableOpacity
                          style={[styles.makeContentButton, { backgroundColor: theme.colors.primary[600] }]}
                          onPress={() => createContentFromProduct(product)}
                          activeOpacity={0.7}
                        >
                          <Wand2 size={13} color="#fff" strokeWidth={2} />
                          <Text style={styles.makeContentButtonText}>콘텐츠</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.buyButton, { backgroundColor: productPm.color + '20' }]}
                          onPress={() => openProductLink(product.link)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.buyButtonText, { color: productPm.color }]}>보기</Text>
                          <ExternalLink size={13} color={productPm.color} strokeWidth={2} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={styles.moreLinkRow}
                  onPress={() => openProductLink(marketplace === 'coupang' ? 'https://www.coupang.com' : marketplace === 'toss' ? 'https://toss.cc/shopping' : 'https://search.shopping.naver.com')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.moreLinkText, { color: productPm.color }]}>
                    {marketplace === 'coupang' ? '쿠팡에서 더 보기' : marketplace === 'toss' ? '토스에서 더 보기' : '네이버 쇼핑에서 더 보기'}
                  </Text>
                  <ChevronRight size={14} color={productPm.color} strokeWidth={2} />
                </TouchableOpacity>
              </ScrollView>
          )}
            </View>
          ) : (
            <View style={styles.loadingWrap}>
              <ShoppingBag size={40} color={productPmColor + '60'} strokeWidth={1.5} />
              <Text style={[styles.loadingText, { color: productPmColor }]}>
                {productPm.label} 인기 상품을 준비 중입니다
              </Text>
              <Text style={styles.keywordEmptySub}>현재 쿠팡, 네이버 쇼핑, 토스 데이터를 제공합니다</Text>
            </View>
          )}
        </>
      ) : (
        // Keywords view mode
        <>
          {keywordLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={theme.colors.accent[400]} />
              <Text style={styles.loadingText}>키워드 트렌드 불러오는 중...</Text>
            </View>
          ) : keywordError ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{keywordError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchKeywordTrends}>
                <Text style={styles.retryButtonText}>다시 시도</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Platform tabs for keywords - compact scrollable icon style */}
              <View style={styles.keywordPlatformRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.keywordPlatformScroll}
              >
                {ALL_KEYWORD_PLATFORMS.map((platformKey, index) => {
                  const pm = KEYWORD_PLATFORM_META[platformKey];
                  const group = keywordGroups.find((g) => g.platform === platformKey);
                  const Icon = pm?.icon || Globe;
                  const isActive = activeKeywordPlatform === index;
                  const color = pm?.color || theme.colors.accent[400];
                  return (
                    <TouchableOpacity
                      key={platformKey}
                      style={[
                        styles.keywordPlatformBtn,
                        isActive && { backgroundColor: color + '20', borderColor: color },
                      ]}
                      onPress={() => setActiveKeywordPlatform(index)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.keywordPlatformIconWrap, isActive && { backgroundColor: color }]}>
                        <Icon size={12} color={isActive ? '#fff' : color} strokeWidth={2} />
                      </View>
                      <Text
                        style={[
                          styles.keywordPlatformLabel,
                          isActive && { color },
                        ]}
                        numberOfLines={1}
                      >
                        {pm?.label || platformKey}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              </View>

              <ScrollView
                style={{ flex: 1, minHeight: 0 }}
                contentContainerStyle={[styles.productListContent, { paddingBottom: tabBarHeight + 24 }]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={keywordLoading}
                    onRefresh={fetchKeywordTrends}
                    tintColor={theme.colors.accent[400]}
                    colors={[theme.colors.accent[400]]}
                  />
                }
              >
                <View style={styles.keywordInfoBox}>
                  <Lightbulb size={14} color={theme.colors.accent[300]} strokeWidth={2} />
                  <Text style={styles.keywordInfoText}>
                    키워드를 탭하면 5개의 콘텐츠 소재 아이디어가 즉시 생성됩니다. 합법적 공개 데이터 기반 추천입니다.
                  </Text>
                </View>

                {currentKeywordGroup && currentKeywordGroup.keywords.length > 0 ? (
                  currentKeywordGroup.keywords.map((item, index) => {
                  const trendInfo = TREND_ICON[item.trend] || TREND_ICON.steady;
                  const TrendIcon = trendInfo.icon;
                  const pm = KEYWORD_PLATFORM_META[item.platform];
                  return (
                    <TouchableOpacity
                      key={`${item.rank}-${index}`}
                      style={styles.keywordCard}
                      onPress={() => handleKeywordPress(item.keyword)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.rankBadge, { backgroundColor: (pm?.color || theme.colors.accent[500]) + '30' }]}>
                        <Text style={[styles.rankText, { color: pm?.color || theme.colors.accent[400] }]}>{item.rank}</Text>
                      </View>
                      <View style={styles.keywordInfo}>
                        <Text style={styles.keywordText} numberOfLines={1} adjustsFontSizeToFit>{item.keyword}</Text>
                        <View style={styles.keywordMetaRow}>
                          <View style={styles.keywordCategoryChip}>
                            <Text style={styles.keywordCategoryText}>{item.category}</Text>
                          </View>
                          <View style={styles.trendRow}>
                            <TrendIcon size={12} color={trendInfo.color} strokeWidth={2} />
                            {item.changeRate && (
                              <Text style={[styles.trendText, { color: trendInfo.color }]}>{item.changeRate}</Text>
                            )}
                            <Text style={styles.trendLabel}>
                              {item.trend === 'up' ? '급상승' : item.trend === 'down' ? '하락' : item.trend === 'new' ? '신규' : '유지'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.keywordAction}>
                        <View style={styles.ideaButton}>
                          <Lightbulb size={13} color={theme.colors.accent[300]} strokeWidth={2} />
                          <Text style={styles.ideaButtonText}>아이디어</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
                ) : (
                  <View style={styles.keywordEmptyWrap}>
                    <Text style={styles.keywordEmptyText}>이 플랫폼의 키워드 트렌드를 준비 중입니다</Text>
                    <Text style={styles.keywordEmptySub}>다른 플랫폼을 선택해보세요</Text>
                  </View>
                )}


              </ScrollView>
            </>
          )}
        </>
      )}

      {/* Idea modal */}
      <Modal
        visible={ideaModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIdeaModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Lightbulb size={18} color={theme.colors.accent[400]} strokeWidth={2} />
                <Text style={styles.modalTitle} numberOfLines={1}>소재 아이디어</Text>
              </View>
              <TouchableOpacity onPress={() => setIdeaModalVisible(false)} activeOpacity={0.7}>
                <X size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalKeywordBox}>
              <Text style={styles.modalKeywordLabel}>선택한 키워드</Text>
              <Text style={styles.modalKeywordText}>{selectedKeyword}</Text>
            </View>

            {ideasLoading ? (
              <View style={styles.modalLoadingWrap}>
                <ActivityIndicator size="large" color={theme.colors.accent[400]} />
                <Text style={styles.modalLoadingText}>아이디어 생성 중...</Text>
              </View>
            ) : ideas.length === 0 ? (
              <Text style={styles.modalEmptyText}>아이디어를 생성하지 못했습니다. 다시 시도해주세요.</Text>
            ) : (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {ideas.map((idea, i) => {
                  const isCopied = copiedIdea === i;
                  return (
                    <View key={i} style={styles.ideaCard}>
                      <View style={styles.ideaCardHeader}>
                        <View style={styles.ideaIndexWrap}>
                          <Text style={styles.ideaIndex}>{i + 1}</Text>
                        </View>
                        <Text style={styles.ideaTitle}>{idea.title}</Text>
                      </View>
                      <Text style={styles.ideaHook}>{idea.hook}</Text>
                      <View style={styles.ideaMetaRow}>
                        <View style={styles.ideaFormatChip}>
                          <Text style={styles.ideaFormatText}>{idea.format}</Text>
                        </View>
                        <View style={styles.ideaAngleChip}>
                          <Text style={styles.ideaAngleText}>{idea.angle}</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.ideaCopyBtn, isCopied && styles.ideaCopyBtnDone]}
                        onPress={() => handleCopyIdea(idea, i)}
                        activeOpacity={0.7}
                      >
                        {isCopied ? (
                          <Check size={13} color={theme.colors.success[400]} strokeWidth={2} />
                        ) : (
                          <Copy size={13} color={theme.colors.dark.textDim} strokeWidth={2} />
                        )}
                        <Text style={[styles.ideaCopyText, isCopied && { color: theme.colors.success[400] }]}>
                          {isCopied ? '복사됨' : '복사'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 12,
    paddingBottom: theme.spacing.sm,
  },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  headerSubtitle: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  viewModeToggleWrap: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  viewModeToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  viewModeToggleActive: {
    backgroundColor: theme.colors.accent[500],
    borderColor: theme.colors.accent[500],
    ...theme.shadows.glowAccent,
  },
  viewModeToggleText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  viewModeToggleTextActive: {
    color: '#fff',
  },
  productPlatformRow: {
    height: 40,
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
  },
  productPlatformScroll: {
    paddingHorizontal: theme.spacing.lg,
    gap: 6,
    paddingBottom: 8,
  },
  productPlatformBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 88,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surface,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  productPlatformIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  productPlatformLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    flexShrink: 1,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.colors.primary[600],
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  retryButtonText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  productsContent: {
    flex: 1,
    minHeight: 0,
  },
  categoryRow: {
    height: 48,
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  categoryScroll: {
    paddingHorizontal: theme.spacing.lg,
    gap: 6,
    paddingBottom: 10,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surface,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  categoryTabActive: {
    backgroundColor: theme.colors.primary[600],
    borderColor: theme.colors.primary[600],
  },
  categoryTabText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  categoryTabTextActive: {
    color: '#fff',
  },
  productListContent: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadows.card,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  rankText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  productInfo: {
    flex: 1,
    gap: 4,
  },
  productName: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  productMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
  },
  reviewCount: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  productPrice: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.primary[300],
  },
  originalPrice: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textDecorationLine: 'line-through',
  },
  discountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  discountText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
  },
  productAction: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
  },
  makeContentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    borderRadius: theme.radius.sm,
  },
  makeContentButtonText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  buyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    borderRadius: theme.radius.sm,
  },
  buyButtonText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  moreLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: theme.spacing.sm,
  },
  moreLinkText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  keywordPlatformRow: {
    height: 40,
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
  },
  keywordPlatformScroll: {
    paddingHorizontal: theme.spacing.lg,
    gap: 6,
  },
  keywordPlatformBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 88,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surface,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  keywordPlatformIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  keywordPlatformLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    flexShrink: 1,
  },
  keywordInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: theme.colors.accent[500] + '12',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent[400],
  },
  keywordInfoText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
  },
  keywordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadows.card,
  },
  keywordInfo: {
    flex: 1,
    gap: 4,
  },
  keywordText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  keywordMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  keywordCategoryChip: {
    backgroundColor: theme.colors.dark.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  keywordCategoryText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  trendText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  trendLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  keywordAction: {
    justifyContent: 'center',
  },
  ideaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.accent[500] + '20',
  },
  ideaButtonText: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[300],
  },
  keywordEmptyWrap: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    gap: 6,
  },
  keywordEmptyText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  keywordEmptySub: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  modalTitle: {
    flex: 1,
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  modalKeywordBox: {
    backgroundColor: theme.colors.accent[500] + '15',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  modalKeywordLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  modalKeywordText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.accent[300],
  },
  modalLoadingWrap: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xxl,
  },
  modalLoadingText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  modalEmptyText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
  },
  modalScroll: {
    maxHeight: 400,
  },
  ideaCard: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  ideaCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  ideaIndexWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.accent[500] + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ideaIndex: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.accent[400],
  },
  ideaTitle: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  ideaHook: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.warning[400],
    marginBottom: 8,
  },
  ideaMetaRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  ideaFormatChip: {
    backgroundColor: theme.colors.primary[500] + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  ideaFormatText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  ideaAngleChip: {
    backgroundColor: theme.colors.dark.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  ideaAngleText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  ideaCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.bg,
  },
  ideaCopyBtnDone: {
    backgroundColor: theme.colors.success[500] + '15',
  },
  ideaCopyText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
});
