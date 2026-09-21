import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { ScanText, Search, Copy, Check, ExternalLink, Info, ShoppingBag, Sparkles, Tag } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { OCR_TEXT_FUNCTION_URL, supabaseAnonKey } from '@/lib/supabase';
import { safeFetch } from '@/lib/apiClient';
import * as Clipboard from 'expo-clipboard';

interface OcrTextItem {
  text: string;
  type: 'brand' | 'model' | 'price' | 'spec' | 'other';
}

interface OcrResult {
  rawTexts: OcrTextItem[];
  brandName: string | null;
  modelName: string | null;
  priceText: string | null;
  searchTerms: string[];
  recommendedSearchQuery: string;
}

interface OcrTextExtractorProps {
  imageUrl: string;
  onSearchTermSelected?: (term: string) => void;
}

const TYPE_LABELS: Record<OcrTextItem['type'], string> = {
  brand: '브랜드',
  model: '모델명',
  price: '가격',
  spec: '스펙',
  other: '기타',
};

const TYPE_COLORS: Record<OcrTextItem['type'], string> = {
  brand: theme.colors.primary[400],
  model: theme.colors.accent[400],
  price: theme.colors.warning[400],
  spec: theme.colors.success[400],
  other: theme.colors.dark.textDim,
};

const SEARCH_PLATFORMS = [
  { label: '쿠팡 검색', url: (q: string) => `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}` },
  { label: '네이버 쇼핑 검색', url: (q: string) => `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(q)}` },
  { label: '네이버 브랜드커넥트', url: (_q: string) => `https://brandconnect.naver.com/about/creator` },
  { label: '쿠팡 파트너스', url: (_q: string) => `https://partners.coupang.com/` },
];

export function OcrTextExtractor({ imageUrl, onSearchTermSelected }: OcrTextExtractorProps) {
  const [result, setResult] = useState<OcrResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState(false);
  const [copiedTerm, setCopiedTerm] = useState<string | null>(null);

  const handleExtract = useCallback(async () => {
    if (loading || !imageUrl) return;
    setLoading(true);
    setError(null);
    try {
      const response = await safeFetch(OCR_TEXT_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ imageDataUrl: imageUrl }),
        timeoutMs: 25000,
      });
      if (response.ok) {
        const data: OcrResult = await response.json();
        if (data.rawTexts && data.rawTexts.length > 0) {
          setResult(data);
          setExtracted(true);
        } else if (data.searchTerms && data.searchTerms.length > 0) {
          setResult(data);
          setExtracted(true);
        } else {
          setError('사진에서 텍스트를 찾지 못했어요. 글자가 선명한 사진으로 다시 시도해주세요.');
        }
      } else {
        setError('OCR 분석 중 오류가 발생했어요.');
      }
    } catch {
      setError('네트워크 오류가 발생했어요. 다시 시도해주세요.');
    }
    setLoading(false);
  }, [loading, imageUrl]);

  const handleCopy = useCallback(async (text: string) => {
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        await Clipboard.setStringAsync(text);
      }
    } else {
      await Clipboard.setStringAsync(text);
    }
    setCopiedTerm(text);
    setTimeout(() => setCopiedTerm(null), 2000);
  }, []);

  const handleSearch = useCallback((url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }, []);

  const handleUseTerm = useCallback((term: string) => {
    onSearchTermSelected?.(term);
    handleCopy(term);
  }, [onSearchTermSelected, handleCopy]);

  const hasTexts = result && result.rawTexts.length > 0;
  const hasSearchTerms = result && result.searchTerms.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ScanText size={16} color={theme.colors.primary[400]} strokeWidth={2} />
          <Text style={styles.title}>스마트 OCR 텍스트 추출</Text>
        </View>
        {!extracted && !loading && (
          <TouchableOpacity style={styles.extractBtn} onPress={handleExtract} activeOpacity={0.8}>
            <Sparkles size={12} color="#fff" strokeWidth={2} />
            <Text style={styles.extractBtnText}>텍스트 추출</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.desc}>
        사진 속 브랜드명, 모델명, 가격 등을 AI가 자동으로 인식해서 제휴 쇼핑 검색어를 제안해요. 제휴 링크 없이 사진만으로 빠르게 쇼핑 매칭을 시작할 수 있어요.
      </Text>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={theme.colors.primary[400]} />
          <Text style={styles.loadingText}>사진 속 텍스트를 AI가 분석 중...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Info size={12} color={theme.colors.error[400]} strokeWidth={2} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleExtract} activeOpacity={0.7}>
            <Text style={styles.retryText}>재시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {extracted && result && !loading && (
        <View style={styles.resultWrap}>
          {/* Brand / Model summary */}
          {(result.brandName || result.modelName || result.priceText) && (
            <View style={styles.summaryBox}>
              {result.brandName && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>브랜드</Text>
                  <Text style={styles.summaryValue}>{result.brandName}</Text>
                </View>
              )}
              {result.modelName && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>모델명</Text>
                  <Text style={styles.summaryValue}>{result.modelName}</Text>
                </View>
              )}
              {result.priceText && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>가격</Text>
                  <Text style={styles.summaryValue}>{result.priceText}</Text>
                </View>
              )}
            </View>
          )}

          {/* Extracted text items */}
          {hasTexts && (
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionLabel}>추출된 텍스트</Text>
              <ScrollView style={styles.textList} nestedScrollEnabled>
                {result.rawTexts.map((item, i) => (
                  <View key={i} style={styles.textItemRow}>
                    <View style={[styles.textTypeBadge, { backgroundColor: TYPE_COLORS[item.type] + '20' }]}>
                      <Text style={[styles.textTypeText, { color: TYPE_COLORS[item.type] }]}>
                        {TYPE_LABELS[item.type]}
                      </Text>
                    </View>
                    <Text style={styles.textItemText} numberOfLines={2}>{item.text}</Text>
                    <TouchableOpacity
                      style={styles.copyIconBtn}
                      onPress={() => handleCopy(item.text)}
                      activeOpacity={0.7}
                    >
                      {copiedTerm === item.text ? (
                        <Check size={12} color={theme.colors.success[400]} strokeWidth={2} />
                      ) : (
                        <Copy size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Search terms */}
          {hasSearchTerms && (
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionLabel}>추천 검색어</Text>
              <View style={styles.searchTermsRow}>
                {result.searchTerms.map((term, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.searchTermPill,
                      result.recommendedSearchQuery === term && styles.searchTermPillRecommended,
                    ]}
                    onPress={() => handleUseTerm(term)}
                    activeOpacity={0.7}
                  >
                    <Tag size={10} color={result.recommendedSearchQuery === term ? '#fff' : theme.colors.primary[300]} strokeWidth={2} />
                    <Text
                      style={[
                        styles.searchTermText,
                        result.recommendedSearchQuery === term && styles.searchTermTextRecommended,
                      ]}
                      numberOfLines={1}
                    >
                      {term}
                    </Text>
                    {copiedTerm === term && (
                      <Check size={10} color="#fff" strokeWidth={2} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.searchHint}>검색어를 탭하면 복사되어 쇼핑커넥트 검색에 사용됩니다.</Text>
            </View>
          )}

          {/* Quick search links */}
          {result.recommendedSearchQuery && (
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionLabel}>원클릭 제휴 검색</Text>
              <View style={styles.searchLinksWrap}>
                {SEARCH_PLATFORMS.map((platform, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.searchLinkRow}
                    onPress={() => handleSearch(platform.url(result.recommendedSearchQuery))}
                    activeOpacity={0.8}
                  >
                    <View style={styles.searchLinkLeft}>
                      <View style={styles.searchLinkIcon}>
                        <ShoppingBag size={12} color={theme.colors.primary[300]} strokeWidth={2} />
                      </View>
                      <Text style={styles.searchLinkText}>{platform.label}</Text>
                    </View>
                    <ExternalLink size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Re-extract button */}
          <TouchableOpacity style={styles.reExtractBtn} onPress={handleExtract} activeOpacity={0.7}>
            <RefreshText />
            <Text style={styles.reExtractBtnText}>다시 분석하기</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function RefreshText() {
  return <Sparkles size={11} color={theme.colors.primary[300]} strokeWidth={2} />;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    marginBottom: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  desc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
    marginBottom: 10,
  },
  extractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
  },
  extractBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.error[500] + '12',
    borderWidth: 1,
    borderColor: theme.colors.error[500] + '30',
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
  retryBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.error[500] + '20',
  },
  retryText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.error[400],
  },
  resultWrap: {
    marginTop: 4,
  },
  summaryBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    width: 40,
  },
  summaryValue: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    flex: 1,
  },
  sectionWrap: {
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  textList: {
    maxHeight: 180,
  },
  textItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    marginBottom: 4,
  },
  textTypeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: theme.radius.sm,
    flexShrink: 0,
  },
  textTypeText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  textItemText: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 16,
  },
  copyIconBtn: {
    padding: 4,
    flexShrink: 0,
  },
  searchTermsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  searchTermPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  searchTermPillRecommended: {
    borderColor: theme.colors.primary[400],
    backgroundColor: theme.colors.primary[500] + '25',
  },
  searchTermText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
    maxWidth: 120,
  },
  searchTermTextRecommended: {
    color: '#fff',
  },
  searchHint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  searchLinksWrap: {
    gap: 5,
  },
  searchLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  searchLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchLinkIcon: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary[500] + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchLinkText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  reExtractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginTop: 4,
  },
  reExtractBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
});
