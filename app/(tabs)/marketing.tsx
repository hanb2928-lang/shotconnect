import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Sparkles,
  Store,
  Tag,
  Flame,
  TrendingUp,
  Check,
  ArrowRight,
  Wand as Wand2,
  Film,
  Zap,
  Lightbulb,
  Music,
  Type,
  Clapperboard,
  Settings,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useSafeTop } from '@/hooks/useSafeTop';
import { useTabBarHeight } from '@/hooks/useTabBarHeight';
import { getItem, setItem } from '@/lib/storage';
import { getUserSettings } from '@/lib/settings';

const MAX_PROMPT_LENGTH = 200;
const MAX_STORE_INPUT_LENGTH = 80;

function sanitizeTextInput(raw: string, maxLength: number): string {
  return raw
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLength);
}

const VIDEO_LENGTH_PRESETS = [
  { key: '7s', label: '7초 폭발 바이럴', desc: '틱톡·릴스 최적', icon: Zap, color: theme.colors.warning[400], seconds: 7 },
  { key: '15s', label: '15초 리뷰형', desc: '유튜브 숏츠 최적', icon: Film, color: theme.colors.primary[400], seconds: 15 },
] as const;

const CAPTION_TONE_PRESETS = [
  { key: 'hook', label: '파격 훅', desc: '호기심 유발', icon: Flame, color: theme.colors.warning[400] },
  { key: 'emotional', label: '감성/브랜드', desc: '고급 분위기', icon: Sparkles, color: theme.colors.accent[400] },
  { key: 'info', label: '정보 전달', desc: '리뷰·팩트', icon: Lightbulb, color: theme.colors.primary[400] },
] as const;

const BGM_MOOD_PRESETS = [
  { key: 'hightension', label: '하이텐션', desc: '빠른 템포', icon: Music, color: theme.colors.accent[400] },
  { key: 'cinematic', label: '시네마틱', desc: '웅장한 빌드업', icon: Film, color: theme.colors.primary[400] },
  { key: 'emotional', label: '감성', desc: '따뜻한 선율', icon: Music, color: theme.colors.accent[300] },
  { key: 'lofi', label: '로파이', desc: '편안한 비트', icon: Music, color: theme.colors.primary[400] },
  { key: 'asmr', label: 'ASMR', desc: '차분한 앰비언트', icon: Music, color: theme.colors.success[400] },
  { key: 'none', label: '자막 전용', desc: '음악 없음', icon: Type, color: theme.colors.dark.textFaint },
] as const;

const BUSINESS_TYPES = [
  { key: 'fnb', label: 'F&B / 음식점', icon: Store, color: theme.colors.warning[400] },
  { key: 'beauty', label: '뷰티 / 미용', icon: Sparkles, color: theme.colors.accent[400] },
  { key: 'retail', label: '로컬 숍 / 소매', icon: Tag, color: theme.colors.primary[400] },
] as const;

const STORE_HOOK_CHIPS = [
  { key: 'new_menu', label: '오늘 우리 동네 신메뉴 특가!', icon: Store, color: theme.colors.warning[400] },
  { key: 'limited', label: '재료 소진 전 마지막 기회', icon: Flame, color: theme.colors.error[400] },
  { key: 'best_seller', label: '이 동네 1위 베스트셀러', icon: TrendingUp, color: theme.colors.primary[400] },
  { key: 'seasonal', label: '계절 한정! 이맘때만 맛볼 수 있어요', icon: Tag, color: theme.colors.accent[400] },
  { key: 'combo', label: '꿀조합 발견! 같이 시키면 최고', icon: Sparkles, color: theme.colors.success[400] },
] as const;

export default function MarketingScreen() {
  const router = useRouter();
  const safeTop = useSafeTop();
  const tabBarHeight = useTabBarHeight();
  const [storeName, setStoreName] = useState('');
  const [signatureMenu, setSignatureMenu] = useState('');
  const [promoText, setPromoText] = useState('');
  const [storeSaved, setStoreSaved] = useState(false);
  const [videoLength, setVideoLength] = useState('15s');
  const [captionTone, setCaptionTone] = useState('hook');
  const [bgmMood, setBgmMood] = useState('hightension');
  const [selectedHook, setSelectedHook] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [manualPromptOpen, setManualPromptOpen] = useState(false);
  const [selectedBusinessType, setSelectedBusinessType] = useState<string>('fnb');
  const [generating, setGenerating] = useState(false);
  const lastActionRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const settings = await getUserSettings();
        if (settings?.default_caption_tone) {
          const toneMap: Record<string, string> = {
            casual: 'hook',
            professional: 'info',
            emotional: 'emotional',
            humorous: 'hook',
          };
          setCaptionTone(toneMap[settings.default_caption_tone] || 'hook');
        }
        const savedStoreName = await getItem('marketing_store_name');
        const savedMenu = await getItem('marketing_signature_menu');
        const savedPromo = await getItem('marketing_promo_text');
        if (savedStoreName) setStoreName(savedStoreName);
        if (savedMenu) setSignatureMenu(savedMenu);
        if (savedPromo) setPromoText(savedPromo);
      } catch {}
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const active = await getItem('marketing_voice_command_active');
          if (active !== 'true') return;
          const promptText = await getItem('marketing_voice_command_prompt');
          await setItem('marketing_voice_command_active', 'false');
          if (promptText?.trim()) {
            setCustomPrompt(promptText.trim());
            setManualPromptOpen(true);
            const savedStore = await getItem('marketing_store_name');
            if (!savedStore) setPromoText(promptText.trim());
          }
        } catch {}
      })();
    }, []),
  );

  const canGenerate = storeName.trim().length > 0 || signatureMenu.trim().length > 0;

  const handleSaveStoreInfo = async () => {
    try {
      await setItem('marketing_store_name', storeName.trim());
      await setItem('marketing_signature_menu', signatureMenu.trim());
      await setItem('marketing_promo_text', promoText.trim());
      setStoreSaved(true);
      setTimeout(() => setStoreSaved(false), 2000);
    } catch {}
  };

  const handleStartGeneration = async () => {
    const now = Date.now();
    if (now - lastActionRef.current < 800) return;
    lastActionRef.current = now;

    setGenerating(true);
    try {
      await setItem('marketing_store_name', storeName.trim());
      await setItem('marketing_signature_menu', signatureMenu.trim());
      await setItem('marketing_promo_text', promoText.trim());
      await setItem('marketing_video_length', videoLength);
      await setItem('marketing_caption_tone', captionTone);
      await setItem('marketing_bgm_mood', bgmMood);
      await setItem('marketing_handoff', 'false');
      await setItem('marketing_capture_mode', 'single');
      try {
        const settings = await getUserSettings();
        if (settings?.brand_persona) {
          await setItem('marketing_brand_persona', settings.brand_persona);
        }
        if (settings?.fixed_hook_phrase) {
          await setItem('marketing_fixed_hook', settings.fixed_hook_phrase);
        }
      } catch {}
      if (customPrompt.trim()) {
        await setItem('marketing_custom_prompt', customPrompt.trim());
        await setItem('marketing_selected_hook', customPrompt.trim());
      } else {
        await setItem('marketing_custom_prompt', '');
        if (selectedHook) {
          await setItem('marketing_selected_hook', selectedHook);
        }
      }
      await setItem('marketing_ai_video_gen', 'false');
      await setItem('marketing_ai_fitting', 'false');
      await setItem('marketing_voice_recording', '');
      router.replace('/(tabs)/');
    } catch {
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: safeTop + theme.spacing.lg, paddingBottom: tabBarHeight + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Wand2 size={24} color={theme.colors.primary[300]} strokeWidth={2.5} />
            </View>
            <View>
              <Text style={styles.headerTitle}>AI 템플릿</Text>
              <Text style={styles.headerSub}>텍스트 입력만으로 15초 숏폼 자동 생성</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => router.push('/settings' as never)}
            activeOpacity={0.7}
          >
            <Settings size={22} color={theme.colors.dark.textDim} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Business type selector */}
        <Text style={styles.sectionLabel}>업종 선택</Text>
        <View style={styles.bizTypeRow}>
          {BUSINESS_TYPES.map((bt) => {
            const Icon = bt.icon;
            const selected = selectedBusinessType === bt.key;
            return (
              <TouchableOpacity
                key={bt.key}
                style={[styles.bizTypeChip, selected && { borderColor: bt.color, backgroundColor: bt.color + '15' }]}
                onPress={() => setSelectedBusinessType(bt.key)}
                activeOpacity={0.7}
              >
                <Icon size={14} color={selected ? bt.color : theme.colors.dark.textDim} strokeWidth={2} />
                <Text style={[styles.bizTypeText, selected && { color: bt.color }]}>{bt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Store info inputs */}
        <Text style={styles.sectionLabel}>매장 정보</Text>
        <View style={styles.inputCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>매장 이름</Text>
            <TextInput
              style={styles.textInput}
              value={storeName}
              onChangeText={(t) => setStoreName(sanitizeTextInput(t, MAX_STORE_INPUT_LENGTH))}
              placeholder="예: 한승식당, 카페 블룸, 킹스버거"
              placeholderTextColor={theme.colors.dark.textFaint}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>대표 메뉴 / 상품</Text>
            <TextInput
              style={styles.textInput}
              value={signatureMenu}
              onChangeText={(t) => setSignatureMenu(sanitizeTextInput(t, MAX_STORE_INPUT_LENGTH))}
              placeholder="예: 명란 아보카도 비빔밥, 수제망고주스"
              placeholderTextColor={theme.colors.dark.textFaint}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>특가 / 홍보 멘트 (선택)</Text>
            <TextInput
              style={[styles.textInput, { minHeight: 70 }]}
              value={promoText}
              onChangeText={(t) => setPromoText(sanitizeTextInput(t, MAX_PROMPT_LENGTH))}
              placeholder="예: 오늘 저녁 한정 2천원 할인, 선찹순 10명 서비스 음료"
              placeholderTextColor={theme.colors.dark.textFaint}
              multiline
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[styles.storeSaveBtn, storeSaved && styles.storeSaveBtnDone]}
            onPress={handleSaveStoreInfo}
            activeOpacity={0.8}
          >
            {storeSaved ? (
              <Check size={16} color="#fff" strokeWidth={2.5} />
            ) : (
              <Tag size={16} color="#fff" strokeWidth={2.5} />
            )}
            <Text style={styles.storeSaveBtnText}>
              {storeSaved ? '저장됨' : '매장 정보 저장'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Hook selection */}
        <Text style={styles.sectionLabel}>오프닝 후킹 문구</Text>
        <View style={styles.hookCard}>
          <Text style={styles.hookDesc}>사장님 매장에 맞는 오프닝 문구를 선택하세요</Text>
          <View style={styles.hookChipRow}>
            {STORE_HOOK_CHIPS.map((chip) => {
              const Icon = chip.icon;
              const selected = selectedHook === chip.key;
              return (
                <TouchableOpacity
                  key={chip.key}
                  style={[styles.hookChip, selected && { borderColor: chip.color, backgroundColor: chip.color + '15' }]}
                  onPress={() => setSelectedHook(selected ? null : chip.key)}
                  activeOpacity={0.7}
                >
                  <Icon size={13} color={selected ? chip.color : theme.colors.dark.textDim} strokeWidth={2} />
                  <Text style={[styles.hookChipText, selected && { color: chip.color }]} numberOfLines={1}>{chip.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.manualToggle}
            onPress={() => setManualPromptOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.manualToggleText}>{manualPromptOpen ? '직접 입력 닫기' : '직접 문구 입력하기'}</Text>
          </TouchableOpacity>

          {manualPromptOpen && (
            <TextInput
              style={[styles.textInput, { minHeight: 60 }]}
              value={customPrompt}
              onChangeText={(t) => setCustomPrompt(sanitizeTextInput(t, MAX_PROMPT_LENGTH))}
              placeholder="원하는 오프닝 문구를 직접 적어주세요"
              placeholderTextColor={theme.colors.dark.textFaint}
              multiline
              textAlignVertical="top"
            />
          )}
        </View>

        {/* Video length */}
        <Text style={styles.sectionLabel}>영상 길이</Text>
        <View style={styles.presetRow}>
          {VIDEO_LENGTH_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const selected = videoLength === preset.key;
            return (
              <TouchableOpacity
                key={preset.key}
                style={[styles.presetCard, selected && { borderColor: preset.color, backgroundColor: preset.color + '12' }]}
                onPress={() => setVideoLength(preset.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.presetIconWrap, { backgroundColor: preset.color + '22' }]}>
                  <Icon size={20} color={preset.color} strokeWidth={2.5} />
                </View>
                <Text style={[styles.presetLabel, selected && { color: preset.color }]}>{preset.label}</Text>
                <Text style={styles.presetDesc}>{preset.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Caption tone */}
        <Text style={styles.sectionLabel}>카피 톤</Text>
        <View style={styles.presetRow}>
          {CAPTION_TONE_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const selected = captionTone === preset.key;
            return (
              <TouchableOpacity
                key={preset.key}
                style={[styles.presetCard, selected && { borderColor: preset.color, backgroundColor: preset.color + '12' }]}
                onPress={() => setCaptionTone(preset.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.presetIconWrap, { backgroundColor: preset.color + '22' }]}>
                  <Icon size={20} color={preset.color} strokeWidth={2.5} />
                </View>
                <Text style={[styles.presetLabel, selected && { color: preset.color }]}>{preset.label}</Text>
                <Text style={styles.presetDesc}>{preset.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* BGM mood */}
        <Text style={styles.sectionLabel}>배경 음악</Text>
        <View style={styles.presetRow}>
          {BGM_MOOD_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const selected = bgmMood === preset.key;
            return (
              <TouchableOpacity
                key={preset.key}
                style={[styles.presetCard, selected && { borderColor: preset.color, backgroundColor: preset.color + '12' }]}
                onPress={() => setBgmMood(preset.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.presetIconWrap, { backgroundColor: preset.color + '22' }]}>
                  <Icon size={20} color={preset.color} strokeWidth={2.5} />
                </View>
                <Text style={[styles.presetLabel, selected && { color: preset.color }]}>{preset.label}</Text>
                <Text style={styles.presetDesc}>{preset.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Generate button */}
        <TouchableOpacity
          style={[styles.generateBtn, (!canGenerate || generating) && styles.generateBtnDisabled]}
          onPress={handleStartGeneration}
          disabled={!canGenerate || generating}
          activeOpacity={0.85}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Sparkles size={22} color="#fff" strokeWidth={2.5} />
              <Text style={styles.generateBtnText}>AI 숏폼 생성하기</Text>
              <ArrowRight size={20} color="#fff" strokeWidth={2.5} />
            </>
          )}
        </TouchableOpacity>
        {!canGenerate && (
          <Text style={styles.generateHint}>매장 이름 또는 대표 메뉴를 입력하면 생성할 수 있습니다</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  bizTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  bizTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
    backgroundColor: theme.colors.dark.surface,
  },
  bizTypeText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  inputCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  textInput: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  storeSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[600],
  },
  storeSaveBtnDone: {
    backgroundColor: theme.colors.success[500],
  },
  storeSaveBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  hookCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  hookDesc: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  hookChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hookChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  hookChipText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    flexShrink: 1,
  },
  manualToggle: {
    paddingVertical: 8,
  },
  manualToggleText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
  },
  presetRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: theme.spacing.sm,
  },
  presetCard: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
    backgroundColor: theme.colors.dark.surface,
  },
  presetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    textAlign: 'center',
  },
  presetDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary[600],
    marginTop: theme.spacing.xl,
  },
  generateBtnDisabled: {
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  generateBtnText: {
    fontSize: 17,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  generateHint: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
});
