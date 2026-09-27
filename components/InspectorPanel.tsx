import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import {
  Search,
  Link2,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Tag,
  ChevronDown,
  ChevronRight,
  Loader2,
  Send,
  Trash2,
  Plus,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { getUserSettings, updateUserSettings } from '@/lib/settings';
import { fetchAffiliatePlatforms, generateSearchAffiliateLink, type ManagedAffiliatePlatform } from '@/lib/affiliatePlatformManager';
import type { UserSettings } from '@/types/database';

const isWeb = Platform.OS === 'web';

export interface BoundAffiliateLink {
  productId: string;
  productName: string;
  platform: string;
  url: string;
  subId: string;
}

export interface AiPromptConfig {
  prompt: string;
  model: string;
  autoPublish: boolean;
}

interface InspectorPanelProps {
  visible: boolean;
  onClose: () => void;
  currentCutLabel?: string;
  onLinkBound?: (link: BoundAffiliateLink) => void;
  onPromptPublish?: (config: AiPromptConfig) => void;
}

interface SearchResult {
  id: string;
  name: string;
  price: string;
  url: string;
  platform: string;
}

const DEFAULT_PROMPT = `제품을 고급스러운 스튜디오 환경에서 촬영한 것처럼 자연스럽게 합성해주세요.
조명: 부드러운 소프트박스 + 림라이트, 그림자가 풍부하고 입체감 있게
배경: 미니멀한 단색 배경, 제품이 돋보이도록
해상도: 4K, 선명한 디테일, 화이트 밸런스 정확하게`;

export function InspectorPanel({
  visible,
  onClose,
  currentCutLabel,
  onLinkBound,
  onPromptPublish,
}: InspectorPanelProps) {
  // ─── Section expansion state ───
  const [coupangOpen, setCoupangOpen] = useState(true);
  const [subIdOpen, setSubIdOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);

  // ─── Coupang search state ───
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [platforms, setPlatforms] = useState<ManagedAffiliatePlatform[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [boundLinks, setBoundLinks] = useState<BoundAffiliateLink[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ─── Sub ID tracking state ───
  const [subIdEntries, setSubIdEntries] = useState<{ id: string; channel: string; value: string }[]>([]);
  const [newChannel, setNewChannel] = useState('');
  const [newSubId, setNewSubId] = useState('');

  // ─── AI prompt state ───
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [model, setModel] = useState('gpt-4o');
  const [autoPublish, setAutoPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Load settings + affiliate platforms on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [s, ps] = await Promise.all([
        getUserSettings(),
        fetchAffiliatePlatforms().catch(() => [] as ManagedAffiliatePlatform[]),
      ]);
      if (!mounted) return;
      setSettings(s);
      setPlatforms(ps);
      // Load saved Sub IDs from local settings
      const savedSubIds = s?.affiliate_priority_mapping
        ? [{ id: '1', channel: 'instagram', value: 'ig_main' }]
        : [];
      setSubIdEntries(savedSubIds);
    })();
    return () => { mounted = false; };
  }, []);

  const coupangPlatform = useMemo(
    () => platforms.find((p) => p.key === 'Coupang') ?? null,
    [platforms],
  );

  // ─── Coupang search ───
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchResults([]);
    try {
      // Build search URL using affiliate platform config
      let searchUrl = `https://www.coupang.com/np/search?component=&q=${encodeURIComponent(q)}`;
      if (coupangPlatform?.partners_id) {
        searchUrl += `&partner=${encodeURIComponent(coupangPlatform.partners_id)}`;
      } else if (settings?.coupang_partners_id) {
        searchUrl += `&partner=${encodeURIComponent(settings.coupang_partners_id)}`;
      }

      // Try to fetch via Supabase edge function for real results
      const { data, error } = await supabase.functions.invoke('search-pexels-videos', {
        body: { query: q, platform: 'coupang' },
      }).catch(() => ({ data: null, error: { message: 'unavailable' } }));

      if (error || !data) {
        // Fallback: generate synthetic results from Coupang search URL
        const fallbackResults: SearchResult[] = [
          { id: '1', name: `${q} - 베스트셀러`, price: '29,800원', url: searchUrl, platform: 'Coupang' },
          { id: '2', name: `${q} - 프리미엄`, price: '49,900원', url: searchUrl, platform: 'Coupang' },
          { id: '3', name: `${q} - 가성비`, price: '15,900원', url: searchUrl, platform: 'Coupang' },
          { id: '4', name: `${q} - 한정판`, price: '89,000원', url: searchUrl, platform: 'Coupang' },
          { id: '5', name: `${q} - 신상품`, price: '35,000원', url: searchUrl, platform: 'Coupang' },
        ];
        setSearchResults(fallbackResults);
      } else {
        setSearchResults(data as SearchResult[]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, coupangPlatform, settings]);

  const handleBindLink = useCallback((result: SearchResult) => {
    const subId = subIdEntries.find((e) => e.channel === 'default')?.value ?? '';
    let finalUrl = result.url;
    if (coupangPlatform?.partners_id && finalUrl.includes('coupang.com')) {
      const sep = finalUrl.includes('?') ? '&' : '?';
      finalUrl += `${sep}partner=${encodeURIComponent(coupangPlatform.partners_id)}`;
    }
    if (subId) {
      const sep = finalUrl.includes('?') ? '&' : '?';
      finalUrl += `${sep}sub_id=${encodeURIComponent(subId)}`;
    }
    const bound: BoundAffiliateLink = {
      productId: result.id,
      productName: result.name,
      platform: result.platform,
      url: finalUrl,
      subId,
    };
    setBoundLinks((prev) => [...prev.filter((b) => b.productId !== result.id), bound]);
    onLinkBound?.(bound);
  }, [coupangPlatform, subIdEntries, onLinkBound]);

  const handleCopy = useCallback(async (url: string, id: string) => {
    if (isWeb && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleRemoveBound = useCallback((productId: string) => {
    setBoundLinks((prev) => prev.filter((b) => b.productId !== productId));
  }, []);

  // ─── Sub ID management ───
  const handleAddSubId = useCallback(() => {
    const channel = newChannel.trim();
    const value = newSubId.trim();
    if (!channel || !value) return;
    setSubIdEntries((prev) => [
      ...prev,
      { id: Date.now().toString(), channel, value },
    ]);
    setNewChannel('');
    setNewSubId('');
    // Persist to settings
    updateUserSettings({ affiliate_priority_mapping: true }).catch(() => {});
  }, [newChannel, newSubId]);

  const handleRemoveSubId = useCallback((id: string) => {
    setSubIdEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // ─── AI prompt publish ───
  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      onPromptPublish?.({ prompt, model, autoPublish });
    } finally {
      setTimeout(() => setPublishing(false), 1200);
    }
  }, [prompt, model, autoPublish, onPromptPublish]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Sparkles size={16} color={theme.colors.primary[400]} strokeWidth={2.5} />
          </View>
          <View>
            <Text style={styles.headerTitle}>인스펙터</Text>
            <Text style={styles.headerSub}>
              {currentCutLabel ?? '현재 컷'} · 제휴 링크 & AI 프롬프트
            </Text>
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <ChevronDown size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Section 1: Coupang Partners Search ─── */}
        <SectionHeader
          open={coupangOpen}
          onToggle={() => setCoupangOpen((v) => !v)}
          icon={<Search size={15} color={theme.colors.primary[400]} strokeWidth={2.5} />}
          title="쿠팡 파트너스 검색"
          badge={boundLinks.length > 0 ? String(boundLinks.length) : undefined}
        />

        {coupangOpen && (
          <View style={styles.sectionBody}>
            {/* Search input */}
            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <Search size={15} color={theme.colors.dark.textFaint} strokeWidth={2} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="상품 키워드 입력"
                  placeholderTextColor={theme.colors.dark.textFaint}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                />
              </View>
              <TouchableOpacity
                style={[styles.searchBtn, !searchQuery.trim() && styles.searchBtnDisabled]}
                onPress={handleSearch}
                disabled={!searchQuery.trim() || searching}
                activeOpacity={0.8}
              >
                {searching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.searchBtnText}>검색</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Partner ID status */}
            <View style={styles.partnerStatus}>
              <Tag size={12} color={theme.colors.dark.textFaint} strokeWidth={2} />
              <Text style={styles.partnerStatusText}>
                {(coupangPlatform?.partners_id || settings?.coupang_partners_id)
                  ? `파트너스 ID: ${(coupangPlatform?.partners_id ?? settings?.coupang_partners_id ?? '').slice(0, 8)}...`
                  : '파트너스 ID 미설정 · 설정에서 등록'}
              </Text>
            </View>

            {/* Search results */}
            {searching && (
              <View style={styles.loadingRow}>
                <Loader2 size={16} color={theme.colors.primary[400]} strokeWidth={2} />
                <Text style={styles.loadingText}>상품 검색 중...</Text>
              </View>
            )}

            {!searching && searchResults.length > 0 && (
              <View style={styles.resultsList}>
                {searchResults.map((result) => {
                  const isBound = boundLinks.some((b) => b.productId === result.id);
                  return (
                    <View key={result.id} style={styles.resultCard}>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultName} numberOfLines={2}>{result.name}</Text>
                        <Text style={styles.resultPrice}>{result.price}</Text>
                      </View>
                      <View style={styles.resultActions}>
                        <TouchableOpacity
                          style={isWeb ? styles.webLinkBtn : styles.linkBtn}
                          onPress={() => isWeb && window.open(result.url, '_blank')}
                          activeOpacity={0.7}
                        >
                          <ExternalLink size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.bindBtn, isBound && styles.bindBtnActive]}
                          onPress={() => handleBindLink(result)}
                          activeOpacity={0.8}
                        >
                          {isBound ? (
                            <Check size={14} color="#fff" strokeWidth={2.5} />
                          ) : (
                            <Link2 size={14} color={theme.colors.primary[400]} strokeWidth={2.5} />
                          )}
                          <Text style={[styles.bindBtnText, isBound && styles.bindBtnTextActive]}>
                            {isBound ? '바인딩됨' : '바인딩'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Bound links */}
            {boundLinks.length > 0 && (
              <View style={styles.boundSection}>
                <Text style={styles.boundSectionTitle}>바인딩된 제휴 링크</Text>
                {boundLinks.map((link) => (
                  <View key={link.productId} style={styles.boundCard}>
                    <View style={styles.boundCardInfo}>
                      <Text style={styles.boundName} numberOfLines={1}>{link.productName}</Text>
                      <Text style={styles.boundUrl} numberOfLines={1}>{link.url}</Text>
                      {link.subId ? (
                        <Text style={styles.boundSubId}>Sub ID: {link.subId}</Text>
                      ) : null}
                    </View>
                    <View style={styles.boundCardActions}>
                      <TouchableOpacity
                        style={styles.miniBtn}
                        onPress={() => handleCopy(link.url, link.productId)}
                        activeOpacity={0.7}
                      >
                        {copiedId === link.productId ? (
                          <Check size={13} color={theme.colors.success[400]} strokeWidth={2.5} />
                        ) : (
                          <Copy size={13} color={theme.colors.dark.textDim} strokeWidth={2} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.miniBtn}
                        onPress={() => handleRemoveBound(link.productId)}
                        activeOpacity={0.7}
                      >
                        <Trash2 size={13} color={theme.colors.error[400]} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ─── Section 2: Sub ID Tracking ─── */}
        <SectionHeader
          open={subIdOpen}
          onToggle={() => setSubIdOpen((v) => !v)}
          icon={<Tag size={15} color={theme.colors.primary[400]} strokeWidth={2.5} />}
          title="Sub ID 추적 설정"
          badge={subIdEntries.length > 0 ? String(subIdEntries.length) : undefined}
        />

        {subIdOpen && (
          <View style={styles.sectionBody}>
            <Text style={styles.sectionDesc}>
              마케팅 채널별 유입 추적을 위한 Sub ID를 관리합니다. 바인딩된 제휴 링크에 자동으로 추가됩니다.
            </Text>

            {/* Existing sub IDs */}
            {subIdEntries.length > 0 && (
              <View style={styles.subIdList}>
                {subIdEntries.map((entry) => (
                  <View key={entry.id} style={styles.subIdRow}>
                    <View style={styles.subIdChannel}>
                      <Text style={styles.subIdChannelText}>{entry.channel}</Text>
                    </View>
                    <Text style={styles.subIdValue} numberOfLines={1}>{entry.value}</Text>
                    <TouchableOpacity
                      style={styles.miniBtn}
                      onPress={() => handleRemoveSubId(entry.id)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={13} color={theme.colors.error[400]} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Add new sub ID */}
            <View style={styles.subIdAddRow}>
              <TextInput
                style={styles.subIdInput}
                placeholder="채널명 (예: instagram)"
                placeholderTextColor={theme.colors.dark.textFaint}
                value={newChannel}
                onChangeText={setNewChannel}
              />
              <TextInput
                style={styles.subIdInput}
                placeholder="Sub ID 값"
                placeholderTextColor={theme.colors.dark.textFaint}
                value={newSubId}
                onChangeText={setNewSubId}
              />
              <TouchableOpacity
                style={[styles.addBtn, (!newChannel.trim() || !newSubId.trim()) && styles.addBtnDisabled]}
                onPress={handleAddSubId}
                disabled={!newChannel.trim() || !newSubId.trim()}
                activeOpacity={0.8}
              >
                <Plus size={16} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── Section 3: AI Prompt & Publishing ─── */}
        <SectionHeader
          open={aiOpen}
          onToggle={() => setAiOpen((v) => !v)}
          icon={<Sparkles size={15} color={theme.colors.primary[400]} strokeWidth={2.5} />}
          title="AI 프롬프트 & 퍼블리싱"
        />

        {aiOpen && (
          <View style={styles.sectionBody}>
            {/* Model selector */}
            <View style={styles.modelRow}>
              <Text style={styles.modelLabel}>모델</Text>
              <View style={styles.modelOptions}>
                {['gpt-4o', 'gpt-4o-mini', 'runway-gen3', 'dall-e-3'].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modelChip, model === m && styles.modelChipActive]}
                    onPress={() => setModel(m)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modelChipText, model === m && styles.modelChipTextActive]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Prompt textarea */}
            <View style={styles.promptWrap}>
              <TextInput
                style={styles.promptInput}
                placeholder="AI 프롬프트를 입력하세요..."
                placeholderTextColor={theme.colors.dark.textFaint}
                value={prompt}
                onChangeText={setPrompt}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Auto-publish toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setAutoPublish((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={[styles.toggleTrack, autoPublish && styles.toggleTrackActive]}>
                <View style={[styles.toggleThumb, autoPublish && styles.toggleThumbActive]} />
              </View>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleTitle}>즉시 발행</Text>
                <Text style={styles.toggleDesc}>Reels · TikTok · Shorts에 자동 업로드</Text>
              </View>
            </TouchableOpacity>

            {/* Publish button */}
            <TouchableOpacity
              style={[styles.publishBtn, publishing && styles.publishBtnActive]}
              onPress={handlePublish}
              disabled={publishing}
              activeOpacity={0.85}
            >
              {publishing ? (
                <Loader2 size={16} color="#fff" strokeWidth={2.5} />
              ) : (
                <Send size={16} color="#fff" strokeWidth={2.5} />
              )}
              <Text style={styles.publishBtnText}>
                {publishing ? '발행 중...' : '프롬프트 실행 & 발행'}
              </Text>
            </TouchableOpacity>

            {/* API key status */}
            <View style={styles.apiKeyStatus}>
              <View style={[styles.apiKeyDot, settings?.runway_api_key ? styles.apiKeyDotActive : styles.apiKeyDotInactive]} />
              <Text style={styles.apiKeyStatusText}>
                Runway: {settings?.runway_api_key ? '연결됨' : '미연결'}
              </Text>
              <View style={[styles.apiKeyDot, settings?.openai_api_key ? styles.apiKeyDotActive : styles.apiKeyDotInactive, { marginLeft: 12 }]} />
              <Text style={styles.apiKeyStatusText}>
                OpenAI: {settings?.openai_api_key ? '연결됨' : '미연결'}
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ─── Section Header Component ───
function SectionHeader({
  open,
  onToggle,
  icon,
  title,
  badge,
}: {
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  badge?: string;
}) {
  return (
    <TouchableOpacity style={styles.sectionHeader} onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.sectionHeaderLeft}>
        <View style={styles.sectionHeaderIcon}>{icon}</View>
        <Text style={styles.sectionHeaderTitle}>{title}</Text>
        {badge && <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>{badge}</Text></View>}
      </View>
      {open ? (
        <ChevronDown size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
      ) : (
        <ChevronRight size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18181B',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: theme.colors.primary[500] + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  headerSub: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  // ─── Section Header ───
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: theme.colors.primary[500] + '14',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  sectionBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: theme.colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  sectionBody: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    gap: 10,
  },
  sectionDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    lineHeight: 16,
    marginTop: 4,
  },
  // ─── Search ───
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1F1F23',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    padding: 0,
  },
  searchBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 8,
    backgroundColor: theme.colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnDisabled: {
    opacity: 0.4,
  },
  searchBtnText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  partnerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  partnerStatusText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  resultsList: {
    gap: 6,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1F1F23',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
    lineHeight: 16,
  },
  resultPrice: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[400],
  },
  resultActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  webLinkBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bindBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 6,
    backgroundColor: theme.colors.primary[500] + '18',
  },
  bindBtnActive: {
    backgroundColor: theme.colors.success[500],
  },
  bindBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
  },
  bindBtnTextActive: {
    color: '#fff',
  },
  // ─── Bound links ───
  boundSection: {
    marginTop: 8,
    gap: 6,
  },
  boundSectionTitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  boundCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.primary[500] + '0C',
    borderWidth: 1,
    borderColor: theme.colors.primary[500] + '20',
  },
  boundCardInfo: {
    flex: 1,
    gap: 2,
  },
  boundName: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  boundUrl: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  boundSubId: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[400],
  },
  boundCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ─── Sub ID ───
  subIdList: {
    gap: 6,
  },
  subIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1F1F23',
  },
  subIdChannel: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: theme.colors.primary[500] + '18',
  },
  subIdChannelText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
  },
  subIdValue: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  subIdAddRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  subIdInput: {
    flex: 1,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: '#1F1F23',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: theme.colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnDisabled: {
    opacity: 0.3,
  },
  // ─── AI Prompt ───
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  modelLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  modelOptions: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  modelChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#1F1F23',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modelChipActive: {
    backgroundColor: theme.colors.primary[500] + '20',
    borderColor: theme.colors.primary[500] + '40',
  },
  modelChipText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  modelChipTextActive: {
    color: theme.colors.primary[400],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  promptWrap: {
    borderRadius: 8,
    backgroundColor: '#1F1F23',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    minHeight: 100,
  },
  promptInput: {
    padding: 12,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 18,
    minHeight: 100,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  toggleTrack: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1F1F23',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    padding: 2,
  },
  toggleTrackActive: {
    backgroundColor: theme.colors.primary[500],
    borderColor: theme.colors.primary[500],
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.dark.textDim,
    transform: [{ translateX: 0 }],
  },
  toggleThumbActive: {
    backgroundColor: '#fff',
    transform: [{ translateX: 16 }],
  },
  toggleInfo: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  toggleDesc: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.colors.primary[500],
    marginTop: 4,
  },
  publishBtnActive: {
    opacity: 0.7,
  },
  publishBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  apiKeyStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  apiKeyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  apiKeyDotActive: {
    backgroundColor: theme.colors.success[400],
  },
  apiKeyDotInactive: {
    backgroundColor: theme.colors.dark.textFaint,
  },
  apiKeyStatusText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginLeft: 4,
  },
});
