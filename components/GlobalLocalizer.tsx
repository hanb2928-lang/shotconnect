import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';

import { Globe, Zap, CircleAlert as AlertCircle, Volume2, Check, ShoppingBag, ChevronDown, ChevronUp, Info, Play, Pause, Copy, Globe as Globe2, Sparkles, ShieldCheck, Download } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { LOCALIZE_FUNCTION_URL, TTS_FUNCTION_URL, BATCH_TTS_FUNCTION_URL, supabaseAnonKey } from '@/lib/supabase';
import { TARGET_LANGUAGES } from '@/lib/globalAffiliate';
import { getMultilingualVoice } from '@/lib/ttsVoices';
import { getLocalizedDisclosure } from '@/lib/disclosure';
import type { DisclosurePlacement } from '@/lib/platformUpload';

interface LocalizedContent {
  language: string;
  languageCode: string;
  hook: string;
  title: string;
  caption: string;
  hashtags: string[];
  narrationText: string;
  ttsVoice: string;
  affiliatePlatform: string;
  affiliateUrl: string;
  disclosureText?: string;
  disclosureRegulation?: string;
  personaTone?: string;
  localizedHashtags?: string[];
}

interface GlobalLocalizerProps {
  hook: string;
  title: string;
  caption: string;
  hashtags: string[];
  productName: string;
  productCategory: string;
  narrationText?: string;
  affiliateUrl?: string;
  preloadedKoreanTtsUrl?: string | null;
}

export function GlobalLocalizer({
  hook,
  title,
  caption,
  hashtags,
  productName,
  productCategory,
  narrationText,
  affiliateUrl,
  preloadedKoreanTtsUrl,
}: GlobalLocalizerProps) {
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en', 'ja']);
  const [localizations, setLocalizations] = useState<LocalizedContent[]>([]);
  const [loading, setLoading] = useState(false);
  const [ttsLoading, setTtsLoading] = useState<string | null>(null);
  const [batchTtsLoading, setBatchTtsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLang, setExpandedLang] = useState<string | null>(null);
  const [ttsResults, setTtsResults] = useState<Record<string, string>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [guideExpanded, setGuideExpanded] = useState(false);
  const [koreanTtsPlaying, setKoreanTtsPlaying] = useState(false);
  const [showGlobalOnly, setShowGlobalOnly] = useState(false);

  const handlePlayKoreanTTS = useCallback(async () => {
    if (!preloadedKoreanTtsUrl) return;
    if (Platform.OS !== 'web') return;
    try {
      if (audioRef.current) { audioRef.current.pause(); }
      const audio = new Audio(preloadedKoreanTtsUrl);
      audioRef.current = audio;
      audio.onended = () => setKoreanTtsPlaying(false);
      audio.onpause = () => setKoreanTtsPlaying(false);
      await audio.play();
      setKoreanTtsPlaying(true);
    } catch {
      setKoreanTtsPlaying(false);
    }
  }, [preloadedKoreanTtsUrl]);


  const toggleLang = useCallback((code: string) => {
    setSelectedLangs(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  }, []);

  const handleLocalize = useCallback(async () => {
    if (selectedLangs.length === 0) return;
    setLoading(true);
    setError(null);
    setLocalizations([]);
    setTtsResults({});
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(LOCALIZE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          hook,
          title,
          caption,
          hashtags,
          productName,
          productCategory,
          narrationText,
          targetLanguages: selectedLangs,
          affiliateUrl,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.localizations && Array.isArray(data.localizations)) {
          const merged = data.localizations.map((loc: LocalizedContent) => {
            if (!loc.disclosureText) {
              const fallback = getLocalizedDisclosure(loc.languageCode);
              if (fallback) {
                loc.disclosureText = fallback.text;
                loc.disclosureRegulation = fallback.regulation;
              }
            }
            return loc;
          });
          setLocalizations(merged);
        }
      } else {
        setError('번역에 실패했어요. 다시 시도해주세요');
      }
    } catch {
      setError('네트워크 오류로 번역에 실패했어요');
    }
    setLoading(false);
  }, [selectedLangs, hook, title, caption, hashtags, productName, productCategory, narrationText, affiliateUrl]);

  const handleCopyFullPost = useCallback(async (loc: LocalizedContent) => {
    const parts: string[] = [];
    if (loc.hook) parts.push(loc.hook);
    if (loc.caption) parts.push(loc.caption);
    if (loc.hashtags && loc.hashtags.length > 0) {
      parts.push(loc.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' '));
    }
    const disclosurePlacement: DisclosurePlacement = loc.affiliatePlatform?.toLowerCase().includes('youtube') ? 'comment' : 'body';
    if (loc.disclosureText && disclosurePlacement === 'body') parts.push(loc.disclosureText);
    const fullText = parts.join('\n\n');
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(fullText);
      }
    } catch {}
    setCopiedField(`${loc.languageCode}-fullpost`);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const handleGenerateTTS = useCallback(async (langCode: string, text: string, voice: string) => {
    if (!text) return;
    setTtsLoading(langCode);
    try {
      const multilingualVoice = getMultilingualVoice(langCode);
      const ttsVoice = multilingualVoice?.openaiVoice || voice;
      const instructions = multilingualVoice?.instructions;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(TTS_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ text, voice: ttsVoice, speed: 1.0, instructions }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.audioBase64) {
          setTtsResults(prev => ({ ...prev, [langCode]: `data:audio/mpeg;base64,${data.audioBase64}` }));
        }
      }
    } catch {
      // TTS failed silently
    }
    setTtsLoading(null);
  }, []);

  const handleGenerateAllTTS = useCallback(async () => {
    if (localizations.length === 0 || batchTtsLoading) return;
    setBatchTtsLoading(true);
    try {
      const items = localizations.map(loc => {
        const mv = getMultilingualVoice(loc.languageCode);
        return {
          languageCode: loc.languageCode,
          text: loc.narrationText || loc.hook,
          voice: mv?.openaiVoice || loc.ttsVoice || 'alloy',
          instructions: mv?.instructions,
          speed: 1.0,
        };
      }).filter(item => item.text);
      if (items.length === 0) { setBatchTtsLoading(false); return; }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const response = await fetch(BATCH_TTS_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ items }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.results && Array.isArray(data.results)) {
          const newResults: Record<string, string> = {};
          for (const r of data.results) {
            if (r.audioBase64) {
              newResults[r.languageCode] = `data:audio/mpeg;base64,${r.audioBase64}`;
            }
          }
          setTtsResults(prev => ({ ...prev, ...newResults }));
        }
      }
    } catch {
      // batch TTS failed
    }
    setBatchTtsLoading(false);
  }, [localizations, batchTtsLoading]);

  const handleDownloadTTS = useCallback((langCode: string) => {
    const dataUrl = ttsResults[langCode];
    if (!dataUrl || Platform.OS !== 'web') return;
    try {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `tts-${langCode}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // download failed
    }
  }, [ttsResults]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const handlePlayTTS = useCallback(async (langCode: string) => {
    const dataUrl = ttsResults[langCode];
    if (!dataUrl) return;
    if (Platform.OS !== 'web') return;
    try {
      if (audioRef.current) { audioRef.current.pause(); }
      const audio = new Audio(dataUrl);
      audioRef.current = audio;
      audio.play().catch(() => {});
    } catch {
      // playback failed
    }
  }, [ttsResults]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Globe size={18} color={theme.colors.primary[400]} strokeWidth={2} />
          <Text style={styles.headerTitle}>글로벌 원클릭 로컬라이징</Text>
        </View>
      </View>

      <Text style={styles.description}>
        버튼 하나로 후킹, 캡션, 해시태그, AI 내레이션을 12개국 언어로 동시 번역하고 글로벌 이커머스 링크를 연동합니다. Amazon, AliExpress, Shopee 등 글로벌 제휴 플랫폼과 각 국가의 TikTok Shop에 맞춰 현지화된 카피와 AI 성우 음성을 자동 생성합니다.
      </Text>

      <TouchableOpacity
        style={styles.guideToggle}
        onPress={() => setGuideExpanded(!guideExpanded)}
        activeOpacity={0.7}
      >
        <Info size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
        <Text style={styles.guideToggleText}>사용법 {guideExpanded ? '접기' : '펼치기'}</Text>
        {guideExpanded ? <ChevronUp size={12} color={theme.colors.dark.textDim} strokeWidth={2} /> : <ChevronDown size={12} color={theme.colors.dark.textDim} strokeWidth={2} />}
      </TouchableOpacity>

      {guideExpanded && (
        <View style={styles.guideBox}>
          <View style={styles.guideStep}>
            <Text style={styles.guideStepNum}>1</Text>
            <Text style={styles.guideStepText}>번역할 언어를 탭하여 선택하세요 (여러 개 동시 선택 가능)</Text>
          </View>
          <View style={styles.guideStep}>
            <Text style={styles.guideStepNum}>2</Text>
            <Text style={styles.guideStepText}>&quot;동시 번역&quot; 버튼을 누르면 AI가 후킹·캡션·해시태그를 현지화합니다</Text>
          </View>
          <View style={styles.guideStep}>
            <Text style={styles.guideStepNum}>3</Text>
            <Text style={styles.guideStepText}>각 언어 카드를 펼쳐서 번역된 카피와 현지 해시태그를 확인하세요</Text>
          </View>
          <View style={styles.guideStep}>
            <Text style={styles.guideStepNum}>4</Text>
            <Text style={styles.guideStepText}>&quot;AI 음성 생성&quot;으로 현지 언어 내레이션을 만들고 재생하세요</Text>
          </View>
          <View style={styles.guideTipRow}>
            <ShoppingBag size={10} color={theme.colors.primary[300]} strokeWidth={2} />
            <Text style={styles.guideTipText}>각 언어별 TikTok Shop 플랫폼이 자동 표시됩니다</Text>
          </View>
        </View>
      )}

      <Text style={styles.optionLabel}>대상 언어 선택 (12개국)</Text>
      <TouchableOpacity
        style={styles.filterToggle}
        onPress={() => setShowGlobalOnly(!showGlobalOnly)}
        activeOpacity={0.7}
      >
        <Globe2 size={11} color={showGlobalOnly ? theme.colors.primary[300] : theme.colors.dark.textDim} strokeWidth={2} />
        <Text style={[styles.filterToggleText, showGlobalOnly && { color: theme.colors.primary[300] }]}>
          {showGlobalOnly ? '글로벌 플랫폼 대상만 보기' : '전체 언어 보기'}
        </Text>
      </TouchableOpacity>
      <View style={styles.langGrid}>
        {TARGET_LANGUAGES.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[styles.langPill, selectedLangs.includes(lang.code) && styles.langPillActive]}
            onPress={() => toggleLang(lang.code)}
            activeOpacity={0.7}
          >
            <Text style={[styles.langPillText, selectedLangs.includes(lang.code) && styles.langPillTextActive]}>
              {lang.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.localizeButton, selectedLangs.length === 0 && styles.localizeButtonDisabled]}
        onPress={handleLocalize}
        disabled={selectedLangs.length === 0 || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator size={18} color="#fff" />
        ) : (
          <Zap size={18} color="#fff" strokeWidth={2} />
        )}
        <Text style={styles.localizeButtonText}>
          {loading ? 'AI 번역 중...' : `${selectedLangs.length}개국 동시 번역`}
        </Text>
      </TouchableOpacity>

      {error && (
        <View style={styles.errorBox}>
          <AlertCircle size={14} color={theme.colors.error[400]} strokeWidth={2} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {preloadedKoreanTtsUrl && (
        <View style={styles.koreanTtsCard}>
          <View style={styles.koreanTtsLeft}>
            <Volume2 size={16} color={theme.colors.success[400]} strokeWidth={2} />
            <View>
              <Text style={styles.koreanTtsTitle}>한국어 내레이션 자동 생성됨</Text>
              <Text style={styles.koreanTtsSub}>후킹 문구로 AI 음성을 만들었어요</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.koreanTtsPlayBtn}
            onPress={handlePlayKoreanTTS}
            activeOpacity={0.7}
          >
            {koreanTtsPlaying ? (
              <Pause size={14} color="#fff" strokeWidth={2} />
            ) : (
              <Play size={14} color="#fff" strokeWidth={2} />
            )}
            <Text style={styles.koreanTtsPlayText}>{koreanTtsPlaying ? '정지' : '재생'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {localizations.length > 0 && (
        <View style={styles.resultsBox}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>번역 완료 ({localizations.length}개국)</Text>
            <TouchableOpacity
              style={[styles.batchTtsButton, batchTtsLoading && styles.batchTtsButtonDisabled]}
              onPress={handleGenerateAllTTS}
              disabled={batchTtsLoading}
              activeOpacity={0.8}
            >
              {batchTtsLoading ? (
                <ActivityIndicator size={11} color="#fff" />
              ) : (
                <Volume2 size={11} color="#fff" strokeWidth={2} />
              )}
              <Text style={styles.batchTtsButtonText}>
                {batchTtsLoading ? '음성 생성 중...' : '전체 언어 음성 동시 생성'}
              </Text>
            </TouchableOpacity>
          </View>
          {localizations.map((loc) => (
            <View key={loc.languageCode} style={styles.langCard}>
              <TouchableOpacity
                style={styles.langCardHeader}
                onPress={() => setExpandedLang(expandedLang === loc.languageCode ? null : loc.languageCode)}
                activeOpacity={0.7}
              >
                <View style={styles.langCardHeaderLeft}>
                  <Text style={styles.langCardLang} numberOfLines={1}>{loc.language}</Text>
                  <View style={styles.platformBadge}>
                    <ShoppingBag size={9} color={theme.colors.primary[300]} strokeWidth={2} />
                    <Text style={styles.platformText}>{loc.affiliatePlatform}</Text>
                  </View>
                </View>
                {expandedLang === loc.languageCode
                  ? <ChevronUp size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
                  : <ChevronDown size={14} color={theme.colors.dark.textDim} strokeWidth={2} />}
              </TouchableOpacity>

              {expandedLang === loc.languageCode && (
                <View style={styles.langCardBody}>
                  {/* Persona tone badge */}
                  {loc.personaTone ? (
                    <View style={styles.personaRow}>
                      <Sparkles size={10} color={theme.colors.warning[400]} strokeWidth={2} />
                      <Text style={styles.personaText}>{loc.personaTone}</Text>
                    </View>
                  ) : null}

                  <View style={styles.fieldBox}>
                    <View style={styles.fieldHeader}>
                      <Text style={styles.fieldLabel}>후킹</Text>
                      <TouchableOpacity
                        style={styles.fieldCopyBtn}
                        onPress={async () => {
                          try {
                            if (Platform.OS === 'web') {
                              await navigator.clipboard.writeText(loc.hook);
                            }
                          } catch {}
                          setCopiedField(`${loc.languageCode}-hook`);
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                      >
                        {copiedField === `${loc.languageCode}-hook` ? (
                          <Check size={10} color={theme.colors.success[400]} strokeWidth={2.5} />
                        ) : (
                          <Copy size={10} color={theme.colors.dark.textDim} strokeWidth={2} />
                        )}
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.fieldValue}>{loc.hook}</Text>
                  </View>
                  <View style={styles.fieldBox}>
                    <View style={styles.fieldHeader}>
                      <Text style={styles.fieldLabel}>캡션</Text>
                      <TouchableOpacity
                        style={styles.fieldCopyBtn}
                        onPress={async () => {
                          try {
                            if (Platform.OS === 'web') {
                              await navigator.clipboard.writeText(loc.caption);
                            }
                          } catch {}
                          setCopiedField(`${loc.languageCode}-caption`);
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                      >
                        {copiedField === `${loc.languageCode}-caption` ? (
                          <Check size={10} color={theme.colors.success[400]} strokeWidth={2.5} />
                        ) : (
                          <Copy size={10} color={theme.colors.dark.textDim} strokeWidth={2} />
                        )}
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.fieldValue}>{loc.caption}</Text>
                  </View>

                  {/* AI-translated hashtags */}
                  <View style={styles.fieldBox}>
                    <Text style={styles.fieldLabel}>해시태그 (AI 현지화)</Text>
                    <Text style={styles.fieldValue}>{loc.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}</Text>
                  </View>

                  {/* Country-specific recommended hashtags */}
                  {loc.localizedHashtags && loc.localizedHashtags.length > 0 && (
                    <View style={styles.fieldBox}>
                      <Text style={styles.fieldLabel}>현지 추천 해시태그</Text>
                      <Text style={styles.recommendedHashtags}>{loc.localizedHashtags.join(' ')}</Text>
                    </View>
                  )}

                  {/* Localized disclosure */}
                  {loc.disclosureText ? (
                    <View style={styles.disclosureBox}>
                      <View style={styles.disclosureHeader}>
                        <ShieldCheck size={10} color={theme.colors.success[400]} strokeWidth={2} />
                        <Text style={styles.disclosureLabel}>대가성 표기 ({loc.disclosureRegulation || '규제'})</Text>
                        <TouchableOpacity
                          style={styles.fieldCopyBtn}
                          onPress={async () => {
                            try {
                              if (Platform.OS === 'web') {
                                await navigator.clipboard.writeText(loc.disclosureText!);
                              }
                            } catch {}
                            setCopiedField(`${loc.languageCode}-disclosure`);
                            setTimeout(() => setCopiedField(null), 2000);
                          }}
                        >
                          {copiedField === `${loc.languageCode}-disclosure` ? (
                            <Check size={10} color={theme.colors.success[400]} strokeWidth={2.5} />
                          ) : (
                            <Copy size={10} color={theme.colors.dark.textDim} strokeWidth={2} />
                          )}
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.disclosureText}>{loc.disclosureText}</Text>
                    </View>
                  ) : null}

                  {/* Copy full post (caption + hashtags + disclosure) */}
                  <TouchableOpacity
                    style={styles.copyFullPostBtn}
                    onPress={() => handleCopyFullPost(loc)}
                    activeOpacity={0.7}
                  >
                    {copiedField === `${loc.languageCode}-fullpost` ? (
                      <Check size={11} color={theme.colors.success[400]} strokeWidth={2.5} />
                    ) : (
                      <Copy size={11} color={theme.colors.primary[300]} strokeWidth={2} />
                    )}
                    <Text style={[
                      styles.copyFullPostText,
                      copiedField === `${loc.languageCode}-fullpost` && { color: theme.colors.success[400] },
                    ]}>
                      {copiedField === `${loc.languageCode}-fullpost` ? '복사 완료!' : '전체 카피 복사 (캡션+해시태그+대가성표기)'}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.ttsRow}>
                    <TouchableOpacity
                      style={styles.ttsButton}
                      onPress={() => {
                        if (ttsResults[loc.languageCode]) {
                          handlePlayTTS(loc.languageCode);
                        } else {
                          handleGenerateTTS(loc.languageCode, loc.narrationText || loc.hook, loc.ttsVoice);
                        }
                      }}
                      disabled={ttsLoading === loc.languageCode}
                      activeOpacity={0.7}
                    >
                      {ttsLoading === loc.languageCode ? (
                        <ActivityIndicator size={12} color="#fff" />
                      ) : ttsResults[loc.languageCode] ? (
                        <Volume2 size={12} color="#fff" strokeWidth={2} />
                      ) : (
                        <Volume2 size={12} color="#fff" strokeWidth={2} />
                      )}
                      <Text style={styles.ttsButtonText}>
                        {ttsLoading === loc.languageCode ? '생성 중...' : ttsResults[loc.languageCode] ? '재생' : 'AI 음성 생성'}
                      </Text>
                    </TouchableOpacity>
                    {ttsResults[loc.languageCode] && (
                      <View style={styles.ttsActions}>
                        <View style={styles.ttsReadyBadge}>
                          <Check size={9} color={theme.colors.success[400]} strokeWidth={2.5} />
                          <Text style={styles.ttsReadyText}>음성 준비됨</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.ttsDownloadBtn}
                          onPress={() => handleDownloadTTS(loc.languageCode)}
                          activeOpacity={0.7}
                        >
                          <Download size={10} color={theme.colors.primary[300]} strokeWidth={2} />
                          <Text style={styles.ttsDownloadText}>다운로드</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  description: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  optionLabel: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    marginBottom: theme.spacing.sm,
  },
  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  langPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  langPillActive: {
    backgroundColor: theme.colors.primary[600],
    borderColor: theme.colors.primary[500],
  },
  langPillText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  langPillTextActive: {
    color: '#fff',
  },
  localizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    ...theme.shadows.card,
  },
  localizeButtonDisabled: {
    opacity: 0.4,
  },
  localizeButtonText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.error[500] + '15',
    marginTop: theme.spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.error[400],
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  batchTtsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.success[500],
  },
  batchTtsButtonDisabled: {
    opacity: 0.6,
  },
  batchTtsButtonText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  ttsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ttsDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary[500] + '15',
  },
  ttsDownloadText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
  },
  resultsBox: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  resultsTitle: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.success[400],
    marginBottom: 4,
  },
  langCard: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  langCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  langCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    flexWrap: 'wrap',
  },
  langCardLang: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.primary[500] + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    maxWidth: 140,
  },
  platformText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
    flexShrink: 1,
  },
  langCardBody: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: 8,
  },
  fieldBox: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fieldLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  fieldValue: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 17,
  },
  ttsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ttsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary[600],
  },
  ttsButtonText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  ttsReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ttsReadyText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.success[400],
  },
  guideToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    marginBottom: theme.spacing.sm,
  },
  guideToggleText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    flex: 1,
  },
  guideBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: 8,
  },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  guideStepNum: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.primary[500] + '30',
    color: theme.colors.primary[300],
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    textAlign: 'center',
    lineHeight: 18,
    overflow: 'hidden',
  },
  guideStepText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 15,
  },
  guideTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
  },
  guideTipText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
  },
  koreanTtsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.success[500] + '12',
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.success[500] + '30',
  },
  koreanTtsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  koreanTtsTitle: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  koreanTtsSub: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  koreanTtsPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.success[500],
  },
  koreanTtsPlayText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    marginBottom: theme.spacing.xs,
  },
  filterToggleText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  fieldCopyBtn: {
    padding: 2,
  },
  copyFullPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: theme.colors.primary[500] + '15',
    borderRadius: theme.radius.sm,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.colors.primary[500] + '30',
  },
  copyFullPostText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  personaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    backgroundColor: theme.colors.warning[500] + '12',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  personaText: {
    flex: 1,
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.warning[400],
    lineHeight: 14,
  },
  recommendedHashtags: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.accent[300],
    lineHeight: 16,
  },
  disclosureBox: {
    backgroundColor: theme.colors.success[500] + '10',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.success[500] + '25',
  },
  disclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  disclosureLabel: {
    flex: 1,
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  disclosureText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 15,
  },
});
