import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  LayoutAnimation,
  UIManager,
  ScrollView,
} from 'react-native';
import { ShoppingBag, ExternalLink, Link2, Check, X, CreditCard as Edit3, Sparkles, Zap, ChevronDown, ChevronUp, ShoppingBasket, Globe, Send, Hop as Home, TreePalm as Palmtree, Ticket, Plus, Store, Copy, Loader as Loader2, Search, CircleAlert as AlertCircle } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { detectAffiliatePlatform, generateMarketingCopy, isKnownAffiliateUrl, validateAffiliateUrl } from '@/lib/affiliateLinkSmart';
import type { AffiliatePlatformKey } from '@/components/AffiliatePlatformSwitch';
import { useAffiliateToast } from '@/components/AffiliateToast';
import * as Clipboard from 'expo-clipboard';
import { createShortLink } from '@/lib/shortUrl';
import type { ShoppingMatch, AffiliateLink, CustomAffiliateLink } from '@/types/database';

interface ShoppingMatchCardProps {
  matches: ShoppingMatch[];
  affiliateLinks: AffiliateLink[];
  customAffiliateLinks?: CustomAffiliateLink[];
  selectedProductIndex?: number;
  saving?: boolean;
  productName?: string;
  priceLabel?: string;
  onMarketingCopyGenerated?: (copy: string) => void;
  onSaveCustomLink?: (url: string, label: string, productIndex: number) => Promise<{ success: boolean; error?: string }>;
  onRemoveCustomLink?: (productIndex: number) => Promise<{ success: boolean; error?: string }>;
  selectedAffiliate: AffiliatePlatformKey;
  onSelectAffiliate: (key: AffiliatePlatformKey) => void;
  availablePlatforms: AffiliatePlatformKey[];
  shortUrl?: string | null;
  scanId?: string;
}

const PLATFORM_META: {
  key: AffiliatePlatformKey;
  label: string;
  icon: typeof ShoppingBag;
  color: string;
  issueUrl: string;
  issueLabel: string;
}[] = [
  { key: 'Coupang', label: '쿠팡', icon: ShoppingBag, color: '#FF3E3E', issueUrl: 'https://partners.coupang.com/', issueLabel: '쿠팡 파트너스에서 링크 발급받기' },
  { key: 'Toss', label: '토스', icon: Send, color: '#0064FF', issueUrl: 'https://business.toss.im/account/sign-in?client_id=ajvm9wq2t0p1ttet13y3qzb3rvjxhacn&redirect_uri=https%3A%2F%2Fsharelink.toss.im%2Fsignup-start', issueLabel: '토스 쉐어링크 가입하기' },
  { key: 'BrandConnect', label: '네이버', icon: Globe, color: '#03C75A', issueUrl: 'https://brandconnect.naver.com/about/creator/', issueLabel: '브랜드커넥트에서 링크 발급받기' },
  { key: 'OliveYoung', label: '올리브영', icon: ShoppingBasket, color: '#1A1A1A', issueUrl: 'https://www.oliveyoung.co.kr/', issueLabel: '올리브영에서 링크 가져오기' },
  { key: 'Zigzag', label: '지그재그', icon: ShoppingBag, color: '#FF4C00', issueUrl: 'https://zigzag.be/', issueLabel: '지그재그에서 링크 가져오기' },
  { key: 'TodayHouse', label: '오늘의집', icon: Home, color: '#35C5F0', issueUrl: 'https://ohou.se/', issueLabel: '오늘의집에서 링크 가져오기' },
  { key: 'Kurly', label: '컬리', icon: ShoppingBasket, color: '#5F0080', issueUrl: 'https://kurly.com/', issueLabel: '컬리에서 링크 가져오기' },
  { key: 'AliExpress', label: '알리', icon: Globe, color: '#FF4747', issueUrl: 'https://www.aliexpress.com/', issueLabel: '알리익스프레스에서 링크 가져오기' },
  { key: 'Amazon', label: '아마존', icon: Globe, color: '#FF9900', issueUrl: 'https://affiliate-program.amazon.com/', issueLabel: '아마존 어소시에이트에서 링크 가져오기' },
  { key: 'MyRealTrip', label: '마이리얼트립', icon: Palmtree, color: '#FF6B35', issueUrl: 'https://www.myrealtrip.com/', issueLabel: '마이리얼트립에서 링크 가져오기' },
  { key: 'Klook', label: '클룩', icon: Ticket, color: '#FF5722', issueUrl: 'https://www.klook.com/', issueLabel: '클룩에서 링크 가져오기' },
  { key: 'Custom', label: '직접 추가', icon: Store, color: '#6366F1', issueUrl: '', issueLabel: '' },
];

export function ShoppingMatchCard({
  matches,
  affiliateLinks,
  customAffiliateLinks = [],
  selectedProductIndex = 0,
  saving = false,
  productName = '',
  priceLabel = '',
  onMarketingCopyGenerated,
  onSaveCustomLink,
  onRemoveCustomLink,
  selectedAffiliate,
  onSelectAffiliate,
  availablePlatforms,
  shortUrl: propShortUrl,
  scanId,
}: ShoppingMatchCardProps) {
  const [editing, setEditing] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [inputLabel, setInputLabel] = useState('');
  const [inputPlatformName, setInputPlatformName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!!customAffiliateLinks.find((l) => l.productIndex === selectedProductIndex));
  const [linkCopied, setLinkCopied] = useState(false);
  const [generatingShortUrl, setGeneratingShortUrl] = useState(false);
  const [localShortUrl, setLocalShortUrl] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const { showAffiliateToast } = useAffiliateToast();

  const handleOpen = (url: string) => {
    showAffiliateToast(url);
  };

  const getPlatformColor = (platform: string): string => {
    const meta = PLATFORM_META.find((p) => p.key === platform);
    return meta?.color || theme.colors.primary[400];
  };

  const getPlatformIcon = (platform: AffiliatePlatformKey) => {
    const meta = PLATFORM_META.find((p) => p.key === platform);
    if (!meta) return <ShoppingBag size={18} color="#fff" strokeWidth={2} />;
    const Icon = meta.icon;
    return <Icon size={18} color="#fff" strokeWidth={2} />;
  };

  useEffect(() => {
    setExpanded(!!customAffiliateLinks.find((l) => l.productIndex === selectedProductIndex));
  }, [selectedProductIndex, customAffiliateLinks]);

  const liveDetection = useMemo(() => {
    const trimmed = inputUrl.trim().replace(/\s+/g, '');
    if (!trimmed || trimmed.length < 8) return null;
    const url = trimmed.startsWith('http') ? trimmed : 'https://' + trimmed;
    if (!isKnownAffiliateUrl(url)) return null;
    return generateMarketingCopy(url, productName, priceLabel);
  }, [inputUrl, productName, priceLabel]);

  const effectiveShortUrl = propShortUrl ?? localShortUrl;

  const handleCopyShortUrl = async () => {
    if (!effectiveShortUrl) return;
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(effectiveShortUrl);
      } else {
        await Clipboard.setStringAsync(effectiveShortUrl);
      }
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // clipboard copy failed silently
    }
  };

  const toggleExpanded = () => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  const openEditor = () => {
    setInputUrl(customLinkForProduct?.url || '');
    setInputLabel(customLinkForProduct?.label || '');
    setInputPlatformName(customLinkForProduct?.platform === 'Custom' ? (customLinkForProduct?.label || '') : '');
    setError(null);
    setWarning(null);
    setEditing(true);
  };

  const closeEditor = () => {
    setEditing(false);
    setInputUrl('');
    setInputLabel('');
    setInputPlatformName('');
    setError(null);
    setWarning(null);
  };

  if (matches.length === 0 && affiliateLinks.length === 0) {
    const searchQuery = encodeURIComponent(productName || '제품');
    const fallbackLinks = [
      { platform: 'Coupang' as const, label: '쿠팡에서 검색', url: `https://www.coupang.com/np/search?q=${searchQuery}` },
      { platform: 'BrandConnect' as const, label: '네이버 쇼핑에서 검색', url: `https://search.shopping.naver.com/search/all?query=${searchQuery}` },
      { platform: 'Toss' as const, label: '토스 쉐어링크 가입하기', url: 'https://business.toss.im/account/sign-in?client_id=ajvm9wq2t0p1ttet13y3qzb3rvjxhacn&redirect_uri=https%3A%2F%2Fsharelink.toss.im%2Fsignup-start' },
    ];
    return (
      <View style={styles.container}>
        <View style={styles.accordionHeader}>
          <View style={styles.accordionHeaderLeft}>
            <ShoppingBag size={16} color={theme.colors.primary[300]} strokeWidth={2} />
            <Text style={styles.accordionTitle}>쇼핑커넥트 & 제휴 링크</Text>
          </View>
        </View>
        <View style={styles.emptyStateBox}>
          <Search size={24} color={theme.colors.primary[300]} strokeWidth={2} />
          <Text style={styles.emptyStateTitle}>자동 매칭된 제휴 링크가 없어요</Text>
          <Text style={styles.emptyStateDesc}>
            AI가 정확히 일치하는 상품을 찾지 못했어요. 아래 검색 링크로 직접 상품을 찾아 수수료 링크를 발급받거나, 직접 링크를 추가해주세요.
          </Text>
          {fallbackLinks.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={styles.fallbackLinkRow}
              onPress={() => handleOpen(item.url)}
              activeOpacity={0.8}
            >
              <View style={[styles.iconWrap, { backgroundColor: getPlatformColor(item.platform) }]}>
                {getPlatformIcon(item.platform)}
              </View>
              <Text style={styles.fallbackLinkText}>{item.label}</Text>
              <ExternalLink size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.emptyStateAddBtn}
            onPress={openEditor}
            activeOpacity={0.8}
          >
            <Plus size={16} color="#fff" strokeWidth={2.5} />
            <Text style={styles.emptyStateAddText}>직접 링크 추가하기</Text>
          </TouchableOpacity>
        </View>
        {editing && renderEditor()}
      </View>
    );
  }

  const customLinkForProduct = customAffiliateLinks.find(
    (l) => l.productIndex === selectedProductIndex,
  );

  const query = matches[0]?.productName || affiliateLinks[0]?.label || '';

  const allItems: { platform: string; label: string; productName: string; price: string; url: string; isCustom: boolean }[] = [
    {
      platform: 'Coupang' as const,
      label: '쿠팡 파트너스',
      productName: query || '제품 검색',
      price: '',
      url: 'https://partners.coupang.com/',
      isCustom: false,
    },
    {
      platform: 'Toss' as const,
      label: '토스 쉐어링크',
      productName: query || '제품 검색',
      price: '',
      url: 'https://business.toss.im/account/sign-in?client_id=ajvm9wq2t0p1ttet13y3qzb3rvjxhacn&redirect_uri=https%3A%2F%2Fsharelink.toss.im%2Fsignup-start',
      isCustom: false,
    },
    ...matches.slice(0, 1).map((m) => ({
      platform: 'BrandConnect' as const,
      label: '네이버 브랜드커넥트',
      productName: m.productName,
      price: m.price,
      url: m.url.includes('brandconnect.naver.com') || m.url.includes('brand.naver.com')
        ? m.url
        : 'https://brandconnect.naver.com/about/creator',
      isCustom: false,
    })),
    ...(matches.length === 0 ? affiliateLinks.filter((a) => a.platform !== 'Coupang' && a.platform !== 'Toss').slice(0, 1).map((a) => ({
      platform: 'BrandConnect' as const,
      label: '네이버 브랜드커넥트',
      productName: '제휴 링크',
      price: '',
      url: a.url.includes('brandconnect.naver.com') || a.url.includes('brand.naver.com')
        ? a.url
        : 'https://brandconnect.naver.com/about/creator',
      isCustom: false,
    })) : []),
  ];

  if (customLinkForProduct) {
    const detectedPlatform = detectAffiliatePlatform(customLinkForProduct.url);
    const customPlatform = detectedPlatform;
    const platformLabels: Record<AffiliatePlatformKey, string> = {
      Coupang: '쿠팡 파트너스 링크',
      Toss: '토스 쉐어링크',
      BrandConnect: '크리에이터 발급 링크',
      OliveYoung: '올리브영 링크',
      Zigzag: '지그재그 링크',
      TodayHouse: '오늘의집 링크',
      Kurly: '컬리 링크',
      AliExpress: '알리익스프레스 링크',
      Amazon: '아마존 링크',
      MyRealTrip: '마이리얼트립 링크',
      Klook: '클룩 링크',
      Custom: '직접 추가 링크',
    };
    const customProductName = platformLabels[detectedPlatform] || '제휴 링크';
    allItems.unshift({
      platform: customPlatform,
      label: customLinkForProduct.label || '내 수수료 링크',
      productName: customProductName,
      price: '',
      url: customLinkForProduct.url,
      isCustom: true,
    });
  }

  const activePlatforms = allItems.map((item) => item.platform);
  const selectedMeta = PLATFORM_META.find((p) => p.key === selectedAffiliate);
  const hasLinkForSelected = availablePlatforms.includes(selectedAffiliate);

  const handleSaveLink = async () => {
    const validation = validateAffiliateUrl(inputUrl);
    if (!validation.valid) {
      setError(validation.error || '링크를 확인해주세요.');
      setWarning(null);
      return;
    }
    let trimmed = inputUrl.trim().replace(/\s+/g, '');
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = 'https://' + trimmed;
    }
    setError(null);
    setWarning(validation.warning || null);
    const detected = generateMarketingCopy(trimmed, productName, priceLabel);
    const isCustomPlatform = selectedAffiliate === 'Custom';
    const finalLabel = isCustomPlatform
      ? (inputPlatformName.trim() || inputLabel.trim() || '직접 추가 링크')
      : (inputLabel.trim() || detected.platformLabel);
    const result = await onSaveCustomLink?.(trimmed, finalLabel, selectedProductIndex);
    if (result && !result.success) {
      setError(result.error || '링크 저장 중 오류가 발생했어요');
      return;
    }
    if (onMarketingCopyGenerated && detected.isAffiliate) {
      onMarketingCopyGenerated(detected.marketingCopy);
    }
    if (!propShortUrl) {
      setGeneratingShortUrl(true);
      try {
        const { createShortLink } = await import('@/lib/shortUrl');
        const short = await createShortLink(trimmed, scanId);
        setLocalShortUrl(short);
      } catch {
        setError('단축 링크 생성에 실패했어요. 나중에 다시 시도해주세요.');
      } finally {
        setGeneratingShortUrl(false);
      }
    }
    setEditing(false);
    setInputUrl('');
    setInputLabel('');
    setInputPlatformName('');
    setError(null);
  };

  const handleRemoveLink = async () => {
    const result = await onRemoveCustomLink?.(selectedProductIndex);
    if (result && !result.success) {
      setError(result.error || '링크 삭제 중 오류가 발생했어요');
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={toggleExpanded}
        activeOpacity={0.7}
      >
        <View style={styles.accordionHeaderLeft}>
          <ShoppingBag size={16} color={theme.colors.primary[300]} strokeWidth={2} />
          <Text style={styles.accordionTitle}>쇼핑커넥트 & 제휴 링크</Text>
          {customLinkForProduct && (
            <View style={styles.appliedBadge}>
              <Check size={9} color="#fff" strokeWidth={3} />
              <Text style={styles.appliedBadgeText}>적용됨</Text>
            </View>
          )}
        </View>
        <View style={styles.accordionHeaderRight}>
          <Text style={styles.accordionToggleHint}>
            {expanded ? '접기' : '펼치기'}
          </Text>
          {expanded ? (
            <ChevronUp size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
          ) : (
            <ChevronDown size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
          )}
        </View>
      </TouchableOpacity>

      {!expanded && (
        <Text style={styles.accordionSubtitle}>
          {customLinkForProduct
            ? '수수료 링크가 적용되어 있습니다. 펼쳐서 수정하거나 제거할 수 있어요.'
            : '선택 사항입니다. 제휴 플랫폼을 선택하고 링크를 붙여넣으면 스티커 링크와 마케팅 문구가 자동 생성됩니다.'}
        </Text>
      )}

      {expanded && (
        <>
          <Text style={styles.label}>제휴 플랫폼 선택</Text>
          <View style={styles.platformGrid}>
            {PLATFORM_META.map(({ key, label, icon: Icon, color }) => {
              const isActive = selectedAffiliate === key;
              const isAvailable = availablePlatforms.includes(key);
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.platformTab,
                    isActive && styles.platformTabActive,
                    isActive && { borderColor: color + '60' },
                  ]}
                  onPress={() => onSelectAffiliate(key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.platformTabIcon, isActive && { backgroundColor: color + '15' }]}>
                    <Icon
                      size={18}
                      color={isActive ? color : theme.colors.dark.textDim}
                      strokeWidth={2}
                    />
                  </View>
                  <Text
                    style={[styles.platformTabText, isActive && { color }]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                  {isAvailable && (
                    <View style={[styles.platformDot, { backgroundColor: color }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedMeta && selectedAffiliate !== 'Custom' && (
            <View style={styles.selectedPlatformInfo}>
              <View style={[styles.selectedPlatformIcon, { backgroundColor: selectedMeta.color }]}>
                {getPlatformIcon(selectedAffiliate)}
              </View>
              <View style={styles.selectedPlatformBody}>
                <Text style={styles.selectedPlatformName}>{selectedMeta.label}</Text>
                <Text style={styles.selectedPlatformHint}>
                  {hasLinkForSelected
                    ? '이 플랫폼의 수수료 링크가 연동되어 있습니다.'
                    : '이 플랫폼에서 발급받은 링크를 아래에 붙여넣으세요.'}
                </Text>
                <TouchableOpacity
                  style={styles.issueLinkBtn}
                  onPress={() => handleOpen(selectedMeta.issueUrl)}
                  activeOpacity={0.7}
                >
                  <ExternalLink size={12} color={theme.colors.primary[300]} strokeWidth={2} />
                  <Text style={styles.issueLinkText}>{selectedMeta.issueLabel}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={styles.subLabel}>쇼핑 매칭 & 제휴 링크</Text>

          {allItems.map((item, i) => {
            const color = getPlatformColor(item.platform);
            return (
              <TouchableOpacity
                key={i}
                style={[styles.card, item.isCustom && styles.cardCustom]}
                activeOpacity={0.8}
                onPress={() => handleOpen(item.url)}
              >
                <View style={[styles.iconWrap, { backgroundColor: color }]}>
                  {item.isCustom ? <Link2 size={18} color="#fff" strokeWidth={2} /> : getPlatformIcon(item.platform as AffiliatePlatformKey)}
                </View>
                <View style={styles.body}>
                  <Text style={styles.platformText}>{item.label}</Text>
                  <Text style={styles.productName} numberOfLines={1}>
                    {item.productName}
                  </Text>
                  {item.price ? (
                    <Text style={styles.priceText}>{item.price}</Text>
                  ) : item.isCustom ? (
                    <Text style={styles.priceCustom}>수수료 링크 적용됨</Text>
                  ) : (
                    <Text style={styles.priceFaint}>수수료 링크</Text>
                  )}
                </View>
                <View style={styles.actionWrap}>
                  <ExternalLink size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
                </View>
              </TouchableOpacity>
            );
          })}

          {!editing && (
            <TouchableOpacity
              style={[styles.pasteButton, customLinkForProduct && styles.pasteButtonActive]}
              onPress={customLinkForProduct ? handleRemoveLink : openEditor}
              activeOpacity={0.7}
              disabled={saving}
            >
              {customLinkForProduct ? (
                <>
                  <X size={16} color={theme.colors.error[400]} strokeWidth={2} />
                  <Text style={styles.pasteButtonTextRemove}>수수료 링크 제거</Text>
                </>
              ) : (
                <>
                  <Link2 size={16} color={theme.colors.primary[300]} strokeWidth={2} />
                  <Text style={styles.pasteButtonText}>내 수수료 링크 붙여넣기</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {!editing && customLinkForProduct && (
            <TouchableOpacity
              style={styles.editCustomBtn}
              onPress={openEditor}
              activeOpacity={0.7}
            >
              <Edit3 size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={styles.editCustomText}>수수료 링크 수정</Text>
            </TouchableOpacity>
          )}

          {!editing && customLinkForProduct && (
            <View style={styles.shortLinkBox}>
              <View style={styles.shortLinkHeader}>
                <Link2 size={14} color={theme.colors.primary[300]} strokeWidth={2} />
                <Text style={styles.shortLinkTitle}>단축 링크</Text>
              </View>
              <Text style={styles.shortLinkUrl} numberOfLines={1}>
                {generatingShortUrl
                  ? '생성 중...'
                  : effectiveShortUrl || '단축 링크를 생성할 수 없어요'}
              </Text>
              {effectiveShortUrl && !generatingShortUrl && (
                <TouchableOpacity
                  style={[styles.shortLinkCopyBtn, linkCopied && styles.shortLinkCopyBtnDone]}
                  onPress={handleCopyShortUrl}
                  activeOpacity={0.7}
                >
                  {linkCopied ? (
                    <Check size={14} color={theme.colors.success[400]} strokeWidth={2} />
                  ) : (
                    <Copy size={14} color={theme.colors.primary[300]} strokeWidth={2} />
                  )}
                  <Text style={[styles.shortLinkCopyText, linkCopied && { color: theme.colors.success[400] }]}>
                    {linkCopied ? '복사됨' : '복사하기'}
                  </Text>
                </TouchableOpacity>
              )}
              {generatingShortUrl && (
                <Loader2 size={14} color={theme.colors.primary[300]} strokeWidth={2} />
              )}
            </View>
          )}

          {editing && renderEditor()}

        </>
      )}
    </View>
  );

  function renderEditor() {
    return (
      <View style={styles.editorBox}>
        <Text style={styles.editorTitle}>수수료 링크 붙여넣기</Text>
        <Text style={styles.editorHint}>
          {selectedAffiliate === 'Custom'
            ? '이용하시는 제휴 플랫폼 이름과 링크를 직접 입력하세요. 카페24, 아임웹, 자사몰 등 어떤 플랫폼이든 등록할 수 있습니다.'
            : selectedMeta
              ? `${selectedMeta.label}에서 발급받은 링크를 붙여넣으세요. 플랫폼이 자동으로 인식되고 공정위 문구가 적용됩니다.`
              : '올리브영, 에이블리, 지그재그, 오늘의집, 컬리, 알리익스프레스, 마이리얼트립, 클룩, 브랜드커넥트, 쿠팡 파트너스, 또는 토스 쉐어링크에서 발급받은 링크를 붙여넣으세요.'}
        </Text>
        {selectedAffiliate === 'Custom' && (
          <TextInput
            style={[styles.editorInput, styles.editorLabelInput]}
            value={inputPlatformName}
            onChangeText={setInputPlatformName}
            placeholder="플랫폼 이름 (예: 카페24, 아임웹, 자사몰)"
            placeholderTextColor={theme.colors.dark.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        <TextInput
          style={styles.editorInput}
          value={inputUrl}
          onChangeText={setInputUrl}
          placeholder="https://... (제휴 링크 URL)"
          placeholderTextColor={theme.colors.dark.textFaint}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={Platform.OS === 'web' ? 'default' : 'url'}
          multiline
        />
        {liveDetection && (
          <View style={styles.detectionPreview}>
            <View style={styles.detectionHeader}>
              <Zap size={14} color={theme.colors.warning[400]} strokeWidth={2} />
              <Text style={styles.detectionPlatform}>{liveDetection.platformLabel} 자동 인식됨</Text>
            </View>
            <View style={styles.detectionBadgeRow}>
              <View style={[styles.detectionBadge, { backgroundColor: getPlatformColor(liveDetection.platform) }]}>
                <Text style={styles.detectionBadgeText}>{liveDetection.shortHint}</Text>
              </View>
            </View>
            <View style={styles.detectionCopyBox}>
              <View style={styles.detectionCopyHeader}>
                <Sparkles size={12} color={theme.colors.primary[300]} strokeWidth={2} />
                <Text style={styles.detectionCopyLabel}>자동 생성 마케팅 문구</Text>
              </View>
              <Text style={styles.detectionCopyText}>{liveDetection.marketingCopy}</Text>
            </View>
            <Text style={styles.detectionHint}>저장하면 이 문구가 캡션에 자동 적용됩니다</Text>
          </View>
        )}
        <TextInput
          style={[styles.editorInput, styles.editorLabelInput]}
          value={inputLabel}
          onChangeText={setInputLabel}
          placeholder="링크 이름 (선택사항)"
          placeholderTextColor={theme.colors.dark.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}
        {warning && !error && (
          <View style={styles.warningBox}>
            <AlertCircle size={12} color={theme.colors.warning[400]} strokeWidth={2} />
            <Text style={styles.warningText}>{warning}</Text>
          </View>
        )}
        {selectedMeta && selectedAffiliate !== 'Custom' && (
          <TouchableOpacity
            style={styles.brandConnectLink}
            onPress={() => handleOpen(selectedMeta.issueUrl)}
            activeOpacity={0.7}
          >
            <ExternalLink size={14} color={theme.colors.primary[300]} strokeWidth={2} />
            <Text style={styles.brandConnectText}>{selectedMeta.issueLabel}</Text>
          </TouchableOpacity>
        )}
        <View style={styles.editorActions}>
          <TouchableOpacity
            style={styles.editorCancelBtn}
            onPress={closeEditor}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Text style={styles.editorCancelText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.editorSaveBtn, saving && styles.editorSaveBtnDisabled]}
            onPress={handleSaveLink}
            disabled={saving}
            activeOpacity={0.7}
          >
            {saving ? (
              <ActivityIndicator size={16} color="#fff" />
            ) : (
              <Check size={16} color="#fff" strokeWidth={2} />
            )}
            <Text style={styles.editorSaveText}>{saving ? '저장 중...' : '저장'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accordionTitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  appliedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.success[500],
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  appliedBadgeText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  accordionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accordionToggleHint: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  accordionSubtitle: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: theme.spacing.sm,
    lineHeight: 19,
  },
  label: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  subLabel: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  platformGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  platformTab: {
    width: 72,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  platformTabIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  platformTabActive: {
    backgroundColor: theme.colors.dark.surface,
  },
  platformTabText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  platformDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  selectedPlatformInfo: {
    flexDirection: 'row',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  selectedPlatformIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedPlatformBody: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  selectedPlatformName: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  selectedPlatformHint: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 3,
    lineHeight: 16,
  },
  issueLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  issueLinkText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.dark.border,
  },
  cardCustom: {
    backgroundColor: theme.colors.primary[500] + '10',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderBottomWidth: 0,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  platformText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  productName: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginTop: 2,
  },
  priceText: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
    marginTop: 2,
  },
  priceCustom: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.success[400],
    marginTop: 2,
  },
  priceFaint: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 2,
  },
  actionWrap: {
    width: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: theme.colors.primary[500] + '40',
  },
  pasteButtonActive: {
    borderColor: theme.colors.error[400] + '40',
  },
  pasteButtonText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  pasteButtonTextRemove: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.error[400],
  },
  editCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
  },
  editCustomText: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  shortLinkBox: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.primary[500] + '20',
  },
  shortLinkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  shortLinkTitle: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  shortLinkUrl: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    marginBottom: 8,
  },
  shortLinkCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary[500] + '15',
    alignSelf: 'flex-start',
  },
  shortLinkCopyBtnDone: {
    backgroundColor: theme.colors.success[500] + '15',
  },
  shortLinkCopyText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  editorBox: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.colors.primary[500] + '40',
  },
  editorTitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginBottom: theme.spacing.xs,
  },
  editorHint: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
    marginBottom: theme.spacing.sm,
  },
  editorInput: {
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    minHeight: 48,
  },
  editorLabelInput: {
    marginTop: theme.spacing.sm,
    minHeight: 40,
  },
  errorText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.error[400],
    marginTop: theme.spacing.sm,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warning[500] + '12',
    borderWidth: 1,
    borderColor: theme.colors.warning[500] + '30',
    marginTop: 6,
  },
  warningText: {
    flex: 1,
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.warning[400],
    lineHeight: 14,
  },
  brandConnectLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
  },
  brandConnectText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
  },
  editorActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  editorCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.bg,
  },
  editorCancelText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  editorSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary[500],
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  editorSaveBtnDisabled: {
    opacity: 0.6,
  },
  editorSaveText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  detectionPreview: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.warning[400] + '30',
  },
  detectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  detectionPlatform: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
  },
  detectionBadgeRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.sm,
  },
  detectionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  detectionBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  detectionCopyBox: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
  },
  detectionCopyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  detectionCopyLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  detectionCopyText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 18,
  },
  detectionHint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: theme.spacing.sm,
  },
  emptyStateBox: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  emptyStateTitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginTop: theme.spacing.xs,
  },
  emptyStateDesc: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 20,
  },
  fallbackLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surface,
    gap: theme.spacing.sm,
  },
  fallbackLinkText: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  emptyStateAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
  },
  emptyStateAddText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
});
