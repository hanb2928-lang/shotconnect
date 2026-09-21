import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { Camera, Sparkles, Info, ExternalLink, Link2, Check, Zap, ChevronDown, ChevronRight, Wallet, Plus, Trash2, Film, LayoutTemplate, BookOpen, Stamp, Upload, Key, Eye, EyeOff, Crown, Rocket, Building2, Coins, CircleDot, Baby, Activity, Sun, Palette, Smartphone, Layers, Wifi, Circle as XCircle, TriangleAlert as AlertTriangle, Play, Target, X, ShoppingBag, Flame, Globe, Megaphone, CalendarClock, ShieldCheck, ChartBar as BarChart3, ArrowRight, DollarSign, TrendingUp, Music2, Video } from 'lucide-react-native';
import { SectionCard } from '@/components/SectionCard';
import { theme as staticTheme } from '@/lib/theme';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { ThemePreset } from '@/lib/theme';
import { getItem, setItem } from '@/lib/storage';
import { getUserSettings, updateUserSettings } from '@/lib/settings';
import { uploadAssetBlob } from '@/lib/savedAssets';
import { clearLogoCache } from '@/lib/logoWatermark';
import { TTS_VOICES, DEFAULT_TTS_VOICE } from '@/lib/ttsVoices';
import { SUBSCRIPTION_PLANS, TOKEN_PACKS, formatKRW as formatPlanKRW } from '@/lib/subscriptionPlans';
import { CreditBalanceBadge } from '@/components/CreditBalanceBadge';
import { CreditPurchaseModal } from '@/components/CreditPurchaseModal';
import { GpuAutoscaleCard } from '@/components/GpuAutoscaleCard';
import { getCreditBalance, getCreditHistory, type CreditBalance, type CreditTransaction } from '@/lib/credits';
import { restorePurchases, isRevenueCatAvailable } from '@/lib/purchases';
import type { UserSettings, RevenueRecord } from '@/types/database';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addRevenueRecord, fetchRevenueRecords, deleteRevenueRecord } from '@/lib/revenue';
import { formatKRW } from '@/lib/dashboard';
import { useMascotSettings, type MascotStyle } from '@/hooks/useMascotSettings';
import { useWebPush } from '@/hooks/useWebPush';
import { invalidateSettingsCache, updateUserSettings as persistUserSettings } from '@/lib/settings';
import { useI18n } from '@/hooks/useI18n';
import { SUPPORTED_LANGUAGES, type AppLanguage } from '@/lib/i18n';
import {
  fetchManagedPlatforms,
  togglePlatformEnabled,
  addCustomPlatform,
  deleteCustomPlatform,
  AVAILABLE_RATIOS,
  type ManagedPlatform,
} from '@/lib/platformManager';
import {
  fetchAffiliatePlatforms,
  updateAffiliatePlatformId,
  toggleAffiliatePlatformEnabled,
  addCustomAffiliatePlatform,
  deleteCustomAffiliatePlatform,
  type ManagedAffiliatePlatform,
} from '@/lib/affiliatePlatformManager';
import { fetchRecentLogs, SESSION_ID } from '@/lib/errorLogger';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t, language, setLanguage } = useI18n();
  const { setPreset: applyThemePreset, setMode: applyThemeMode, colors: dynamicColors, baseTheme: dynamicBaseTheme, spacing: dynamicSpacing, typography: dynamicTypography, presetColors } = useAppTheme();
  const theme = {
    ...dynamicBaseTheme,
    colors: { ...dynamicBaseTheme.colors, dark: dynamicColors, light: dynamicColors, primary: presetColors.primary, accent: presetColors.accent },
    spacing: dynamicSpacing,
    typography: dynamicTypography,
  };
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [coupangId, setCoupangId] = useState('');
  const [naverId, setNaverId] = useState('');
  const [tossId, setTossId] = useState('');

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const [errorLogs, setErrorLogs] = useState<Awaited<ReturnType<typeof fetchRecentLogs>>>([]);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [errorLogsVisible, setErrorLogsVisible] = useState(false);
  const [selectedLog, setSelectedLog] = useState<Awaited<ReturnType<typeof fetchRecentLogs>>[0] | null>(null);

  const [revenues, setRevenues] = useState<RevenueRecord[]>([]);
  const [revModalVisible, setRevModalVisible] = useState(false);
  const [revPlatform, setRevPlatform] = useState('Coupang');
  const [revAmount, setRevAmount] = useState('');
  const [revMonth, setRevMonth] = useState(new Date().toISOString().slice(0, 7));
  const [revNote, setRevNote] = useState('');
  const [revSaving, setRevSaving] = useState(false);
  const [openaiKey, setOpenaiKey] = useState('');
  const [pexelsKey, setPexelsKey] = useState('');
  const [ttsKey, setTtsKey] = useState('');
  const [runwayKey, setRunwayKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [savedKey, setSavedKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const mascot = useMascotSettings();
  const [savingMascot, setSavingMascot] = useState(false);
  const [savedMascot, setSavedMascot] = useState(false);
  const [defaultVideoDuration, setDefaultVideoDuration] = useState('15s');
  const [defaultTtsVoice, setDefaultTtsVoice] = useState(DEFAULT_TTS_VOICE);
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsPitch, setTtsPitch] = useState(0);
  const [progressStyle, setProgressStyle] = useState<'circular' | 'baby-run' | 'status-bar'>('circular');
  const [autoDisclosure, setAutoDisclosure] = useState(true);
  const [cleanFootage, setCleanFootage] = useState(false);
  const [captureGuideMode, setCaptureGuideMode] = useState<'beginner' | 'pro'>('beginner');
  const [uiPerformance, setUiPerformance] = useState<'high' | 'lite'>('high');
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [themePreset, setThemePreset] = useState<ThemePreset>('cinematic-dark');
  const [displayDensity, setDisplayDensity] = useState<'compact' | 'standard' | 'wide'>('standard');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [savedDefaults, setSavedDefaults] = useState(false);
  const [brandPersona, setBrandPersona] = useState('');
  const [defaultCaptionTone, setDefaultCaptionTone] = useState<string>('casual');
  const [fixedHookPhrase, setFixedHookPhrase] = useState('');
  const [affiliatePriority, setAffiliatePriority] = useState(false);
  const [autoPublishReels, setAutoPublishReels] = useState(false);
  const [autoPublishTiktok, setAutoPublishTiktok] = useState(false);
  const [autoPublishShorts, setAutoPublishShorts] = useState(false);
  const [sandboxMode, setSandboxMode] = useState(true);
  const [savingBrandSection, setSavingBrandSection] = useState(false);
  const [savedBrandSection, setSavedBrandSection] = useState(false);
  const [savingAutoPublish, setSavingAutoPublish] = useState(false);
  const [savedAutoPublish, setSavedAutoPublish] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'pro' | 'business'>('pro');
  const [showTokenPacks, setShowTokenPacks] = useState(false);
  const [creditModalVisible, setCreditModalVisible] = useState(false);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [creditHistory, setCreditHistory] = useState<CreditTransaction[]>([]);
  const [showCreditHistory, setShowCreditHistory] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialLinkInput, setTutorialLinkInput] = useState('');
  const [managedPlatforms, setManagedPlatforms] = useState<ManagedPlatform[]>([]);
  const [platformsLoading, setPlatformsLoading] = useState(true);
  const [showAddPlatform, setShowAddPlatform] = useState(false);
  const [newPlatformName, setNewPlatformName] = useState('');
  const [newPlatformRatio, setNewPlatformRatio] = useState<string>('9:16');
  const [addingPlatform, setAddingPlatform] = useState(false);
  const [affiliatePlatforms, setAffiliatePlatforms] = useState<ManagedAffiliatePlatform[]>([]);
  const [affiliatePlatformsLoading, setAffiliatePlatformsLoading] = useState(true);
  const [editingAffiliateId, setEditingAffiliateId] = useState<string | null>(null);
  const [editingAffiliateValue, setEditingAffiliateValue] = useState('');
  const [showAddAffiliate, setShowAddAffiliate] = useState(false);
  const [newAffName, setNewAffName] = useState('');
  const [newAffId, setNewAffId] = useState('');
  const [newAffParam, setNewAffParam] = useState('');
  const [addingAffiliate, setAddingAffiliate] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const router = useRouter();

  const loadSettings = useCallback(async () => {
    try {
      const data = await getUserSettings();
      setSettings(data);
      setCoupangId(data?.coupang_partners_id || '');
      setNaverId(data?.naver_shopping_id || '');
      setTossId(data?.toss_share_id || '');
      setLogoUrl(data?.logo_url || null);
      setOpenaiKey(data?.openai_api_key || '');
      setPexelsKey(data?.pexels_api_key || '');
      setTtsKey(data?.tts_api_key || '');
      setRunwayKey(data?.runway_api_key || '');
      setDefaultVideoDuration(data?.default_video_duration || '15s');
      setDefaultTtsVoice(data?.default_tts_voice || DEFAULT_TTS_VOICE);
      setTtsSpeed(data?.tts_speed ?? 1.0);
      setTtsPitch(data?.tts_pitch ?? 0);
      setProgressStyle((data?.progress_style as 'circular' | 'baby-run' | 'status-bar') || 'circular');
      setAutoDisclosure(data?.auto_disclosure ?? true);
      setCleanFootage(data?.clean_footage_enabled ?? false);
      setCaptureGuideMode((data?.capture_guide_mode as 'beginner' | 'pro') || 'beginner');
      setUiPerformance((data?.ui_performance as 'high' | 'lite') || 'high');
      setThemeMode((data?.theme_mode as 'dark' | 'light') || 'dark');
      setThemePreset((data?.theme_preset as ThemePreset) || 'cinematic-dark');
      setDisplayDensity((data?.display_density as 'compact' | 'standard' | 'wide') || 'standard');
      const tp = (data?.theme_preset as ThemePreset) || 'cinematic-dark';
      if (tp === 'studio-light') { setThemeMode('light'); }
      else if (tp === 'cinematic-dark' || tp === 'trendy-viral') { setThemeMode('dark'); }
      setBrandPersona(data?.brand_persona || '');
      setDefaultCaptionTone(data?.default_caption_tone || 'casual');
      setFixedHookPhrase(data?.fixed_hook_phrase || '');
      setAffiliatePriority(data?.affiliate_priority_mapping ?? false);
      setAutoPublishReels(data?.auto_publish_reels ?? false);
      setAutoPublishTiktok(data?.auto_publish_tiktok ?? false);
      setAutoPublishShorts(data?.auto_publish_shorts ?? false);
      setSandboxMode(data?.auto_publish_sandbox_mode ?? true);
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRevenues = useCallback(async () => {
    try {
      const data = await fetchRevenueRecords(20);
      setRevenues(data);
    } catch {
      setRevenues([]);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadRevenues();
  }, [loadSettings, loadRevenues]);

  const loadPlatforms = useCallback(async () => {
    setPlatformsLoading(true);
    try {
      const data = await fetchManagedPlatforms();
      setManagedPlatforms(data);
    } catch {
      setManagedPlatforms([]);
    }
    setPlatformsLoading(false);
  }, []);

  useEffect(() => { loadPlatforms(); }, [loadPlatforms]);

  const loadAffiliatePlatforms = useCallback(async () => {
    setAffiliatePlatformsLoading(true);
    try {
      const data = await fetchAffiliatePlatforms();
      setAffiliatePlatforms(data);
    } catch {
      setAffiliatePlatforms([]);
    }
    setAffiliatePlatformsLoading(false);
  }, []);

  useEffect(() => { loadAffiliatePlatforms(); }, [loadAffiliatePlatforms]);

  const loadCredits = useCallback(async () => {
    try {
      const [bal, hist] = await Promise.all([getCreditBalance(), getCreditHistory(10)]);
      setCreditBalance(bal);
      setCreditHistory(hist);
    } catch {
      setCreditBalance(null);
      setCreditHistory([]);
    }
  }, []);

  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  const handleRestorePurchases = async () => {
    setRestoring(true);
    try {
      await restorePurchases();
      await loadCredits();
      Alert.alert('복원 완료', '이전 구매 내역을 복원했습니다.');
    } catch {
      Alert.alert('복원 실패', '구매 내역 복원 중 오류가 발생했습니다.');
    }
    setRestoring(false);
  };

  const handleTogglePlatform = async (id: string, enabled: boolean) => {
    try {
      await togglePlatformEnabled(id, enabled);
      setManagedPlatforms((prev) => prev.map((p) => p.id === id ? { ...p, isEnabled: enabled } : p));
    } catch {
      Alert.alert(t('common.error'), t('settings.platformToggleFail'));
    }
  };

  const handleAddPlatform = async () => {
    if (!newPlatformName.trim()) {
      Alert.alert(t('settings.inputRequired'), t('settings.platformNameRequired'));
      return;
    }
    setAddingPlatform(true);
    try {
      await addCustomPlatform({ label: newPlatformName.trim(), ratio: newPlatformRatio });
      setNewPlatformName('');
      setNewPlatformRatio('9:16');
      setShowAddPlatform(false);
      await loadPlatforms();
    } catch {
      Alert.alert(t('common.error'), t('settings.platformAddFail'));
    }
    setAddingPlatform(false);
  };

  const handleDeletePlatform = (id: string) => {
    Alert.alert(t('common.delete'), t('settings.platformDeleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomPlatform(id);
            await loadPlatforms();
          } catch {
            Alert.alert(t('common.error'), t('settings.deleteFail'));
          }
        },
      },
    ]);
  };

  const handleThemeChange = useCallback((preset: ThemePreset, mode: 'dark' | 'light') => {
    setThemePreset(preset);
    setThemeMode(mode);
    applyThemePreset(preset);
    applyThemeMode(mode);
  }, [applyThemePreset, applyThemeMode]);

  const handleSaveAffiliateId = async (id: string) => {
    try {
      await updateAffiliatePlatformId(id, editingAffiliateValue);
      setEditingAffiliateId(null);
      await loadAffiliatePlatforms();
    } catch {
      Alert.alert(t('common.error'), t('settings.partnersIdSaveFail'));
    }
  };

  const handleToggleAffiliate = async (id: string, enabled: boolean) => {
    try {
      await toggleAffiliatePlatformEnabled(id, enabled);
      setAffiliatePlatforms((prev) => prev.map((p) => p.id === id ? { ...p, is_enabled: enabled } : p));
    } catch {
      Alert.alert(t('common.error'), t('settings.platformToggleFail'));
    }
  };

  const handleAddAffiliate = async () => {
    if (!newAffName.trim()) {
      Alert.alert(t('settings.inputRequired'), t('settings.platformNameRequired'));
      return;
    }
    setAddingAffiliate(true);
    try {
      await addCustomAffiliatePlatform({
        label: newAffName.trim(),
        partnersId: newAffId.trim(),
        trackingParam: newAffParam.trim(),
      });
      setNewAffName('');
      setNewAffId('');
      setNewAffParam('');
      setShowAddAffiliate(false);
      await loadAffiliatePlatforms();
    } catch {
      Alert.alert(t('common.error'), t('settings.affiliateAddFail'));
    }
    setAddingAffiliate(false);
  };

  const handleDeleteAffiliate = (id: string) => {
    Alert.alert(t('common.delete'), t('settings.affiliateDeleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomAffiliatePlatform(id);
            await loadAffiliatePlatforms();
          } catch {
            Alert.alert(t('common.error'), t('settings.deleteFail'));
          }
        },
      },
    ]);
  };

  const handleUploadLogo = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('안내', '로고 업로드는 웹에서 지원됩니다. 곧 모바일도 지원될 예정이에요');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg';
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        Alert.alert('파일 크기', '로고 이미지는 2MB 이하의 PNG 또는 JPG 파일을 사용해주세요');
        return;
      }
      setLogoUploading(true);
      try {
        const fileName = `logo-${Date.now()}.png`;
        const fileUrl = await uploadAssetBlob(file, fileName, file.type || 'image/png');
        if (!fileUrl) {
          Alert.alert('업로드 실패', '이미지 업로드에 실패했어요. 다시 시도해주세요');
          setLogoUploading(false);
          return;
        }
        await updateUserSettings({ logo_url: fileUrl });
        setLogoUrl(fileUrl);
        clearLogoCache();
      } catch {
        Alert.alert('업로드 실패', '로고 업로드 중 오류가 발생했어요');
      }
      setLogoUploading(false);
    };
    input.click();
  };

  const handleRemoveLogo = async () => {
    Alert.alert('로고 삭제', '등록된 로고를 삭제하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateUserSettings({ logo_url: null });
            setLogoUrl(null);
            clearLogoCache();
          } catch {
            Alert.alert('오류', '로고 삭제 중 오류가 발생했어요');
          }
        },
      },
    ]);
  };

  const handleSaveRevenue = async () => {
    const amount = parseInt(revAmount, 10);
    if (!amount || amount <= 0) {
      Alert.alert('입력 오류', '수익 금액을 정확히 입력해주세요');
      return;
    }
    setRevSaving(true);
    try {
      await addRevenueRecord(revPlatform, amount, revMonth, revNote || undefined);
      setRevModalVisible(false);
      setRevAmount('');
      setRevNote('');
      await loadRevenues();
    } catch (err) {
      Alert.alert('저장 실패', err instanceof Error ? err.message : '알 수 없는 오류');
    }
    setRevSaving(false);
  };

  const handleDeleteRevenue = (id: string) => {
    Alert.alert('삭제', '이 수익 기록을 삭제하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRevenueRecord(id);
            await loadRevenues();
          } catch (err) {
            Alert.alert('삭제 실패', err instanceof Error ? err.message : '오류');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary[400]} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24, paddingTop: 16 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {/* API Health Check Badges */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.apiStatus')}</Text>
        <View style={styles.healthCheckRow}>
          {[
            { label: t('settings.coupang'), value: coupangId, color: '#FF3E3E', icon: 'C' },
            { label: t('settings.naver'), value: naverId, color: '#03C75A', icon: 'N' },
            { label: t('settings.toss'), value: tossId, color: '#0064FF', icon: 'T' },
            { label: 'OpenAI', value: openaiKey, color: theme.colors.primary[400], icon: 'AI' },
            { label: 'Pexels', value: pexelsKey, color: theme.colors.success[400], icon: 'PX' },
            { label: 'TTS', value: ttsKey, color: theme.colors.accent[400], icon: 'TTS' },
            { label: 'Runway', value: runwayKey, color: theme.colors.warning[400], icon: 'RW' },
          ].map((item, i) => {
            const isSet = item.value && item.value.trim().length > 0;
            return (
              <View key={i} style={[styles.healthBadge, isSet ? styles.healthBadgeOk : styles.healthBadgeErr]}>
                <View style={[styles.healthBadgeIcon, { backgroundColor: isSet ? item.color + '20' : theme.colors.dark.surfaceLight }]}>
                  {isSet ? (
                    <Check size={12} color={item.color} strokeWidth={2.5} />
                  ) : (
                    <XCircle size={12} color={theme.colors.error[400]} strokeWidth={2} />
                  )}
                </View>
                <Text style={[styles.healthBadgeLabel, isSet ? { color: theme.colors.dark.text } : { color: theme.colors.dark.textDim }]}>
                  {item.label}
                </Text>
                <Text style={[styles.healthBadgeStatus, isSet ? styles.healthBadgeStatusOk : styles.healthBadgeStatusErr]}>
                  {isSet ? t('settings.connected') : t('settings.notSet')}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Latest Updates */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>최근 업데이트</Text>
        <Text style={styles.sectionDesc}>
          최근 개선된 기능과 수정된 오류를 확인하세요
        </Text>
        <View style={styles.card}>
          <View style={styles.updateRow}>
            <View style={[styles.updateIconWrap, { backgroundColor: theme.colors.success[400] + '20' }]}>
              <Check size={18} color={theme.colors.success[400]} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.updateTitle}>영상 생성 안정성 강화</Text>
              <Text style={styles.updateDesc}>중복 터치 방지 가드, 60초 인코딩 타임아웃, 렌더링 타임아웃 시 레코더 안전 중지로 영상 생성이 멈추지 않고 완료됩니다</Text>
            </View>
          </View>
          <Divider />
          <View style={styles.updateRow}>
            <View style={[styles.updateIconWrap, { backgroundColor: theme.colors.primary[400] + '20' }]}>
              <Film size={18} color={theme.colors.primary[400]} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.updateTitle}>CDN 이미지 CORS 처리</Text>
              <Text style={styles.updateDesc}>외부 제휴 상품 이미지와 스톡 비디오를 불러올 때 crossOrigin 설정으로 캔버스 합성 오류(Tainted canvas)를 방지합니다</Text>
            </View>
          </View>
          <Divider />
          <View style={styles.updateRow}>
            <View style={[styles.updateIconWrap, { backgroundColor: theme.colors.accent[400] + '20' }]}>
              <Sparkles size={18} color={theme.colors.accent[400]} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.updateTitle}>TTS 오디오 싱크 개선</Text>
              <Text style={styles.updateDesc}>감정 곡선(후킹→신뢰→클로징) 구간별 TTS 속도를 자동 조정하여 영상 타이밍과 내레이션이 정확히 맞춰집니다. 배치 TTS에 캐시와 재시도 로직이 추가되었습니다</Text>
            </View>
          </View>
          <Divider />
          <View style={styles.updateRow}>
            <View style={[styles.updateIconWrap, { backgroundColor: theme.colors.warning[400] + '20' }]}>
              <Zap size={18} color={theme.colors.warning[400]} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.updateTitle}>진행률 표시 최적화</Text>
              <Text style={styles.updateDesc}>영상 렌더링 중 진행률 업데이트를 초당 5회로 제한하여 UI 과부하로 인한 멈춤을 방지합니다</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Interactive Onboarding Tutorial */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.tutorial')}</Text>
        <Text style={styles.sectionDesc}>
          {t('settings.tutorialDesc')}
        </Text>
        <TouchableOpacity
          style={styles.tutorialBtn}
          onPress={() => setTutorialStep(1)}
          activeOpacity={0.8}
        >
          <Play size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.tutorialBtnText}>{t('settings.tutorialStart')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.guideLinkBtn}
          onPress={() => router.push('/guide' as never)}
          activeOpacity={0.8}
        >
          <BookOpen size={18} color={theme.colors.primary[400]} strokeWidth={2} />
          <Text style={styles.guideLinkBtnText}>사용설명서 보기</Text>
          <ChevronRight size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Tutorial Modal */}
      <Modal
        visible={tutorialStep > 0}
        transparent
        animationType="fade"
        onRequestClose={() => setTutorialStep(0)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.tutorialModalContent}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setTutorialStep(0)}
              activeOpacity={0.7}
            >
              <X size={20} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>

            {tutorialStep === 1 && (
              <View style={styles.tutorialStepWrap}>
                <View style={styles.tutorialStepIndicator}>
                  <View style={[styles.tutorialDot, styles.tutorialDotActive]} />
                  <View style={styles.tutorialDot} />
                  <View style={styles.tutorialDot} />
                </View>
                <View style={styles.tutorialIconWrap}>
                  <Link2 size={32} color={theme.colors.primary[400]} strokeWidth={2} />
                </View>
                <Text style={styles.tutorialStepTitle}>1단계: 제휴 링크 입력</Text>
                <Text style={styles.tutorialStepDesc}>
                  가상 상품 '무선 블루투스 이어폰'의 제휴 링크를 입력해보세요. 쿠팡 파트너스 링크를 자동으로 생성하거나 직접 입력할 수 있어요.
                </Text>
                <View style={styles.tutorialMockCard}>
                  <Text style={styles.tutorialMockLabel}>가상 상품</Text>
                  <Text style={styles.tutorialMockProduct}>무선 블루투스 이어폰</Text>
                  <Text style={styles.tutorialMockPrice}>예상가 ₩29,900</Text>
                  <View style={styles.tutorialMockLinkRow}>
                    <TextInput
                      style={styles.tutorialMockInput}
                      value={tutorialLinkInput}
                      onChangeText={setTutorialLinkInput}
                      placeholder="https://coupang.com/..."
                      placeholderTextColor={theme.colors.dark.textFaint}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.tutorialMockBtn}
                      onPress={() => {
                        if (!tutorialLinkInput.trim()) {
                          setTutorialLinkInput('https://coupang.com/p/1234567?ref=affiliate');
                        }
                        setTutorialStep(2);
                      }}
                      activeOpacity={0.7}
                    >
                      <Check size={16} color="#fff" strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.tutorialNextBtn}
                  onPress={() => setTutorialStep(2)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.tutorialNextBtnText}>다음 단계</Text>
                  <ChevronRight size={16} color="#fff" strokeWidth={2} />
                </TouchableOpacity>
              </View>
            )}

            {tutorialStep === 2 && (
              <View style={styles.tutorialStepWrap}>
                <View style={styles.tutorialStepIndicator}>
                  <View style={[styles.tutorialDot, styles.tutorialDotDone]} />
                  <View style={[styles.tutorialDot, styles.tutorialDotActive]} />
                  <View style={styles.tutorialDot} />
                </View>
                <View style={styles.tutorialIconWrap}>
                  <Sparkles size={32} color={theme.colors.accent[400]} strokeWidth={2} />
                </View>
                <Text style={styles.tutorialStepTitle}>2단계: AI 숏폼 생성</Text>
                <Text style={styles.tutorialStepDesc}>
                  AI가 상품 사진을 분석하고 자동으로 마케팅 카피, 만화 시나리오, 숏폼 영상 시나리오를 생성합니다.
                </Text>
                <View style={styles.tutorialMockCard}>
                  <View style={styles.tutorialMockAiRow}>
                    <Target size={14} color={theme.colors.primary[400]} strokeWidth={2} />
                    <Text style={styles.tutorialMockAiText}>제품 분석: 무선 블루투스 이어폰 / 전자기기</Text>
                  </View>
                  <View style={styles.tutorialMockAiRow}>
                    <Sparkles size={14} color={theme.colors.accent[400]} strokeWidth={2} />
                    <Text style={styles.tutorialMockAiText}>카피: "한 번 쓰면 못 놓는 무선 자유"</Text>
                  </View>
                  <View style={styles.tutorialMockAiRow}>
                    <Film size={14} color={theme.colors.warning[400]} strokeWidth={2} />
                    <Text style={styles.tutorialMockAiText}>숏폼 시나리오: 15초 / 4컷 구성 생성됨</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.tutorialNextBtn}
                  onPress={() => setTutorialStep(3)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.tutorialNextBtnText}>다음 단계</Text>
                  <ChevronRight size={16} color="#fff" strokeWidth={2} />
                </TouchableOpacity>
              </View>
            )}

            {tutorialStep === 3 && (
              <View style={styles.tutorialStepWrap}>
                <View style={styles.tutorialStepIndicator}>
                  <View style={[styles.tutorialDot, styles.tutorialDotDone]} />
                  <View style={[styles.tutorialDot, styles.tutorialDotDone]} />
                  <View style={[styles.tutorialDot, styles.tutorialDotActive]} />
                </View>
                <View style={styles.tutorialIconWrap}>
                  <Check size={32} color={theme.colors.success[400]} strokeWidth={2} />
                </View>
                <Text style={styles.tutorialStepTitle}>3단계: 공정위 문구 완성</Text>
                <Text style={styles.tutorialStepDesc}>
                  생성된 콘텐츠에 공정거래위원회 광고 표시 문구가 자동으로 포함됩니다. 이것으로 전체 흐름이 완성됩니다.
                </Text>
                <View style={styles.tutorialMockCard}>
                  <View style={styles.tutorialDisclosureBox}>
                    <Check size={14} color={theme.colors.success[400]} strokeWidth={2} />
                    <Text style={styles.tutorialDisclosureText}>
                      "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
                    </Text>
                  </View>
                  <Text style={styles.tutorialCompleteHint}>
                    모든 단계를 완료했습니다! 실제 제품으로 바로 시작해보세요.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.tutorialCompleteBtn}
                  onPress={() => {
                    setTutorialStep(0);
                    setTutorialLinkInput('');
                    router.push('/(tabs)/');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.tutorialCompleteBtnText}>실제 제품 분석 시작하기</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>분석 및 수익 대시보드</Text>
        <Text style={styles.sectionDesc}>
          제휴 링크 수익, 숏폼 성과, 클릭 및 전환율을 한눈에 확인하세요
        </Text>
        <TouchableOpacity
          style={styles.analyticsShortcutCard}
          onPress={() => router.push('/(tabs)/analytics')}
          activeOpacity={0.8}
        >
          <View style={styles.analyticsShortcutIconWrap}>
            <BarChart3 size={22} color={theme.colors.success[400]} strokeWidth={2} />
          </View>
          <View style={styles.analyticsShortcutInfo}>
            <Text style={styles.analyticsShortcutTitle}>성과 및 수익 확인하기</Text>
            <Text style={styles.analyticsShortcutDesc}>총 수익금 · 숏폼 조회수 · 클릭 전환율 · QR 스캔 통계</Text>
          </View>
          <ArrowRight size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>크레딧 관리</Text>
        <Text style={styles.sectionDesc}>
          AI 콘텐츠 생성 시 크레딧이 소모됩니다. 크레딧을 충전하고 사용 내역을 확인할 수 있어요.
        </Text>

        <View style={styles.creditBalanceCard}>
          <View style={styles.creditBalanceLeft}>
            <View style={styles.creditBalanceIconWrap}>
              <Coins size={22} color={theme.colors.warning[400]} strokeWidth={2} />
            </View>
            <View>
              <Text style={styles.creditBalanceLabel}>현재 보유 크레딧</Text>
              <Text style={styles.creditBalanceValue}>
                {creditBalance ? creditBalance.balance.toLocaleString() : '...'}
              </Text>
            </View>
          </View>
          <View style={styles.creditBalanceStats}>
            {creditBalance && (
              <>
                <Text style={styles.creditBalanceStatLabel}>총 충전</Text>
                <Text style={styles.creditBalanceStatValue}>{creditBalance.total_purchased.toLocaleString()}</Text>
                <Text style={[styles.creditBalanceStatLabel, { marginTop: 6 }]}>총 사용</Text>
                <Text style={styles.creditBalanceStatValue}>{creditBalance.total_consumed.toLocaleString()}</Text>
              </>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.subscribeBtn}
          onPress={() => setCreditModalVisible(true)}
          activeOpacity={0.8}
        >
          <Coins size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.subscribeBtnText}>크레딧 충전하기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tokenPackToggle}
          onPress={() => setShowCreditHistory(!showCreditHistory)}
          activeOpacity={0.7}
        >
          <Activity size={18} color={theme.colors.primary[400]} strokeWidth={2} />
          <Text style={styles.tokenPackToggleText}>사용 내역</Text>
          {showCreditHistory ? <ChevronDown size={18} color={theme.colors.dark.textDim} strokeWidth={2} /> : <ChevronRight size={18} color={theme.colors.dark.textDim} strokeWidth={2} />}
        </TouchableOpacity>

        {showCreditHistory && (
          <View style={styles.tokenPackContainer}>
            {creditHistory.length === 0 ? (
              <Text style={styles.tokenPackHint}>아직 사용 내역이 없습니다.</Text>
            ) : (
              creditHistory.map((tx) => (
                <View key={tx.id} style={styles.tokenPackCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tokenPackName}>{tx.description || (tx.amount > 0 ? '충전' : '사용')}</Text>
                    <Text style={styles.tokenPackQuota}>
                      {new Date(tx.created_at).toLocaleDateString('ko-KR')}
                      {tx.feature ? ` · ${tx.feature}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.tokenPackPrice, { color: tx.amount > 0 ? theme.colors.success[400] : theme.colors.error[400] }]}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {Platform.OS !== 'web' && isRevenueCatAvailable() && (
          <TouchableOpacity
            style={[styles.tokenPackToggle, { justifyContent: 'center' }]}
            onPress={handleRestorePurchases}
            disabled={restoring}
            activeOpacity={0.7}
          >
            {restoring ? (
              <ActivityIndicator size="small" color={theme.colors.primary[400]} />
            ) : (
              <>
                <Wallet size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
                <Text style={[styles.tokenPackToggleText, { color: theme.colors.dark.textDim }]}>구매 내역 복원</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {!isRevenueCatAvailable() && Platform.OS === 'web' && (
          <View style={styles.creditWebNote}>
            <Info size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.creditWebNoteText}>
              모바일 앱에서는 인앱 결제(RevenueCat)를 통해 실제 결제가 처리됩니다. 현재 웹에서는 테스트용 즉시 충전으로 작동합니다.
            </Text>
          </View>
        )}
      </View>

      <CreditPurchaseModal
        visible={creditModalVisible}
        onClose={() => {
          setCreditModalVisible(false);
          loadCredits();
        }}
        onPurchased={() => loadCredits()}
      />

      {/* Marketing Platform Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.platformMgmt')}</Text>
        <Text style={styles.sectionDesc}>
          {t('settings.platformMgmtDesc')}
        </Text>

        {platformsLoading ? (
          <ActivityIndicator size="small" color={theme.colors.primary[400]} style={{ marginVertical: 16 }} />
        ) : (
          <View style={styles.card}>
            {managedPlatforms.map((p, idx) => (
              <View key={p.id} style={[styles.platformMgmtRow, idx > 0 && styles.platformMgmtRowBorder]}>
                <View style={[styles.platformMgmtIcon, { backgroundColor: p.color + '20' }]}>
                  <Smartphone size={18} color={p.color} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.platformMgmtLabel}>{p.label}</Text>
                  <Text style={styles.platformMgmtMeta}>{p.ratio} · {p.width}×{p.height}px{p.isBuiltin ? '' : ' · 커스텀'}</Text>
                </View>
                {!p.isBuiltin && (
                  <TouchableOpacity
                    style={styles.platformMgmtDelete}
                    onPress={() => handleDeletePlatform(p.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={14} color={theme.colors.error[400]} strokeWidth={2} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => handleTogglePlatform(p.id, !p.isEnabled)}
                  activeOpacity={0.7}
                  hitSlop={12}
                >
                  <View style={[styles.toggleSwitch, p.isEnabled && styles.toggleSwitchActive]}>
                    <View style={[styles.toggleKnob, p.isEnabled && styles.toggleKnobActive]} />
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {showAddPlatform ? (
          <View style={styles.card}>
            <Text style={styles.idInputLabel}>{t('settings.platformName')}</Text>
            <TextInput
              style={styles.idInput}
              value={newPlatformName}
              onChangeText={setNewPlatformName}
              placeholder={t('settings.platformNamePlaceholder')}
              placeholderTextColor={theme.colors.dark.textFaint}
              maxLength={20}
            />
            <View style={{ height: 12 }} />
            <Text style={styles.idInputLabel}>{t('settings.platformRatio')}</Text>
            <View style={styles.platformPickerRow}>
              {AVAILABLE_RATIOS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.platformChip, newPlatformRatio === r && styles.platformChipActive]}
                  onPress={() => setNewPlatformRatio(r)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.platformChipText, newPlatformRatio === r && styles.platformChipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.addPlatformActions}>
              <TouchableOpacity
                style={[styles.addPlatformCancelBtn]}
                onPress={() => { setShowAddPlatform(false); setNewPlatformName(''); }}
                activeOpacity={0.7}
              >
                <X size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
                <Text style={styles.addPlatformCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveIdButton, { flex: 1 }, addingPlatform && { opacity: 0.5 }]}
                onPress={handleAddPlatform}
                disabled={addingPlatform}
                activeOpacity={0.8}
              >
                {addingPlatform ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Check size={18} color="#fff" strokeWidth={2} />
                    <Text style={styles.saveIdButtonText}>추가</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addPlatformBtn}
            onPress={() => setShowAddPlatform(true)}
            activeOpacity={0.8}
          >
            <Plus size={18} color={theme.colors.primary[300]} strokeWidth={2} />
            <Text style={styles.addPlatformBtnText}>{t('settings.platformAddCustom')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Affiliate Marketing Platform Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.affiliatePlatformMgmt')}</Text>
        <Text style={styles.sectionDesc}>
          {t('settings.affiliatePlatformMgmtDesc')}
        </Text>

        {affiliatePlatformsLoading ? (
          <ActivityIndicator size="small" color={theme.colors.primary[400]} style={{ marginVertical: 16 }} />
        ) : (
          <View style={styles.card}>
            {affiliatePlatforms.map((p, idx) => (
              <View key={p.id} style={[styles.affPlatformRow, idx > 0 && styles.affPlatformRowBorder]}>
                <View style={[styles.platformMgmtIcon, { backgroundColor: p.color + '20' }]}>
                  <ShoppingBag size={16} color={p.color} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.affPlatformLabel}>{p.label}</Text>
                    {!p.is_builtin && (
                      <View style={styles.affCustomBadge}>
                        <Text style={styles.affCustomBadgeText}>{t('settings.customBadge')}</Text>
                      </View>
                    )}
                  </View>
                  {editingAffiliateId === p.id ? (
                    <View style={styles.affEditRow}>
                      <TextInput
                        style={styles.affEditInput}
                        value={editingAffiliateValue}
                        onChangeText={setEditingAffiliateValue}
                        placeholder={t('settings.partnersIdPlaceholder')}
                        placeholderTextColor={theme.colors.dark.textFaint}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        style={styles.affEditSaveBtn}
                        onPress={() => handleSaveAffiliateId(p.id)}
                        activeOpacity={0.7}
                      >
                        <Check size={14} color="#fff" strokeWidth={2.5} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => { setEditingAffiliateId(p.id); setEditingAffiliateValue(p.partners_id); }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.affIdText}>
                        {p.hasId ? `ID: ${p.partners_id}` : t('settings.partnersIdNotSet')}
                      </Text>
                      {p.tracking_param ? (
                        <Text style={styles.affParamText}>추적 파라미터: {p.tracking_param}</Text>
                      ) : null}
                    </TouchableOpacity>
                  )}
                </View>
                {!p.is_builtin && (
                  <TouchableOpacity
                    style={styles.platformMgmtDelete}
                    onPress={() => handleDeleteAffiliate(p.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={14} color={theme.colors.error[400]} strokeWidth={2} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => handleToggleAffiliate(p.id, !p.is_enabled)}
                  activeOpacity={0.7}
                  hitSlop={12}
                >
                  <View style={[styles.toggleSwitch, p.is_enabled && styles.toggleSwitchActive]}>
                    <View style={[styles.toggleKnob, p.is_enabled && styles.toggleKnobActive]} />
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {showAddAffiliate ? (
          <View style={styles.card}>
            <Text style={styles.idInputLabel}>{t('settings.platformName')}</Text>
            <TextInput
              style={styles.idInput}
              value={newAffName}
              onChangeText={setNewAffName}
              placeholder={t('settings.affiliatePlatformNamePlaceholder')}
              placeholderTextColor={theme.colors.dark.textFaint}
              maxLength={20}
            />
            <View style={{ height: 12 }} />
            <Text style={styles.idInputLabel}>{t('settings.partnersId')}</Text>
            <TextInput
              style={styles.idInput}
              value={newAffId}
              onChangeText={setNewAffId}
              placeholder={t('settings.partnersIdHint')}
              placeholderTextColor={theme.colors.dark.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ height: 12 }} />
            <Text style={styles.idInputLabel}>{t('settings.trackingParam')}</Text>
            <TextInput
              style={styles.idInput}
              value={newAffParam}
              onChangeText={setNewAffParam}
              placeholder={t('settings.trackingParamPlaceholder')}
              placeholderTextColor={theme.colors.dark.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.affParamHint}>{t('settings.trackingParamHint')}</Text>
            <View style={styles.addPlatformActions}>
              <TouchableOpacity
                style={styles.addPlatformCancelBtn}
                onPress={() => { setShowAddAffiliate(false); setNewAffName(''); setNewAffId(''); setNewAffParam(''); }}
                activeOpacity={0.7}
              >
                <X size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
                <Text style={styles.addPlatformCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveIdButton, { flex: 1 }, addingAffiliate && { opacity: 0.5 }]}
                onPress={handleAddAffiliate}
                disabled={addingAffiliate}
                activeOpacity={0.8}
              >
                {addingAffiliate ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Check size={18} color="#fff" strokeWidth={2} />
                    <Text style={styles.saveIdButtonText}>추가</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addPlatformBtn}
            onPress={() => setShowAddAffiliate(true)}
            activeOpacity={0.8}
          >
            <Plus size={18} color={theme.colors.primary[300]} strokeWidth={2} />
            <Text style={styles.addPlatformBtnText}>{t('settings.affiliateAddCustom')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>내 가게 로고 / 스탬프</Text>
        <Text style={styles.sectionDesc}>
          매장 로고(PNG)를 등록하면 생성되는 템플릿 카드, 숏폼 영상, 만화 콘텐츠 구석에 자동으로 워터마크처럼 박힙니다. 공유되어도 내 매장 브랜드가 홍보됩니다.
        </Text>
        <View style={styles.card}>
          {logoUrl ? (
            <View style={styles.logoPreviewWrap}>
              {Platform.OS === 'web' ? (
                // @ts-ignore img element on web
                <img src={logoUrl} style={styles.logoPreviewImg as any} />
              ) : (
                <Image source={{ uri: logoUrl }} style={styles.logoPreviewImg} resizeMode="contain" />
              )}
              <View style={styles.logoInfo}>
                <Text style={styles.logoRegisteredText}>로고가 등록되어 있어요</Text>
                <Text style={styles.logoHintText}>모든 콘텐츠에 자동으로 워터마크가 적용됩니다</Text>
              </View>
              <TouchableOpacity style={styles.logoRemoveBtn} onPress={handleRemoveLogo} activeOpacity={0.7}>
                <Trash2 size={14} color={theme.colors.error[400]} strokeWidth={2} />
                <Text style={styles.logoRemoveText}>삭제</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.logoEmptyWrap}>
              <View style={styles.logoEmptyIcon}>
                <Stamp size={28} color={theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={styles.logoEmptyText}>등록된 로고가 없어요</Text>
              <Text style={styles.logoEmptyHint}>PNG 파일을 업로드하면 자동으로 적용됩니다</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={[styles.logoUploadBtn, logoUploading && { opacity: 0.5 }]}
          onPress={handleUploadLogo}
          disabled={logoUploading}
          activeOpacity={0.8}
        >
          {logoUploading ? (
            <ActivityIndicator size="small" color={theme.colors.primary[300]} />
          ) : (
            <Upload size={18} color={theme.colors.primary[300]} strokeWidth={2} />
          )}
          <Text style={styles.logoUploadBtnText}>
            {logoUploading ? '업로드 중...' : logoUrl ? '로고 변경하기' : '로고 업로드하기'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>수익 기록</Text>
        <Text style={styles.sectionDesc}>
          제휴 수수료 수익을 직접 기록하면 분석 대시보드에 자동 반영됩니다. 어떤 콘텐츠가 얼마를 벌었는지 추적하세요.
        </Text>
        <TouchableOpacity
          style={styles.addRevenueButton}
          onPress={() => setRevModalVisible(true)}
          activeOpacity={0.8}
        >
          <Plus size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.addRevenueButtonText}>수익 추가 기록</Text>
        </TouchableOpacity>

        {revenues.length > 0 && (
          <View style={styles.revenueList}>
            {revenues.map((rev) => (
              <View key={rev.id} style={styles.revenueRow}>
                <View style={styles.revenueInfo}>
                  <Text style={styles.revenuePlatform}>{rev.platform}</Text>
                  <Text style={styles.revenueAmount}>{formatKRW(Number(rev.amount))}</Text>
                  <Text style={styles.revenueMeta}>{rev.period_month}{rev.note ? ` · ${rev.note}` : ''}</Text>
                </View>
                <TouchableOpacity
                  style={styles.revenueDeleteBtn}
                  onPress={() => handleDeleteRevenue(rev.id)}
                  activeOpacity={0.7}
                >
                  <Trash2 size={16} color={theme.colors.error[400]} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>콘텐츠 기본 설정</Text>
        <Text style={styles.sectionDesc}>
          만화 숏폼, 숏폼 영상 생성 시 기본으로 사용될 옵션을 미리 설정하세요
        </Text>
        <View style={styles.card}>
          <Text style={styles.idInputLabel}>기본 영상 길이</Text>
          <View style={styles.platformPickerRow}>
            {['10s', '15s', '20s', '30s'].map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.platformChip, defaultVideoDuration === d && styles.platformChipActive]}
                onPress={() => setDefaultVideoDuration(d)}
                activeOpacity={0.7}
              >
                <Text style={[styles.platformChipText, defaultVideoDuration === d && styles.platformChipTextActive]}>
                  {d}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Divider />
          <Text style={styles.idInputLabel}>기본 TTS 음성</Text>
          <Text style={styles.ttsCategoryLabel}>남성 - 쇼핑호스트</Text>
          <View style={styles.platformPickerRow}>
            {TTS_VOICES.filter((v) => v.gender === 'male' && v.style === 'shopping').map((v) => (
              <TouchableOpacity
                key={v.key}
                style={[styles.platformChip, defaultTtsVoice === v.key && styles.platformChipActive]}
                onPress={() => setDefaultTtsVoice(v.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.platformChipText, defaultTtsVoice === v.key && styles.platformChipTextActive]}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ttsCategoryLabel}>남성 - 아나운서</Text>
          <View style={styles.platformPickerRow}>
            {TTS_VOICES.filter((v) => v.gender === 'male' && v.style === 'announcer').map((v) => (
              <TouchableOpacity
                key={v.key}
                style={[styles.platformChip, defaultTtsVoice === v.key && styles.platformChipActive]}
                onPress={() => setDefaultTtsVoice(v.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.platformChipText, defaultTtsVoice === v.key && styles.platformChipTextActive]}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ttsCategoryLabel}>여성 - 쇼핑호스트</Text>
          <View style={styles.platformPickerRow}>
            {TTS_VOICES.filter((v) => v.gender === 'female' && v.style === 'shopping').map((v) => (
              <TouchableOpacity
                key={v.key}
                style={[styles.platformChip, defaultTtsVoice === v.key && styles.platformChipActive]}
                onPress={() => setDefaultTtsVoice(v.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.platformChipText, defaultTtsVoice === v.key && styles.platformChipTextActive]}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ttsCategoryLabel}>여성 - 아나운서</Text>
          <View style={styles.platformPickerRow}>
            {TTS_VOICES.filter((v) => v.gender === 'female' && v.style === 'announcer').map((v) => (
              <TouchableOpacity
                key={v.key}
                style={[styles.platformChip, defaultTtsVoice === v.key && styles.platformChipActive]}
                onPress={() => setDefaultTtsVoice(v.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.platformChipText, defaultTtsVoice === v.key && styles.platformChipTextActive]}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Divider />
          <Text style={styles.idInputLabel}>내레이션 속도</Text>
          <Text style={styles.sliderValueText}>{ttsSpeed.toFixed(1)}x{ttsSpeed === 1.0 ? ' (기본)' : ttsSpeed < 1.0 ? ' (느림)' : ' (빠름)'}</Text>
          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>0.5x</Text>
            <View style={styles.sliderTrack}>
              <View style={[styles.sliderFill, { width: `${((ttsSpeed - 0.5) / 1.5) * 100}%` }]} />
              <View style={[styles.sliderThumb, { left: `${((ttsSpeed - 0.5) / 1.5) * 100}%` }]} />
            </View>
            <Text style={styles.sliderLabel}>2.0x</Text>
          </View>
          <View style={styles.sliderChipsRow}>
            {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.sliderChip, ttsSpeed === s && styles.sliderChipActive]}
                onPress={() => setTtsSpeed(s)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sliderChipText, ttsSpeed === s && styles.sliderChipTextActive]}>{s.toFixed(2).replace(/\.?0+$/, '')}x</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Divider />
          <Text style={styles.idInputLabel}>내레이션 피치 (음조)</Text>
          <Text style={styles.sliderValueText}>{ttsPitch > 0 ? `+${ttsPitch}` : ttsPitch}{ttsPitch === 0 ? ' (기본)' : ttsPitch > 0 ? ' (높음)' : ' (낮음)'}</Text>
          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>-12</Text>
            <View style={styles.sliderTrack}>
              <View style={[styles.sliderFill, { width: `${((ttsPitch + 12) / 24) * 100}%` }]} />
              <View style={[styles.sliderThumb, { left: `${((ttsPitch + 12) / 24) * 100}%` }]} />
            </View>
            <Text style={styles.sliderLabel}>+12</Text>
          </View>
          <View style={styles.sliderChipsRow}>
            {[-12, -6, -3, 0, 3, 6, 12].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.sliderChip, ttsPitch === p && styles.sliderChipActive]}
                onPress={() => setTtsPitch(p)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sliderChipText, ttsPitch === p && styles.sliderChipTextActive]}>{p > 0 ? `+${p}` : p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Divider />
          <Text style={styles.idInputLabel}>진행 상태 표시 스타일</Text>
          <Text style={styles.ttsCategoryLabel}>영상 제작 중 표시되는 로딩 UI를 선택하세요</Text>
          <View style={styles.progressStyleRow}>
            <TouchableOpacity
              style={[styles.progressStyleCard, progressStyle === 'circular' && styles.progressStyleCardActive]}
              onPress={() => setProgressStyle('circular')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, progressStyle === 'circular' && styles.progressStyleIconActive]}>
                <CircleDot size={22} color={progressStyle === 'circular' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, progressStyle === 'circular' && styles.progressStyleNameActive]}>원형 회전형</Text>
              <Text style={styles.progressStyleDesc}>클래식한 원형 로딩</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.progressStyleCard, progressStyle === 'baby-run' && styles.progressStyleCardActive]}
              onPress={() => setProgressStyle('baby-run')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, progressStyle === 'baby-run' && styles.progressStyleIconActive]}>
                <Baby size={22} color={progressStyle === 'baby-run' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, progressStyle === 'baby-run' && styles.progressStyleNameActive]}>아기 달리기형</Text>
              <Text style={styles.progressStyleDesc}>트랙을 달리는 아기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.progressStyleCard, progressStyle === 'status-bar' && styles.progressStyleCardActive]}
              onPress={() => setProgressStyle('status-bar')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, progressStyle === 'status-bar' && styles.progressStyleIconActive]}>
                <Activity size={22} color={progressStyle === 'status-bar' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, progressStyle === 'status-bar' && styles.progressStyleNameActive]}>실시간 상태 바형</Text>
              <Text style={styles.progressStyleDesc}>옹알이 표정 변화</Text>
            </TouchableOpacity>
          </View>
          <Divider />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>제휴 공시문 자동 포함</Text>
              <Text style={styles.featureDesc}>생성되는 카드와 공유 콘텐츠에 제휴 광고 표시를 자동으로 추가합니다</Text>
            </View>
            <TouchableOpacity
              onPress={() => setAutoDisclosure(!autoDisclosure)}
              activeOpacity={0.7}
              hitSlop={12}
            >
              <View style={[styles.toggleSwitch, autoDisclosure && styles.toggleSwitchActive]}>
                <View style={[styles.toggleKnob, autoDisclosure && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>
          </View>
          <Divider />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>클린 영상 추출 (자막/훅 없음)</Text>
              <Text style={styles.featureDesc}>자막·후킹문구가 없는 순수 원본 영상만 생성합니다. 유튜브 쇼츠 사운드 중심 콘텐츠, 네이버 플레이스 동영상 탭, 외부 편집 툴용으로 적합합니다</Text>
            </View>
            <TouchableOpacity
              onPress={() => setCleanFootage(!cleanFootage)}
              activeOpacity={0.7}
              hitSlop={12}
            >
              <View style={[styles.toggleSwitch, cleanFootage && styles.toggleSwitchActive]}>
                <View style={[styles.toggleKnob, cleanFootage && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>
          </View>
          <Divider />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>영상 완성 푸시 알림</Text>
              <Text style={styles.featureDesc}>AI 영상 제작이 완료되면 브라우저 상단에 알림을 보냅니다. 앱을 닫아도 완료 시점에 알려드립니다</Text>
            </View>
            <PushNotificationToggle />
          </View>
        </View>
        <TouchableOpacity
          style={[styles.saveIdButton, savedDefaults && styles.saveIdButtonDone]}
          onPress={async () => {
            setSavingDefaults(true);
            setSavedDefaults(false);
            try {
              await updateUserSettings({
                default_video_duration: defaultVideoDuration,
                default_tts_voice: defaultTtsVoice,
                tts_speed: ttsSpeed,
                tts_pitch: ttsPitch,
                progress_style: progressStyle,
                auto_disclosure: autoDisclosure,
                clean_footage_enabled: cleanFootage,
              });
              setSavedDefaults(true);
              setTimeout(() => setSavedDefaults(false), 2500);
            } catch (err) {
              Alert.alert('저장 실패', err instanceof Error ? err.message : '알 수 없는 오류');
            }
            setSavingDefaults(false);
          }}
          disabled={savingDefaults}
          activeOpacity={0.8}
        >
          {savingDefaults ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : savedDefaults ? (
            <>
              <Check size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.saveIdButtonText}>저장됨</Text>
            </>
          ) : (
            <>
              <Check size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.saveIdButtonText}>기본 설정 저장</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>마스코트 캐릭터 설정</Text>
        <Text style={styles.sectionDesc}>
          영상과 화면에 표시되는 아기 캐릭터 마스코트를 켜거나 끌 수 있습니다. 비즈니스 계정이나 전문적인 톤이 필요하다면 마스코트를 끄거나 심플한 스타일로 변경하세요.
        </Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>마스코트 표시</Text>
              <Text style={styles.featureDesc}>아기 캐릭터를 영상 오버레이, 진행 바, 화면 UI에 표시합니다</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                const next = !mascot.enabled;
                mascot.updateEnabled(next);
                setSavingMascot(true);
                persistUserSettings({ mascot_enabled: next }).then(() => {
                  invalidateSettingsCache();
                  setSavingMascot(false);
                  setSavedMascot(true);
                  setTimeout(() => setSavedMascot(false), 2000);
                }).catch(() => setSavingMascot(false));
              }}
              activeOpacity={0.7}
              hitSlop={12}
            >
              <View style={[styles.toggleSwitch, mascot.enabled && styles.toggleSwitchActive]}>
                <View style={[styles.toggleKnob, mascot.enabled && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>
          </View>

          {mascot.enabled && (
            <>
              <Divider />
              <Text style={styles.idInputLabel}>마스코트 스타일</Text>
              <Text style={styles.ttsCategoryLabel}>표시할 캐릭터 스타일을 선택하세요</Text>
              <View style={styles.progressStyleRow}>
                <TouchableOpacity
                  style={[styles.progressStyleCard, mascot.style === 'cute-crawler' && styles.progressStyleCardActive]}
                  onPress={() => {
                    mascot.updateStyle('cute-crawler');
                    persistUserSettings({ mascot_style: 'cute-crawler' }).then(() => invalidateSettingsCache()).catch(() => {});
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.progressStyleIcon, mascot.style === 'cute-crawler' && styles.progressStyleIconActive]}>
                    <Baby size={22} color={mascot.style === 'cute-crawler' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
                  </View>
                  <Text style={[styles.progressStyleName, mascot.style === 'cute-crawler' && styles.progressStyleNameActive]}>아기 크롤러</Text>
                  <Text style={styles.progressStyleDesc}>귀여운 3D 아기</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.progressStyleCard, mascot.style === 'minimal-dot' && styles.progressStyleCardActive]}
                  onPress={() => {
                    mascot.updateStyle('minimal-dot');
                    persistUserSettings({ mascot_style: 'minimal-dot' }).then(() => invalidateSettingsCache()).catch(() => {});
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.progressStyleIcon, mascot.style === 'minimal-dot' && styles.progressStyleIconActive]}>
                    <CircleDot size={22} color={mascot.style === 'minimal-dot' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
                  </View>
                  <Text style={[styles.progressStyleName, mascot.style === 'minimal-dot' && styles.progressStyleNameActive]}>심플 닷</Text>
                  <Text style={styles.progressStyleDesc}>미니멀 인디케이터</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.progressStyleCard, mascot.style === 'none' && styles.progressStyleCardActive]}
                  onPress={() => {
                    mascot.updateStyle('none');
                    persistUserSettings({ mascot_style: 'none' }).then(() => invalidateSettingsCache()).catch(() => {});
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.progressStyleIcon, mascot.style === 'none' && styles.progressStyleIconActive]}>
                    <Activity size={22} color={mascot.style === 'none' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
                  </View>
                  <Text style={[styles.progressStyleName, mascot.style === 'none' && styles.progressStyleNameActive]}>표시 안 함</Text>
                  <Text style={styles.progressStyleDesc}>마스코트 없음</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
        {savingMascot && (
          <Text style={styles.mascotSavingHint}>저장 중...</Text>
        )}
        {savedMascot && (
          <Text style={styles.mascotSavedHint}>마스코트 설정이 저장되었습니다</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>앱 환경 설정</Text>
        <Text style={styles.sectionDesc}>
          촬영 가이드 모드, 화면 효과, 테마를 기기 사양과 선호에 맞게 조절하세요
        </Text>
        <View style={styles.card}>
          {/* Capture Guide Mode */}
          <Text style={styles.idInputLabel}>AI 정밀도 및 촬영 가이드 모드</Text>
          <View style={styles.progressStyleRow}>
            <TouchableOpacity
              style={[styles.progressStyleCard, captureGuideMode === 'beginner' && styles.progressStyleCardActive]}
              onPress={() => setCaptureGuideMode('beginner')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, captureGuideMode === 'beginner' && styles.progressStyleIconActive]}>
                <Camera size={22} color={captureGuideMode === 'beginner' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, captureGuideMode === 'beginner' && styles.progressStyleNameActive]}>초보자용 간편</Text>
              <Text style={styles.progressStyleDesc}>사진 한 장으로 시작</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.progressStyleCard, captureGuideMode === 'pro' && styles.progressStyleCardActive]}
              onPress={() => setCaptureGuideMode('pro')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, captureGuideMode === 'pro' && styles.progressStyleIconActive]}>
                <Layers size={22} color={captureGuideMode === 'pro' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, captureGuideMode === 'pro' && styles.progressStyleNameActive]}>프로 다각도</Text>
              <Text style={styles.progressStyleDesc}>정면·측면·디테일</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.ttsCategoryLabel}>
            {captureGuideMode === 'beginner'
              ? '간편 모드: 기본 촬영 팁만 표시되고, 사진 한 장으로 빠르게 AI 분석을 시작합니다'
              : '프로 모드: 다각도 촬영 가이드(정면·측면·후면·디테일)가 표시되고, 여러 각도 사진으로 AI 정밀도가 극대화됩니다'}
          </Text>

          <Divider />

          {/* UI Performance */}
          <Text style={styles.idInputLabel}>UI 성능 (글래스모피즘 & 블러)</Text>
          <View style={styles.progressStyleRow}>
            <TouchableOpacity
              style={[styles.progressStyleCard, uiPerformance === 'high' && styles.progressStyleCardActive]}
              onPress={() => setUiPerformance('high')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, uiPerformance === 'high' && styles.progressStyleIconActive]}>
                <Sparkles size={22} color={uiPerformance === 'high' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, uiPerformance === 'high' && styles.progressStyleNameActive]}>고화질 블러</Text>
              <Text style={styles.progressStyleDesc}>반투명 유리 효과</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.progressStyleCard, uiPerformance === 'lite' && styles.progressStyleCardActive]}
              onPress={() => setUiPerformance('lite')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, uiPerformance === 'lite' && styles.progressStyleIconActive]}>
                <Smartphone size={22} color={uiPerformance === 'lite' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, uiPerformance === 'lite' && styles.progressStyleNameActive]}>저사양 최적화</Text>
              <Text style={styles.progressStyleDesc}>단색 배경 대체</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.ttsCategoryLabel}>
            {uiPerformance === 'high'
              ? '고화질: 반투명 유리 질감(글래스모피즘)과 블러 효과가 적용되어 프리미엄 느낌을 줍니다'
              : '최적화: 블러 효과 대신 단색 배경을 사용하여 구형 기기에서도 부드럽게 작동합니다'}
          </Text>

          <Divider />

          {/* Theme Mode */}
          <Text style={styles.idInputLabel}>{t('settings.themePreset')}</Text>
          <Text style={styles.ttsCategoryLabel}>{t('settings.themePresetDesc')}</Text>
          <View style={styles.progressStyleRow}>
            <TouchableOpacity
              style={[styles.progressStyleCard, themePreset === 'cinematic-dark' && styles.progressStyleCardActive]}
              onPress={() => handleThemeChange('cinematic-dark', 'dark')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, themePreset === 'cinematic-dark' && styles.progressStyleIconActive, { backgroundColor: themePreset === 'cinematic-dark' ? '#167ef5' : theme.colors.dark.surfaceLight }]}>
                <Palette size={22} color={themePreset === 'cinematic-dark' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, themePreset === 'cinematic-dark' && styles.progressStyleNameActive]}>{t('settings.themeCinematicDark')}</Text>
              <Text style={styles.progressStyleDesc}>{t('settings.themeCinematicDarkDesc')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.progressStyleCard, themePreset === 'studio-light' && styles.progressStyleCardActive]}
              onPress={() => handleThemeChange('studio-light', 'light')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, themePreset === 'studio-light' && styles.progressStyleIconActive, { backgroundColor: themePreset === 'studio-light' ? '#3b82f6' : theme.colors.dark.surfaceLight }]}>
                <Sun size={22} color={themePreset === 'studio-light' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, themePreset === 'studio-light' && styles.progressStyleNameActive]}>{t('settings.themeStudioLight')}</Text>
              <Text style={styles.progressStyleDesc}>{t('settings.themeStudioLightDesc')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.progressStyleCard, themePreset === 'trendy-viral' && styles.progressStyleCardActive]}
              onPress={() => handleThemeChange('trendy-viral', 'dark')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, themePreset === 'trendy-viral' && styles.progressStyleIconActive, { backgroundColor: themePreset === 'trendy-viral' ? '#e02eff' : theme.colors.dark.surfaceLight }]}>
                <Flame size={22} color={themePreset === 'trendy-viral' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, themePreset === 'trendy-viral' && styles.progressStyleNameActive]}>{t('settings.themeTrendyViral')}</Text>
              <Text style={styles.progressStyleDesc}>{t('settings.themeTrendyViralDesc')}</Text>
            </TouchableOpacity>
          </View>

          <Divider />

          {/* Display Density */}
          <Text style={styles.idInputLabel}>화면 밀도 및 텍스트 가독성</Text>
          <View style={styles.progressStyleRow}>
            <TouchableOpacity
              style={[styles.progressStyleCard, displayDensity === 'compact' && styles.progressStyleCardActive]}
              onPress={() => setDisplayDensity('compact')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, displayDensity === 'compact' && styles.progressStyleIconActive]}>
                <Smartphone size={22} color={displayDensity === 'compact' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, displayDensity === 'compact' && styles.progressStyleNameActive]}>컴팩트</Text>
              <Text style={styles.progressStyleDesc}>작은 화면 최적화</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.progressStyleCard, displayDensity === 'standard' && styles.progressStyleCardActive]}
              onPress={() => setDisplayDensity('standard')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, displayDensity === 'standard' && styles.progressStyleIconActive]}>
                <LayoutTemplate size={22} color={displayDensity === 'standard' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, displayDensity === 'standard' && styles.progressStyleNameActive]}>스탠다드</Text>
              <Text style={styles.progressStyleDesc}>균형 잡힌 여백</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.progressStyleCard, displayDensity === 'wide' && styles.progressStyleCardActive]}
              onPress={() => setDisplayDensity('wide')}
              activeOpacity={0.7}
            >
              <View style={[styles.progressStyleIcon, displayDensity === 'wide' && styles.progressStyleIconActive]}>
                <BookOpen size={22} color={displayDensity === 'wide' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              </View>
              <Text style={[styles.progressStyleName, displayDensity === 'wide' && styles.progressStyleNameActive]}>와이드 텍스트</Text>
              <Text style={styles.progressStyleDesc}>큰 폰트 가독성</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.ttsCategoryLabel}>
            {displayDensity === 'compact'
              ? '컴팩트 모드: 아이폰 미니/SE 등 작은 화면에서 여백을 줄여 한눈에 더 많은 정보를 볼 수 있습니다'
              : displayDensity === 'wide'
                ? '와이드 텍스트 모드: 본문 폰트 크기가 확대되고 여백이 넓어져 가독성이 크게 향상됩니다'
                : '스탠다드 모드: 모든 화면 크기에서 균형 잡힌 여백과 폰트 크기를 제공합니다'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.saveIdButton, savedPrefs && styles.saveIdButtonDone]}
          onPress={async () => {
            setSavingPrefs(true);
            setSavedPrefs(false);
            try {
              await updateUserSettings({
                capture_guide_mode: captureGuideMode,
                ui_performance: uiPerformance,
                theme_mode: themeMode,
                theme_preset: themePreset,
                display_density: displayDensity,
              });
              setSavedPrefs(true);
              setTimeout(() => setSavedPrefs(false), 2500);
            } catch (err) {
              Alert.alert('저장 실패', err instanceof Error ? err.message : '알 수 없는 오류');
            }
            setSavingPrefs(false);
          }}
          disabled={savingPrefs}
          activeOpacity={0.8}
        >
          {savingPrefs ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : savedPrefs ? (
            <>
              <Check size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.saveIdButtonText}>저장됨</Text>
            </>
          ) : (
            <>
              <Check size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.saveIdButtonText}>환경 설정 저장</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* App Language Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.appLanguage')}</Text>
        <Text style={styles.sectionDesc}>{t('settings.appLanguageDesc')}</Text>
        <TouchableOpacity
          style={styles.langTriggerRow}
          onPress={() => setLangModalVisible(true)}
          activeOpacity={0.7}
        >
          <Globe size={20} color={theme.colors.primary[400]} strokeWidth={2} />
          <View style={styles.langTriggerBody}>
            <Text style={styles.langTriggerLabel}>
              {SUPPORTED_LANGUAGES.find((l) => l.code === language)?.flag}  {SUPPORTED_LANGUAGES.find((l) => l.code === language)?.nativeName}
            </Text>
            <Text style={styles.langTriggerSub}>{SUPPORTED_LANGUAGES.find((l) => l.code === language)?.label}</Text>
          </View>
          <ChevronRight size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={langModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.langModalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Globe size={18} color={theme.colors.primary[400]} strokeWidth={2} />
                <Text style={styles.modalTitle}>{t('settings.appLanguage')}</Text>
              </View>
              <TouchableOpacity onPress={() => setLangModalVisible(false)} activeOpacity={0.7}>
                <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.langModalScroll} showsVerticalScrollIndicator={false}>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.langModalItem, language === lang.code && styles.langModalItemActive]}
                  onPress={async () => {
                    await setLanguage(lang.code);
                    try {
                      await updateUserSettings({ app_language: lang.code });
                    } catch {}
                    setLangModalVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.langModalFlag}>{lang.flag}</Text>
                  <View style={styles.langModalItemBody}>
                    <Text style={[styles.langModalItemLabel, language === lang.code && styles.langModalItemLabelActive]}>
                      {lang.nativeName}
                    </Text>
                    <Text style={styles.langModalItemSub}>{lang.label}</Text>
                  </View>
                  {language === lang.code && (
                    <Check size={20} color={theme.colors.primary[400]} strokeWidth={2} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={styles.section}>
        <SectionCard
          title={t('settings.brandPersonaSection')}
          subtitle={t('settings.brandPersonaSectionDesc')}
          icon={<Sparkles size={20} color={theme.colors.accent[400]} strokeWidth={2} />}
          defaultExpanded
        >
          {/* Brand persona text */}
          <Text style={styles.accordionLabel}>{t('settings.brandPersona')}</Text>
          <Text style={styles.accordionDesc}>{t('settings.brandPersonaDesc')}</Text>
          <TextInput
            style={[styles.idInput, { minHeight: 70, textAlignVertical: 'top', marginTop: 8 }]}
            value={brandPersona}
            onChangeText={setBrandPersona}
            placeholder={t('settings.brandPersonaPlaceholder')}
            placeholderTextColor={theme.colors.dark.textFaint}
            autoCorrect={false}
            multiline
            maxLength={500}
          />
          <Text style={styles.charCount}>{brandPersona.length}/500</Text>

          {/* Default caption tone */}
          <View style={styles.accordionSpacer} />
          <Text style={styles.accordionLabel}>{t('settings.defaultCaptionTone')}</Text>
          <Text style={styles.accordionDesc}>{t('settings.defaultCaptionToneDesc')}</Text>
          <View style={styles.toneChipRow}>
            {([
              { key: 'casual', label: t('settings.captionToneCasual') },
              { key: 'professional', label: t('settings.captionToneProfessional') },
              { key: 'emotional', label: t('settings.captionToneEmotional') },
              { key: 'humorous', label: t('settings.captionToneHumorous') },
              { key: 'studio_premium', label: t('settings.captionToneStudioPremium') },
              { key: 'raw_trigger', label: t('settings.captionToneRawTrigger') },
            ] as const).map((tone) => (
              <TouchableOpacity
                key={tone.key}
                style={[styles.toneChip, defaultCaptionTone === tone.key && styles.toneChipActive]}
                onPress={() => setDefaultCaptionTone(tone.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.toneChipText, defaultCaptionTone === tone.key && styles.toneChipTextActive]}>
                  {tone.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Fixed 3s hook phrase */}
          <View style={styles.accordionSpacer} />
          <Text style={styles.accordionLabel}>{t('settings.fixedHookPhrase')}</Text>
          <Text style={styles.accordionDesc}>{t('settings.fixedHookPhraseDesc')}</Text>
          <TextInput
            style={[styles.idInput, { marginTop: 8 }]}
            value={fixedHookPhrase}
            onChangeText={setFixedHookPhrase}
            placeholder={t('settings.fixedHookPhrasePlaceholder')}
            placeholderTextColor={theme.colors.dark.textFaint}
            autoCorrect={false}
            maxLength={100}
          />

          {/* Watermark status */}
          <View style={styles.accordionSpacer} />
          <Text style={styles.accordionLabel}>{t('settings.watermarkLogo')}</Text>
          <Text style={styles.accordionDesc}>{t('settings.watermarkLogoDesc')}</Text>
          <View style={styles.watermarkStatusRow}>
            {logoUrl ? (
              <>
                <Check size={16} color={theme.colors.success[400]} strokeWidth={2} />
                <Text style={styles.watermarkStatusActive}>{t('settings.connected')}</Text>
              </>
            ) : (
              <>
                <Stamp size={16} color={theme.colors.dark.textFaint} strokeWidth={2} />
                <Text style={styles.watermarkStatusInactive}>{t('settings.notSet')}</Text>
              </>
            )}
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveIdButton, savedBrandSection && styles.saveIdButtonDone]}
            onPress={async () => {
              setSavingBrandSection(true);
              setSavedBrandSection(false);
              try {
                await updateUserSettings({
                  brand_persona: brandPersona.trim() || null,
                  default_caption_tone: defaultCaptionTone,
                  fixed_hook_phrase: fixedHookPhrase.trim() || null,
                });
                setSavedBrandSection(true);
                setTimeout(() => setSavedBrandSection(false), 2500);
              } catch (err) {
                Alert.alert(t('common.error'), err instanceof Error ? err.message : String(err));
              }
              setSavingBrandSection(false);
            }}
            disabled={savingBrandSection}
            activeOpacity={0.8}
          >
            {savingBrandSection ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : savedBrandSection ? (
              <>
                <Check size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.saveIdButtonText}>{t('settings.brandPersonaSaved')}</Text>
              </>
            ) : (
              <>
                <Check size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.saveIdButtonText}>{t('common.save')}</Text>
              </>
            )}
          </TouchableOpacity>
        </SectionCard>

        <SectionCard
          title={t('settings.smartAffiliateSection')}
          subtitle={t('settings.smartAffiliateSectionDesc')}
          icon={<Megaphone size={20} color={theme.colors.primary[400]} strokeWidth={2} />}
          badge={sandboxMode ? t('settings.sandboxBadge') : undefined}
        >
          {/* Commission priority mapping */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleBody}>
              <Text style={styles.toggleLabel}>{t('settings.affiliatePriority')}</Text>
              <Text style={styles.toggleDesc}>{t('settings.affiliatePriorityDesc')}</Text>
            </View>
            <TouchableOpacity onPress={() => setAffiliatePriority(!affiliatePriority)} activeOpacity={0.7} hitSlop={12}>
              <View style={[styles.toggleSwitch, affiliatePriority && styles.toggleSwitchActive]}>
                <View style={[styles.toggleKnob, affiliatePriority && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.toggleDivider} />

          {/* Auto-publish toggles */}
          <Text style={styles.accordionLabel}>{t('settings.smartAffiliateSection')}</Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleBody}>
              <Text style={styles.toggleLabel}>{t('settings.autoPublishReels')}</Text>
            </View>
            <TouchableOpacity onPress={() => setAutoPublishReels(!autoPublishReels)} activeOpacity={0.7} hitSlop={12}>
              <View style={[styles.toggleSwitch, autoPublishReels && styles.toggleSwitchActive]}>
                <View style={[styles.toggleKnob, autoPublishReels && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.toggleRow}>
            <View style={styles.toggleBody}>
              <Text style={styles.toggleLabel}>{t('settings.autoPublishTiktok')}</Text>
            </View>
            <TouchableOpacity onPress={() => setAutoPublishTiktok(!autoPublishTiktok)} activeOpacity={0.7} hitSlop={12}>
              <View style={[styles.toggleSwitch, autoPublishTiktok && styles.toggleSwitchActive]}>
                <View style={[styles.toggleKnob, autoPublishTiktok && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.toggleRow}>
            <View style={styles.toggleBody}>
              <Text style={styles.toggleLabel}>{t('settings.autoPublishShorts')}</Text>
            </View>
            <TouchableOpacity onPress={() => setAutoPublishShorts(!autoPublishShorts)} activeOpacity={0.7} hitSlop={12}>
              <View style={[styles.toggleSwitch, autoPublishShorts && styles.toggleSwitchActive]}>
                <View style={[styles.toggleKnob, autoPublishShorts && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.toggleDivider} />

          {/* Sandbox mode */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleBody}>
              <View style={styles.toggleLabelRow}>
                <ShieldCheck size={16} color={theme.colors.success[400]} strokeWidth={2} />
                <Text style={styles.toggleLabel}>{t('settings.sandboxMode')}</Text>
              </View>
              <Text style={styles.toggleDesc}>{t('settings.sandboxModeDesc')}</Text>
            </View>
            <TouchableOpacity onPress={() => setSandboxMode(!sandboxMode)} activeOpacity={0.7} hitSlop={12}>
              <View style={[styles.toggleSwitch, sandboxMode && styles.toggleSwitchActive]}>
                <View style={[styles.toggleKnob, sandboxMode && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveIdButton, savedAutoPublish && styles.saveIdButtonDone]}
            onPress={async () => {
              setSavingAutoPublish(true);
              setSavedAutoPublish(false);
              try {
                await updateUserSettings({
                  affiliate_priority_mapping: affiliatePriority,
                  auto_publish_reels: autoPublishReels,
                  auto_publish_tiktok: autoPublishTiktok,
                  auto_publish_shorts: autoPublishShorts,
                  auto_publish_sandbox_mode: sandboxMode,
                });
                setSavedAutoPublish(true);
                setTimeout(() => setSavedAutoPublish(false), 2500);
              } catch (err) {
                Alert.alert(t('common.error'), err instanceof Error ? err.message : String(err));
              }
              setSavingAutoPublish(false);
            }}
            disabled={savingAutoPublish}
            activeOpacity={0.8}
          >
            {savingAutoPublish ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : savedAutoPublish ? (
              <>
                <Check size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.saveIdButtonText}>{t('settings.autoPublishApplied')}</Text>
              </>
            ) : (
              <>
                <Check size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.saveIdButtonText}>{t('common.save')}</Text>
              </>
            )}
          </TouchableOpacity>
        </SectionCard>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>OpenAI API 키 설정</Text>
        <Text style={styles.sectionDesc}>
          가상 컷 생성, AI 범용 합성 등 AI 이미지 기능에 사용됩니다. 키는 안전하게 저장되며 서버에서만 사용됩니다.
        </Text>
        <View style={styles.card}>
          <View style={styles.idInputRow}>
            <View style={[styles.idIconWrap, { backgroundColor: theme.colors.primary[500] + '20' }]}>
              <Key size={18} color={theme.colors.primary[400]} strokeWidth={2} />
            </View>
            <View style={styles.idInputBody}>
              <Text style={styles.idInputLabel}>OpenAI API Key</Text>
              <TextInput
                style={styles.idInput}
                value={openaiKey}
                onChangeText={setOpenaiKey}
                placeholder="sk-..."
                placeholderTextColor={theme.colors.dark.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showApiKey}
              />
            </View>
            <TouchableOpacity onPress={() => setShowApiKey(!showApiKey)} style={styles.idIconWrap} hitSlop={12}>
              {showApiKey ? <EyeOff size={18} color={theme.colors.dark.textDim} strokeWidth={2} /> : <Eye size={18} color={theme.colors.dark.textDim} strokeWidth={2} />}
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.saveIdButton, savedKey && styles.saveIdButtonDone]}
          onPress={async () => {
            setSavingKey(true);
            setSavedKey(false);
            try {
              await updateUserSettings({ openai_api_key: openaiKey || null, pexels_api_key: pexelsKey || null, tts_api_key: ttsKey || null, runway_api_key: runwayKey || null });
              setSavedKey(true);
              setTimeout(() => setSavedKey(false), 2500);
            } catch (err) {
              Alert.alert('저장 실패', err instanceof Error ? err.message : '알 수 없는 오류');
            }
            setSavingKey(false);
          }}
          disabled={savingKey}
          activeOpacity={0.8}
        >
          {savingKey ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : savedKey ? (
            <>
              <Check size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.saveIdButtonText}>저장됨</Text>
            </>
          ) : (
            <>
              <Check size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.saveIdButtonText}>API 키 저장</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.card}>
          <View style={styles.idInputRow}>
            <View style={[styles.idIconWrap, { backgroundColor: theme.colors.success[500] + '20' }]}>
              <Film size={18} color={theme.colors.success[400]} strokeWidth={2} />
            </View>
            <View style={styles.idInputBody}>
              <Text style={styles.idInputLabel}>Pexels API Key</Text>
              <TextInput
                style={styles.idInput}
                value={pexelsKey}
                onChangeText={setPexelsKey}
                placeholder="영상 검색용 Pexels 키"
                placeholderTextColor={theme.colors.dark.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showApiKey}
              />
            </View>
          </View>
          <Text style={{ fontSize: 11, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, marginTop: 8, lineHeight: 16 }}>
            pexels.com에서 발급받은 키를 입력하면 제품 테마 영상 검색이 활성화됩니다.
          </Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' }}
            onPress={() => Linking.openURL('https://www.pexels.com/api/')}
            activeOpacity={0.7}
          >
            <ExternalLink size={12} color={theme.colors.success[400]} strokeWidth={2} />
            <Text style={{ fontSize: 11, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.success[400] }}>
              Pexels에서 무료 키 발급받기
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.idInputRow}>
            <View style={[styles.idIconWrap, { backgroundColor: theme.colors.accent[500] + '20' }]}>
              <Music2 size={18} color={theme.colors.accent[400]} strokeWidth={2} />
            </View>
            <View style={styles.idInputBody}>
              <Text style={styles.idInputLabel}>TTS API Key (ElevenLabs / OpenAI)</Text>
              <TextInput
                style={styles.idInput}
                value={ttsKey}
                onChangeText={setTtsKey}
                placeholder="고품질 내레이션용 음성 합성 키"
                placeholderTextColor={theme.colors.dark.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showApiKey}
              />
            </View>
          </View>
          <Text style={{ fontSize: 11, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, marginTop: 8, lineHeight: 16 }}>
            ElevenLabs 또는 OpenAI TTS API 키를 입력하면 인간에 가까운 자연스러운 한국어 내레이션이 영상에 포함됩니다. 미입력 시 기본 브라우저 음성이 사용됩니다.
          </Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' }}
            onPress={() => Linking.openURL('https://platform.openai.com/api-keys')}
            activeOpacity={0.7}
          >
            <ExternalLink size={12} color={theme.colors.accent[400]} strokeWidth={2} />
            <Text style={{ fontSize: 11, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.accent[400] }}>
              OpenAI에서 API 키 발급받기
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.idInputRow}>
            <View style={[styles.idIconWrap, { backgroundColor: theme.colors.warning[500] + '20' }]}>
              <Video size={18} color={theme.colors.warning[400]} strokeWidth={2} />
            </View>
            <View style={styles.idInputBody}>
              <Text style={styles.idInputLabel}>Runway API Key</Text>
              <TextInput
                style={styles.idInput}
                value={runwayKey}
                onChangeText={setRunwayKey}
                placeholder="key_..."
                placeholderTextColor={theme.colors.dark.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showApiKey}
              />
            </View>
          </View>
          <Text style={{ fontSize: 11, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.dark.textDim, marginTop: 8, lineHeight: 16 }}>
            Runway API 키를 입력하면 AI 영상 생성 기능이 활성화됩니다. 사진을 영상으로 변환하거나 숏폼 영상을 자동 생성할 때 사용됩니다.
          </Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' }}
            onPress={() => Linking.openURL('https://runwayml.com/api/')}
            activeOpacity={0.7}
          >
            <ExternalLink size={12} color={theme.colors.warning[400]} strokeWidth={2} />
            <Text style={{ fontSize: 11, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.warning[400] }}>
              Runway에서 API 키 발급받기
            </Text>
          </TouchableOpacity>
        </View>

        <GpuAutoscaleCard />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI 분석</Text>
        <View style={styles.aiBuiltInCard}>
          <View style={styles.aiBuiltInIcon}>
            <Zap size={22} color="#fff" strokeWidth={2} />
          </View>
          <View style={styles.aiBuiltInBody}>
            <Text style={styles.aiBuiltInTitle}>AI 분석 내장됨</Text>
            <Text style={styles.aiBuiltInDesc}>
              별도 설정 없이 사진을 찍으면 AI가 자동으로 제품을 식별하고 마케팅 카피를 생성합니다.
            </Text>
          </View>
          <Check size={18} color={theme.colors.success[400]} strokeWidth={2} />
        </View>
      </View>

      <Text style={styles.footer}>ShortConnect (숏커넥트) — 온·오프라인 셀러를 위한 올인원 AI 커머스</Text>

      <Modal
        visible={revModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRevModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%' }}
          >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Wallet size={18} color={theme.colors.success[400]} strokeWidth={2} />
                <Text style={styles.modalTitle}>수익 기록 추가</Text>
              </View>
              <TouchableOpacity onPress={() => setRevModalVisible(false)} activeOpacity={0.7}>
                <Text style={styles.modalCloseText}>취소</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>플랫폼</Text>
            <View style={styles.platformPickerRow}>
              {['Coupang', 'BrandConnect', 'Toss', '기타'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.platformChip, revPlatform === p && styles.platformChipActive]}
                  onPress={() => setRevPlatform(p)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.platformChipText, revPlatform === p && styles.platformChipTextActive]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>금액 (원)</Text>
            <TextInput
              style={styles.modalInput}
              value={revAmount}
              onChangeText={setRevAmount}
              placeholder="예: 15000"
              placeholderTextColor={theme.colors.dark.textFaint}
              keyboardType="numeric"
            />

            <Text style={styles.modalLabel}>정산 월</Text>
            <TextInput
              style={styles.modalInput}
              value={revMonth}
              onChangeText={setRevMonth}
              placeholder="YYYY-MM"
              placeholderTextColor={theme.colors.dark.textFaint}
            />

            <Text style={styles.modalLabel}>메모 (선택)</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 60 }]}
              value={revNote}
              onChangeText={setRevNote}
              placeholder="어떤 콘텐츠 수익인지 메모"
              placeholderTextColor={theme.colors.dark.textFaint}
              multiline
            />

            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={handleSaveRevenue}
              disabled={revSaving}
              activeOpacity={0.8}
            >
              {revSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalSaveButtonText}>기록 저장</Text>
              )}
            </TouchableOpacity>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      {/* ── Error Log Viewer ── */}
      <SectionCard title="원격 에러 로그" icon={<Activity size={18} color={theme.colors.error?.[400] ?? '#ef4444'} strokeWidth={2} />}>
        <Text style={styles.sectionDesc}>
          APK 빌드에서 발생한 크래시 및 JS 에러를 실시간으로 확인할 수 있습니다.{'\n'}
          세션 ID: <Text style={{ color: theme.colors.dark.textDim, fontFamily: theme.typography.fontFamily.regular }}>{SESSION_ID}</Text>
        </Text>
        <TouchableOpacity
          style={[styles.saveIdButton, { marginTop: 8, flexDirection: 'row', gap: 6, alignItems: 'center' }]}
          onPress={async () => {
            setErrorLogsLoading(true);
            setErrorLogsVisible(true);
            try {
              const logs = await fetchRecentLogs(50);
              setErrorLogs(logs);
            } catch {
              setErrorLogs([]);
            } finally {
              setErrorLogsLoading(false);
            }
          }}
          activeOpacity={0.8}
        >
          <Activity size={16} color="#fff" strokeWidth={2} />
          <Text style={styles.saveIdButtonText}>최근 에러 로그 불러오기</Text>
        </TouchableOpacity>
      </SectionCard>

      {/* Error log list modal */}
      <Modal visible={errorLogsVisible} animationType="slide" onRequestClose={() => setErrorLogsVisible(false)}>
        <View style={[styles.modalOverlay, { paddingTop: insets.top + 8 }]}>
          <View style={styles.errorModalHeader}>
            <Text style={styles.errorModalTitle}>에러 로그 (최근 50건)</Text>
            <TouchableOpacity onPress={() => { setErrorLogsVisible(false); setSelectedLog(null); }} activeOpacity={0.7}>
              <X size={22} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          {errorLogsLoading ? (
            <ActivityIndicator size="large" color={theme.colors.primary[400]} style={{ marginTop: 40 }} />
          ) : errorLogs.length === 0 ? (
            <View style={styles.errorEmptyWrap}>
              <Text style={styles.errorEmptyText}>기록된 에러가 없습니다.</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8 }}>
              {errorLogs.map((log) => (
                <TouchableOpacity
                  key={log.id}
                  style={[
                    styles.errorLogRow,
                    log.level === 'fatal' && styles.errorLogFatal,
                    log.level === 'warning' && styles.errorLogWarning,
                  ]}
                  onPress={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                  activeOpacity={0.8}
                >
                  <View style={styles.errorLogTop}>
                    <View style={[styles.errorLevelBadge, log.level === 'fatal' ? styles.badgeFatal : log.level === 'warning' ? styles.badgeWarning : styles.badgeError]}>
                      <Text style={styles.errorLevelText}>{log.level.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.errorLogTime} numberOfLines={1}>
                      {new Date(log.created_at).toLocaleString('ko-KR')}
                    </Text>
                    <Text style={styles.errorLogPlatform}>{log.platform ?? ''}</Text>
                  </View>
                  <Text style={styles.errorLogMessage} numberOfLines={selectedLog?.id === log.id ? undefined : 2}>
                    {log.message}
                  </Text>
                  {selectedLog?.id === log.id && log.stack ? (
                    <Text style={styles.errorLogStack} selectable>{log.stack}</Text>
                  ) : null}
                  {selectedLog?.id === log.id && log.context ? (
                    <Text style={styles.errorLogStack} selectable>{JSON.stringify(log.context, null, 2)}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: staticTheme.colors.dark.bg,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: staticTheme.colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  section: {
    paddingHorizontal: staticTheme.spacing.lg,
    marginBottom: staticTheme.spacing.xl,
  },
  sectionTitle: {
    fontSize: staticTheme.typography.micro,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: staticTheme.spacing.sm,
  },
  sectionDesc: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    lineHeight: 20,
    marginBottom: staticTheme.spacing.md,
  },
  analyticsShortcutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: staticTheme.spacing.md,
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: staticTheme.radius.lg,
    padding: staticTheme.spacing.md,
    ...staticTheme.shadows.card,
  },
  analyticsShortcutIconWrap: {
    width: 48,
    height: 48,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.success[500] + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyticsShortcutInfo: {
    flex: 1,
  },
  analyticsShortcutTitle: {
    fontSize: staticTheme.typography.body,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  analyticsShortcutDesc: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    marginTop: 3,
    lineHeight: 16,
  },
  card: {
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: staticTheme.radius.lg,
    padding: staticTheme.spacing.md,
    ...staticTheme.shadows.card,
  },
  featureRow: {
    flexDirection: 'row',
    paddingVertical: staticTheme.spacing.sm,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureBody: {
    flex: 1,
    marginLeft: staticTheme.spacing.md,
  },
  featureTitle: {
    fontSize: staticTheme.typography.body,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  featureDesc: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    lineHeight: 20,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: staticTheme.colors.dark.border,
    marginVertical: staticTheme.spacing.sm,
  },
  usageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: staticTheme.spacing.sm,
  },
  usageSteps: {
    paddingLeft: 48,
    paddingBottom: staticTheme.spacing.sm,
    gap: 8,
  },
  usageStepRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  usageStepBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: staticTheme.colors.primary[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  usageStepNum: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: staticTheme.colors.primary[400],
  },
  usageStepText: {
    flex: 1,
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    lineHeight: 20,
  },
  flowContainer: {
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: staticTheme.radius.lg,
    padding: staticTheme.spacing.md,
    ...staticTheme.shadows.card,
  },
  flowStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: staticTheme.spacing.md,
  },
  flowStepIcon: {
    width: 44,
    height: 44,
    borderRadius: staticTheme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flowStepBody: {
    flex: 1,
  },
  flowStepNum: {
    fontSize: 9,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: staticTheme.colors.dark.textFaint,
    letterSpacing: 1,
  },
  flowStepTitle: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
    marginTop: 2,
  },
  flowStepDesc: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    lineHeight: 18,
    marginTop: 4,
  },
  flowConnector: {
    width: 2,
    height: 20,
    backgroundColor: staticTheme.colors.dark.border,
    marginLeft: 21,
    marginVertical: 2,
  },
  aiBuiltInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: staticTheme.spacing.md,
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: staticTheme.radius.lg,
    padding: staticTheme.spacing.md,
    ...staticTheme.shadows.card,
  },
  aiBuiltInIcon: {
    width: 44,
    height: 44,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.success[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiBuiltInBody: {
    flex: 1,
  },
  aiBuiltInTitle: {
    fontSize: staticTheme.typography.body,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  aiBuiltInDesc: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    lineHeight: 20,
    marginTop: 2,
  },
  footer: {
    textAlign: 'center',
    fontSize: staticTheme.typography.micro,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textFaint,
  },
  guideCard: {
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: staticTheme.radius.lg,
    padding: staticTheme.spacing.md,
    marginBottom: staticTheme.spacing.md,
    ...staticTheme.shadows.card,
  },
  guideStepTitle: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
    marginBottom: staticTheme.spacing.sm,
  },
  guideStepText: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    lineHeight: 22,
  },
  guideLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: staticTheme.spacing.md,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.primary[500] + '15',
    marginBottom: staticTheme.spacing.md,
  },
  guideLinkText: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.primary[400],
  },
  noticeCard: {
    flexDirection: 'row',
    gap: staticTheme.spacing.sm,
    backgroundColor: staticTheme.colors.warning[500] + '10',
    borderRadius: staticTheme.radius.md,
    padding: staticTheme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: staticTheme.colors.warning[400],
  },
  noticeText: {
    flex: 1,
    fontSize: staticTheme.typography.micro,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    lineHeight: 20,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: staticTheme.spacing.sm,
  },
  idInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: staticTheme.spacing.sm,
  },
  idIconWrap: {
    width: 40,
    height: 40,
    borderRadius: staticTheme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  idIconText: {
    fontSize: 18,
    fontFamily: staticTheme.typography.fontFamily.bold,
  },
  idInputBody: {
    flex: 1,
    marginLeft: staticTheme.spacing.md,
  },
  idInputLabel: {
    fontSize: staticTheme.typography.micro,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.textDim,
    marginBottom: 4,
  },
  idInput: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.text,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    borderRadius: staticTheme.radius.sm,
    paddingHorizontal: staticTheme.spacing.md,
    paddingVertical: 8,
  },
  charCount: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textFaint,
    textAlign: 'right',
    marginTop: 4,
  },
  tossSignupLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: staticTheme.radius.sm,
    backgroundColor: '#0064FF10',
  },
  tossSignupLinkText: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: '#0064FF',
  },
  customAffDividerWrap: {
    marginTop: staticTheme.spacing.md,
    marginBottom: staticTheme.spacing.sm,
  },
  customAffSectionLabel: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.primary[300],
    marginTop: staticTheme.spacing.sm,
    letterSpacing: 0.5,
  },
  customAffDeleteBtn: {
    padding: staticTheme.spacing.sm,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  customAffAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: staticTheme.spacing.md,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.primary[500] + '12',
    borderWidth: 1.5,
    borderColor: staticTheme.colors.primary[400] + '30',
    borderStyle: 'dashed',
    marginTop: staticTheme.spacing.md,
  },
  customAffAddBtnText: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.primary[300],
  },
  saveIdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: staticTheme.spacing.md,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.primary[600],
    marginTop: staticTheme.spacing.md,
  },
  saveIdButtonDone: {
    backgroundColor: staticTheme.colors.success[500],
  },
  saveIdButtonText: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  logoPreviewWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoPreviewImg: {
    width: 60,
    height: 60,
    borderRadius: staticTheme.radius.md,
    objectFit: 'contain',
    backgroundColor: staticTheme.colors.dark.bg,
  },
  logoInfo: {
    flex: 1,
  },
  logoRegisteredText: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  logoHintText: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    marginTop: 2,
  },
  logoRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: staticTheme.radius.sm,
    backgroundColor: staticTheme.colors.error[500] + '15',
  },
  logoRemoveText: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.error[400],
  },
  logoEmptyWrap: {
    alignItems: 'center',
    paddingVertical: staticTheme.spacing.md,
  },
  logoEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  logoEmptyText: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.medium,
    color: staticTheme.colors.dark.textDim,
  },
  logoEmptyHint: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textFaint,
    marginTop: 2,
  },
  logoUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: staticTheme.spacing.md,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.primary[500] + '15',
    borderWidth: 1.5,
    borderColor: staticTheme.colors.primary[400] + '30',
    marginTop: staticTheme.spacing.sm,
  },
  logoUploadBtnText: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.primary[300],
  },
  addRevenueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: staticTheme.spacing.md,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.success[500],
  },
  addRevenueButtonText: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  revenueList: {
    marginTop: staticTheme.spacing.md,
    gap: staticTheme.spacing.sm,
  },
  revenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: staticTheme.radius.md,
    padding: staticTheme.spacing.md,
  },
  revenueInfo: {
    flex: 1,
  },
  revenuePlatform: {
    fontSize: staticTheme.typography.micro,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.textDim,
  },
  revenueAmount: {
    fontSize: staticTheme.typography.body,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: staticTheme.colors.success[400],
    marginTop: 2,
  },
  revenueMeta: {
    fontSize: staticTheme.typography.micro,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textFaint,
    marginTop: 2,
  },
  revenueDeleteBtn: {
    padding: staticTheme.spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: staticTheme.spacing.lg,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: staticTheme.radius.xl,
    padding: staticTheme.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: staticTheme.spacing.md,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: staticTheme.typography.heading,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: staticTheme.colors.dark.text,
  },
  modalCloseText: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.medium,
    color: staticTheme.colors.dark.textDim,
  },
  modalLabel: {
    fontSize: staticTheme.typography.micro,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.textDim,
    marginBottom: 6,
    marginTop: staticTheme.spacing.sm,
  },
  platformPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ttsCategoryLabel: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.medium,
    color: staticTheme.colors.dark.textDim,
    marginTop: 10,
    marginBottom: 6,
  },
  sliderValueText: {
    fontSize: 13,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.accent[300],
    marginBottom: 8,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sliderLabel: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textFaint,
  },
  sliderTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    height: 6,
    borderRadius: 3,
    backgroundColor: staticTheme.colors.accent[500],
  },
  sliderThumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginLeft: -8,
    marginTop: -5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  sliderChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  sliderChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: staticTheme.radius.full,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: staticTheme.colors.dark.border,
  },
  sliderChipActive: {
    backgroundColor: staticTheme.colors.accent[500],
    borderColor: staticTheme.colors.accent[500],
  },
  sliderChipText: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.medium,
    color: staticTheme.colors.dark.textDim,
  },
  sliderChipTextActive: {
    color: '#fff',
  },
  platformChip: {
    paddingHorizontal: staticTheme.spacing.md,
    paddingVertical: 8,
    borderRadius: staticTheme.radius.full,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: staticTheme.colors.dark.border,
  },
  platformChipActive: {
    backgroundColor: staticTheme.colors.primary[600],
    borderColor: staticTheme.colors.primary[600],
  },
  platformChipText: {
    fontSize: staticTheme.typography.micro,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.textDim,
  },
  platformChipTextActive: {
    color: '#fff',
  },
  modalInput: {
    fontSize: staticTheme.typography.body,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.text,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    borderRadius: staticTheme.radius.md,
    paddingHorizontal: staticTheme.spacing.md,
    paddingVertical: 10,
  },
  modalSaveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: staticTheme.spacing.md,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.success[500],
    marginTop: staticTheme.spacing.lg,
  },
  modalSaveButtonText: {
    fontSize: staticTheme.typography.body,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: staticTheme.spacing.sm,
    gap: staticTheme.spacing.md,
  },
  toggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: staticTheme.colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchActive: {
    backgroundColor: staticTheme.colors.success[500],
    borderColor: staticTheme.colors.success[500],
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: staticTheme.colors.dark.textDim,
    marginLeft: 0,
  },
  toggleKnobActive: {
    backgroundColor: '#fff',
    marginLeft: 22,
  },
  planCard: {
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: staticTheme.radius.lg,
    padding: staticTheme.spacing.md + 4,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: staticTheme.colors.dark.border,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  planIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planName: {
    fontSize: 18,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: staticTheme.colors.dark.text,
  },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: staticTheme.radius.full,
  },
  planBadgeText: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: '#fff',
  },
  planTagline: {
    fontSize: 12,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    marginTop: 2,
  },
  planRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: staticTheme.colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 24,
    fontFamily: staticTheme.typography.fontFamily.bold,
  },
  planPriceUnit: {
    fontSize: 14,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
  },
  planQuota: {
    fontSize: 13,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
    marginBottom: 10,
  },
  planFeatureList: {
    gap: 8,
  },
  planFeatureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  planFeatureText: {
    flex: 1,
    fontSize: 12,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    lineHeight: 18,
  },
  subscribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.primary[500],
    marginBottom: 12,
  },
  subscribeBtnText: {
    fontSize: 15,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: '#fff',
  },
  tokenPackToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: staticTheme.spacing.md,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
  },
  tokenPackToggleText: {
    flex: 1,
    fontSize: 13,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  tokenPackContainer: {
    marginTop: 10,
    gap: 10,
  },
  creditBalanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: staticTheme.radius.lg,
    padding: staticTheme.spacing.md,
    marginBottom: staticTheme.spacing.md,
  },
  creditBalanceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  creditBalanceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.warning[500] + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  creditBalanceLabel: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
  },
  creditBalanceValue: {
    fontSize: 24,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: staticTheme.colors.dark.text,
  },
  creditBalanceStats: {
    alignItems: 'flex-end',
  },
  creditBalanceStatLabel: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textFaint,
  },
  creditBalanceStatValue: {
    fontSize: 14,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.textDim,
  },
  creditWebNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    borderRadius: staticTheme.radius.md,
    padding: staticTheme.spacing.sm + 2,
    marginTop: staticTheme.spacing.sm,
  },
  creditWebNoteText: {
    flex: 1,
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    lineHeight: 16,
  },
  tokenPackHint: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textFaint,
    lineHeight: 16,
  },
  tokenPackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: staticTheme.spacing.md,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.dark.surface,
    borderWidth: 1.5,
    borderColor: staticTheme.colors.dark.border,
  },
  tokenPackName: {
    fontSize: 14,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  tokenPackQuota: {
    fontSize: 12,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    marginTop: 2,
  },
  tokenPackPrice: {
    fontSize: 15,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: staticTheme.colors.warning[400],
  },
  tokenPackBuyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: staticTheme.radius.full,
    backgroundColor: staticTheme.colors.warning[400] + '20',
    borderWidth: 1.5,
    borderColor: staticTheme.colors.warning[400],
  },
  tokenPackBuyBtnText: {
    fontSize: 12,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.warning[400],
  },
  progressStyleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  progressStyleCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: staticTheme.colors.dark.border,
  },
  progressStyleCardActive: {
    backgroundColor: staticTheme.colors.primary[600] + '15',
    borderColor: staticTheme.colors.primary[500],
  },
  progressStyleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: staticTheme.colors.dark.surface,
    borderWidth: 1.5,
    borderColor: staticTheme.colors.dark.border,
  },
  progressStyleIconActive: {
    backgroundColor: staticTheme.colors.primary[500],
    borderColor: staticTheme.colors.primary[500],
  },
  progressStyleName: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.textDim,
    textAlign: 'center',
  },
  progressStyleNameActive: {
    color: staticTheme.colors.primary[300],
  },
  progressStyleDesc: {
    fontSize: 9,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textFaint,
    textAlign: 'center',
  },
  mascotSavingHint: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    textAlign: 'center',
    marginTop: 8,
  },
  mascotSavedHint: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.success[400],
    textAlign: 'center',
    marginTop: 8,
  },
  healthCheckRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: staticTheme.radius.md,
    borderWidth: 1.5,
  },
  healthBadgeOk: {
    backgroundColor: staticTheme.colors.success[500] + '0D',
    borderColor: staticTheme.colors.success[500] + '40',
  },
  healthBadgeErr: {
    backgroundColor: staticTheme.colors.error[500] + '08',
    borderColor: staticTheme.colors.error[500] + '30',
  },
  healthBadgeIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthBadgeLabel: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
  },
  healthBadgeStatus: {
    fontSize: 9,
    fontFamily: staticTheme.typography.fontFamily.medium,
  },
  healthBadgeStatusOk: {
    color: staticTheme.colors.success[400],
  },
  healthBadgeStatusErr: {
    color: staticTheme.colors.error[400],
  },
  modalClose: {
    position: "absolute",
    top: staticTheme.spacing.md,
    right: staticTheme.spacing.md,
    width: 32,
    height: 32,
    borderRadius: staticTheme.radius.full,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  tutorialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: staticTheme.spacing.md,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.accent[500],
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  updateIconWrap: {
    width: 36,
    height: 36,
    borderRadius: staticTheme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  updateTitle: {
    fontSize: 14,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
    marginBottom: 4,
  },
  updateDesc: {
    fontSize: 12,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    lineHeight: 18,
  },
  tutorialBtnText: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  guideLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: staticTheme.spacing.md,
    paddingHorizontal: staticTheme.spacing.md,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.dark.surface,
    marginTop: 10,
  },
  guideLinkBtnText: {
    flex: 1,
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  tutorialModalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: staticTheme.radius.xl,
    padding: staticTheme.spacing.lg,
    position: 'relative',
    ...staticTheme.shadows.elevated,
  },
  tutorialStepWrap: {
    alignItems: 'center',
    gap: 14,
  },
  tutorialStepIndicator: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  tutorialDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
  },
  tutorialDotActive: {
    backgroundColor: staticTheme.colors.primary[400],
  },
  tutorialDotDone: {
    backgroundColor: staticTheme.colors.success[400],
  },
  tutorialIconWrap: {
    width: 64,
    height: 64,
    borderRadius: staticTheme.radius.lg,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tutorialStepTitle: {
    fontSize: staticTheme.typography.heading,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: staticTheme.colors.dark.text,
    textAlign: 'center',
  },
  tutorialStepDesc: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 20,
  },
  tutorialMockCard: {
    width: '100%',
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    borderRadius: staticTheme.radius.md,
    padding: 14,
    gap: 10,
  },
  tutorialMockLabel: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.medium,
    color: staticTheme.colors.dark.textDim,
  },
  tutorialMockProduct: {
    fontSize: staticTheme.typography.body,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: staticTheme.colors.dark.text,
  },
  tutorialMockPrice: {
    fontSize: staticTheme.typography.caption,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.success[400],
  },
  tutorialMockLinkRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tutorialMockInput: {
    flex: 1,
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.text,
    backgroundColor: staticTheme.colors.dark.bg,
    borderRadius: staticTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tutorialMockBtn: {
    width: 36,
    height: 36,
    borderRadius: staticTheme.radius.sm,
    backgroundColor: staticTheme.colors.success[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  tutorialMockAiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tutorialMockAiText: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.medium,
    color: staticTheme.colors.dark.text,
  },
  tutorialDisclosureBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: staticTheme.colors.success[500] + '10',
    borderRadius: staticTheme.radius.sm,
    padding: 10,
  },
  tutorialDisclosureText: {
    flex: 1,
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    lineHeight: 16,
  },
  tutorialCompleteHint: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.success[400],
    textAlign: 'center',
  },
  tutorialNextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    paddingVertical: 12,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.primary[500],
  },
  tutorialNextBtnText: {
    fontSize: staticTheme.typography.body,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  tutorialCompleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.success[500],
  },
  tutorialCompleteBtnText: {
    fontSize: staticTheme.typography.body,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: '#fff',
  },
  langTriggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: staticTheme.spacing.md,
    borderRadius: staticTheme.radius.lg,
    backgroundColor: staticTheme.colors.dark.surface,
    ...staticTheme.shadows.card,
  },
  langTriggerBody: {
    flex: 1,
  },
  langTriggerLabel: {
    fontSize: 16,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  langTriggerSub: {
    fontSize: 12,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    marginTop: 2,
  },
  langModalContainer: {
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: staticTheme.radius.xl,
    padding: staticTheme.spacing.md,
    maxHeight: '80%',
    width: '90%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  langModalScroll: {
    marginTop: staticTheme.spacing.sm,
  },
  langModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: staticTheme.spacing.md,
    borderRadius: staticTheme.radius.md,
    marginBottom: 4,
  },
  langModalItemActive: {
    backgroundColor: staticTheme.colors.primary[500] + '15',
  },
  langModalFlag: {
    fontSize: 24,
  },
  langModalItemBody: {
    flex: 1,
  },
  langModalItemLabel: {
    fontSize: 15,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  langModalItemLabelActive: {
    color: staticTheme.colors.primary[400],
  },
  langModalItemSub: {
    fontSize: 12,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    marginTop: 2,
  },
  platformMgmtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  platformMgmtRowBorder: {
    borderTopWidth: 1,
    borderTopColor: staticTheme.colors.dark.border,
  },
  platformMgmtIcon: {
    width: 36,
    height: 36,
    borderRadius: staticTheme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  platformMgmtLabel: {
    fontSize: 14,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  platformMgmtMeta: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    marginTop: 2,
  },
  platformMgmtDelete: {
    padding: 6,
  },
  addPlatformBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.primary[500] + '15',
    borderWidth: 1.5,
    borderColor: staticTheme.colors.primary[400] + '40',
    borderStyle: 'dashed',
  },
  addPlatformBtnText: {
    fontSize: 14,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.primary[300],
  },
  addPlatformActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  addPlatformCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
  },
  addPlatformCancelText: {
    fontSize: 14,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.textDim,
  },
  affPlatformRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  affPlatformRowBorder: {
    borderTopWidth: 1,
    borderTopColor: staticTheme.colors.dark.border,
  },
  affPlatformLabel: {
    fontSize: 14,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  affCustomBadge: {
    backgroundColor: staticTheme.colors.primary[500] + '20',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  affCustomBadgeText: {
    fontSize: 9,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.primary[300],
  },
  affIdText: {
    fontSize: 12,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
  },
  affParamText: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textFaint,
    marginTop: 2,
  },
  affEditRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  affEditInput: {
    flex: 1,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    borderRadius: staticTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.text,
    borderWidth: 1,
    borderColor: staticTheme.colors.dark.border,
  },
  affEditSaveBtn: {
    width: 32,
    height: 32,
    borderRadius: staticTheme.radius.sm,
    backgroundColor: staticTheme.colors.success[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  affParamHint: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textFaint,
    marginTop: 4,
  },
  accordionLabel: {
    fontSize: 14,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  accordionDesc: {
    fontSize: 12,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    marginTop: 4,
    lineHeight: 17,
  },
  accordionSpacer: {
    height: 16,
  },
  toneChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  toneChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  toneChipActive: {
    backgroundColor: staticTheme.colors.primary[600] + '15',
    borderColor: staticTheme.colors.primary[500],
  },
  toneChipText: {
    fontSize: 13,
    fontFamily: staticTheme.typography.fontFamily.medium,
    color: staticTheme.colors.dark.textDim,
  },
  toneChipTextActive: {
    color: staticTheme.colors.primary[400],
    fontFamily: staticTheme.typography.fontFamily.semiBold,
  },
  watermarkStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  watermarkStatusActive: {
    fontSize: 13,
    fontFamily: staticTheme.typography.fontFamily.medium,
    color: staticTheme.colors.success[400],
  },
  watermarkStatusInactive: {
    fontSize: 13,
    fontFamily: staticTheme.typography.fontFamily.medium,
    color: staticTheme.colors.dark.textFaint,
  },
  toggleBody: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 14,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  toggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleDesc: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    marginTop: 3,
    lineHeight: 15,
  },
  errorModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: staticTheme.colors.dark.border,
  },
  errorModalTitle: {
    fontSize: 17,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: staticTheme.colors.dark.text,
  },
  errorEmptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorEmptyText: {
    fontSize: 14,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
  },
  errorLogRow: {
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: staticTheme.colors.error[500],
    gap: 4,
  },
  errorLogFatal: {
    borderLeftColor: '#ff3333',
    backgroundColor: '#2a1010',
  },
  errorLogWarning: {
    borderLeftColor: '#f59e0b',
    backgroundColor: '#1e1a0e',
  },
  errorLogTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorLevelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeFatal: { backgroundColor: '#ff3333' },
  badgeError: { backgroundColor: staticTheme.colors.error[500] },
  badgeWarning: { backgroundColor: '#f59e0b' },
  errorLevelText: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: '#fff',
  },
  errorLogTime: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    flex: 1,
  },
  errorLogPlatform: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
  },
  errorLogMessage: {
    fontSize: 13,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.text,
    lineHeight: 18,
  },
  errorLogStack: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    lineHeight: 15,
    marginTop: 4,
  },
  toggleDivider: {
    height: 1,
    backgroundColor: staticTheme.colors.dark.border,
    marginVertical: 8,
  },
});

function PushNotificationToggle() {
  const { supported, isSubscribed, subscribe, unsubscribe, error } = useWebPush();
  const [toggling, setToggling] = useState(false);
  const colors = useAppTheme().colors;

  if (!supported) {
    return (
      <View style={[styles.toggleSwitch, { opacity: 0.4 }]}>
        <View style={styles.toggleKnob} />
      </View>
    );
  }

  const handleToggle = async () => {
    setToggling(true);
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
    setToggling(false);
  };

  return (
    <TouchableOpacity
      onPress={handleToggle}
      activeOpacity={0.7}
      hitSlop={12}
      disabled={toggling}
    >
      <View style={[styles.toggleSwitch, isSubscribed && styles.toggleSwitchActive]}>
        <View style={[styles.toggleKnob, isSubscribed && styles.toggleKnobActive]} />
      </View>
    </TouchableOpacity>
  );
}
