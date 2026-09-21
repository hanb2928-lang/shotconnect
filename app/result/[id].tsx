import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  TextInput,
  AppState,
  Linking,
  Modal,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import {
  ArrowLeft,
  Share2,
  Sparkles,
  Pencil,
  Hash,
  Copy,
  Check,
  Flame,
  TrendingUp,
  Plus,
  X,
  Link2,
  MessageCircle,
  Sun,
  MoveUp,
  MoveVertical,
  MoveDown,
  CircleAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { getThumbnailUrl } from '@/lib/imageUtils';
import { supabase } from '@/lib/supabase';
import { getUserSettings } from '@/lib/settings';
import { generateAffiliateLinks } from '@/lib/affiliate';
import { detectAffiliatePlatform } from '@/lib/affiliateLinkSmart';
import { getDisclosureForPlatforms } from '@/lib/disclosure';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { uploadAssetBlobWithProgress, uploadAssetFromFileUriWithProgress, saveAssetRecord } from '@/lib/savedAssets';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { readUriAsBase64 } from '@/lib/imageEdit';
import { cleanBase64, uint8ArrayToBase64 } from '@/lib/base64';
import { Share as RNShare } from 'react-native';
import type { Scan, UserSettings, AffiliateLink, CustomAffiliateLink, DetectedProduct, PlatformKey, CustomReview } from '@/types/database';
import { STICKER_POSITIONS, TEXT_POSITIONS } from '@/components/TemplateCard';
import type { StickerPosition, TextPosition } from '@/components/TemplateCard';
import { StickerLinkControls } from '@/components/StickerLink';
import type { StickerStyle } from '@/components/StickerLink';
import { ShareBar } from '@/components/ShareBar';
import { SocialShortFormShare } from '@/components/SocialShortFormShare';
import { ShoppingMatchCard } from '@/components/ShoppingMatchCard';
import { ProductSelector } from '@/components/ProductSelector';
import { PlatformTabs, BoardTabs, getPlatformMediaType, platformSupportsBoth } from '@/components/PlatformTabs';
import type { MediaType as BoardMediaType } from '@/components/PlatformTabs';
import { MultiPlatformExport } from '@/components/MultiPlatformExport';
import type { AffiliatePlatformKey } from '@/components/AffiliatePlatformSwitch';
import type { LocalStoreInfo } from '@/types/database';
import { ReviewInput } from '@/components/ReviewInput';
import { CopyWriter } from '@/components/CopyWriter';
import { VariantGenerator, type Variant } from '@/components/VariantGenerator';
import { SmartScheduler } from '@/components/SmartScheduler';
import { OcrTextExtractor } from '@/components/OcrTextExtractor';
import { BellRing, ScanText as ScanTextIcon } from 'lucide-react-native';
import { LocalStoreCard } from '@/components/LocalStoreCard';
import { ShortFormTipsCard } from '@/components/ShortFormTipsCard';
import { ViralPredictor } from '@/components/ViralPredictor';
import { PersonaSimulator } from '@/components/PersonaSimulator';
import { GlobalLocalizer } from '@/components/GlobalLocalizer';
import { LocalizationSafetyCard } from '@/components/LocalizationSafetyCard';
import { HyperHumanEngineCard } from '@/components/HyperHumanEngineCard';
import { TrendCopyBar } from '@/components/TrendCopyBar';
import { HashtagCopyBar } from '@/components/HashtagCopyBar';
import { createShortLink } from '@/lib/shortUrl';
import { recommendStickerStyle, recommendStickerSize, getCardStyleForPlatform } from '@/lib/stickerRecommend';
import { urlToDataUrl } from '@/lib/base64';
import { getImageSize, prepareImageForApi } from '@/lib/imageEdit';
import { compressForEdgeFunction } from '@/lib/parallelImageCompress';
import { fetchMatchedTrendingHashtags, getTrendingSuggestions } from '@/lib/trendingHashtags';
import { LoadingScreen } from '@/components/LoadingScreen';
import { friendlyError } from '@/lib/errors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeTop } from '@/hooks/useSafeTop';
import { LazySection } from '@/components/LazySection';
import { ShortFormGuideCard } from '@/components/ShortFormGuideCard';
import { TrendMatchCard } from '@/components/TrendMatchCard';
import { AffiliatePromptBanner } from '@/components/AffiliatePromptBanner';
import { AIStyleCard } from '@/components/AIStyleCard';
import type { StyleRecommendation } from '@/lib/styleRecommend';
import { getItem } from '@/lib/storage';
import { FeatureTileGrid } from '@/components/FeatureTileGrid';
import type { FeatureCategory, ScanMode, MediaType } from '@/components/FeatureTileGrid';
import { subscribeToJob } from '@/lib/jobQueue';
import { finalizeAnalysisFromJob, triggerTTS } from '@/lib/asyncAnalysis';
import type { RenderJob } from '@/lib/jobQueue';
import { TrendingUp as TrendingUpIcon, Hash as HashIcon, PenLine, LayoutTemplate, ShoppingBag as ShoppingBagIcon, Wand as Wand2, Film as FilmIcon, Lightbulb, Store, BookOpen, Rocket, Users, Globe, Share2 as Share2Icon, Palette as PaletteIcon, Clock, Camera as CameraIcon, Sun as SunIcon, ShieldCheck as ShieldIcon, Link2 as Link2Icon, User as UserIcon, SlidersHorizontal as SlidersIcon, Pencil as PencilIcon, Sparkles as SparklesIcon, Zap as ZapIcon, Scissors as ScissorsIcon, Youtube, Music2, Instagram, MonitorPlay, FileText, AudioLines, Video as VideoIcon, Image as ImageIcon, AlertCircle as AlertCircleIcon, Loader2 as Loader2Icon, Download, Upload, Settings2, RotateCcw, CheckCircle2 } from 'lucide-react-native';
import { LightingContextStudio } from '@/components/LightingContextStudio';
import { QuickTweakPanel } from '@/components/QuickTweakPanel';
import { AccountSafetyChecker } from '@/components/AccountSafetyChecker';
import { LinkInBioCard } from '@/components/LinkInBioCard';
import { CreatorPersonaCard } from '@/components/CreatorPersonaCard';
import { SnapMixTuner } from '@/components/SnapMixTuner';
import { MicroEditSlot } from '@/components/MicroEditSlot';
import { OriginalityScoreCard } from '@/components/OriginalityScoreCard';
import type { InlineEditState, HookEffectType } from '@/components/AIProcessAccordion';
import { ShortFormPreviewPlayer } from '@/components/ShortFormPreviewPlayer';
import { ResultPreviewSection } from '@/components/ResultPreviewSection';
import { AiSoloDirectorCard } from '@/components/AiSoloDirectorCard';
import { buildShortFormEditPlan, type ContentTone } from '@/lib/shortFormEditEngine';
import { getBgmTemplateForMood } from '@/lib/bgmEngine';
import { buildNarrativePlan, getNarrativeSummary, type NarrativePlan } from '@/lib/humanRealityNarrativeEngine';
import { submitVideoJobAsync, subscribeVideoJob, upgradeVideoToHd, subscribeHdUpgrade, recoverVideoJob, type VideoGenProgress } from '@/lib/aiVideoPipeline';
import { analyzeProductVision, type ProductVisionResult } from '@/lib/productVision';
import {
  buildViralAudioSyncProfile,
  buildRegenerationPayload,
  getSyncAccuracyLabel,
  formatTimeBoxSummary,
} from '@/lib/viralAudioSyncEngine';
import { mapVoiceKeyToProsody } from '@/lib/prosodyProfile';
import { DEFAULT_DURATION, DURATION_PRESETS } from '@/lib/durationPresets';
import { getDeepLink } from '@/lib/platformUpload';
import { NarrationPlayer } from '@/components/NarrationPlayer';
import { HumanTtsProfileCard } from '@/components/HumanTtsProfileCard';
import { ViralFormulaCard } from '@/components/ViralFormulaCard';
import { AutoHookSubtitleCard } from '@/components/AutoHookSubtitleCard';
import { VirtualFittingLoadingOverlay } from '@/components/VirtualFittingLoadingOverlay';
import { useWebPush } from '@/hooks/useWebPush';
import { DirectShareBridge } from '@/components/DirectShareBridge';
import { buildCopyOverlayTimeline } from '@/lib/promptBuilder';
import type { CopyOverlayTimeline } from '@/lib/promptBuilder';

type TargetPlatformKey = 'shorts' | 'tiktok' | 'reels' | 'naverclip' | 'instagramFeed' | 'naverBlog' | 'pinterest' | 'smartstore';

type TargetMediaType = 'video' | 'image';

interface TargetPlatformPreset {
  key: TargetPlatformKey;
  label: string;
  icon: typeof Youtube;
  color: string;
  algorithmHint: string;
  defaultPrompt: string;
  captionFont: string;
  captionPosition: string;
  bgmMood: string;
  videoTemplate: string;
  hashtags: string[];
  mediaType: TargetMediaType;
}

const TARGET_PLATFORM_PRESETS: Record<TargetPlatformKey, TargetPlatformPreset> = {
  shorts: {
    key: 'shorts',
    label: 'YouTube Shorts',
    icon: Youtube,
    color: '#FF0000',
    algorithmHint: '첫 3초 후킹 + 검색 키워드 노출',
    defaultPrompt: '유튜브 쇼츠 알고리즘 최적화: 첫 3초 강렬한 후킹, 검색 키워드 포함, 시청 지속률 극대화',
    captionFont: '고딕 굵게',
    captionPosition: '하단 고정',
    bgmMood: '하이텐션',
    videoTemplate: '스토리텔링',
    hashtags: ['쇼츠', '숏폼', '리뷰', '제품추천', '유튜브쇼츠'],
    mediaType: 'video',
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    icon: Music2,
    color: '#FF0050',
    algorithmHint: '트렌드 사운드 + 빠른 전환 + FYP 진입',
    defaultPrompt: '틱톡 알고리즘 최적화: 트렌드 사운드 활용, 1.5초 단위 컷 전환, FYP 진입率为 높이는 후킹',
    captionFont: '손글씨 캐주얼',
    captionPosition: '하단 + 상단 번갈',
    bgmMood: '하이텐션',
    videoTemplate: '트렌디 쇼핑',
    hashtags: ['틱톡', '탁해볶', 'tiktok', '제품리뷰', '템'],
    mediaType: 'video',
  },
  reels: {
    key: 'reels',
    label: 'Instagram Reels',
    icon: Instagram,
    color: '#E1306C',
    algorithmHint: '감성 스토리 + 미적 연출 + 댓글 유도',
    defaultPrompt: '인스타 릴스 알고리즘 최적화: 감성 스토리 구조, 미적 비주얼 연출, 댓글 참여 유도',
    captionFont: '명조 우아',
    captionPosition: '중앙',
    bgmMood: '감성',
    videoTemplate: '라이프스타일',
    hashtags: ['릴스', 'reels', '인스타릴스', '제품추천', '일상'],
    mediaType: 'video',
  },
  naverclip: {
    key: 'naverclip',
    label: '네이버 클립',
    icon: MonitorPlay,
    color: '#03C75A',
    algorithmHint: '정보 전달 + 신뢰성 + 쇼핑 연결',
    defaultPrompt: '네이버 클립 알고리즘 최적화: 정보 밀도 높은 설명, 신뢰감 있는 톤, 쇼핑 검색 연동',
    captionFont: '스포츠 강조',
    captionPosition: '하단 고정',
    bgmMood: '시네마틱',
    videoTemplate: '제품 집중',
    hashtags: ['네이버클립', '클립', '쇼핑', '제품리뷰', 'naver'],
    mediaType: 'video',
  },
  instagramFeed: {
    key: 'instagramFeed',
    label: '인스타 피드',
    icon: Instagram,
    color: '#C13584',
    algorithmHint: '카드뉴스 + 감성 스토리텔링 + 해시태그 노출',
    defaultPrompt: '인스타 피드 알고리즘 최적화: 카드뉴스 형태 스토리텔링, 미적 비주얼, 해시태그 SEO',
    captionFont: '명조 우아',
    captionPosition: '하단 고정',
    bgmMood: '감성',
    videoTemplate: '라이프스타일',
    hashtags: ['인스타', '카드뉴스', '제품추천', '일상', 'instagram'],
    mediaType: 'image',
  },
  naverBlog: {
    key: 'naverBlog',
    label: '네이버 블로그',
    icon: FileText,
    color: '#03C75A',
    algorithmHint: '상세 정보 + 검색 SEO + 신뢰성',
    defaultPrompt: '네이버 블로그 최적화: 상세한 제품 설명, 검색 키워드 포함, 신뢰감 있는 톤',
    captionFont: '고딕 굵게',
    captionPosition: '하단 고정',
    bgmMood: '시네마틱',
    videoTemplate: '제품 집중',
    hashtags: ['네이버블로그', '블로그', '제품리뷰', '쇼핑', 'naver'],
    mediaType: 'image',
  },
  pinterest: {
    key: 'pinterest',
    label: '핀터레스트',
    icon: ImageIcon,
    color: '#E60023',
    algorithmHint: '시각적 어필 + 키워드 핀 + 보드 노출',
    defaultPrompt: '핀터레스트 알고리즘 최적화: 시각적으로 어필하는 핀 이미지, 키워드 최적화, 보드 노출 극대화',
    captionFont: '미니멀 얇게',
    captionPosition: '하단 고정',
    bgmMood: '로파이',
    videoTemplate: '라이프스타일',
    hashtags: ['핀터레스트', 'pinterest', '제품추천', '인테리어', '디자인'],
    mediaType: 'image',
  },
  smartstore: {
    key: 'smartstore',
    label: '스마트스토어',
    icon: ShoppingBagIcon,
    color: '#00C73C',
    algorithmHint: '상세 이미지 + 구매 전환 + 상품 상세',
    defaultPrompt: '스마트스토어 최적화: 상품 상세 이미지, 구매 전환을 유도하는 카피, 명확한 정보 전달',
    captionFont: '스포츠 강조',
    captionPosition: '하단 고정',
    bgmMood: '시네마틱',
    videoTemplate: '제품 집중',
    hashtags: ['스마트스토어', '쇼핑', '제품리뷰', '네이버쇼핑', 'naver'],
    mediaType: 'image',
  },
};

const TARGET_PLATFORM_LIST = Object.values(TARGET_PLATFORM_PRESETS);

const VIDEO_PLATFORM_LIST = TARGET_PLATFORM_LIST.filter((p) => p.mediaType === 'video');
const IMAGE_PLATFORM_LIST = TARGET_PLATFORM_LIST.filter((p) => p.mediaType === 'image' && (p.key === 'instagramFeed' || p.key === 'pinterest'));

type ContentPurpose = 'monetization' | 'adConversion';

interface ContentPurposePreset {
  key: ContentPurpose;
  label: string;
  icon: typeof Rocket;
  color: string;
  bgmEnabled: boolean;
  narrationEnabled: boolean;
  bgmMoodOverride?: string;
  captionFontOverride?: string;
  videoTemplateOverride?: string;
  defaultPrompt: string;
  audioGuideline: string;
  strategyLabel: string;
}

const CONTENT_PURPOSE_PRESETS: Record<ContentPurpose, ContentPurposePreset> = {
  monetization: {
    key: 'monetization',
    label: '수익화 / 노출 극대화',
    icon: Rocket,
    color: '#FF6B35',
    bgmEnabled: true,
    narrationEnabled: true,
    defaultPrompt: '',
    audioGuideline: '오디오 전략: 자막 + 트렌디 BGM + AI 나레이션 풀 패키지. 도파민 유도형 BGM으로 시청 지속률 극대화, 핵심 자막으로 정보 처리 속도 향상, 신뢰감 있는 나레이션 스크립트 동시 생성',
    strategyLabel: '자막 + BGM + 나레이션 풀패키지',
  },
  adConversion: {
    key: 'adConversion',
    label: '광고 / 구매 전환',
    icon: ShoppingBagIcon,
    color: '#2563EB',
    bgmEnabled: false,
    narrationEnabled: true,
    bgmMoodOverride: 'ASMR',
    captionFontOverride: '스포츠 강조',
    videoTemplateOverride: '제품 집중',
    defaultPrompt: '',
    audioGuideline: '오디오 전략: BGM 배제/최소화, 차분하고 설득력 있는 전문 VO + 시선을 사로잡는 핵심 키워드 자막. 구매 전환을 위한 CTA 중심 구성',
    strategyLabel: '전문 VO + 키워드 자막 (BGM 최소화)',
  },
};

const CONTENT_PURPOSE_LIST = Object.values(CONTENT_PURPOSE_PRESETS);

const DEFAULT_PURPOSE_FOR_PLATFORM: Record<TargetPlatformKey, ContentPurpose> = {
  shorts: 'monetization',
  tiktok: 'monetization',
  reels: 'monetization',
  naverclip: 'adConversion',
  instagramFeed: 'adConversion',
  naverBlog: 'adConversion',
  pinterest: 'monetization',
  smartstore: 'adConversion',
};

const TARGET_TO_UPLOAD_PLATFORM: Partial<Record<TargetPlatformKey, string>> = {
  shorts: 'youtube',
  tiktok: 'tiktok',
  reels: 'instagram',
  naverclip: 'naver_clip',
  instagramFeed: 'instagram',
  naverBlog: 'naver_blog',
  pinterest: 'pinterest',
  smartstore: 'naver_blog',
};

const VIDEO_UNKNOWN_PATTERNS = [
  /알\s*수\s*없/gi,
  /알수없/gi,
  /unknown/gi,
  /미확인/gi,
  /미상/gi,
  /unidentified/gi,
  /not\s*identified/gi,
];

function sanitizeVideoProductName(name: string | undefined | null): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '프리미엄 추천 상품';
  for (const pattern of VIDEO_UNKNOWN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return '프리미엄 추천 상품';
    }
  }
  return trimmed;
}

function sanitizeVideoText(text: string | undefined | null): string {
  if (!text || !text.trim()) return '';
  let result = text;
  for (const pattern of VIDEO_UNKNOWN_PATTERNS) {
    result = result.replace(pattern, '시선 집중! 지금 바로 확인하세요');
  }
  return result;
}


function RotatingLoader({ size, color, strokeWidth = 2 }: { size: number; color: string; strokeWidth?: number }) {
  const rotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotate]);
  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Loader2Icon size={size} color={color} strokeWidth={strokeWidth} />
    </Animated.View>
  );
}

export default function ResultScreen() {
  const router = useRouter();
  const { id, customPrompt: routeCustomPrompt } = useLocalSearchParams<{ id: string; customPrompt?: string }>();
  const userCustomPrompt = useRef<string>(routeCustomPrompt || '');
  const [scan, setScan] = useState<Scan | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProductIndex, setSelectedProductIndex] = useState(0);
  const [customAffiliateLinks, setCustomAffiliateLinks] = useState<CustomAffiliateLink[]>([]);
  const [savingLink, setSavingLink] = useState(false);
  const [activePlatform, setActivePlatform] = useState<PlatformKey>('shortform');
  const [activeBoard, setActiveBoard] = useState<BoardMediaType>('video');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [stickerPosition, setStickerPosition] = useState<StickerPosition>('top-left');
  const [stickerStyle, setStickerStyle] = useState<StickerStyle>('pill');
  const [stickerSize, setStickerSize] = useState(48);
  const [stickerUserOverride, setStickerUserOverride] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState<number | null>(null);
  const [textPosition, setTextPosition] = useState<TextPosition>('bottom');
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [trendingHashtags, setTrendingHashtags] = useState<string[]>([]);
  const [addedHashtags, setAddedHashtags] = useState<string[]>([]);
  const [selectedAffiliate, setSelectedAffiliate] = useState<AffiliatePlatformKey>('Coupang');
  const [captureImageUrl, setCaptureImageUrl] = useState<string>('');
  const [heroAspect, setHeroAspect] = useState<number>(1);
  const [autoMarketingCopy, setAutoMarketingCopy] = useState<string | null>(null);
  const [hookOverride, setHookOverride] = useState<string | null>(null);
  const [priceOverride, setPriceOverride] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);

  const [localStoreInfo, setLocalStoreInfo] = useState<LocalStoreInfo | null>(null);
  const [recommendedStyle, setRecommendedStyle] = useState<StyleRecommendation | null>(null);
  const [styleAppliedKey, setStyleAppliedKey] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [ttsUrl, setTtsUrl] = useState<string | null>(null);
  const [focusTileKey, setFocusTileKey] = useState<string | null>(null);
  const [safetyCheckerVisible, setSafetyCheckerVisible] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>({
    volumeIntensity: 0.75,
    hookEffect: 'rotation_zoom' as HookEffectType,
    beatSyncSensitivity: 0.6,
    sfxStyle: '하이텐션',
    captionText: '',
    hashtags: [],
    videoTemplate: '트렌디 쇼핑',
    captionFont: '고딕 굵게',
    captionPosition: '하단 고정',
    bgmMood: '하이텐션',
    aiPrompt: routeCustomPrompt || '',
    titleText: '',
  });
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoGenError, setVideoGenError] = useState<string | null>(null);
  const [narrativeVariation, setNarrativeVariation] = useState(0);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoGenProgress, setVideoGenProgress] = useState<VideoGenProgress | null>(null);
  const [videoStage, setVideoStage] = useState<'idle' | 'drafting' | 'draft_ready' | 'hd_upgrading' | 'hd_ready' | 'failed'>('idle');
  const [draftVideoUrl, setDraftVideoUrl] = useState<string | null>(null);
  const [hdUpgradeProgress, setHdUpgradeProgress] = useState<string | null>(null);
  const hdUnsubRef = useRef<(() => void) | null>(null);
  const videoUnsubRef = useRef<(() => void) | null>(null);
  const videoGenLockRef = useRef(false);
  const draftProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showAdvancedCamera, setShowAdvancedCamera] = useState(false);
  const [showAdvancedCaption, setShowAdvancedCaption] = useState(false);
  const [showAdvancedAudio, setShowAdvancedAudio] = useState(false);
  const [cameraMotion, setCameraMotion] = useState<string>('AI 자동');
  const [bgmVolume, setBgmVolume] = useState<number>(0.75);
  const [promptStrength, setPromptStrength] = useState<number>(7);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [bgStyle, setBgStyle] = useState<string>('자동');
  const [outfitIntensity, setOutfitIntensity] = useState<number>(3);
  const [zoomSpeed, setZoomSpeed] = useState<number>(2);
  const [cameraRotation, setCameraRotation] = useState<number>(0);
  const [transitionEffect, setTransitionEffect] = useState<string>('컷 전환');
  const [imageAspectRatio, setImageAspectRatio] = useState<string>('1:1');
  const [stylePreset, setStylePreset] = useState<string>('clean-studio');
  const [detailRestoration, setDetailRestoration] = useState<boolean>(true);
  const [hdUpscale, setHdUpscale] = useState<boolean>(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageGenError, setImageGenError] = useState<string | null>(null);
  const [imageGenProgress, setImageGenProgress] = useState<{ phase: 'submitting' | 'generating' | 'completed' | 'error'; progress: number; message: string; completedCount: number; totalCount: number } | null>(null);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [narrationPlaying, setNarrationPlaying] = useState(false);
  const [fittingOverlayVisible, setFittingOverlayVisible] = useState(false);
  const [activeCutIndex, setActiveCutIndex] = useState(0);
  const [targetPlatform, setTargetPlatform] = useState<TargetPlatformKey>('shorts');
  const [contentPurpose, setContentPurpose] = useState<ContentPurpose>('monetization');
  const [selectedDurationMs, setSelectedDurationMs] = useState<number>(DEFAULT_DURATION);
  const [productVision, setProductVision] = useState<ProductVisionResult | null>(null);
  const [visionAnalyzing, setVisionAnalyzing] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [galleryModalIndex, setGalleryModalIndex] = useState(0);
  const [angleGalleryExpanded, setAngleGalleryExpanded] = useState(false);
  const [showManualSettings, setShowManualSettings] = useState(false);
  const [videoGenMode, setVideoGenMode] = useState<'auto' | 'manual'>('auto');
  const [manualHook, setManualHook] = useState('');
  const [manualKeywords, setManualKeywords] = useState('');
  const [isCleanVideoMode, setIsCleanVideoMode] = useState(false);
  const [targetMediaType, setTargetMediaType] = useState<TargetMediaType>('video');
  const [bgJobNotice, setBgJobNotice] = useState<string | null>(null);
  const [pushPromptVisible, setPushPromptVisible] = useState(false);
  const { supported: pushSupported, isSubscribed: pushSubscribed, subscribe: subscribePush } = useWebPush();
  const autoSavedVideoRef = useRef<string | null>(null);
  const bgVideoChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const applyCombinedPreset = useCallback((platform: TargetPlatformKey, purpose: ContentPurpose) => {
    const pp = TARGET_PLATFORM_PRESETS[platform];
    const cp = CONTENT_PURPOSE_PRESETS[purpose];
    setInlineEdit((prev) => ({
      ...prev,
      aiPrompt: userCustomPrompt.current.trim() || cp.defaultPrompt || pp.defaultPrompt,
      captionFont: cp.captionFontOverride || pp.captionFont,
      captionPosition: pp.captionPosition,
      bgmMood: cp.bgmMoodOverride || pp.bgmMood,
      videoTemplate: cp.videoTemplateOverride || pp.videoTemplate,
      hashtags: pp.hashtags,
    }));
    setAddedHashtags(pp.hashtags);
  }, []);

  const handleTargetPlatformChange = useCallback((key: TargetPlatformKey) => {
    setTargetPlatform(key);
    const defaultPurpose = DEFAULT_PURPOSE_FOR_PLATFORM[key];
    setContentPurpose(defaultPurpose);
    applyCombinedPreset(key, defaultPurpose);
  }, [applyCombinedPreset]);

  const handleMediaTypeChange = useCallback((media: TargetMediaType) => {
    setTargetMediaType(media);
    const filtered = media === 'video' ? VIDEO_PLATFORM_LIST : IMAGE_PLATFORM_LIST;
    const currentPreset = TARGET_PLATFORM_PRESETS[targetPlatform];
    if (currentPreset.mediaType !== media && filtered.length > 0) {
      const firstKey = filtered[0].key;
      setTargetPlatform(firstKey);
      const defaultPurpose = DEFAULT_PURPOSE_FOR_PLATFORM[firstKey];
      setContentPurpose(defaultPurpose);
      applyCombinedPreset(firstKey, defaultPurpose);
    }
  }, [targetPlatform, applyCombinedPreset]);

  const handleContentPurposeChange = useCallback((key: ContentPurpose) => {
    setContentPurpose(key);
    applyCombinedPreset(targetPlatform, key);
  }, [targetPlatform, applyCombinedPreset]);

  const handleInlineEdit = useCallback((patch: Partial<InlineEditState>) => {
    setInlineEdit((prev) => ({ ...prev, ...patch }));
    if (patch.aiPrompt !== undefined) {
      userCustomPrompt.current = patch.aiPrompt;
    }
  }, []);

  const handleInlineRemoveHashtag = useCallback((tag: string) => {
    setAddedHashtags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleRegenerate = useCallback(async () => {
    if (!scan || isRegenerating) return;
    setIsRegenerating(true);
    setNarrativeVariation((v) => v + 1);

    try {
      const preset = TARGET_PLATFORM_PRESETS[targetPlatform];
      const purposePreset = CONTENT_PURPOSE_PRESETS[contentPurpose];
      const prosodyProfile = mapVoiceKeyToProsody('viral_female_1');
      const scriptText = inlineEdit.captionText || activeHookRef.current || scan.summary || '';
      const syncProfile = buildViralAudioSyncProfile(
        targetPlatform as 'shorts' | 'tiktok' | 'reels' | 'naverclip',
        contentPurpose,
        selectedDurationMs,
        prosodyProfile,
        scriptText,
      );
      const viralPayload = buildRegenerationPayload(syncProfile, inlineEdit.aiPrompt);
      const promptParts = [
        `플랫폼: ${preset.label} (${preset.algorithmHint})`,
        `목적: ${purposePreset.label}`,
        purposePreset.audioGuideline,
        `영상 길이: ${syncProfile.totalDurationSec}초 (${syncProfile.tier})`,
        `동기화 정밀도: ${getSyncAccuracyLabel(syncProfile)}`,
        `타임박스: ${formatTimeBoxSummary(syncProfile.timeBoxingPlan)}`,
        `템플릿: ${inlineEdit.videoTemplate}`,
        `자막: ${inlineEdit.captionFont} / ${inlineEdit.captionPosition}`,
        `BGM: ${inlineEdit.bgmMood}${purposePreset.bgmEnabled ? '' : ' (배경음 최소화)'}`,
        `나레이션: ${purposePreset.narrationEnabled ? '포함' : '미포함'}`,
        `훅: ${inlineEdit.hookEffect}`,
        viralPayload,
      ].filter(Boolean);
      const { data, error } = await supabase.functions.invoke('generate-copy', {
        body: {
          scanId: scan.id,
          platform: activePlatform,
          productName: sanitizeVideoProductName(activeProductName || scan.product_name || '프리미엄 추천 상품'),
          extraPrompt: promptParts.join(' | '),
        },
      });
      if (error) throw error;
      if (mountedRef.current && data) {
        const result = data as { caption?: string; hook?: string; title?: string };
        if (result.caption) {
          setAutoMarketingCopy(result.caption);
          setInlineEdit((prev) => ({ ...prev, captionText: result.caption! }));
        }
        if (result.hook) setHookOverride(result.hook);
        if (result.title) setInlineEdit((prev) => ({ ...prev, titleText: result.title! }));
      }
    } catch {
      // copy regeneration failed — keep current content
    }

    if (mountedRef.current) {
      setIsRegenerating(false);
    }
  }, [scan, isRegenerating, inlineEdit.videoTemplate, inlineEdit.captionFont, inlineEdit.captionPosition, inlineEdit.bgmMood, inlineEdit.hookEffect, inlineEdit.aiPrompt, inlineEdit.captionText, activePlatform, targetPlatform, contentPurpose, selectedDurationMs]);

  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const safeTop = useSafeTop();
  const cardRef = useRef<View>(null);
  const mountedRef = useRef(true);
  const activeHookRef = useRef('');
  const styleApplyCounter = useRef(0);
  const handleJobUpdateRef = useRef<((job: RenderJob) => void) | null>(null);

  const triggerTtsGeneration = useCallback(async (scanId: string): Promise<boolean> => {
    const tdDirect = scan?.template_data as { hook?: string; platformVariants?: Record<string, { hook?: string }> } | undefined;
    const platformHook = tdDirect?.platformVariants?.[activePlatform]?.hook;
    const dp0 = scan?.detected_products?.[0] as { templateData?: { hook?: string }; oneLiner?: string; productName?: string } | undefined;
    const sharedCaption = inlineEdit.captionText || activeHookRef.current || scan?.summary || '시선 집중! 지금 바로 확인하세요';
    const hookText = sanitizeVideoText(platformHook || tdDirect?.hook || sharedCaption || scan?.one_liner || dp0?.templateData?.hook || dp0?.oneLiner || dp0?.productName || scan?.product_name || sharedCaption) || sharedCaption;
    try {
      await triggerTTS(scanId, hookText);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'TTS 나레이션 생성에 실패했습니다.';
      if (mountedRef.current) setVideoGenError(prev => prev ? `${prev}\n나레이션: ${msg}` : `나레이션: ${msg}`);
      return false;
    }
  }, [scan, activePlatform]);

  const handleAiVideoGenerate = useCallback(async () => {
    if (!scan || isGeneratingVideo || videoGenLockRef.current) return;
    videoGenLockRef.current = true;
    if (hdUnsubRef.current) { hdUnsubRef.current(); hdUnsubRef.current = null; }
    if (videoUnsubRef.current) { videoUnsubRef.current(); videoUnsubRef.current = null; }
    setIsGeneratingVideo(true);
    setVideoGenError(null);
    setVideoGenProgress({ phase: 'submitting', progress: 0.05, message: 'AI 실사 비디오 생성 요청 중...', elapsedSec: 0 });

    // Before submitting a new job, check if a previous one already completed
    // (e.g. after a client-side timeout the server may have finished rendering)
    try {
      const recovered = await recoverVideoJob(scan.id);
      if (recovered?.status === 'SUCCESS' && recovered.videoUrl) {
        if (mountedRef.current) {
          setGeneratedVideoUrl(recovered.videoUrl);
          setVideoStage(recovered.isHd ? 'hd_ready' : 'draft_ready');
          setIsGeneratingVideo(false);
          setVideoGenProgress(null);
          setVideoGenError(null);
        }
        videoGenLockRef.current = false;
        return;
      }
      if (recovered?.status === 'FAILED') {
        // Previous job failed — clear it so we can submit a fresh one
      }
    } catch {
      // Recovery check failed — proceed with new submission
    }

    const videoCutImages = narrativeReorderedImages.length > 0 ? narrativeReorderedImages : allCutImages;

    let visionData: ProductVisionResult | null = productVision;
    if (!visionData && scan.product_vision) {
      visionData = scan.product_vision;
      if (mountedRef.current) setProductVision(visionData);
    }
    if (!visionData && videoCutImages.length >= 5) {
      setVisionAnalyzing(true);
      setVideoGenProgress({ phase: 'submitting', progress: 0.02, message: 'Vision AI 사물 분석 중...', elapsedSec: 0 });
      try {
        visionData = await analyzeProductVision(videoCutImages.slice(0, 5), sanitizeVideoProductName(scan.product_name) || undefined, scan.id);
        if (mountedRef.current) setProductVision(visionData);
      } catch {
        // Vision analysis failed — proceed without it
      }
      if (mountedRef.current) setVisionAnalyzing(false);
    }

    // Build prompt: manual mode uses user-edited hook + keywords; auto mode uses AI-generated content
    const requestedDurationSec = Math.max(Math.round(selectedDurationMs / 1000), 3);
    let videoPromptText: string;
    if (isCleanVideoMode) {
      const cleanParts: string[] = [];
      const name = sanitizeVideoProductName(scan.product_name) || visionData?.productName || '제품';
      if (inlineEdit.aiPrompt.trim()) {
        cleanParts.push(inlineEdit.aiPrompt.trim());
      }
      cleanParts.push(`Cinematic 3D product showcase for ${name}, pure visual focus`);
      if (visionData) {
        if (visionData.visualFeatures.length > 0) cleanParts.push(`key features: ${visionData.visualFeatures.slice(0, 4).join(', ')}`);
        if (visionData.shapeDescription) cleanParts.push(`shape: ${visionData.shapeDescription}`);
        if (visionData.materialGuess) cleanParts.push(`material: ${visionData.materialGuess}`);
        if (visionData.textureDescription) cleanParts.push(`texture: ${visionData.textureDescription}`);
        if (visionData.orbitalFocusPoint) cleanParts.push(`focal point: ${visionData.orbitalFocusPoint}`);
      }
      cleanParts.push('smooth gentle camera pan, soft studio lighting, macro detail of surface texture, no text overlays, no captions, no marketing elements, pure product cinematography');
      videoPromptText = cleanParts.join('. ');
    } else if (videoGenMode === 'manual' && (manualHook.trim() || manualKeywords.trim())) {
      const parts: string[] = [];
      if (manualHook.trim()) parts.push(manualHook.trim());
      if (manualKeywords.trim()) parts.push(`Keywords: ${manualKeywords.trim()}`);
      parts.push(`${requestedDurationSec}s vertical short-form with loss-aversion hook, before/after contrast, social-proof urgency CTA`);
      videoPromptText = parts.join('. ');
    } else {
      const baseFallback = activeHookRef.current || sanitizeVideoText(scan.summary) || sanitizeVideoText(scan.one_liner) || (visionData ? `${visionData.suggestedCopyLayers.primary} ${visionData.suggestedCopyLayers.secondary} ${visionData.suggestedCopyLayers.tertiary}` : '') || sanitizeVideoProductName(scan.product_name) || `프리미엄 추천 상품. ${requestedDurationSec}-second vertical short-form with loss-aversion hook, before/after contrast, social-proof urgency CTA.`;
      videoPromptText = inlineEdit.aiPrompt.trim()
        ? `${inlineEdit.aiPrompt.trim()}. ${baseFallback}`
        : baseFallback;
    }
    if (!videoPromptText.trim()) {
      if (visionData) {
        const v = visionData;
        const visionParts: string[] = [`Cinematic 3D commercial for ${v.productName || sanitizeVideoProductName(scan.product_name) || '제품'}`];
        if (v.visualFeatures.length > 0) visionParts.push(`features: ${v.visualFeatures.slice(0, 4).join(', ')}`);
        if (v.marketingPoints.length > 0) visionParts.push(`marketing: ${v.marketingPoints.slice(0, 2).join(' / ')}`);
        if (v.shapeDescription) visionParts.push(`shape: ${v.shapeDescription}`);
        if (v.materialGuess) visionParts.push(`material: ${v.materialGuess}`);
        if (v.textureDescription) visionParts.push(`texture: ${v.textureDescription}`);
        if (v.orbitalFocusPoint) visionParts.push(`focal: ${v.orbitalFocusPoint}`);
        const copy = v.suggestedCopyLayers;
        if (copy.primary) visionParts.push(`hook: "${copy.primary}"`);
        if (copy.secondary) visionParts.push(`benefit: "${copy.secondary}"`);
        if (copy.tertiary) visionParts.push(`CTA: "${copy.tertiary}"`);
        visionParts.push(`${requestedDurationSec}s vertical short-form with loss-aversion hook, before/after contrast, social-proof urgency CTA`);
        videoPromptText = visionParts.join('. ');
      } else if (scan.product_name && sanitizeVideoProductName(scan.product_name) !== '프리미엄 추천 상품') {
        videoPromptText = `Cinematic 3D commercial for ${sanitizeVideoProductName(scan.product_name)}. ${requestedDurationSec}-second vertical short-form with loss-aversion hook, before/after problem-solution contrast, and social-proof urgency CTA.`;
      } else {
        videoPromptText = `Cinematic 3D product commercial. ${requestedDurationSec}-second vertical short-form with loss-aversion hook, before/after problem-solution contrast, and social-proof urgency CTA.`;
      }
    }

    // Trigger TTS generation in parallel with video generation so narration is ready when video completes
    if (!isCleanVideoMode) {
      triggerTtsGeneration(scan.id).then((ok) => {
        if (ok && mountedRef.current) {
          setTtsUrl(null);
          Promise.resolve(
            supabase.from('scans').select('tts_url').eq('id', scan.id).maybeSingle()
          ).then(({ data }: { data: { tts_url: string } | null }) => {
            if (data?.tts_url && mountedRef.current) setTtsUrl(data.tts_url);
          }).catch(() => {});
        }
      });
    }

    try {
      // Stage 1: Submit the video job and return immediately — no blocking wait.
      // The user gets a toast and can navigate freely while the server renders.
      const requestedDurationSec = Math.max(Math.round(selectedDurationMs / 1000), 3);
      const submitResult = await submitVideoJobAsync(
        videoPromptText,
        {
          durationSec: requestedDurationSec,
          aspectRatio: (targetMediaType === 'video' ? '9:16' : imageAspectRatio) as '9:16' | '16:9' | '1:1' | '4:5',
          productName: sanitizeVideoProductName(scan.product_name || activeProductName || '프리미엄 추천 상품'),
          scanId: scan.id,
          variationSeed: narrativeVariation + 1,
          bgmMood: inlineEdit.bgmMood,
          captionText: sanitizeVideoText(inlineEdit.captionText || activeHookRef.current || scan.summary || (visionData ? `${visionData.suggestedCopyLayers.primary} ${visionData.suggestedCopyLayers.secondary}` : '') || '시선 집중! 지금 바로 확인하세요'),
          platform: targetPlatform,
          hookCategory: inlineEdit.hookEffect || 'curiosity',
          productVision: visionData,
          isCleanVideoMode,
          promptStrength,
          negativePrompt: negativePrompt.trim() || undefined,
          bgStyle: bgStyle === '자동' ? undefined : bgStyle,
          outfitIntensity: outfitIntensity === 3 ? undefined : outfitIntensity,
          zoomSpeed: zoomSpeed === 2 ? undefined : zoomSpeed,
          cameraRotation,
          transitionEffect: transitionEffect === '컷 전환' ? undefined : transitionEffect,
          stylePreset: targetMediaType === 'image' ? stylePreset : undefined,
          detailRestoration: targetMediaType === 'image' ? detailRestoration : undefined,
          hdUpscale,
          draft: true,
        },
      );

      if (!mountedRef.current) return;

      // Job submitted — switch to drafting phase. Keep the progress UI alive
      // so the user sees continuous feedback while the backend renders.
      // The user can still navigate away; the realtime subscription and
      // background polling will deliver the result on return.
      setVideoStage('drafting');
      setVideoGenProgress({ phase: 'generating', progress: 0.08, message: 'AI가 영상을 렌더링하고 있어요', elapsedSec: 0 });
      setBgJobNotice('영상이 접수되었습니다! 완료 시 알림을 보내드릴게요. 다른 메뉴를 이용하셔도 됩니다.');

      // Background progress simulator: incrementally advance progress while
      // the backend job runs, so the UI never freezes in a blank state.
      const draftStartTime = Date.now();
      const draftProgressTimer = setInterval(() => {
        if (!mountedRef.current) return;
        const elapsed = Math.round((Date.now() - draftStartTime) / 1000);
        // Asymptotic progress curve — approaches 0.92 but never reaches 1.0
        const simulated = Math.min(0.08 + 0.84 * (1 - Math.exp(-elapsed / 45)), 0.92);
        setVideoGenProgress({
          phase: 'generating',
          progress: simulated,
          message: `AI가 영상을 렌더링하고 있어요${elapsed > 5 ? ` (${Math.round(simulated * 100)}%)` : ''}`,
          elapsedSec: elapsed,
        });
      }, 2000);
      draftProgressTimerRef.current = draftProgressTimer;

      // Optimal push permission timing: ask after the user submits their first video generation.
      // This is the moment they have the highest intent to know when the result is ready.
      if (pushSupported && !pushSubscribed) {
        setPushPromptVisible(true);
      }

      const clearDraftProgress = () => {
        if (draftProgressTimerRef.current) {
          clearInterval(draftProgressTimerRef.current);
          draftProgressTimerRef.current = null;
        }
      };

      // Subscribe to the video job via Realtime — non-blocking.
      // When the draft completes, show it immediately. If HD was requested,
      // kick off the HD upgrade in the background after the draft is ready.
      videoUnsubRef.current = subscribeVideoJob(scan.id, submitResult.taskId, (result) => {
        if (!mountedRef.current) return;
        clearDraftProgress();
        if (result.status === 'SUCCESS' && result.videoUrl) {
          setDraftVideoUrl(result.videoUrl);
          setGeneratedVideoUrl(result.videoUrl);
          setVideoStage('draft_ready');
          setIsGeneratingVideo(false);
          setVideoGenProgress(null);
          setBgJobNotice('백그라운드에서 계속 진행 중입니다. 다른 메뉴를 이용해도 완성본은 보관함에 자동 저장됩니다.');

          // Stage 2: Kick off HD upgrade in the background (only when PRO mode is enabled)
          if (!hdUpscale) return;

          setVideoStage('hd_upgrading');
          setHdUpgradeProgress('고화질 업그레이드를 백그라운드에서 시작했어요...');

          upgradeVideoToHd(scan.id, submitResult.taskId, videoPromptText, {
            durationSec: requestedDurationSec,
            aspectRatio: (targetMediaType === 'video' ? '9:16' : imageAspectRatio) as '9:16' | '16:9' | '1:1' | '4:5',
            productName: sanitizeVideoProductName(scan.product_name || activeProductName || '프리미엄 추천 상품'),
            scanId: scan.id,
            variationSeed: narrativeVariation + 1,
            bgmMood: inlineEdit.bgmMood,
            captionText: sanitizeVideoText(inlineEdit.captionText || activeHookRef.current || scan.summary || (visionData ? `${visionData.suggestedCopyLayers.primary} ${visionData.suggestedCopyLayers.secondary}` : '') || '시선 집중! 지금 바로 확인하세요'),
            platform: targetPlatform,
            hookCategory: inlineEdit.hookEffect || 'curiosity',
            productVision: visionData,
            isCleanVideoMode,
            promptStrength,
            negativePrompt: negativePrompt.trim() || undefined,
            bgStyle: bgStyle === '자동' ? undefined : bgStyle,
            outfitIntensity: outfitIntensity === 3 ? undefined : outfitIntensity,
            zoomSpeed: zoomSpeed === 2 ? undefined : zoomSpeed,
            cameraRotation,
            transitionEffect: transitionEffect === '컷 전환' ? undefined : transitionEffect,
            stylePreset: targetMediaType === 'image' ? stylePreset : undefined,
            detailRestoration: targetMediaType === 'image' ? detailRestoration : undefined,
            hdUpscale: true,
          }).then(({ hdJobId }) => {
            if (!mountedRef.current) return;
            hdUnsubRef.current = subscribeHdUpgrade(scan.id, submitResult.taskId, (hdResult) => {
              if (!mountedRef.current) return;
              if (hdResult.status === 'SUCCESS' && hdResult.videoUrl) {
                setGeneratedVideoUrl(hdResult.videoUrl);
                setDraftVideoUrl(null);
                setVideoStage('hd_ready');
                setHdUpgradeProgress(null);
                setIsGeneratingVideo(false);
                setVideoGenProgress(null);
              } else if (hdResult.status === 'FAILED') {
                setVideoStage('draft_ready');
                setHdUpgradeProgress(null);
                setIsGeneratingVideo(false);
                setVideoGenProgress(null);
                setVideoGenError(prev => prev ? `${prev}\n고화질 업그레이드 실패 (초안 유지)` : '고화질 업그레이드 실패 (초안 유지)');
              }
            });
          }).catch(() => {
            if (mountedRef.current) {
              setVideoStage('draft_ready');
              setHdUpgradeProgress(null);
              setIsGeneratingVideo(false);
              setVideoGenProgress(null);
            }
          });
        } else if (result.status === 'FAILED') {
          const msg = result.error ?? 'AI 영상 생성에 실패했습니다.';
          setVideoGenError(msg);
          setVideoStage('failed');
          setIsGeneratingVideo(false);
          setVideoGenProgress(null);
        }
      });
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'AI 영상 생성 요청에 실패했습니다.';
        setVideoGenError(msg);
        setVideoStage('failed');
        setIsGeneratingVideo(false);
        setVideoGenProgress(null);
      }
      if (draftProgressTimerRef.current) {
        clearInterval(draftProgressTimerRef.current);
        draftProgressTimerRef.current = null;
      }
    }

    videoGenLockRef.current = false;
  }, [scan, isGeneratingVideo, inlineEdit.aiPrompt, inlineEdit.bgmMood, inlineEdit.captionText, inlineEdit.hookEffect, narrativeVariation, productVision, targetPlatform, videoGenMode, manualHook, manualKeywords, isCleanVideoMode, promptStrength, negativePrompt, bgStyle, outfitIntensity, zoomSpeed, cameraRotation, transitionEffect, targetMediaType, imageAspectRatio, stylePreset, detailRestoration, hdUpscale, selectedDurationMs, triggerTtsGeneration, ttsUrl, videoStage]);

  const handleAiImageGenerate = useCallback(async () => {
    if (!scan || isGeneratingImage) return;
    setIsGeneratingImage(true);
    setImageGenError(null);
    setGeneratedImages([]);
    setSelectedImageIndex(0);
    setImageGenProgress({ phase: 'submitting', progress: 0, message: '이미지 생성 준비 중...', completedCount: 0, totalCount: 5 });

    const sizeMap: Record<string, '1024x1024' | '1792x1024' | '1024x1792'> = {
      '1:1': '1024x1024',
      '4:5': '1024x1792',
      '9:16': '1024x1792',
      '16:9': '1792x1024',
    };
    const size = sizeMap[imageAspectRatio] ?? '1024x1024';

    const stylePresetMap: Record<string, { style: 'vivid' | 'natural'; quality: 'standard' | 'hd' }> = {
      'clean-studio': { style: 'vivid', quality: 'standard' },
      'editorial-film': { style: 'natural', quality: 'standard' },
      'minimalist-soft': { style: 'natural', quality: 'standard' },
      'luxury-dark': { style: 'vivid', quality: 'standard' },
    };
    const presetConfig = stylePresetMap[stylePreset] ?? stylePresetMap['clean-studio'];
    const quality = hdUpscale ? 'hd' : presetConfig.quality;

    const basePrompt = sanitizeVideoText(inlineEdit.aiPrompt.trim() || activeHookRef.current || scan.summary || scan.product_name) || '프리미엄 상품 상업용 이미지';
    const productName = sanitizeVideoProductName(scan.product_name || '프리미엄 추천 상품');

    const seeds = [101, 202, 303, 404, 505];

    const buildPromptForIndex = (idx: number): string => {
      const variations = [
        '정면 클로즈업, 스튜디오 조명',
        '45도 측면 각도, 얕은 피사계 심도',
        '사용 시나리오 연출, 라이프스타일 분위기',
        '매크로 디테일 샷, 텍스처 강조',
        '풀샷 환경 구도, 배경과 조화',
      ];
      return `${basePrompt}. ${variations[idx] ?? variations[0]}`;
    };

    try {
      const wave1 = [0, 1];
      const wave2 = [2, 3];
      const wave3 = [4];

      const refImageUrl = scan.edited_image_url || scan.image_url;
      let referenceImageBase64: string | undefined;
      if (refImageUrl) {
        setImageGenProgress({ phase: 'submitting', progress: 0.05, message: '참조 이미지 로딩 중...', completedCount: 0, totalCount: 5 });
        try {
          const imgResp = await fetch(refImageUrl);
          if (imgResp.ok) {
            const arrayBuffer = await imgResp.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
              binary += String.fromCharCode(...chunk);
            }
            const rawBase64 = uint8ArrayToBase64(bytes);
            const rawDataUrl = `data:image/jpeg;base64,${rawBase64}`;
            const compressed = await compressForEdgeFunction(rawDataUrl);
            referenceImageBase64 = compressed.base64;
          }
        } catch {
          // If fetch fails, proceed without reference image
        }
      }

      const invokeOne = async (idx: number) =>
        supabase.functions.invoke('generate-image', {
          body: {
            output_type: 'image',
            mode: 'image',
            prompt: buildPromptForIndex(idx),
            size,
            quality,
            style: presetConfig.style,
            productName,
            productCategory: scan?.detected_products?.[selectedProductIndex]?.productCategory,
            seed: seeds[idx],
            platform: targetPlatform,
            customPrompt: inlineEdit.aiPrompt || undefined,
            referenceImage: referenceImageBase64,
          },
        });

      const runWave = async (indices: number[]) =>
        Promise.allSettled(indices.map((idx) => invokeOne(idx)));

      const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

      setImageGenProgress({ phase: 'generating', progress: 0.1, message: '1~2번 이미지 병렬 생성 중...', completedCount: 0, totalCount: 5 });
      const r1 = await runWave(wave1);
      if (!mountedRef.current) return;
      setImageGenProgress({ phase: 'generating', progress: 0.35, message: '3~4번 이미지 병렬 생성 중...', completedCount: 2, totalCount: 5 });
      await delay(12000);
      const r2 = await runWave(wave2);
      if (!mountedRef.current) return;
      setImageGenProgress({ phase: 'generating', progress: 0.65, message: '5번 이미지 생성 중...', completedCount: 4, totalCount: 5 });
      await delay(12000);
      const r3 = await runWave(wave3);
      if (!mountedRef.current) return;
      setImageGenProgress({ phase: 'generating', progress: 0.85, message: '생성 결과 수집 중...', completedCount: 5, totalCount: 5 });

      const results = [...r1, ...r2, ...r3];

      if (!mountedRef.current) return;

      const images: string[] = [];
      const failedErrors: string[] = [];

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          const { data, error } = result.value;
          if (error) {
            const errMsg = typeof error === 'object' && error !== null && 'message' in error
              ? String((error as { message: unknown }).message)
              : `이미지 ${idx + 1}번 생성 실패`;
            failedErrors.push(errMsg);
            return;
          }
          if (!data?.image) {
            const serverErr = data?.error as string | undefined;
            failedErrors.push(serverErr ?? `이미지 ${idx + 1}번: 응답 데이터 없음`);
            return;
          }
          const base64 = data.image as string;
          const mimeType = (data.mimeType as string) ?? 'image/png';
          images.push(`data:${mimeType};base64,${base64}`);
        } else {
          const errMsg = result.reason instanceof Error ? result.reason.message : `이미지 ${idx + 1}번 요청 실패`;
          failedErrors.push(errMsg);
        }
      });

      if (images.length === 0) {
        setImageGenError(
          `5장 이미지 생성에 모두 실패했습니다.\n${failedErrors.slice(0, 3).join('\n')}\n다시 시도해주세요.`,
        );
        setImageGenProgress({ phase: 'error', progress: 1, message: '생성 실패', completedCount: 0, totalCount: 5 });
      } else if (images.length < 5) {
        setImageGenError(`5장 중 ${images.length}장 생성 성공, ${failedErrors.length}장 실패.\n${failedErrors.slice(0, 3).join('\n')}`);
        setImageGenProgress({ phase: 'completed', progress: 1, message: `${images.length}/5장 완료`, completedCount: images.length, totalCount: 5 });
      } else {
        setImageGenError(null);
        setImageGenProgress({ phase: 'completed', progress: 1, message: '5장 생성 완료', completedCount: 5, totalCount: 5 });
      }
      setGeneratedImages(images);
      if (images.length > 0 && mountedRef.current) {
        setSelectedImageIndex(0);
      }
    } catch (err) {
      if (mountedRef.current) {
        setImageGenError(err instanceof Error ? err.message : '이미지 생성 중 오류가 발생했습니다.');
        setImageGenProgress({ phase: 'error', progress: 1, message: '생성 실패', completedCount: 0, totalCount: 5 });
      }
    }

    if (mountedRef.current) {
      setIsGeneratingImage(false);
    }

    // Auto-clear progress after 3 seconds on success
    setTimeout(() => {
      if (mountedRef.current) {
        setImageGenProgress((prev) =>
          prev?.phase === 'completed' ? null : prev,
        );
      }
    }, 3000);
  }, [scan, isGeneratingImage, inlineEdit.aiPrompt, imageAspectRatio, stylePreset, hdUpscale, targetPlatform, selectedProductIndex]);

  useEffect(() => {
    if (generatedImages.length > 0 && selectedImageIndex >= generatedImages.length) {
      setSelectedImageIndex(0);
    }
  }, [generatedImages.length, selectedImageIndex]);

  const fetchScan = useCallback(async () => {
    if (!id) {
      setError('잘못된 접근입니다.');
      setLoading(false);
      return;
    }
    try {
      const [scanResult, settingsResult] = await Promise.all([
        supabase.from('scans').select('*').eq('id', id).maybeSingle(),
        getUserSettings(),
      ]);

      if (!mountedRef.current) return;
      if (scanResult.error) {
        setError(friendlyError(scanResult.error, '데이터를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.'));
      } else if (!scanResult.data) {
        if (mountedRef.current) setError('스캔을 찾을 수 없습니다');
      } else {
        if (!mountedRef.current) return;
        const scanData = scanResult.data as Scan;
        setScan(scanData);
        setCustomAffiliateLinks(scanData.custom_affiliate_links ?? []);
        setLocalStoreInfo(scanData.local_store_info ?? null);
        if (scanData.template_data?.cleanMode) {
          setIsCleanVideoMode(true);
        } else if (settingsResult?.clean_footage_enabled) {
          setIsCleanVideoMode(true);
        }
        if (scanData.video_url) {
          setGeneratedVideoUrl(scanData.video_url);
        }
        if (scanData.product_vision) {
          setProductVision(scanData.product_vision);
        }
      }
      if (mountedRef.current) setSettings(settingsResult);
    } catch (err) {
      if (mountedRef.current) setError(friendlyError(err, '데이터를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.'));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      videoGenLockRef.current = false;
      if (hdUnsubRef.current) hdUnsubRef.current();
      if (videoUnsubRef.current) videoUnsubRef.current();
      if (draftProgressTimerRef.current) {
        clearInterval(draftProgressTimerRef.current);
        draftProgressTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    fetchScan();
  }, [fetchScan]);

  useEffect(() => {
    if (!scan || scan.tts_url || ttsUrl) return;
    const interval = setInterval(() => {
      Promise.resolve(
        supabase
          .from('scans')
          .select('tts_url')
          .eq('id', scan.id)
          .maybeSingle()
      ).then(({ data }: { data: { tts_url: string } | null }) => {
        if (data?.tts_url && mountedRef.current) {
          setTtsUrl(data.tts_url);
        }
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [scan, ttsUrl]);


  // Re-check TTS URL when app returns to foreground
  useEffect(() => {
    if (!scan || scan.tts_url || ttsUrl) return;
    const subscription = AppState.addEventListener('change', (nextAppState: string) => {
      if (nextAppState === 'active' && mountedRef.current) {
        Promise.resolve(
          supabase
            .from('scans')
            .select('tts_url')
            .eq('id', scan.id)
            .maybeSingle()
        ).then(({ data }) => {
          if (data?.tts_url && mountedRef.current) {
            setTtsUrl(data.tts_url);
          }
        }).catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [scan, ttsUrl]);

  // Resume polling for in-progress video generation jobs on mount
  useEffect(() => {
    if (!scan || generatedVideoUrl || isGeneratingVideo) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        // First try to recover a previously-completed job (e.g. after timeout)
        const recovered = await recoverVideoJob(scan.id);
        if (cancelled || !recovered) {
          // recoverVideoJob returned null — check for pending jobs below
        } else if (recovered.status === 'SUCCESS' && recovered.videoUrl) {
          if (mountedRef.current) {
            setGeneratedVideoUrl(recovered.videoUrl);
            setVideoStage(recovered.isHd ? 'hd_ready' : 'draft_ready');
            setIsGeneratingVideo(false);
            setVideoGenProgress(null);
          }
          return;
        } else if (recovered.status === 'FAILED') {
          // Job already failed — don't re-poll
          return;
        }

        // No completed job found — check for pending jobs and resume polling
        const { data: jobRow } = await supabase
          .from('video_jobs')
          .select('task_id, status, is_draft')
          .eq('scan_id', scan.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled || !jobRow) return;

        if (jobRow.status === 'PENDING' || jobRow.status === 'RUNNING' || jobRow.status === 'THROTTLED') {
          const taskId = jobRow.task_id as string;

          // Zombie job guard: if the job has been stuck for over 5 minutes, don't resume
          const { data: fullJob } = await supabase
            .from('video_jobs')
            .select('created_at')
            .eq('scan_id', scan.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (fullJob?.created_at) {
            const jobAgeMs = Date.now() - new Date(fullJob.created_at).getTime();
            if (jobAgeMs > 300000) {
              if (mountedRef.current) {
                setVideoGenError('이전 영상 생성 작업이 시간 초과로 실패했습니다. 다시 시도해주세요.');
                setVideoStage('failed');
              }
              return;
            }
          }

          setIsGeneratingVideo(true);
          setVideoGenProgress({ phase: 'generating', progress: 0.1, message: '이전 영상 생성 작업을 이어받는 중...', elapsedSec: 0 });

          const startTime = Date.now();
          let consecutiveErrors = 0;
          const MAX_CONSECUTIVE_ERRORS = 8;
          const POLL_TIMEOUT_MS = 300000;

          const pollOnce = async () => {
            if (cancelled) return;
            if (Date.now() - startTime > POLL_TIMEOUT_MS) {
              if (mountedRef.current) {
                setVideoGenError('영상 생성 시간이 초과되었습니다. 다시 시도해주세요.');
                setIsGeneratingVideo(false);
                setVideoGenProgress(null);
              }
              return;
            }
            try {
              const { data: pollData } = await supabase.functions.invoke('generate-video', {
                body: { mode: 'poll', taskId, scanId: scan.id },
              });

              if (!pollData || typeof pollData !== 'object') return;

              const status = pollData.status as string;
              const elapsed = Math.round((Date.now() - startTime) / 1000);

              if (status === 'SUCCESS' && pollData.videoUrl) {
                if (mountedRef.current) {
                  setGeneratedVideoUrl(pollData.videoUrl as string);
                  setIsGeneratingVideo(false);
                  setVideoGenProgress(null);
                }
                return; // stop polling
              } else if (status === 'FAILED') {
                if (mountedRef.current) {
                  setVideoGenError(pollData.error as string ?? '영상 생성에 실패했습니다.');
                  setIsGeneratingVideo(false);
                  setVideoGenProgress(null);
                }
                return; // stop polling
              } else {
                consecutiveErrors = 0;
                const rawProgress = pollData.progress ? parseFloat(pollData.progress) : NaN;
                const numericProgress = !isNaN(rawProgress) ? 0.1 + rawProgress * 0.85 : 0.1;
                const pctLabel = !isNaN(rawProgress) ? ` (${Math.round(rawProgress * 100)}%)` : '';
                if (mountedRef.current) {
                  setVideoGenProgress({
                    phase: 'generating',
                    progress: Math.min(numericProgress, 0.95),
                    message: `AI가 영상을 렌더링하고 있어요${pctLabel}`,
                    elapsedSec: elapsed,
                  });
                }
              }
            } catch {
              consecutiveErrors++;
              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                if (mountedRef.current) {
                  setVideoGenError('네트워크 연결이 불안정하여 영상 생성 상태를 확인할 수 없습니다. 다시 시도해주세요.');
                  setIsGeneratingVideo(false);
                  setVideoGenProgress(null);
                }
                return;
              }
            }
            // Schedule next poll with adaptive interval
            const elapsedMs = Date.now() - startTime;
            const baseInterval = elapsedMs < 5000 ? 500 : 1000;
            const backoffMultiplier = consecutiveErrors > 0 ? Math.min(Math.pow(2, consecutiveErrors), 8) : 1;
            intervalId = setTimeout(pollOnce, Math.round(baseInterval * backoffMultiplier));
          };

          intervalId = setTimeout(pollOnce, 500);
        }
      } catch {
        // video_jobs table read failed — non-fatal
      }
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearTimeout(intervalId);
    };
  }, [scan, generatedVideoUrl, isGeneratingVideo]);

  // Background realtime subscription: watch video_jobs for this scan so that
  // even if the user navigated away and came back, the completed video is
  // detected and auto-saved to the Assets tab.
  useEffect(() => {
    if (!scan) return;

    const autoSaveVideoToAssets = async (videoUrl: string) => {
      if (autoSavedVideoRef.current === videoUrl) return;
      autoSavedVideoRef.current = videoUrl;
      try {
        const fileName = `snap-connect-video-${scan.id}-${Date.now()}.mp4`;
        let cloudUrl: string | null = null;
        if (Platform.OS === 'web') {
          const res = await fetch(videoUrl);
          const blob = await res.blob();
          cloudUrl = await uploadAssetBlobWithProgress(blob, fileName, 'video/mp4', () => {});
        } else {
          cloudUrl = await uploadAssetFromFileUriWithProgress(videoUrl, fileName, 'video/mp4', () => {});
        }
        if (cloudUrl) {
          await saveAssetRecord({
            scan_id: scan.id,
            asset_type: 'video',
            title: scan.product_name || scan.title || 'AI 영상',
            file_url: cloudUrl,
            file_name: fileName,
            mime_type: 'video/mp4',
            platform: activePlatform,
          });
        }
      } catch {
        // Auto-save is best-effort; user can still manually save
      }
    };

    const channel = supabase
      .channel(`bg-video-watch:${scan.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_jobs', filter: `scan_id=eq.${scan.id}` },
        (payload) => {
          if (!mountedRef.current || !payload.new) return;
          const row = payload.new as { status: string; video_url: string | null; hd_status?: string | null; hd_video_url?: string | null };
          if (row.hd_status === 'SUCCESS' && row.hd_video_url) {
            setGeneratedVideoUrl(row.hd_video_url);
            setVideoStage('hd_ready');
            setIsGeneratingVideo(false);
            setVideoGenProgress(null);
            setBgJobNotice(null);
            autoSaveVideoToAssets(row.hd_video_url);
          } else if (row.status === 'SUCCESS' && row.video_url) {
            if (!generatedVideoUrl) {
              setGeneratedVideoUrl(row.video_url);
              setVideoStage('draft_ready');
              setIsGeneratingVideo(false);
              setVideoGenProgress(null);
              setBgJobNotice(null);
              autoSaveVideoToAssets(row.video_url);
            }
          }
        },
      )
      .subscribe();

    bgVideoChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      bgVideoChannelRef.current = null;
    };
  }, [scan, generatedVideoUrl, activePlatform]);

  // Realtime subscription on the scans row itself: when the background
  // stereo pipeline (or any other background task) writes text data
  // (template_data, one_liner, summary, product_name) to the scan row
  // after the user has already landed on this page, re-fetch so the
  // generated hooks/captions appear without requiring a manual reload.
  useEffect(() => {
    if (!scan) return;
    let skipInitial = true;
    const channel = supabase
      .channel(`scan-row-watch:${scan.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scans', filter: `id=eq.${scan.id}` },
        () => {
          if (!mountedRef.current) return;
          if (skipInitial) {
            skipInitial = false;
            return;
          }
          Promise.resolve(
            supabase
              .from('scans')
              .select('*')
              .eq('id', scan.id)
              .maybeSingle(),
          ).then(({ data }) => {
            if (mountedRef.current && data) {
              setScan(data as Scan);
            }
          }).catch(() => {});
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scan?.id]);

  // Realtime subscription for async analysis job completion
  useEffect(() => {
    if (!scan?.analysis_job_id) {
      setAnalysisStatus('idle');
      return;
    }

    setAnalysisStatus('processing');
    setAnalysisError(null);
    let finalizing = false;

    const handleJobUpdate = (job: RenderJob) => {
      if (!mountedRef.current) return;
      if (job.status === 'done' && !finalizing) {
        finalizing = true;
        setAnalysisStatus('done');
        // Finalize: write analysis data to scan row, cache result, trigger TTS
        (async () => {
          try {
            if (!job.result) {
              throw new Error('분석 결과가 비어 있습니다. 다시 시도해주세요.');
            }
            await finalizeAnalysisFromJob(scan.id, job.id, job.result);
            // Refresh the scan to get the updated data
            const { data: refreshed } = await supabase
              .from('scans')
              .select('*')
              .eq('id', scan.id)
              .maybeSingle();
            if (mountedRef.current && refreshed) {
              setScan(refreshed as Scan);
            }
          } catch (err) {
            if (mountedRef.current) {
              setAnalysisError(err instanceof Error ? err.message : '분석 결과 저장에 실패했습니다.');
            }
          }
        })();
      } else if (job.status === 'error') {
        setAnalysisStatus('error');
        setAnalysisError(job.error_message || 'AI 분석 중 오류가 발생했습니다.');
      }
    };

    const sub = subscribeToJob(scan.analysis_job_id, handleJobUpdate);
    handleJobUpdateRef.current = handleJobUpdate;

    // Also poll the job as a fallback (realtime can miss events)
    let pollErrorCount = 0;
    const MAX_POLL_ERRORS = 10;
    const ANALYSIS_TIMEOUT_MS = 300000;
    const analysisStartTime = Date.now();
    const pollInterval = setInterval(async () => {
      if (!mountedRef.current) return;
      if (Date.now() - analysisStartTime > ANALYSIS_TIMEOUT_MS) {
        clearInterval(pollInterval);
        if (mountedRef.current && analysisStatus === 'processing') {
          setAnalysisStatus('error');
          setAnalysisError('분석 시간이 초과되었습니다. 다시 시도해주세요.');
        }
        return;
      }
      try {
        const { data: jobRow } = await supabase
          .from('render_jobs')
          .select('*')
          .eq('id', scan.analysis_job_id)
          .maybeSingle();
        if (jobRow && (jobRow.status === 'done' || jobRow.status === 'error')) {
          clearInterval(pollInterval);
          handleJobUpdate(jobRow as RenderJob);
        }
        pollErrorCount = 0;
      } catch {
        pollErrorCount++;
        if (pollErrorCount >= MAX_POLL_ERRORS) {
          clearInterval(pollInterval);
          if (mountedRef.current && analysisStatus === 'processing') {
            setAnalysisStatus('error');
            setAnalysisError('네트워크 연결이 불안정하여 분석 상태를 확인할 수 없습니다. 다시 시도해주세요.');
          }
        }
      }
    }, 3000);

    return () => {
      sub.unsubscribe();
      clearInterval(pollInterval);
      handleJobUpdateRef.current = null;
    };
  }, [scan?.analysis_job_id, retryCount]);
  // (OS suspends timers when screen is off / app is backgrounded)
  useEffect(() => {
    if (!scan?.analysis_job_id) return;
    if (analysisStatus !== 'processing') return;

    const subscription = AppState.addEventListener('change', (nextAppState: string) => {
      if (nextAppState === 'active' && mountedRef.current) {
        Promise.resolve(
          supabase
            .from('render_jobs')
            .select('*')
            .eq('id', scan.analysis_job_id!)
            .maybeSingle()
        ).then(({ data }) => {
          if (data && mountedRef.current && (data.status === 'done' || data.status === 'error')) {
            handleJobUpdateRef.current?.(data as RenderJob);
          }
        }).catch(() => {});
      }
    });

    return () => subscription.remove();
  }, [scan?.analysis_job_id, analysisStatus]);

  useEffect(() => {
    (async () => {
      const saved = await getItem('preferred_template_style');
      if (saved) {
        setActivePlatform(saved as PlatformKey);
        setActiveBoard(getPlatformMediaType(saved as PlatformKey));
      }
      const savedTone = await getItem('content_tone');
      // Studio tone no longer auto-enables clean video mode — overlays should be visible
      // Users can still manually toggle clean mode via the UI switch
    })();
  }, []);

  const handlePlatformChange = useCallback((key: PlatformKey) => {
    setActivePlatform(key);
    setActiveBoard(getPlatformMediaType(key));
  }, []);

  useEffect(() => {
    if (!scan) return;
    const url = scan.edited_image_url || scan.image_url;
    let cancelled = false;
    (async () => {
      try {
        const dataUrl = await urlToDataUrl(url);
        const compressed = await prepareImageForApi(dataUrl, 1024, 0.8);
        if (!cancelled) {
          setCaptureImageUrl(compressed);
        }
      } catch {
        if (!cancelled) {
          try {
            const fallbackDataUrl = await urlToDataUrl(url);
            if (!cancelled) {
              setCaptureImageUrl(fallbackDataUrl);
            }
          } catch {
            if (!cancelled) {
              setCaptureImageUrl(url);
            }
          }
        }
      }
    })();
    (async () => {
      try {
        const size = await getImageSize(url);
        if (!cancelled && size.width && size.height) {
          setHeroAspect(size.width / size.height);
        }
      } catch {
        // keep default aspect ratio
      }
    })();
    return () => { cancelled = true; };
  }, [scan?.edited_image_url, scan?.image_url]);


  const partnerIdsConfigured = useMemo(() => {
    return !!(settings?.coupang_partners_id || settings?.toss_share_id || settings?.naver_shopping_id);
  }, [settings]);

  const handleConnectLink = useCallback(() => {
    setFocusTileKey('shoppingMatch');
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 2200, animated: true });
    }, 350);
  }, []);

  const handleSaveCustomLink = async (url: string, label: string, productIndex: number): Promise<{ success: boolean; error?: string }> => {
    if (!scan) return { success: false, error: '스캔 정보를 찾을 수 없어요' };
    if (!url || !url.trim()) return { success: false, error: '링크 URL을 입력해주세요' };
    setSavingLink(true);
    const detectedPlatform = detectAffiliatePlatform(url);
    const updated = customAffiliateLinks.filter((l) => l.productIndex !== productIndex);
    updated.push({ platform: detectedPlatform, label, url, productIndex });
    updated.sort((a, b) => a.productIndex - b.productIndex);
    try {
      const { error: updateError } = await supabase
        .from('scans')
        .update({ custom_affiliate_links: updated })
        .eq('id', scan.id);
      if (updateError) {
        setSavingLink(false);
        return { success: false, error: '링크 저장 실패: ' + updateError.message };
      }
      setCustomAffiliateLinks(updated);
      setSelectedAffiliate(detectedPlatform);
      setSavingLink(false);
      return { success: true };
    } catch (e: any) {
      setSavingLink(false);
      return { success: false, error: '링크 저장 실패: ' + (e?.message || String(e)) };
    }
  };

  const handleRemoveCustomLink = async (productIndex: number): Promise<{ success: boolean; error?: string }> => {
    if (!scan) return { success: false, error: '스캔 정보를 찾을 수 없어요' };
    const updated = customAffiliateLinks.filter((l) => l.productIndex !== productIndex);
    try {
      const { error: updateError } = await supabase
        .from('scans')
        .update({ custom_affiliate_links: updated })
        .eq('id', scan.id);
      if (updateError) {
        return { success: false, error: '링크 삭제 실패: ' + updateError.message };
      }
      setCustomAffiliateLinks(updated);
      setAutoMarketingCopy(null);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: '링크 삭제 실패: ' + (e?.message || String(e)) };
    }
  };

  const detectedProducts: DetectedProduct[] = useMemo(() => scan?.detected_products ?? [], [scan?.detected_products]);
  const selectedProduct = useMemo(() => detectedProducts[selectedProductIndex] ?? null, [detectedProducts, selectedProductIndex]);
  const activeProductName = useMemo(() => sanitizeVideoProductName(selectedProduct?.productName || scan?.product_name || '프리미엄 추천 상품'), [selectedProduct, scan?.product_name]);
  const activePriceEstimate = useMemo(() => priceOverride !== null ? priceOverride : (selectedProduct?.priceEstimate || scan?.price_estimate || ''), [priceOverride, selectedProduct, scan?.price_estimate]);
  const activeShoppingMatches = useMemo(() => selectedProduct?.shoppingMatches ?? scan?.shopping_matches ?? [], [selectedProduct, scan?.shopping_matches]);
  const activeTemplateData = useMemo(() => selectedProduct?.templateData ?? scan?.template_data, [selectedProduct, scan?.template_data]);
  const activeOneLiner = useMemo(() => sanitizeVideoText(selectedProduct?.oneLiner || scan?.one_liner || '') || '', [selectedProduct, scan?.one_liner]);

  const currentAffiliateLinks: AffiliateLink[] = useMemo(() => {
    if (!scan) return [];
    return generateAffiliateLinks(
        {
          title: scan.title || '',
          summary: scan.summary || '',
          contacts: scan.contacts,
          tags: scan.tags,
          productName: activeProductName,
          productCategory: selectedProduct?.productCategory || scan?.product_category || '',
          priceEstimate: activePriceEstimate,
          oneLiner: activeOneLiner,
          shoppingMatches: activeShoppingMatches,
          templateData: activeTemplateData,
          detectedProducts: [],
        },
        settings,
      );
  }, [scan, settings, activeProductName, activePriceEstimate, activeShoppingMatches, activeTemplateData, activeOneLiner, selectedProduct]);

  const td = activeTemplateData;
  const platformVariant = td?.platformVariants?.[activePlatform];
  const activeHook = hookOverride || platformVariant?.hook || td?.hook || productVision?.suggestedCopyLayers.primary || '시선 집중! 하이엔드 럭셔리 컬렉션';
  activeHookRef.current = activeHook;
  const activeCaption = inlineEdit.captionText || (autoMarketingCopy || platformVariant?.caption || td?.caption || productVision?.suggestedCopyLayers.secondary || '내 몸에 완벽하게 감기는 핏');
  const activeHashtags = platformVariant?.hashtags || td?.hashtags || [];
  const allDisplayHashtags = [...activeHashtags, ...addedHashtags];

  useEffect(() => {
    if (!scan) return;
    const aiCaption = platformVariant?.caption || td?.caption || '';
    const baseCaption = aiCaption || scan?.one_liner || scan?.summary || '';
    // Only auto-set if user hasn't manually edited AND AI caption is now available
    const userEdited = inlineEdit.captionText && !autoMarketingCopy && inlineEdit.captionText !== (scan?.one_liner || scan?.summary || '');
    if (!userEdited && baseCaption) {
      setInlineEdit((prev) => ({ ...prev, captionText: baseCaption }));
    }
    if (!inlineEdit.titleText) {
      const baseTitle = sanitizeVideoText(scan.title) || activeProductName || td?.hook || '프리미엄 추천 상품';
      if (baseTitle) setInlineEdit((prev) => ({ ...prev, titleText: baseTitle }));
    }
  }, [scan?.id, scan?.one_liner, scan?.summary, scan?.title, platformVariant?.caption, td?.caption, td?.hook, activeProductName]);

  const isLinkRestrictedPlatform = activePlatform === 'instagram' || activePlatform === 'shortform';
  const commentCta = isLinkRestrictedPlatform && shortUrl ? '\n\n댓글창 링크 확인' : '';

  const baseCaption = autoMarketingCopy || (activeCaption
    ? `${activeCaption}\n\n${allDisplayHashtags.map((h) => `#${h}`).join(' ')}`
    : `${activeOneLiner || scan?.title || '숏커넥트'}\n${activeProductName ? `제품: ${activeProductName}\n` : ''}${activePriceEstimate ? `가격: ${activePriceEstimate}\n` : ''}`);
  const fullCaption = autoMarketingCopy
    ? `${baseCaption}${isLinkRestrictedPlatform ? commentCta : (shortUrl ? `\n\n${shortUrl}` : '')}`
    : `${baseCaption}`;

  const [captionCopied, setCaptionCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [hookCopied, setHookCopied] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadDone, setUploadDone] = useState(false);

  const handleCopyCaption = async () => {
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(captionWithLink);
        setCaptionCopied(true);
        setTimeout(() => setCaptionCopied(false), 2000);
      } else {
        await Clipboard.setStringAsync(captionWithLink);
        setCaptionCopied(true);
        setTimeout(() => setCaptionCopied(false), 2000);
      }
    } catch {
      // clipboard copy failed silently
    }
  };

  const handleSaveVideo = async () => {
    if (!generatedVideoUrl) return;
    setUploadError(null);
    setUploadProgress(0);

    let fallbackObjectUrl: string | null = null;
    try {
      const fileName = `snap-connect-video-${scan?.id ?? 'card'}-${Date.now()}.mp4`;

      if (Platform.OS === 'web') {
        let fetchRes: Response;
        try {
          fetchRes = await fetch(generatedVideoUrl);
        } catch {
          throw new Error('영상을 불러올 수 없습니다. 네트워크 연결을 확인해주세요.');
        }
        if (!fetchRes.ok) throw new Error(`영상 서버 응답 오류 (${fetchRes.status})`);
        const blob = await fetchRes.blob();
        fallbackObjectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = fallbackObjectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          throw new Error('갤러리 접근 권한이 필요합니다.');
        }
        const dir = FileSystem.cacheDirectory;
        if (!dir) throw new Error('임시 저장 공간을 사용할 수 없습니다.');
        const fileUri = `${dir}${fileName}`;
        const downloadResult = await FileSystem.downloadAsync(generatedVideoUrl, fileUri);
        if (downloadResult.status !== 200) {
          throw new Error(`영상 다운로드 실패 (${downloadResult.status})`);
        }
        await MediaLibrary.createAssetAsync(downloadResult.uri);
      }

      setUploadProgress(100);
      setUploadDone(true);
      setTimeout(() => {
        setUploadProgress(null);
        setUploadDone(false);
      }, 2500);
    } catch (saveError) {
      setUploadProgress(null);
      const message = saveError instanceof Error ? saveError.message : '영상 저장에 실패했습니다. 다시 시도해주세요.';
      setUploadError(message);
    } finally {
      if (fallbackObjectUrl && Platform.OS === 'web') {
        URL.revokeObjectURL(fallbackObjectUrl);
      }
    }
  };

  const handleSaveAndShare = async () => {
    if (uploadProgress !== null) return;
    setUploadError(null);
    setUploadDone(false);
    setUploadProgress(0);

    let fallbackObjectUrl: string | null = null;
    try {
      let uri: string;
      const fileName = `snap-connect-${scan?.id ?? 'card'}-${Date.now()}.png`;

      if (Platform.OS === 'web') {
        // Web: skip DOM canvas capture (CORS/tainted-canvas issues) — fetch source image directly
        const sourceUrl = captureImageUrl || scan?.edited_image_url || scan?.image_url;
        if (!sourceUrl) throw new Error('저장할 이미지를 찾을 수 없습니다.');
        let fetchRes: Response;
        try {
          fetchRes = await fetch(sourceUrl);
        } catch {
          throw new Error('이미지를 불러올 수 없습니다. 네트워크 연결을 확인해주세요.');
        }
        if (!fetchRes.ok) throw new Error(`이미지 서버 응답 오류 (${fetchRes.status})`);
        const blob = await fetchRes.blob();
        fallbackObjectUrl = URL.createObjectURL(blob);
        uri = fallbackObjectUrl;

        // Trigger browser download via <a> tag
        const link = document.createElement('a');
        link.href = uri;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        // Native: use view-shot capture
        try {
          uri = await captureRef(cardRef, {
            format: 'png',
            quality: 1,
            fileName: `snap-connect-${scan?.id ?? 'card'}.png`,
          });
        } catch (captureError) {
          throw new Error('화면 캡처에 실패했습니다. 이미지를 불러온 후 다시 시도해주세요.');
        }

        // 1) Save to device gallery (primary action)
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          throw new Error('갤러리 접근 권한이 필요합니다.');
        }
        try {
          await MediaLibrary.createAssetAsync(uri);
        } catch {
          const { base64 } = await readUriAsBase64(uri);
          const dir = FileSystem.cacheDirectory;
          if (!dir) throw new Error('임시 저장 공간을 사용할 수 없습니다.');
          const fileUri = `${dir}${fileName}`;
          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await MediaLibrary.createAssetAsync(fileUri);
        }
      }

      // Gallery save succeeded — reset progress after brief success flash
      setUploadProgress(100);
      setUploadDone(true);
      const resetTimer = setTimeout(() => {
        setUploadProgress(null);
        setUploadDone(false);
      }, 2500);

      // 2) Cloud upload + asset record (secondary, non-blocking, silent)
      (async () => {
        try {
          let cloudUrl: string | null = null;
          if (Platform.OS === 'web') {
            const res = await fetch(uri);
            const blob = await res.blob();
            cloudUrl = await uploadAssetBlobWithProgress(blob, fileName, 'image/png', () => {});
          } else {
            cloudUrl = await uploadAssetFromFileUriWithProgress(uri, fileName, 'image/png', () => {});
          }
          if (cloudUrl) {
            await saveAssetRecord({
              scan_id: scan?.id ?? null,
              asset_type: 'image',
              title: activeProductName || scan?.title || '숏폼 카드',
              file_url: cloudUrl,
              file_name: fileName,
              mime_type: 'image/png',
              platform: activePlatform,
            });
          }
        } catch {
          // Cloud save is secondary; gallery export already succeeded
        } finally {
          if (fallbackObjectUrl && Platform.OS === 'web') {
            URL.revokeObjectURL(fallbackObjectUrl);
          }
        }
      })();

      if (Platform.OS === 'web') {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(shareText);
        }
        setCaptionCopied(true);
        setTimeout(() => setCaptionCopied(false), 2000);
      } else {
        try {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: '공유하기',
          });
        } catch {
          await RNShare.share({ message: shareText });
        }
      }
    } catch (saveError) {
      setUploadProgress(null);
      let message: string;
      if (saveError instanceof Error && saveError.message) {
        message = saveError.message;
      } else if (typeof saveError === 'string') {
        message = saveError;
      } else {
        message = Platform.OS === 'web'
          ? '이미지 저장에 실패했습니다. 브라우저 설정에서 다운로드 권한을 확인해주세요.'
          : '저장 중 오류가 발생했습니다. 다시 시도해주세요.';
      }
      setUploadError(message);
      if (fallbackObjectUrl && Platform.OS === 'web') {
        URL.revokeObjectURL(fallbackObjectUrl);
      }
    }
  };

  const handleCopyHook = async () => {
    if (!activeHook) return;
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(activeHook);
      } else {
        await Clipboard.setStringAsync(activeHook);
      }
      setHookCopied(true);
      setTimeout(() => setHookCopied(false), 2000);
    } catch {
      // clipboard copy failed silently
    }
  };

  const handleCopyCommentLink = async () => {
    if (!shortUrl) return;
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(shortUrl);
      } else {
        await Clipboard.setStringAsync(shortUrl);
      }
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // clipboard copy failed silently
    }
  };

  const customLinkForCurrentProduct = customAffiliateLinks.find(
    (l) => l.productIndex === selectedProductIndex,
  );

  const hasCustomLink = !!customLinkForCurrentProduct?.url;

  const platformAffiliateUrls = useMemo<Record<AffiliatePlatformKey, string | null>>(() => {
    if (!hasCustomLink) {
      return {
        Coupang: null,
        Toss: null,
        BrandConnect: null,
        OliveYoung: null,
        Zigzag: null,
        TodayHouse: null,
        Kurly: null,
        AliExpress: null,
        Amazon: null,
        MyRealTrip: null,
        Klook: null,
        Custom: null,
      };
    }
    const url = customLinkForCurrentProduct?.url || '';
    const detected = detectAffiliatePlatform(url);
    const result: Record<AffiliatePlatformKey, string | null> = {
      Coupang: null,
      Toss: null,
      BrandConnect: null,
      OliveYoung: null,
      Zigzag: null,
      TodayHouse: null,
      Kurly: null,
      AliExpress: null,
      Amazon: null,
      MyRealTrip: null,
      Klook: null,
      Custom: null,
    };
    result[detected] = url;
    // BrandConnect also matches generic naver shopping URLs
    if (detected !== 'BrandConnect' && /smartstore\.naver\.com|brand\.naver\.com/i.test(url)) {
      result.BrandConnect = url;
    }
    return result;
  }, [customLinkForCurrentProduct, hasCustomLink]);

  const primaryAffiliateUrl = platformAffiliateUrls[selectedAffiliate];

  useEffect(() => {
    if (!hasCustomLink) return;
    if (platformAffiliateUrls[selectedAffiliate]) return;
    const entry = (Object.entries(platformAffiliateUrls) as [AffiliatePlatformKey, string | null][]).find(([, v]) => v);
    if (entry) setSelectedAffiliate(entry[0]);
  }, [platformAffiliateUrls, selectedAffiliate, hasCustomLink]);

  const availablePlatforms = useMemo<AffiliatePlatformKey[]>(
    () => (Object.entries(platformAffiliateUrls) as [AffiliatePlatformKey, string | null][])
      .filter(([, v]) => !!v)
      .map(([k]) => k),
    [platformAffiliateUrls],
  );

  const affiliatePlatforms = useMemo(
    () => availablePlatforms.length > 0 ? availablePlatforms : [selectedAffiliate],
    [availablePlatforms, selectedAffiliate],
  );

  const previewEditPlan = useMemo(
    () => {
      const bgmTemplate = getBgmTemplateForMood(inlineEdit.bgmMood);
      const bgmOverride = {
        templateId: bgmTemplate.id,
        label: bgmTemplate.label,
        mood: bgmTemplate.mood,
        bpm: bgmTemplate.bpm,
        highlightStartSec: bgmTemplate.highlightStartSec,
        highlightDurationSec: bgmTemplate.highlightDurationSec,
        energyCurve: bgmTemplate.energyCurve,
      };
      return buildShortFormEditPlan(
        targetPlatform,
        inlineEdit.aiPrompt || activeOneLiner || scan?.summary || '',
        activeHook || null,
        activeProductName || undefined,
        affiliatePlatforms,
        true,
        false,
        undefined,
        bgmOverride,
        productVision ?? undefined,
        (settings?.default_caption_tone as ContentTone) ?? 'casual',
      );
    },
    [targetPlatform, inlineEdit.aiPrompt, inlineEdit.bgmMood, activeOneLiner, scan?.summary, activeHook, activeProductName, affiliatePlatforms, productVision, settings?.default_caption_tone],
  );

  const disclosureText = getDisclosureForPlatforms(affiliatePlatforms);
  const captionWithLink = isLinkRestrictedPlatform
    ? (autoMarketingCopy ? `${fullCaption}\n\n${disclosureText}` : `${fullCaption}${shortUrl ? commentCta : ''}\n\n${disclosureText}`)
    : (shortUrl && !autoMarketingCopy
      ? `${fullCaption}\n\n${shortUrl}\n\n${disclosureText}`
      : `${fullCaption}\n\n${disclosureText}`);

  const shareText = captionWithLink;

  const handlePlatformUpload = useCallback(async () => {
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
      } else {
        await Clipboard.setStringAsync(shareText);
      }
    } catch {
      // clipboard copy failed silently
    }

    const uploadKey = TARGET_TO_UPLOAD_PLATFORM[targetPlatform];
    if (!uploadKey) return;
    const deepLink = getDeepLink(uploadKey);
    const url = Platform.OS === 'web' ? deepLink.uploadWebUrl : deepLink.uploadAppUrl;
    if (!url) return;
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        try {
          const supported = await Linking.canOpenURL(url);
          if (supported) {
            await Linking.openURL(url);
          } else {
            await Linking.openURL(deepLink.uploadWebUrl);
          }
        } catch {
          // App scheme failed — fall back to web upload page
          try {
            await Linking.openURL(deepLink.uploadWebUrl);
          } catch {
            // web fallback also failed — silently ignore
          }
        }
      }
    } catch {
      // Last resort: try web URL if available
      if (deepLink.uploadWebUrl && Platform.OS !== 'web') {
        try { await Linking.openURL(deepLink.uploadWebUrl); } catch { /* ignore */ }
      }
    }
  }, [shareText, targetPlatform]);

  const handleOtherSnsShare = useCallback(async () => {
    const fullShareText = `${shareText}${shortUrl ? `\n\n${shortUrl}` : ''}`;
    try {
      if (Platform.OS === 'web' && navigator.share) {
        await navigator.share({ title: activeProductName || scan?.title || 'SnapConnect', text: fullShareText, url: shortUrl || undefined });
      } else if (Platform.OS === 'web') {
        if (navigator.clipboard) await navigator.clipboard.writeText(fullShareText);
      } else {
        await RNShare.share({ message: fullShareText, title: activeProductName || scan?.title || 'SnapConnect' });
      }
    } catch {
      // user cancelled or share failed — silently ignore
    }
  }, [shareText, shortUrl, activeProductName, scan?.title]);

  useEffect(() => {
    if (!scan) return;
    if (!primaryAffiliateUrl) {
      setShortUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await createShortLink(primaryAffiliateUrl, scan.id);
        if (!cancelled) setShortUrl(result);
      } catch {
        if (!cancelled) setShortUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, [primaryAffiliateUrl, scan?.id]);

  useEffect(() => {
    if (!scan) return;
    let cancelled = false;
    setAddedHashtags([]);
    setHookOverride(null);
    (async () => {
      try {
        const productCat = selectedProduct?.productCategory || scan.product_category || '';
        const productTags = scan.tags || [];
        const name = activeProductName || scan.product_name || '';
        const result = await fetchMatchedTrendingHashtags(productCat, productTags, name);
        if (!cancelled) setTrendingHashtags(result?.hashtags ?? []);
      } catch {
        if (!cancelled) setTrendingHashtags([]);
      }
    })();
    return () => { cancelled = true; };
  }, [scan?.id, scan?.product_category, scan?.product_name, scan?.tags, selectedProductIndex, activeProductName, selectedProduct?.productCategory]);

  const allCutImages = useMemo(() => {
    const images: string[] = [];
    if (scan?.image_url) images.push(scan.image_url);
    if (scan?.additional_image_urls && Array.isArray(scan.additional_image_urls)) {
      for (const url of scan.additional_image_urls) {
        if (url && !images.includes(url)) images.push(url);
      }
    }
    return images;
  }, [scan?.image_url, scan?.additional_image_urls]);



  const narrativePlan: NarrativePlan | null = useMemo(() => {
    if (allCutImages.length === 0) return null;
    const context = (scan?.product_category as NarrativePlan['scenario']['context']) || 'general';
    return buildNarrativePlan(allCutImages, context, narrativeVariation);
  }, [allCutImages, scan?.product_category, narrativeVariation]);

  const narrativeReorderedImages = useMemo(() => {
    if (!narrativePlan) return allCutImages;
    return narrativePlan.reorderedCuts.orderedImageUrls;
  }, [narrativePlan, allCutImages]);

  const copyOverlaysForPreview: CopyOverlayTimeline[] | null = useMemo(() => {
    if (isCleanVideoMode) return null;
    if (productVision) {
      const layers = productVision.suggestedCopyLayers;
      const primary = layers?.primary || activeHook || activeOneLiner || scan?.summary || '시선 집중! 지금 바로 확인하세요';
      const secondary = layers?.secondary || scan?.one_liner || '왜 다들 이걸 찾는지 알겠더라고요';
      const tertiary = layers?.tertiary || (shortUrl ? `자세히 보기 ${shortUrl}` : '지금 확인하고 놓치 마세요');
      return buildCopyOverlayTimeline({
        title: primary,
        hookCopy: primary,
        featureCopy: productVision.visualFeatures.slice(0, 3).join(' · ') || secondary,
        ctaCopy: tertiary,
        subtitleCopy: secondary,
      });
    }
    const hookText = activeHook || activeOneLiner || sanitizeVideoText(scan?.summary) || sanitizeVideoProductName(scan?.product_name) || sanitizeVideoText(scan?.one_liner) || '시선 집중! 지금 바로 확인하세요';
    const ctaText = shortUrl ? `자세히 보기 ${shortUrl}` : '지금 확인하세요';
    const featureText = activeCaption || inlineEdit.captionText || scan?.one_liner || '';
    if (!hookText && !featureText) return null;
    return buildCopyOverlayTimeline({
      title: hookText,
      hookCopy: hookText,
      featureCopy: featureText,
      ctaCopy: ctaText,
      subtitleCopy: featureText,
    });
  }, [productVision, isCleanVideoMode, activeHook, activeOneLiner, scan?.summary, scan?.product_name, scan?.one_liner, activeCaption, inlineEdit.captionText, shortUrl]);

  const trendingSuggestions = getTrendingSuggestions(trendingHashtags, [...activeHashtags, ...addedHashtags]);

  const handleAddTrendingHashtag = (tag: string) => {
    setAddedHashtags((prev) => [...prev, tag]);
  };

  const handleRemoveTrendingHashtag = (tag: string) => {
    setAddedHashtags((prev) => prev.filter((t) => t !== tag));
  };

  useEffect(() => {
    if (stickerUserOverride) return;
    const category = selectedProduct?.productCategory || scan?.product_category || '';
    const cardStyle = getCardStyleForPlatform(activePlatform, activeTemplateData);
    setStickerStyle(recommendStickerStyle(cardStyle, category));
    setStickerSize(recommendStickerSize(cardStyle));
  }, [activePlatform, selectedProduct, scan, activeTemplateData, stickerUserOverride]);

  const handleStickerStyleChange = useCallback((style: StickerStyle) => {
    setStickerUserOverride(true);
    setStickerStyle(style);
  }, []);

  const handleStickerSizeChange = useCallback((size: number) => {
    setStickerUserOverride(true);
    setStickerSize(size);
  }, []);

  if (loading) {
    return <LoadingScreen message="분석 결과를 불러오는 중..." />;
  }

  if (error || !scan) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{error || '문제가 발생했습니다'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace('/(tabs)'); } }} activeOpacity={0.8}>
          <ArrowLeft size={20} color={theme.colors.dark.text} strokeWidth={2} />
          <Text style={styles.backButtonText}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const featureCategories: FeatureCategory[] = [
    {
      key: 'template',
      label: '핵심 템플릿',
      tiles: [
        {
          key: 'templateCard',
          label: '템플릿 카드',
          description: '피팅 컷, 상세 컷 등 핵심 레이아웃으로 제품 카드 제작',
          category: 'template',
          modes: ['single', 'multi', 'template'] as ScanMode[],
          icon: <LayoutTemplate size={16} color={theme.colors.accent[300]} strokeWidth={2} />,
          mediaType: 'image',
          render: () => (
            <View>
              {primaryAffiliateUrl ? (
                <>
                  <StickerLinkControls
                    enabled={true}
                    onToggle={() => {}}
                    stickerStyle={stickerStyle}
                    onStyleChange={handleStickerStyleChange}
                    size={stickerSize}
                    onSizeChange={handleStickerSizeChange}
                    aiRecommended={!stickerUserOverride}
                  />
                  <View style={styles.qrPositionRow}>
                    <Text style={styles.qrPositionLabel}>스티커 위치</Text>
                    <View style={styles.qrPositionGroup}>
                      {STICKER_POSITIONS.map((pos) => (
                        <TouchableOpacity
                          key={pos.value}
                          style={[
                            styles.qrPositionPill,
                            stickerPosition === pos.value && styles.qrPositionPillActive,
                          ]}
                          onPress={() => setStickerPosition(pos.value)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.qrPositionPillText,
                              stickerPosition === pos.value && styles.qrPositionPillTextActive,
                            ]}
                          >
                            {pos.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.noLinkNotice}>
                  <Link2 size={16} color={theme.colors.warning[400]} strokeWidth={2} />
                  <Text style={styles.noLinkNoticeText}>
                    구매 링크를 입력하면 스티커 링크가 자동으로 만들어져요. 아래 &lsquo;쇼핑커넥트 &amp; 제휴 링크&rsquo;를 펼쳐서 플랫폼을 선택하고 내 수수료 링크를 붙여넣으세요.
                  </Text>
                </View>
              )}
              <View style={styles.overlayControlWrap}>
                <View style={styles.overlayControlHeader}>
                  <Sun size={14} color={theme.colors.accent[400]} strokeWidth={2} />
                  <Text style={styles.overlayControlTitle}>배경 투명도</Text>
                  <TouchableOpacity onPress={() => setOverlayOpacity(null)} activeOpacity={0.7}>
                    <Text style={styles.overlayResetText}>기본값</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.opacitySliderRow}>
                  <Text style={styles.opacityMinLabel}>얇게</Text>
                  <TouchableOpacity
                    style={styles.opacityTrack}
                    onPress={(e) => {
                      const { locationX } = e.nativeEvent;
                      const measuredWidth = (e.currentTarget as any).clientWidth || (e.nativeEvent as any).layout?.width || 200;
                      const ratio = Math.max(0, Math.min(1, locationX / measuredWidth));
                      setOverlayOpacity(Math.round(ratio * 100) / 100);
                    }}
                    activeOpacity={1}
                  >
                    <View
                      style={[
                        styles.opacityFill,
                        { width: `${Math.round((overlayOpacity != null ? overlayOpacity : 0.62) * 100)}%` },
                      ]}
                    />
                    <View
                      style={[
                        styles.opacityThumb,
                        { left: `${Math.round((overlayOpacity != null ? overlayOpacity : 0.62) * 100)}%` },
                      ]}
                    />
                  </TouchableOpacity>
                  <Text style={styles.opacityMaxLabel}>진하게</Text>
                </View>
              </View>
              <View style={styles.textPositionRow}>
                <Text style={styles.qrPositionLabel}>문구 위치</Text>
                <View style={styles.qrPositionGroup}>
                  {TEXT_POSITIONS.map((pos: { label: string; value: TextPosition }) => (
                    <TouchableOpacity
                      key={pos.value}
                      style={[
                        styles.qrPositionPill,
                        textPosition === pos.value && styles.qrPositionPillActive,
                      ]}
                      onPress={() => setTextPosition(pos.value)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.qrPositionPillText,
                          textPosition === pos.value && styles.qrPositionPillTextActive,
                        ]}
                      >
                        {pos.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Clean footage toggle */}
                <View style={styles.cleanModeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cleanModeTitle}>클린 영상 (자막/훅 없음)</Text>
                    <Text style={styles.cleanModeDesc}>텍스트 오버레이 없이 순수 원본 비주얼만 추출</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setIsCleanVideoMode((v) => !v)}
                    activeOpacity={0.7}
                    hitSlop={12}
                  >
                    <View style={[styles.cleanModeSwitch, isCleanVideoMode && styles.cleanModeSwitchActive]}>
                      <View style={[styles.cleanModeKnob, isCleanVideoMode && styles.cleanModeKnobActive]} />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ),
        },
        {
          key: 'aiStyle',
          label: 'AI 스타일',
          description: '제품 이미지에 어울리는 AI 배경 및 분위기 스타일 변환',
          category: 'template',
          modes: ['single', 'multi', 'template'] as ScanMode[],
          icon: <PaletteIcon size={16} color={theme.colors.accent[300]} strokeWidth={2} />,
          mediaType: 'image',
          render: () => (
            <AIStyleCard
              productName={activeProductName || scan.product_name || ''}
              productCategory={selectedProduct?.productCategory || scan.product_category || ''}
              accentColor={td?.accentColor || theme.colors.primary[400]}
              hook={activeHook}
              oneLiner={activeOneLiner || scan?.one_liner || ''}
              platform={activePlatform}
              onApply={(rec) => {
                setRecommendedStyle(rec);
                styleApplyCounter.current += 1;
                setStyleAppliedKey(`style-${styleApplyCounter.current}`);
              }}
            />
          ),
        },
        {
          key: 'lightingStudio',
          label: '조명 & 배경 스튜디오',
          description: '제품 원본은 그대로, 배경과 조명만 AI로 다채롭게 변경',
          category: 'template',
          modes: ['single', 'multi', 'template'] as ScanMode[],
          icon: <SunIcon size={16} color={theme.colors.accent[300]} strokeWidth={2} />,
          mediaType: 'image',
          render: () => (
            <LightingContextStudio
              imageUrl={captureImageUrl || scan.edited_image_url || scan.image_url}
              productName={activeProductName || scan.product_name || ''}
              onUseImage={(dataUrl) => { setCaptureImageUrl(dataUrl); }}
            />
          ),
        },
      ],
    },
    {
      key: 'commerce',
      label: '커머스 & 공유',
      tiles: [
        {
          key: 'ocrText',
          label: 'OCR 텍스트 추출',
          description: '사진 속 브랜드/모델명을 AI로 인식하여 제휴 검색어 자동 제안',
          category: 'commerce',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <ScanTextIcon size={16} color={theme.colors.primary[300]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <OcrTextExtractor
              imageUrl={captureImageUrl || scan.edited_image_url || scan.image_url}
            />
          ),
        },
        {
          key: 'shoppingMatch',
          label: '쇼핑커넥트',
          description: '오픈마켓·자사몰 상품 링크와 단축 URL 연동',
          category: 'commerce',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <ShoppingBagIcon size={16} color={theme.colors.warning[400]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <ShoppingMatchCard
              matches={activeShoppingMatches}
              affiliateLinks={activeShoppingMatches.length > 0 ? [] : currentAffiliateLinks}
              customAffiliateLinks={customAffiliateLinks}
              selectedProductIndex={selectedProductIndex}
              saving={savingLink}
              productName={activeProductName}
              priceLabel={activePriceEstimate}
              onMarketingCopyGenerated={(copy) => setAutoMarketingCopy(copy)}
              onSaveCustomLink={handleSaveCustomLink}
              onRemoveCustomLink={handleRemoveCustomLink}
              selectedAffiliate={selectedAffiliate}
              onSelectAffiliate={setSelectedAffiliate}
              availablePlatforms={availablePlatforms}
              shortUrl={shortUrl}
              scanId={scan.id}
            />
          ),
        },
        {
          key: 'localStore',
          label: '로컬 스토어',
          description: '지역 기반 상점 및 오프라인 마케팅 연계 정보 설정',
          category: 'commerce',
          modes: ['single', 'multi', 'template'] as ScanMode[],
          icon: <Store size={16} color={theme.colors.warning[400]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <LocalStoreCard
              value={localStoreInfo}
              onChange={(info) => {
                setLocalStoreInfo(info);
                if (scan) {
                  supabase
                    .from('scans')
                    .update({ local_store_info: info })
                    .eq('id', scan.id)
                    .then(() => {}, () => {});
                }
              }}
            />
          ),
        },
        {
          key: 'multiExport',
          label: '멀티 내보내기',
          description: '여러 플랫폼 규격에 맞춰 한 번에 결과물 추출',
          category: 'export',
          modes: ['single', 'multi', 'template'] as ScanMode[],
          icon: <Share2Icon size={16} color={theme.colors.primary[300]} strokeWidth={2} />,
          mediaType: 'image',
          render: () => (
            <MultiPlatformExport
              imageUrl={captureImageUrl || scan.edited_image_url || scan.image_url}
              hook={activeHook}
              title={activeProductName || scan.title || 'Product'}
              hashtags={allDisplayHashtags}
              accentColor={td?.accentColor || theme.colors.primary[400]}
              category={td?.category || ''}
              fileName={`snap-connect-${scan.id}.png`}
              affiliatePlatforms={affiliatePlatforms}
              platform={activePlatform}
              shortUrl={shortUrl || ''}
            />
          ),
        },
        {
          key: 'shareBar',
          label: '공유하기 / 링크 복사',
          description: '즉시 클립보드 복사 및 SNS 공유',
          category: 'export',
          modes: ['single', 'multi', 'template'] as ScanMode[],
          icon: <Share2Icon size={16} color={theme.colors.primary[300]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <ShareBar
              cardRef={cardRef}
              shareText={shareText}
              affiliateUrl={primaryAffiliateUrl}
              shortUrl={shortUrl}
              fileName={`snap-connect-${scan.id}.png`}
              affiliatePlatforms={affiliatePlatforms}
            />
          ),
        },
      ],
    },
    {
      key: 'copyText',
      label: '문구 / 카피',
      tiles: [
        {
          key: 'copyWriter',
          label: '카피라이터',
          description: '브랜드 페르소나가 반영된 감성형·정보형·파격할인형 카피 생성',
          category: 'content',
          modes: ['single', 'multi', 'template'] as ScanMode[],
          icon: <PenLine size={16} color={theme.colors.primary[300]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <CopyWriter
              productName={activeProductName}
              productCategory={selectedProduct?.productCategory || scan?.product_category || ''}
              priceEstimate={activePriceEstimate}
              oneLiner={activeOneLiner}
              productAdvantages={td?.productAdvantages || []}
              platform={activePlatform}
              brandPersona={settings?.brand_persona}
              contentTone={settings?.default_caption_tone}
            />
          ),
        },
        {
          key: 'trendCopy',
          label: '트렌드 카피',
          description: '실시간 인기 키워드 기반 마케팅 문구 추천',
          category: 'content',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <TrendingUpIcon size={16} color={theme.colors.primary[300]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <TrendCopyBar
              productName={activeProductName}
              productCategory={selectedProduct?.productCategory || scan?.product_category || ''}
              tags={scan?.tags || []}
              platform={activePlatform}
              onApplyTrend={(phrase) => setAutoMarketingCopy(phrase)}
            />
          ),
        },
        {
          key: 'hashtag',
          label: '해시태그',
          description: '최적의 해시태그 조합 추천 및 복사',
          category: 'content',
          modes: ['single', 'multi', 'template'] as ScanMode[],
          icon: <HashIcon size={16} color={theme.colors.primary[300]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <HashtagCopyBar
              hashtags={allDisplayHashtags}
              productCategory={selectedProduct?.productCategory || scan?.product_category || ''}
              platform={activePlatform}
            />
          ),
        },
        {
          key: 'shortFormGuide',
          label: '숏폼 가이드',
          description: '영상 제작 시 자막 타이밍 및 구성 가이드 제공',
          category: 'content',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <BookOpen size={16} color={theme.colors.primary[300]} strokeWidth={2} />,
          mediaType: 'video',
          render: () => (
            <ShortFormGuideCard
              productName={activeProductName}
              productCategory={selectedProduct?.productCategory || scan?.product_category || ''}
              priceEstimate={activePriceEstimate}
              oneLiner={activeOneLiner}
              productAdvantages={td?.productAdvantages || []}
              onApplyHook={(hook) => setHookOverride(hook)}
              appliedHook={hookOverride}
            />
          ),
        },
        {
          key: 'globalLocalizer',
          label: '글로벌 로컬라이저',
          description: '해외 타겟 맞춤 번역 및 현지화 콘텐츠 생성',
          category: 'export',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <Globe size={16} color={theme.colors.primary[300]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <GlobalLocalizer
              hook={activeHook}
              title={activeProductName || scan.title || 'Product'}
              caption={baseCaption}
              hashtags={allDisplayHashtags}
              productName={activeProductName || scan.product_name || ''}
              productCategory={selectedProduct?.productCategory || scan.product_category || ''}
              narrationText={activeHook || activeOneLiner}
              affiliateUrl={shortUrl || primaryAffiliateUrl || undefined}
              preloadedKoreanTtsUrl={ttsUrl || scan.tts_url}
            />
          ),
        },
        {
          key: 'socialShortForm',
          label: '숏폼 인트로/아웃트로',
          description: '숏폼 도입부 후킹 문구 및 마무리 멘트 생성',
          category: 'export',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <Share2Icon size={16} color={theme.colors.primary[300]} strokeWidth={2} />,
          mediaType: 'video',
          render: () => (
            <SocialShortFormShare
              shareText={shareText}
              affiliateUrl={primaryAffiliateUrl}
              shortUrl={shortUrl}
              affiliatePlatforms={affiliatePlatforms}
            />
          ),
        },
        {
          key: 'directShare',
          label: '원탭 공유 & 갤러리 저장',
          description: '영상을 갤러리에 저장하거나 릴스·쇼츠·틱톡으로 바로 내보내기',
          category: 'export',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <Download size={16} color={theme.colors.accent[400]} strokeWidth={2} />,
          mediaType: 'video',
          render: () => (
            <DirectShareBridge
              videoUrl={generatedVideoUrl}
              shareText={shareText}
              fileName={activeProductName || 'ai-shortform'}
            />
          ),
        },
        {
          key: 'accountSafety',
          label: '계정 안전 헬스체커',
          description: '발행 간격 쿨다운 타이머 + 안전 점수로 섀도우반 방지',
          category: 'export',
          modes: ['single', 'multi', 'template'] as ScanMode[],
          icon: <ShieldIcon size={16} color={theme.colors.success[400]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <TouchableOpacity
              style={styles.safetyTileBtn}
              onPress={() => setSafetyCheckerVisible(true)}
              activeOpacity={0.7}
            >
              <ShieldIcon size={16} color={theme.colors.success[400]} strokeWidth={2} />
              <Text style={styles.safetyTileBtnText}>계정 안전 확인하기</Text>
            </TouchableOpacity>
          ),
        },
        {
          key: 'creatorPersona',
          label: '마이 페르소나',
          description: '크리에이터 고유 어조, 시그니처 멘트, 대표 컬러 등록',
          category: 'optimize',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <UserIcon size={16} color={theme.colors.accent[400]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => <CreatorPersonaCard />,
        },
        {
          key: 'snapMix',
          label: 'Snap-Mix 1초 튜닝',
          description: '톤앤매너·시점을 1탭으로 즉시 전환',
          category: 'optimize',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <SlidersIcon size={16} color={theme.colors.accent[400]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => <SnapMixTuner />,
        },
        {
          key: 'microEdit',
          label: '인간의 손길 10% 마이크로 에디팅',
          description: '나만의 사용 후기 1줄 추가 + 실물 촬영 컷 삽입',
          category: 'optimize',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <PencilIcon size={16} color={theme.colors.warning[400]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => <MicroEditSlot />,
        },
        {
          key: 'hyperHumanEngine',
          label: '1% 크리에이터 AI 엔진',
          description: '역발상 훅 + 감정 곡선 TTS + 비트 동기화 3단게 자동 적용',
          category: 'optimize',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <ZapIcon size={16} color={theme.colors.accent[400]} strokeWidth={2} />,
          mediaType: 'video',
          render: () => (
            <HyperHumanEngineCard
              productName={activeProductName || scan?.product_name || ''}
              caption={activeCaption}
              hashtags={allDisplayHashtags}
              videoDurationSec={15}
            />
          ),
        },
        {
          key: 'originalityScore',
          label: '크리에이터 독창성 스코어',
          description: '현재 콘텐츠가 얼마나 중복되는지 독창성 점수 산출',
          category: 'optimize',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <SparklesIcon size={16} color={theme.colors.accent[400]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <OriginalityScoreCard
              factors={{
                hasPersonaSignature: !!settings?.brand_persona,
                hasCustomTone: !!settings?.brand_persona,
                hasVoiceClone: false,
                hasMicroEdit: false,
                hasUniqueAngle: false,
                cacheHitCount: 0,
              }}
            />
          ),
        },
        {
          key: 'localizationSafety',
          label: '현지 적합성 스코어',
          description: '법적 규제·금기어·현지 톤 안전성 점검 (FTC/스텔마/공정위)',
          category: 'optimize',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <ShieldIcon size={16} color={theme.colors.success[400]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <LocalizationSafetyCard
              caption={activeCaption}
              countryCode="US"
              disclosureEnabled={!!settings?.auto_disclosure}
              transcreationApplied={!!settings?.brand_persona}
              nativeToneMatch={!!settings?.brand_persona}
            />
          ),
        },
        {
          key: 'linkInBio',
          label: '링크인바이오 랜딩페이지',
          description: '모든 상품을 한 페이지에 모아두는 프로필 바이오 링크',
          category: 'export',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <Link2Icon size={16} color={theme.colors.accent[400]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <LinkInBioCard
              scanId={scan.id}
              scanTitle={activeProductName || scan.title || '상품'}
            />
          ),
        },
        {
          key: 'smartScheduler',
          label: '스마트 업로드 알림',
          description: '골든타임 예약 푸시 알림과 원클릭 캡션 복사',
          category: 'export',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <BellRing size={16} color={theme.colors.primary[300]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <SmartScheduler
              scanId={scan.id}
              caption={baseCaption}
              hashtags={allDisplayHashtags}
              affiliateUrl={shortUrl || primaryAffiliateUrl || undefined}
              platform={activePlatform}
            />
          ),
        },
      ],
    },
    {
      key: 'analysis',
      label: '분석 / 전략',
      tiles: [
        {
          key: 'shortFormTips',
          label: '숏폼 팁',
          description: '트렌디한 편집 팁과 플랫폼별 최적화 정보',
          category: 'insight',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <Lightbulb size={16} color={theme.colors.success[400]} strokeWidth={2} />,
          mediaType: 'video',
          render: () => (
            <ShortFormTipsCard
              hook={activeHook}
              oneLiner={activeOneLiner || scan?.one_liner || ''}
              productAdvantages={td?.productAdvantages || []}
              caption={activeCaption}
              productName={activeProductName || scan?.product_name || ''}
              platform={activePlatform}
              onApplyPlatform={setActivePlatform}
            />
          ),
        },
        {
          key: 'viralPredict',
          label: '바이럴 예측',
          description: '현재 콘텐츠의 바이럴 성공 확률 분석',
          category: 'insight',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <Rocket size={16} color={theme.colors.success[400]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <ViralPredictor
              hook={activeHook}
              title={activeProductName || scan.title || 'Product'}
              productName={activeProductName || scan.product_name || ''}
              productCategory={selectedProduct?.productCategory || scan.product_category || ''}
              hashtags={allDisplayHashtags}
              comicStyle="lineart"
              panelCount={1}
              hasTTS={!!scan?.tts_url}
              episodeMode={false}
              trendingKeywords={trendingHashtags}
            />
          ),
        },
        {
          key: 'trendMatch',
          label: '트렌드 매치',
          description: '제품과 현재 트렌드의 매칭 점검 및 해시태그 추천',
          category: 'commerce',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <TrendingUpIcon size={16} color={theme.colors.warning[400]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <TrendMatchCard
              productCategory={selectedProduct?.productCategory || scan?.product_category || ''}
              productName={activeProductName || scan?.product_name || ''}
              platform={activePlatform}
              onApplyHashtags={(tags) => setAddedHashtags((prev) => [...prev, ...tags.filter((t) => !prev.includes(t))])}
            />
          ),
        },
        {
          key: 'personaSim',
          label: '페르소나 시뮬',
          description: '타겟 고객 페르소나별 반응 시뮬레이션',
          category: 'insight',
          modes: ['single', 'multi'] as ScanMode[],
          icon: <Users size={16} color={theme.colors.success[400]} strokeWidth={2} />,
          mediaType: 'both',
          render: () => (
            <PersonaSimulator
              productName={activeProductName || scan.product_name || ''}
              productCategory={selectedProduct?.productCategory || scan.product_category || ''}
              priceEstimate={activePriceEstimate}
              oneLiner={activeOneLiner}
              productAdvantages={td?.productAdvantages || []}
              hook={activeHook}
            />
          ),
        },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: safeTop + 12 }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => {
            if (activePlatform !== 'shortform') {
              handlePlatformChange('shortform');
            } else {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)');
              }
            }
          }}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={theme.colors.dark.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? safeTop : 0}
      >
      <ScrollView ref={scrollViewRef} contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {analysisStatus === 'processing' && (
          <View style={styles.analysisPendingCard}>
            <View style={styles.analysisPendingHeader}>
              <ActivityIndicator size="small" color={theme.colors.primary[400]} />
              <Text style={styles.analysisPendingTitle}>AI 분석 진행 중</Text>
            </View>
            <Text style={styles.analysisPendingDesc}>
              사진을 분석하고 마케팅 소스를 생성하고 있습니다. 잠시만 기다려주시면 결과가 자동으로 표시됩니다.
            </Text>
            <Text style={styles.analysisPendingHint}>
              대기 중에 다른 탭(제휴 링크, 성과 분석 등)을 자유롭게 이용할 수 있어요.
            </Text>
          </View>
        )}
        {analysisStatus === 'error' && (
          <View style={styles.analysisErrorCard}>
            <CircleAlert size={18} color={theme.colors.error[400]} strokeWidth={2} />
            <Text style={styles.analysisErrorTitle}>AI 분석 실패</Text>
            <Text style={styles.analysisErrorDesc}>
              {analysisError || '분석 중 오류가 발생했습니다. 다시 시도해주세요.'}
            </Text>
            <TouchableOpacity
              style={styles.analysisRetryBtn}
              onPress={async () => {
                if (scan?.analysis_job_id) {
                  setAnalysisStatus('processing');
                  setAnalysisError(null);
                  await supabase
                    .from('render_jobs')
                    .update({ status: 'queued', error_message: null })
                    .eq('id', scan.analysis_job_id);
                  setRetryCount((c) => c + 1);
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.analysisRetryText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* === 1순위: 미리보기 (동영상: 자동 완성 영상 / 이미지: 대형 프리뷰 + 썸네일 스트립) === */}
        <ResultPreviewSection
          mediaUrl={generatedVideoUrl}
          mediaType={targetMediaType}
          generatedImages={generatedImages}
          selectedImageIndex={selectedImageIndex}
          onSelectImage={setSelectedImageIndex}
          onOpenImageViewer={(idx) => { setImageViewerIndex(idx); setImageViewerVisible(true); }}
          isProcessing={isGeneratingVideo || isGeneratingImage}
          progressMessage={videoGenProgress?.message ?? imageGenProgress?.message ?? ''}
          isGeneratingVideo={isGeneratingVideo}
          isGeneratingImage={isGeneratingImage}
          isRegenerating={isRegenerating}
          visionAnalyzing={visionAnalyzing}
          videoGenProgress={videoGenProgress}
          imageGenProgress={imageGenProgress}
          bgJobNotice={bgJobNotice}
          onDismissBgJobNotice={() => setBgJobNotice(null)}
          videoGenError={videoGenError}
          imageGenError={imageGenError}
          onRetryVideo={() => handleAiVideoGenerate()}
          onRetryImage={() => handleAiImageGenerate()}
          onDismissVideoError={() => setVideoGenError(null)}
          onDismissImageError={() => setImageGenError(null)}
          previewEditPlan={previewEditPlan}
          narrativePlan={narrativePlan}
          bgmVolume={bgmVolume}
          copyOverlays={copyOverlaysForPreview}
          narrationActive={narrationPlaying}
          ttsUrl={ttsUrl ?? scan?.tts_url ?? null}
          onDownload={handleSaveVideo}
        />

        {/* === 2순위: 플랫폼 선택 === */}
        <View style={styles.targetPlatformSection}>
          <View style={styles.targetPlatformHeader}>
            <MonitorPlay size={14} color={theme.colors.primary[300]} strokeWidth={2} />
            <Text style={styles.targetPlatformLabel}>이 영상을 어디에 올릴 건가요?</Text>
          </View>
          <View style={styles.mediaTypeRow}>
            <TouchableOpacity
              style={[styles.mediaTypeBtn, targetMediaType === 'video' && styles.mediaTypeBtnActive]}
              onPress={() => handleMediaTypeChange('video')}
              activeOpacity={0.7}
            >
              <VideoIcon size={15} color={targetMediaType === 'video' ? theme.colors.primary[300] : theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={[styles.mediaTypeBtnText, targetMediaType === 'video' && styles.mediaTypeBtnTextActive]}>
                동영상
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mediaTypeBtn, targetMediaType === 'image' && styles.mediaTypeBtnActive]}
              onPress={() => handleMediaTypeChange('image')}
              activeOpacity={0.7}
            >
              <ImageIcon size={15} color={targetMediaType === 'image' ? theme.colors.primary[300] : theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={[styles.mediaTypeBtnText, targetMediaType === 'image' && styles.mediaTypeBtnTextActive]}>
                이미지
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.targetPlatformScroll}>
            {(targetMediaType === 'video' ? VIDEO_PLATFORM_LIST : IMAGE_PLATFORM_LIST).map((p) => {
              const isActive = targetPlatform === p.key;
              const Icon = p.icon;
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.targetPlatformChip, isActive && { backgroundColor: p.color + '20', borderColor: p.color }]}
                  onPress={() => handleTargetPlatformChange(p.key)}
                  activeOpacity={0.7}
                >
                  <Icon size={15} color={isActive ? p.color : theme.colors.dark.textDim} strokeWidth={2} />
                  <Text style={[styles.targetPlatformChipText, isActive && { color: p.color }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={styles.targetPlatformHint}>
            {TARGET_PLATFORM_PRESETS[targetPlatform].algorithmHint}
          </Text>
        </View>

        {/* === 프롬프트 입력 + AI 자동 생성 + 상세 수동 설정 === */}
        <View style={styles.quickPromptSection}>
          <View style={styles.quickPromptHeader}>
            <Wand2 size={14} color={theme.colors.primary[300]} strokeWidth={2} />
            <Text style={styles.quickPromptLabel}>연출 프롬프트</Text>
          </View>
          <TextInput
            style={styles.quickPromptInput}
            value={inlineEdit.aiPrompt}
            onChangeText={(text) => handleInlineEdit({ aiPrompt: text })}
            placeholder="예: 캐주얼한 스트릿 패션, 밝고 화사한 스튜디오 배경"
            placeholderTextColor={theme.colors.dark.textFaint}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />
        </View>
        <View style={styles.dualActionRow}>
          <TouchableOpacity
            style={[styles.dualActionBtn, styles.dualActionPrimary, ((targetMediaType === 'video' ? (isGeneratingVideo || videoStage === 'drafting' || videoStage === 'hd_upgrading') : isGeneratingImage) || !scan) && styles.dualActionDisabled]}
            onPress={() => targetMediaType === 'video' ? handleAiVideoGenerate() : handleAiImageGenerate()}
            disabled={(targetMediaType === 'video' ? (isGeneratingVideo || videoStage === 'drafting' || videoStage === 'hd_upgrading') : isGeneratingImage) || !scan}
            activeOpacity={0.7}
          >
            {(targetMediaType === 'video' ? (isGeneratingVideo || videoStage === 'drafting' || videoStage === 'hd_upgrading') : isGeneratingImage) ? (
              <RotatingLoader size={18} color="#fff" />
            ) : (
              <ZapIcon size={18} color="#fff" strokeWidth={2} />
            )}
            <Text style={styles.dualActionBtnText} numberOfLines={1}>
              {targetMediaType === 'video'
                ? ((isGeneratingVideo || videoStage === 'drafting' || videoStage === 'hd_upgrading')
                  ? (videoGenProgress?.phase === 'submitting' ? '요청 중...'
                    : videoStage === 'hd_upgrading' ? '고화질 업그레이드 중...'
                    : generatedVideoUrl ? '고화질 대기 중...' : '렌더링 중...')
                  : 'AI 자동 생성')
                : (isGeneratingImage ? (imageGenProgress ? `${Math.round(imageGenProgress.progress * 100)}% 생성 중...` : '5장 생성 중...') : 'AI 자동 생성 (5장)')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dualActionBtn, styles.dualActionSecondary, showManualSettings && styles.dualActionSecondaryActive]}
            onPress={() => setShowManualSettings((v) => !v)}
            activeOpacity={0.7}
          >
            <SlidersIcon size={18} color={showManualSettings ? theme.colors.accent[300] : theme.colors.dark.textDim} strokeWidth={2} />
            <Text
              style={[styles.dualActionBtnTextSecondary, showManualSettings && { color: theme.colors.accent[300] }]}
              numberOfLines={1}
            >
              상세 수동 설정
            </Text>
            {showManualSettings ? (
              <ChevronUp size={16} color={theme.colors.accent[300]} strokeWidth={2} />
            ) : (
              <ChevronDown size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
            )}
          </TouchableOpacity>
        </View>

        {generatedVideoUrl && targetMediaType === 'video' && (
          <>
          {videoStage === 'hd_upgrading' && (
            <View style={styles.hdUpgradingBanner}>
              <RotatingLoader size={14} color={theme.colors.accent[300]} strokeWidth={2} />
              <Text style={styles.hdUpgradingText}>
                고화질 업그레이드 진행 중 — 초안을 먼저 확인하세요
              </Text>
            </View>
          )}
          {videoStage === 'hd_ready' && (
            <View style={styles.hdReadyBanner}>
              <CheckCircle2 size={14} color={theme.colors.success[400]} strokeWidth={2} />
              <Text style={styles.hdReadyText}>
                고화질 영상으로 교체 완료
              </Text>
            </View>
          )}
          {videoStage === 'draft_ready' && (
            <View style={styles.draftBadgeRow}>
              <Text style={styles.draftBadgeText}>초안 미리보기</Text>
            </View>
          )}
          <View style={styles.dualActionRow}>
            <TouchableOpacity
              style={[styles.dualActionBtn, styles.aiVideoBtn]}
              onPress={handleSaveVideo}
              disabled={uploadProgress !== null}
              activeOpacity={0.7}
            >
              {uploadProgress !== null ? (
                <Loader2Icon size={18} color={theme.colors.primary[300]} strokeWidth={2} />
              ) : (
                <Download size={18} color={theme.colors.primary[300]} strokeWidth={2} />
              )}
              <Text style={styles.aiVideoBtnText} numberOfLines={1}>
                {uploadProgress !== null ? '영상 저장 중...' : 'AI 영상 갤러리에 저장'}
              </Text>
            </TouchableOpacity>
          </View>
          </>
        )}

        {showManualSettings && (
        <>
        {/* 목적 선택 */}
        <View style={styles.targetPlatformSection}>
          <View style={styles.purposeRow}>
            <Text style={styles.purposeLabel}>목적</Text>
            {CONTENT_PURPOSE_LIST.map((p) => {
              const isActive = contentPurpose === p.key;
              const Icon = p.icon;
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.purposeChip, isActive && { backgroundColor: p.color + '20', borderColor: p.color }]}
                  onPress={() => handleContentPurposeChange(p.key)}
                  activeOpacity={0.7}
                >
                  <Icon size={12} color={isActive ? p.color : theme.colors.dark.textDim} strokeWidth={2} />
                  <Text style={[styles.purposeChipText, isActive && { color: p.color }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.strategyHint}>
            {CONTENT_PURPOSE_PRESETS[contentPurpose].strategyLabel}
          </Text>
        </View>

        {/* Quick-Tweak 정보 입력 */}
        <QuickTweakPanel
          hook={activeHook}
          productName={activeProductName}
          priceEstimate={activePriceEstimate}
          shortUrl={shortUrl}
          onHookChange={(h) => setHookOverride(h)}
          onProductNameChange={(name) => {
            if (scan) {
              supabase.from('scans').update({ product_name: name }).eq('id', scan.id).then(() => {}, () => {});
              setScan({ ...scan, product_name: name });
            }
          }}
          onPriceChange={(price) => setPriceOverride(price)}
        />

        {/* Quick-Tweak 편집 세팅 — 동영상 모드 전용 */}
        {targetMediaType === 'video' && (
        <View style={styles.chipSection}>
          {/* 영상 길이 선택 */}
          <View style={styles.durationSelectorRow}>
            <Text style={styles.durationSelectorLabel}>영상 길이</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.durationScroll}>
              {DURATION_PRESETS.map((p) => {
                const isActive = selectedDurationMs === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    style={[styles.durationChip, isActive && styles.durationChipActive]}
                    onPress={() => setSelectedDurationMs(p.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.durationChipText, isActive && styles.durationChipTextActive]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Clean Video Mode Toggle */}
          <View style={styles.cleanVideoToggleRow}>
            <View style={styles.cleanVideoToggleLeft}>
              <SparklesIcon size={14} color={theme.colors.accent[300]} strokeWidth={2} />
              <View style={styles.cleanVideoToggleTextWrap}>
                <Text style={styles.cleanVideoToggleLabel}>마케팅 텍스트/효과 제외 (Clean Video)</Text>
                <Text style={styles.cleanVideoToggleDesc}>
                  후킹 문구, 자막, 나레이션, BGM 추천 없이 순수 비주얼만 생성
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.cleanVideoSwitch, isCleanVideoMode && styles.cleanVideoSwitchActive]}
              onPress={() => setIsCleanVideoMode((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={[styles.cleanVideoSwitchKnob, isCleanVideoMode && styles.cleanVideoSwitchKnobActive]} />
            </TouchableOpacity>
          </View>

          {/* BGM 분위기 — hidden in Clean Video mode */}
          {!isCleanVideoMode && (
          <View style={styles.chipGroup}>
            <View style={styles.chipGroupHeader}>
              <FilmIcon size={14} color={theme.colors.accent[300]} strokeWidth={2} />
              <Text style={styles.chipGroupLabel}>BGM 분위기</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {['하이텐션', '시네마틱', 'ASMR', '감성', '로파이'].map((mood) => (
                <TouchableOpacity
                  key={mood}
                  style={[styles.chipPill, inlineEdit.bgmMood === mood && styles.chipPillActive]}
                  onPress={() => handleInlineEdit({ bgmMood: mood })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipPillText, inlineEdit.bgmMood === mood && styles.chipPillTextActive]}>
                    {mood}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          )}

          {/* AI Narration — hidden in Clean Video mode */}
          {!isCleanVideoMode && (
          <>
          <NarrationPlayer
            ttsUrl={ttsUrl ?? scan?.tts_url ?? null}
            ttsLoading={!scan?.tts_url && !ttsUrl && !!scan?.analysis_job_id}
            narrationText={activeHook || activeOneLiner || scan?.summary || ''}
            onPlayStateChange={setNarrationPlaying}
          />

          <HumanTtsProfileCard
            narrationText={activeHook || activeOneLiner || scan?.summary || ''}
            moodLabel={inlineEdit.bgmMood || '트렌디'}
            totalDurationSec={15}
          />

          <ViralFormulaCard totalDurationSec={15} />

          <AutoHookSubtitleCard
            productName={activeProductName}
            productCategory={scan?.detected_products?.[selectedProductIndex]?.productCategory}
            customPrompt={inlineEdit.aiPrompt}
            narrationText={activeHook || activeOneLiner || scan?.summary || ''}
          />
          </>
          )}

          {/* 한 줄 후킹 편집 바 + 상세 자막 토글 — hidden in Clean Video mode */}
          {!isCleanVideoMode && (
          <>
          <View style={styles.hookEditBar}>
            <TextInput
              style={styles.hookEditInput}
              value={hookOverride ?? activeHook}
              onChangeText={(text) => setHookOverride(text)}
              placeholder="후킹 멘트를 여기서 바로 수정하세요"
              placeholderTextColor={theme.colors.dark.textFaint}
              numberOfLines={1}
            />
            {hookOverride && hookOverride !== activeHook && (
              <TouchableOpacity
                style={styles.hookEditReset}
                onPress={() => setHookOverride(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.hookEditResetText}>원본</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.hookEditReset, showAdvancedCaption && { backgroundColor: theme.colors.accent[400] + '20' }]}
              onPress={() => setShowAdvancedCaption((v) => !v)}
              activeOpacity={0.7}
            >
              <PenLine size={13} color={showAdvancedCaption ? theme.colors.accent[300] : theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={[styles.hookEditResetText, showAdvancedCaption && { color: theme.colors.accent[300] }]}>자막</Text>
            </TouchableOpacity>
          </View>

          {/* 상세 자막/폰트 편집 (접이식) */}
          {showAdvancedCaption && (
            <View style={styles.advancedPanel}>
              <Text style={styles.advancedPanelLabel}>자막 스타일</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {['고딕 굵게', '명조 우아', '손글씨 캐주얼', '미니멀 얇게', '스포츠 강조'].map((font) => (
                  <TouchableOpacity
                    key={font}
                    style={[styles.chipPill, inlineEdit.captionFont === font && styles.chipPillActive]}
                    onPress={() => handleInlineEdit({ captionFont: font })}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipPillText, inlineEdit.captionFont === font && styles.chipPillTextActive]}>
                      {font}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={[styles.advancedPanelLabel, { marginTop: 8 }]}>자막 위치</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {['하단 고정', '상단 고정', '중앙', '하단 + 상단 번갈', '좌측 세로'].map((pos) => (
                  <TouchableOpacity
                    key={pos}
                    style={[styles.chipPill, inlineEdit.captionPosition === pos && styles.chipPillActive]}
                    onPress={() => handleInlineEdit({ captionPosition: pos })}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipPillText, inlineEdit.captionPosition === pos && styles.chipPillTextActive]}>
                      {pos}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          </>
          )}
        </View>
        )}

          {/* 고급 카메라 모션 수동 설정 (접이식) — 동영상 모드 전용 */}
          {targetMediaType === 'video' && (
          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowAdvancedCamera((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={styles.detailToggleLeft}>
              <CameraIcon size={14} color={theme.colors.accent[300]} strokeWidth={2} />
              <Text style={styles.advancedToggleText}>고급 카메라 모션 수동 설정</Text>
            </View>
            {showAdvancedCamera ? (
              <ChevronUp size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
            ) : (
              <ChevronDown size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
            )}
          </TouchableOpacity>
          )}
          {showAdvancedCamera && targetMediaType === 'video' && (
            <View style={styles.advancedPanel}>
              <Text style={styles.advancedPanelLabel}>카메라 워킹</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {['AI 자동', '돌리 인', '돌리 아웃', '오비탈', '카운터 줌', '고정 샷', '핸드헬드'].map((motion) => (
                  <TouchableOpacity
                    key={motion}
                    style={[styles.chipPill, cameraMotion === motion && styles.chipPillActive]}
                    onPress={() => setCameraMotion(motion)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipPillText, cameraMotion === motion && styles.chipPillTextActive]}>
                      {motion}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={[styles.advancedPanelLabel, { marginTop: 8 }]}>영상 템플릿</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {['트렌디 쇼핑', '라이프스타일', '제품 집중', '스토리텔링', 'ASMR 리뷰'].map((tmpl) => (
                  <TouchableOpacity
                    key={tmpl}
                    style={[styles.chipPill, inlineEdit.videoTemplate === tmpl && styles.chipPillActive]}
                    onPress={() => handleInlineEdit({ videoTemplate: tmpl })}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipPillText, inlineEdit.videoTemplate === tmpl && styles.chipPillTextActive]}>
                      {tmpl}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 음량/믹싱 수동 조절 (접이식) — 동영상 모드 전용 */}
          {targetMediaType === 'video' && (
          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowAdvancedAudio((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={styles.detailToggleLeft}>
              <AudioLines size={14} color={theme.colors.accent[300]} strokeWidth={2} />
              <Text style={styles.advancedToggleText}>음량 / 믹싱 비율 수동 조절</Text>
            </View>
            {showAdvancedAudio ? (
              <ChevronUp size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
            ) : (
              <ChevronDown size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
            )}
          </TouchableOpacity>
          )}
          {showAdvancedAudio && targetMediaType === 'video' && (
            <View style={styles.advancedPanel}>
              <View style={styles.volumeSliderRow}>
                <Text style={styles.volumeSliderLabel}>BGM 음량</Text>
                <Text style={styles.volumeSliderValue}>{Math.round(bgmVolume * 100)}%</Text>
              </View>
              <View style={styles.volumeSliderTrack}>
                <TouchableOpacity
                  style={[styles.volumeSliderFill, { width: `${bgmVolume * 100}%` }]}
                  activeOpacity={1}
                />
              </View>
              <View style={styles.volumeSliderBtns}>
                <TouchableOpacity onPress={() => setBgmVolume((v) => Math.max(0, v - 0.1))} activeOpacity={0.7}>
                  <Text style={styles.volumeSliderBtnText}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setBgmVolume((v) => Math.min(1, v + 0.1))} activeOpacity={0.7}>
                  <Text style={styles.volumeSliderBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* AI 범용 합성 전용 수동 설정 */}
          <View style={styles.synthManualSection}>
            <View style={styles.synthManualHeader}>
              <SlidersIcon size={14} color={theme.colors.accent[300]} strokeWidth={2} />
              <Text style={styles.synthManualTitle}>AI 범용 합성 상세 설정</Text>
              <View style={[styles.synthModeBadge, targetMediaType === 'video' ? styles.synthModeBadgeVideo : styles.synthModeBadgeImage]}>
                <Text style={styles.synthModeBadgeText}>{targetMediaType === 'video' ? '동영상' : '이미지'}</Text>
              </View>
            </View>

            {/* 프롬프트 가중치 (Prompt Strength) */}
            <View style={styles.synthInputGroup}>
              <View style={styles.synthSliderHeader}>
                <Text style={styles.synthInputLabel}>프롬프트 반영 강도</Text>
                <Text style={styles.synthSliderValue}>{promptStrength}/10</Text>
              </View>
              <View style={styles.synthSliderTrack}>
                <View style={[styles.synthSliderFill, { width: `${(promptStrength / 10) * 100}%` }]} />
                {[1, 3, 5, 7, 10].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.synthSliderTick, promptStrength === val && styles.synthSliderTickActive]}
                    onPress={() => setPromptStrength(val)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.synthSliderTickLabel}>{val}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.synthHint}>
                {promptStrength >= 8 ? '입력한 프롬프트를 최대한 그대로 반영' : promptStrength <= 4 ? 'AI가 창의적으로 자유롭게 해석' : '프롬프트와 창의성의 균형'}
              </Text>
            </View>

            {/* 네거티브 프롬프트 */}
            <View style={styles.synthInputGroup}>
              <Text style={styles.synthInputLabel}>제외할 요소 (네거티브 프롬프트)</Text>
              <TextInput
                style={styles.synthNegInput}
                value={negativePrompt}
                onChangeText={setNegativePrompt}
                placeholder="예: 흐림, 로고, 텍스트, 특정 색상 등 제외할 요소"
                placeholderTextColor={theme.colors.dark.textFaint}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* 배경 스타일 칩 */}
            <View style={styles.synthInputGroup}>
              <Text style={styles.synthInputLabel}>배경 스타일</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {['자동', '스튜디오', '야외', '빈티지', '미니멀', '카페', '도시'].map((bg) => (
                  <TouchableOpacity
                    key={bg}
                    style={[styles.chipPill, bgStyle === bg && styles.chipPillActive]}
                    onPress={() => setBgStyle(bg)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipPillText, bgStyle === bg && styles.chipPillTextActive]}>
                      {bg}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* 의상/스타일 변환 강도 */}
            <View style={styles.synthInputGroup}>
              <View style={styles.synthSliderHeader}>
                <Text style={styles.synthInputLabel}>의상/스타일 변환 강도</Text>
                <Text style={styles.synthSliderValue}>{outfitIntensity}/5</Text>
              </View>
              <View style={styles.synthSliderTrack}>
                <View style={[styles.synthSliderFill, { width: `${(outfitIntensity / 5) * 100}%` }]} />
                {[1, 2, 3, 4, 5].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.synthSliderTick, outfitIntensity === val && styles.synthSliderTickActive]}
                    onPress={() => setOutfitIntensity(val)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.synthSliderTickLabel}>{val}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.synthHint}>
                {outfitIntensity >= 4 ? '드라마틱한 스타일 변화' : outfitIntensity <= 2 ? '자연스러운 미묘한 변화' : '중간 수준의 스타일 조정'}
              </Text>
            </View>

            {/* === 이미지 모드 전용 컨트롤 === */}
            {targetMediaType === 'image' && (
            <>
            {/* 이미지 규격 (Aspect Ratio) */}
            <View style={styles.synthInputGroup}>
              <Text style={styles.synthInputLabel}>이미지 규격 (비율)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {[
                  { id: '1:1', label: '1:1 · 인스타 피드' },
                  { id: '4:5', label: '4:5 · 인스타 세로' },
                  { id: '9:16', label: '9:16 · 스토리/릴스' },
                  { id: '16:9', label: '16:9 · 블로그/배너' },
                ].map((ar) => (
                  <TouchableOpacity
                    key={ar.id}
                    style={[styles.chipPill, imageAspectRatio === ar.id && styles.chipPillActive]}
                    onPress={() => setImageAspectRatio(ar.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipPillText, imageAspectRatio === ar.id && styles.chipPillTextActive]}>
                      {ar.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* 스타일 프리셋 (Visual Style Preset) */}
            <View style={styles.synthInputGroup}>
              <Text style={styles.synthInputLabel}>스타일 무드 프리셋</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {[
                  { id: 'clean-studio', label: '상업용 스튜디오' },
                  { id: 'editorial-film', label: '감성 필름/매거진' },
                  { id: 'minimalist-soft', label: '미니멀 소프트' },
                  { id: 'luxury-dark', label: '럭셔리 시네마틱' },
                ].map((sp) => (
                  <TouchableOpacity
                    key={sp.id}
                    style={[styles.chipPill, stylePreset === sp.id && styles.chipPillActive]}
                    onPress={() => setStylePreset(sp.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipPillText, stylePreset === sp.id && styles.chipPillTextActive]}>
                      {sp.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.synthHint}>
                {stylePreset === 'clean-studio' ? '균일한 스튜디오 조명, 깔끔한 상업용 톤' :
                 stylePreset === 'editorial-film' ? '필름 그레인, 매거진 에디토리얼 무드' :
                 stylePreset === 'minimalist-soft' ? '파스텔 톤, 여백이 많은 미니멀 감성' :
                 '딥 블랙, 시네마틱 명암 대비, 럭셔리 분위기'}
              </Text>
            </View>

            {/* 디테일 보정 토글 */}
            <View style={styles.synthToggleRow}>
              <View style={styles.synthToggleLeft}>
                <Text style={styles.synthInputLabel}>인물/상품 디테일 보정</Text>
                <Text style={styles.synthHint}>손가락·인체 왜곡, 텍스처 뭉개짐 방지</Text>
              </View>
              <TouchableOpacity
                style={[styles.synthToggleSwitch, detailRestoration && styles.synthToggleSwitchActive]}
                onPress={() => setDetailRestoration((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={[styles.synthToggleKnob, detailRestoration && styles.synthToggleKnobActive]} />
              </TouchableOpacity>
            </View>

            {/* HD 업스케일 토글 */}
            <View style={styles.synthToggleRow}>
              <View style={styles.synthToggleLeft}>
                <Text style={styles.synthInputLabel}>고해상도 업스케일링 (HD)</Text>
                <Text style={styles.synthHint}>최종 결과물 선명도·해상도 향상</Text>
              </View>
              <TouchableOpacity
                testID="hd-upscale-toggle"
                style={[styles.synthToggleSwitch, hdUpscale && styles.synthToggleSwitchActive]}
                onPress={() => setHdUpscale((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={[styles.synthToggleKnob, hdUpscale && styles.synthToggleKnobActive]} />
              </TouchableOpacity>
            </View>
            </>
            )}

            {/* 카메라 무빙 및 연출 효과 — 동영상 모드 전용 */}
            {targetMediaType === 'video' && (
            <>
            {/* 카메라 무빙: 줌 속도 */}
            <View style={styles.synthInputGroup}>
              <View style={styles.synthSliderHeader}>
                <Text style={styles.synthInputLabel}>줌인/줌아웃 속도</Text>
                <Text style={styles.synthSliderValue}>{zoomSpeed.toFixed(1)}x</Text>
              </View>
              <View style={styles.synthSliderTrack}>
                <View style={[styles.synthSliderFill, { width: `${((zoomSpeed - 0.5) / 4.5) * 100}%` }]} />
                {[0.5, 1, 2, 3, 5].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.synthSliderTick, zoomSpeed === val && styles.synthSliderTickActive]}
                    onPress={() => setZoomSpeed(val)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.synthSliderTickLabel}>{val.toFixed(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 카메라 회전 각도 */}
            <View style={styles.synthInputGroup}>
              <View style={styles.synthSliderHeader}>
                <Text style={styles.synthInputLabel}>카메라 회전 각도</Text>
                <Text style={styles.synthSliderValue}>{cameraRotation > 0 ? `+${cameraRotation}°` : `${cameraRotation}°`}</Text>
              </View>
              <View style={styles.synthSliderTrack}>
                <View style={[styles.synthSliderFill, { width: `${((cameraRotation + 30) / 60) * 100}%` }]} />
                {[-30, -15, 0, 15, 30].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.synthSliderTick, cameraRotation === val && styles.synthSliderTickActive]}
                    onPress={() => setCameraRotation(val)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.synthSliderTickLabel}>{val > 0 ? `+${val}` : val}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 전환 효과 */}
            <View style={styles.synthInputGroup}>
              <Text style={styles.synthInputLabel}>전환 효과 (숏폼 전용)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {['컷 전환', '크로스페이드', '와이프', '줌 전환', '플래시', '슬로우 모션'].map((eff) => (
                  <TouchableOpacity
                    key={eff}
                    style={[styles.chipPill, transitionEffect === eff && styles.chipPillActive]}
                    onPress={() => setTransitionEffect(eff)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipPillText, transitionEffect === eff && styles.chipPillTextActive]}>
                      {eff}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* 고화질 PRO 생성 토글 — 동영상 모드 전용 */}
            <View style={styles.synthToggleRow}>
              <View style={styles.synthToggleLeft}>
                <Text style={styles.synthInputLabel}>고화질 PRO 생성 (HD Upscale)</Text>
                <Text style={styles.synthHint}>
                  {hdUpscale ? '초안 생성 후 자동으로 고화질 업그레이드 진행' : '빠른 일화질 생성 (업그레이드 미포함)'}
                </Text>
              </View>
              <TouchableOpacity
                testID="hd-upscale-toggle"
                style={[styles.synthToggleSwitch, hdUpscale && styles.synthToggleSwitchActive]}
                onPress={() => setHdUpscale((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={[styles.synthToggleKnob, hdUpscale && styles.synthToggleKnobActive]} />
              </TouchableOpacity>
            </View>
            </>
            )}
          </View>

          {/* AI 가상 영상 프롬프트 — 동영상 모드 전용 */}
          {targetMediaType === 'video' && (
          <>
          <View style={styles.promptHeader}>
            <Wand2 size={16} color={theme.colors.primary[300]} strokeWidth={2} />
            <Text style={styles.promptTitle}>AI 가상 영상 프롬프트</Text>
          </View>
          <TextInput
            style={styles.promptInput}
            value={inlineEdit.aiPrompt}
            onChangeText={(text) => handleInlineEdit({ aiPrompt: text })}
            placeholder="원하는 연출 분위기나 강조 사항을 입력하세요"
            placeholderTextColor={theme.colors.dark.textFaint}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.promptGenBtn, ((isGeneratingVideo || videoStage === 'drafting' || videoStage === 'hd_upgrading') || !scan) && styles.dualActionDisabled]}
            onPress={() => handleAiVideoGenerate()}
            disabled={(isGeneratingVideo || videoStage === 'drafting' || videoStage === 'hd_upgrading') || !scan}
            activeOpacity={0.7}
          >
            {(isGeneratingVideo || videoStage === 'drafting' || videoStage === 'hd_upgrading') ? (
              <RotatingLoader size={18} color="#fff" />
            ) : (
              <SparklesIcon size={18} color="#fff" strokeWidth={2} />
            )}
            <Text style={styles.promptGenBtnText} numberOfLines={1}>
              {(isGeneratingVideo || videoStage === 'drafting' || videoStage === 'hd_upgrading')
                ? (videoStage === 'hd_upgrading' ? '고화질 업그레이드 중...' : 'AI 영상 생성 중...')
                : 'AI 자동 생성'}
            </Text>
          </TouchableOpacity>
          </>
          )}

          {/* AI 이미지 프롬프트 — 이미지 모드 전용 */}
          {targetMediaType === 'image' && (
          <>
          <View style={styles.promptHeader}>
            <Wand2 size={16} color={theme.colors.accent[300]} strokeWidth={2} />
            <Text style={styles.promptTitle}>AI 이미지 프롬프트 (5장 병렬 생성)</Text>
          </View>
          <TextInput
            style={styles.promptInput}
            value={inlineEdit.aiPrompt}
            onChangeText={(text) => handleInlineEdit({ aiPrompt: text })}
            placeholder="원하는 연출 분위기나 강조 사항을 입력하세요"
            placeholderTextColor={theme.colors.dark.textFaint}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.promptGenBtn, (isGeneratingImage || !scan) && styles.dualActionDisabled]}
            onPress={() => handleAiImageGenerate()}
            disabled={isGeneratingImage || !scan}
            activeOpacity={0.7}
          >
            {isGeneratingImage ? (
              <RotatingLoader size={18} color="#fff" />
            ) : (
              <SparklesIcon size={18} color="#fff" strokeWidth={2} />
            )}
            <Text style={styles.promptGenBtnText} numberOfLines={1}>
              {isGeneratingImage ? (imageGenProgress ? `${Math.round(imageGenProgress.progress * 100)}% 생성 중...` : '5장 생성 중...') : 'AI 5장 자동 생성'}
            </Text>
          </TouchableOpacity>
          </>
          )}

        </>
        )}

        {/* === 5각도 원본 컷 풀스크린 뷰어 === */}
        <Modal visible={galleryModalVisible} transparent animationType="fade" onRequestClose={() => setGalleryModalVisible(false)}>
          <View style={styles.galleryModalOverlay}>
            <View style={styles.galleryModalContent}>
              <View style={styles.galleryModalHeader}>
                <Text style={styles.galleryModalTitle} numberOfLines={1}>
                  {['정면', '좌측', '우측', '후면', '상부'][galleryModalIndex] ?? `컷 ${galleryModalIndex + 1}`} 컷
                </Text>
                <TouchableOpacity style={styles.galleryModalCloseBtn} onPress={() => setGalleryModalVisible(false)} activeOpacity={0.7}>
                  <X size={20} color="#fff" strokeWidth={2} />
                </TouchableOpacity>
              </View>
              <Image
                source={{ uri: allCutImages[galleryModalIndex] ?? allCutImages[0] }}
                style={styles.galleryModalImage}
                resizeMode="contain"
              />
              <View style={styles.galleryModalActions}>
                <TouchableOpacity
                  style={styles.galleryModalActionBtn}
                  onPress={() => {
                    setGalleryModalVisible(false);
                    router.push(`/editor?id=${scan.id}`);
                  }}
                  activeOpacity={0.7}
                >
                  <Pencil size={15} color={theme.colors.dark.text} strokeWidth={2} />
                  <Text style={styles.galleryModalActionText}>이 컷 수정</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.galleryModalActionBtn, styles.galleryModalActionPrimary]}
                  onPress={() => {
                    setGalleryModalVisible(false);
                    router.push('/(tabs)/index');
                  }}
                  activeOpacity={0.7}
                >
                  <CameraIcon size={15} color="#fff" strokeWidth={2} />
                  <Text style={[styles.galleryModalActionText, { color: '#fff' }]}>재촬영</Text>
                </TouchableOpacity>
              </View>
              {allCutImages.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.galleryModalThumbScroll}
                  contentContainerStyle={styles.galleryModalThumbContent}
                >
                  {allCutImages.map((imgUrl, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => setGalleryModalIndex(idx)}
                      activeOpacity={0.85}
                    >
                      <Image
                        source={{ uri: getThumbnailUrl(imgUrl, 120) }}
                        style={[
                          styles.galleryModalThumb,
                          idx === galleryModalIndex && styles.galleryModalThumbActive,
                        ]}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* === AI 생성 이미지 풀스크린 뷰어 === */}
        <Modal visible={imageViewerVisible} transparent animationType="fade" onRequestClose={() => setImageViewerVisible(false)}>
          <View style={styles.galleryModalOverlay}>
            <View style={styles.galleryModalContent}>
              <View style={styles.galleryModalHeader}>
                <Text style={styles.galleryModalTitle} numberOfLines={1}>
                  AI 이미지 {imageViewerIndex + 1} / {generatedImages.length}
                </Text>
                <TouchableOpacity style={styles.galleryModalCloseBtn} onPress={() => setImageViewerVisible(false)} activeOpacity={0.7}>
                  <X size={20} color="#fff" strokeWidth={2} />
                </TouchableOpacity>
              </View>
              <Image
                source={{ uri: generatedImages[imageViewerIndex] ?? generatedImages[0] }}
                style={styles.galleryModalImage}
                resizeMode="contain"
              />
              <View style={styles.galleryModalActions}>
                <TouchableOpacity
                  style={styles.galleryModalActionBtn}
                  onPress={async () => {
                    const uri = generatedImages[imageViewerIndex];
                    if (!uri) return;
                    try {
                      const fileUri = `${FileSystem.documentDirectory}ai_image_${Date.now()}.png`;
                      const base64 = uri.split(',')[1] ?? '';
                      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
                      await MediaLibrary.saveToLibraryAsync(fileUri);
                    } catch { /* non-fatal */ }
                  }}
                  activeOpacity={0.7}
                >
                  <Download size={15} color={theme.colors.dark.text} strokeWidth={2} />
                  <Text style={styles.galleryModalActionText}>저장</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.galleryModalActionBtn, styles.galleryModalActionPrimary]}
                  onPress={async () => {
                    const uri = generatedImages[imageViewerIndex];
                    if (!uri) return;
                    try {
                      await RNShare.share({ url: uri });
                    } catch { /* non-fatal */ }
                  }}
                  activeOpacity={0.7}
                >
                  <Share2Icon size={15} color="#fff" strokeWidth={2} />
                  <Text style={[styles.galleryModalActionText, { color: '#fff' }]}>공유</Text>
                </TouchableOpacity>
              </View>
              {generatedImages.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.galleryModalThumbScroll}
                  contentContainerStyle={styles.galleryModalThumbContent}
                >
                  {generatedImages.map((imgUri, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => setImageViewerIndex(idx)}
                      activeOpacity={0.85}
                    >
                      <Image
                        source={{ uri: getThumbnailUrl(imgUri, 120) }}
                        style={[
                          styles.galleryModalThumb,
                          idx === imageViewerIndex && styles.galleryModalThumbActive,
                        ]}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        <View style={styles.body}>
          {detectedProducts.length > 1 && (
            <View style={styles.section}>
              <ProductSelector
                products={detectedProducts}
                selectedIndex={selectedProductIndex}
                onSelect={setSelectedProductIndex}
              />
            </View>
          )}

          {activePlatform === 'instagram' && (
            <View style={styles.section}>
              <ReviewInput
                review={scan.custom_review?.text ? scan.custom_review : null}
                onSave={async (newReview: CustomReview) => {
                  setReviewSaving(true);
                  try {
                    const { error: reviewError } = await supabase
                      .from('scans')
                      .update({ custom_review: newReview })
                      .eq('id', scan.id);
                    if (reviewError) throw reviewError;
                    setScan({ ...scan, custom_review: newReview });
                  } catch (err) {
                    setError(friendlyError(err, '후기 저장에 실패했습니다. 다시 시도해주세요.'));
                  }
                  setReviewSaving(false);
                }}
                onClear={async () => {
                  setReviewSaving(true);
                  try {
                    const { error: reviewError } = await supabase
                      .from('scans')
                      .update({ custom_review: null })
                      .eq('id', scan.id);
                    if (reviewError) throw reviewError;
                    setScan({ ...scan, custom_review: null });
                  } catch (err) {
                    setError(friendlyError(err, '후기 삭제에 실패했습니다. 다시 시도해주세요.'));
                  }
                  setReviewSaving(false);
                }}
                productData={{
                  productName: activeProductName,
                  productCategory: selectedProduct?.productCategory || scan?.product_category || '',
                  priceEstimate: activePriceEstimate,
                  oneLiner: activeOneLiner,
                  hook: activeHook,
                  productAdvantages: td?.productAdvantages || [],
                }}
                brandPersona={settings?.brand_persona}
              />
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Flame size={16} color={theme.colors.warning[400]} strokeWidth={2} />
              <Text style={styles.sectionLabel}>AI 생성 결과</Text>
            </View>
            {td?.caption ? (
              <View style={styles.captionCard}>
                {activeHook ? (
                  <View style={styles.hookRow}>
                    <Text style={styles.hookText} numberOfLines={3}>{activeHook}</Text>
                    <TouchableOpacity style={styles.hookCopyBtn} onPress={handleCopyHook} activeOpacity={0.7}>
                      {hookCopied ? (
                        <Check size={13} color={theme.colors.success[400]} strokeWidth={2} />
                      ) : (
                        <Copy size={13} color={theme.colors.warning[400]} strokeWidth={2} />
                      )}
                      <Text style={[styles.hookCopyText, hookCopied && { color: theme.colors.success[400] }]}>
                        {hookCopied ? '복사됨' : '후킹 복사'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <Text style={styles.captionText}>{activeCaption}</Text>
                {td.productAdvantages && td.productAdvantages.length > 0 ? (
                  <View style={styles.metaChips}>
                    {td.productAdvantages.map((adv, i) => (
                      <View key={i} style={styles.metaChip}>
                        <Sparkles size={11} color={theme.colors.accent[300]} strokeWidth={2} />
                        <Text style={styles.metaChipText}>{adv}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {activeHashtags.length > 0 ? (
                  <View style={styles.hashtagRow}>
                    <Hash size={12} color={theme.colors.primary[300]} strokeWidth={2} />
                    <Text style={styles.hashtagText}>
                      {activeHashtags.map((h) => `#${h}`).join(' ')}
                    </Text>
                  </View>
                ) : null}
                {addedHashtags.length > 0 ? (
                  <View style={styles.addedHashtagRow}>
                    {addedHashtags.map((tag) => (
                      <TouchableOpacity
                        key={tag}
                        style={styles.addedHashtagChip}
                        onPress={() => handleRemoveTrendingHashtag(tag)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.addedHashtagText}>#{tag}</Text>
                        <X size={10} color={theme.colors.accent[300]} strokeWidth={2.5} />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                {trendingSuggestions.length > 0 ? (
                  <View style={styles.trendingHashtagSection}>
                    <View style={styles.trendingHashtagHeader}>
                      <TrendingUp size={12} color={theme.colors.accent[400]} strokeWidth={2} />
                      <Text style={styles.trendingHashtagLabel}>트렌딩 해시태그 추천</Text>
                    </View>
                    <View style={styles.trendingHashtagChips}>
                      {trendingSuggestions.map((tag) => (
                        <TouchableOpacity
                          key={tag}
                          style={styles.trendingHashtagChip}
                          onPress={() => handleAddTrendingHashtag(tag)}
                          activeOpacity={0.7}
                        >
                          <Plus size={9} color={theme.colors.accent[300]} strokeWidth={2.5} />
                          <Text style={styles.trendingHashtagChipText}>{tag}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.copyCaptionBtn} onPress={handleCopyCaption} activeOpacity={0.7}>
                  {captionCopied ? (
                    <Check size={14} color={theme.colors.success[400]} strokeWidth={2} />
                  ) : (
                    <Copy size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
                  )}
                  <Text style={[styles.copyCaptionText, captionCopied && { color: theme.colors.success[400] }]}>
                    {captionCopied ? '복사됨' : '카피 복사'}
                  </Text>
                </TouchableOpacity>
                {isLinkRestrictedPlatform && shortUrl ? (
                  <View style={styles.commentLinkBox}>
                    <View style={styles.commentLinkHint}>
                      <MessageCircle size={12} color={theme.colors.warning[400]} strokeWidth={2} />
                      <Text style={styles.commentLinkHintText}>
                        본문에 링크 직접 삽입 시 노출 제한(섀도우밴) 위험이 있어요. 댓글창에 링크를 남겨주세요.
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.copyLinkBtn} onPress={handleCopyCommentLink} activeOpacity={0.7}>
                      {linkCopied ? (
                        <Check size={13} color={theme.colors.success[400]} strokeWidth={2} />
                      ) : (
                        <Copy size={13} color={theme.colors.primary[300]} strokeWidth={2} />
                      )}
                      <Text style={[styles.copyLinkBtnText, linkCopied && { color: theme.colors.success[400] }]}>
                        {linkCopied ? '댓글용 링크 복사됨' : '댓글용 링크 복사'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* FeatureTileGrid hidden — marketing agent cards removed to streamline video creation flow */}

          <Text style={styles.dateText}>
            {new Date(scan.created_at).toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
        </View>



        {/* === 4순위: 촬영된 5각도 입체 원본 컷 갤러리 (최하단, 접기 가능) === */}
        {allCutImages.length > 0 && (
          <View style={styles.angleGallerySection}>
            <TouchableOpacity
              style={styles.angleGalleryHeader}
              onPress={() => setAngleGalleryExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <CameraIcon size={15} color={theme.colors.accent[300]} strokeWidth={2} />
              <Text style={styles.angleGalleryTitle}>촬영된 5각도 입체 원본 컷</Text>
              <View style={styles.angleGalleryBadge}>
                <Text style={styles.angleGalleryBadgeText}>{allCutImages.length}/5</Text>
              </View>
              {angleGalleryExpanded ? (
                <ChevronUp size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
              ) : (
                <ChevronDown size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
              )}
            </TouchableOpacity>
            {angleGalleryExpanded && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.angleGalleryScroll}>
                {allCutImages.map((imgUrl, idx) => {
                  const angleLabels = ['정면', '좌측', '우측', '후면', '상부'];
                  const label = angleLabels[idx] ?? `컷 ${idx + 1}`;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={styles.angleThumbWrap}
                      onPress={() => {
                        setGalleryModalIndex(idx);
                        setGalleryModalVisible(true);
                      }}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri: getThumbnailUrl(imgUrl, 200) }} style={styles.angleThumbImage} resizeMode="cover" />
                      <View style={styles.angleThumbLabelWrap}>
                        <Text style={styles.angleThumbLabel}>{label}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

      </ScrollView>
      </KeyboardAvoidingView>


      <AccountSafetyChecker
        platform={activePlatform}
        visible={safetyCheckerVisible}
        onClose={() => setSafetyCheckerVisible(false)}
      />

      <VirtualFittingLoadingOverlay visible={fittingOverlayVisible} />

      <Modal visible={pushPromptVisible} transparent animationType="fade" onRequestClose={() => setPushPromptVisible(false)}>
        <View style={styles.pushPromptOverlay}>
          <View style={styles.pushPromptCard}>
            <View style={styles.pushPromptIconWrap}>
              <BellRing size={32} color={theme.colors.primary[300]} strokeWidth={2} />
            </View>
            <Text style={styles.pushPromptTitle}>작업 완료 시 알림을 보내드릴까요?</Text>
            <Text style={styles.pushPromptDesc}>
              AI 영상 생성은 2~4분 소요됩니다. 완료되면 브라우저 알림으로 즉시 알려드리고, 결과 페이지로 바로 이동할 수 있습니다.
            </Text>
            <View style={styles.pushPromptBtnRow}>
              <TouchableOpacity
                style={styles.pushPromptDeclineBtn}
                onPress={() => setPushPromptVisible(false)}
                activeOpacity={0.7}>
                <Text style={styles.pushPromptDeclineText}>나중에 하기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pushPromptAcceptBtn}
                onPress={async () => {
                  setPushPromptVisible(false);
                  await subscribePush();
                }}
                activeOpacity={0.8}>
                <BellRing size={16} color="#fff" strokeWidth={2.5} />
                <Text style={styles.pushPromptAcceptText}>알림 받기</Text>
              </TouchableOpacity>
            </View>
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
  centerContainer: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 12,
    paddingBottom: theme.spacing.sm,
  },
iconButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  stickyActionBar: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 8,
    backgroundColor: theme.colors.dark.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
    ...theme.shadows.elevated,
  },
  stickyBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stickySaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary[500],
  },
  stickySaveBtnText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  stickyUploadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary[500] + '15',
    borderWidth: 1.5,
    borderColor: theme.colors.primary[400] + '40',
  },
  stickyUploadBtnText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.primary[300],
  },
  stickyErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.error[500] + '12',
  },
  stickyErrorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.error[400],
  },
  stickyErrorDismiss: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  stickySuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.success[500] + '12',
  },
  stickySuccessText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
  },
  body: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  section: {
    marginTop: theme.spacing.xl,
  },
  safetyTileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.success[500] + '15',
    borderWidth: 1.5,
    borderColor: theme.colors.success[400] + '40',
  },
  safetyTileBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.success[400],
  },
  analysisPendingCard: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary[500] + '12',
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '25',
    gap: theme.spacing.sm,
  },
  analysisPendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  analysisPendingTitle: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  analysisPendingDesc: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 20,
  },
  analysisPendingHint: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
  },
  analysisErrorCard: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.error[500] + '12',
    borderWidth: 1,
    borderColor: theme.colors.error[400] + '30',
    alignItems: 'center',
    gap: 8,
  },
  analysisErrorTitle: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.error[400],
  },
  analysisErrorDesc: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    textAlign: 'center',
    lineHeight: 20,
  },
  analysisRetryBtn: {
    marginTop: theme.spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
  },
  analysisRetryText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  sectionLabel: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  captionCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  hookRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  hookText: {
    flex: 1,
    fontSize: 20,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.warning[400],
    lineHeight: 26,
  },
  hookCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginTop: 2,
  },
  hookCopyText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.warning[400],
  },
  captionText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#ffffff',
    lineHeight: 24,
    textShadowColor: 'rgba(4,11,27,0.7)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  metaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: theme.spacing.md,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  metaChipText: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  hashtagRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  hashtagText: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
    lineHeight: 20,
  },
  addedHashtagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: theme.spacing.sm,
  },
  addedHashtagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.accent[500] + '25',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
  },
  addedHashtagText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[300],
  },
  trendingHashtagSection: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
  },
  trendingHashtagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  trendingHashtagLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
  },
  trendingHashtagChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  trendingHashtagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.dark.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.accent[500] + '30',
  },
  trendingHashtagChipText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  copyCaptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  copyCaptionText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  commentLinkBox: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  commentLinkHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: theme.colors.warning[500] + '10',
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.warning[400],
  },
  commentLinkHintText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
  },
  copyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500] + '15',
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '30',
  },
  copyLinkBtnText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  dateText: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: theme.spacing.xl,
    textAlign: 'center',
  },
  disclosureSection: {
    marginTop: theme.spacing.lg,
  },
  disclosureToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  disclosureToggleText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  disclosureBody: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    lineHeight: 16,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 4,
    textAlign: 'center',
  },
  angleGallerySection: {
    marginTop: 4,
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: 8,
    ...theme.shadows.card,
  },
  angleGalleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  angleGalleryTitle: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  angleGalleryBadge: {
    backgroundColor: theme.colors.accent[500] + '25',
    borderRadius: theme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  angleGalleryBadgeText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[300],
  },
  angleGalleryScroll: {
    flexDirection: 'row',
  },
  angleThumbWrap: {
    width: 68,
    height: 68,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    marginRight: 8,
    position: 'relative',
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  angleThumbImage: {
    width: '100%',
    height: '100%',
  },
  angleThumbLabelWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  angleThumbLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
    textAlign: 'center',
  },
  galleryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryModalContent: {
    flex: 1,
    width: Dimensions.get('window').width,
    maxHeight: Dimensions.get('window').height,
  },
  galleryModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  galleryModalTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  galleryModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryModalImage: {
    flex: 1,
    width: Dimensions.get('window').width,
  },
  galleryModalActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  galleryModalActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  galleryModalActionPrimary: {
    backgroundColor: theme.colors.primary[500],
  },
  galleryModalActionText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  galleryModalThumbScroll: {
    paddingBottom: 30,
  },
  galleryModalThumbContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  galleryModalThumb: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  galleryModalThumbActive: {
    borderColor: theme.colors.primary[400],
  },
  errorTitle: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.dark.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  backButtonText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  qrPositionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  qrPositionLabel: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  qrPositionGroup: {
    flexDirection: 'row',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 3,
    gap: 2,
  },
  qrPositionPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
  },
  qrPositionPillActive: {
    backgroundColor: theme.colors.primary[600],
  },
  qrPositionPillText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  qrPositionPillTextActive: {
    color: '#fff',
  },
  noLinkNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: theme.colors.warning[500] + '12',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.warning[400],
  },
  noLinkNoticeText: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 20,
  },
  overlayControlWrap: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent[400],
  },
  overlayControlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  overlayControlTitle: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  overlayResetText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  opacitySliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  opacityMinLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  opacityMaxLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  opacityTrack: {
    flex: 1,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.dark.surfaceLight,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  opacityFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: theme.colors.accent[500] + '60',
    borderRadius: 14,
  },
  opacityThumb: {
    position: 'absolute',
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.accent[400],
    marginLeft: -10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  textPositionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  cleanModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: theme.spacing.sm,
  },
  cleanModeTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  cleanModeDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  cleanModeSwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  cleanModeSwitchActive: {
    backgroundColor: theme.colors.primary[600],
  },
  cleanModeKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.dark.text,
  },
  cleanModeKnobActive: {
    backgroundColor: '#fff',
    alignSelf: 'flex-end',
  },
  // Inline edit panel (replaces accordion)
  editPanel: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginVertical: theme.spacing.xs,
    gap: 10,
    ...theme.shadows.card,
  },
  editPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.dark.border,
  },
  editPanelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editPanelNumber: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: theme.colors.warning[400] + '25',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editPanelNumberText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.warning[400],
  },
  editPanelTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  editRenderBox: {
    backgroundColor: theme.colors.dark.border + '40',
    borderRadius: theme.radius.sm,
    padding: 10,
    gap: 6,
  },
  editRenderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  editRenderLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  editRenderValue: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  editBox: {
    backgroundColor: theme.colors.dark.bg + '50',
    borderRadius: theme.radius.sm,
    padding: 10,
    gap: 8,
  },
  editBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editBoxLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    flex: 1,
  },
  editChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  editChip: {
    backgroundColor: theme.colors.dark.border + '60',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editChipActive: {
    backgroundColor: theme.colors.primary[400],
  },
  editChipText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  editChipTextActive: {
    color: '#fff',
  },
  editTextInput: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    minHeight: 72,
  },
  editTextInputSingle: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  editRegenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary[400],
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  editRegenBtnDisabled: {
    backgroundColor: theme.colors.dark.border,
  },
  editRegenBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  editRegenBtnTextDisabled: {
    color: theme.colors.dark.textFaint,
  },
  editHashtagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  editHashtagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.warning[400] + '18',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  editHashtagChipText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.warning[400],
  },
  editHashtagRemoveX: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  // === One-stop preview & edit layout ===
  regenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500] + '15',
    marginBottom: 4,
  },
  regenBannerText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  bgJobBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500] + '12',
    borderWidth: 1,
    borderColor: theme.colors.accent[400] + '30',
    marginBottom: 4,
  },
  bgJobText: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.accent[300],
    lineHeight: 16,
  },
  imageGenProgressContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500] + '12',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: theme.colors.accent[400] + '20',
  },
  imageGenProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  imageGenProgressPercent: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.accent[300],
    marginLeft: 'auto',
  },
  imageGenProgressBarTrack: {
    height: 4,
    backgroundColor: theme.colors.dark.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  imageGenProgressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  imageGenProgressCount: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    marginTop: 4,
  },
  targetPlatformSection: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 8,
  },
  targetPlatformHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  targetPlatformLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  targetPlatformScroll: {
    flexGrow: 0,
  },
  targetPlatformChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  targetPlatformChipText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  targetPlatformHint: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[300],
    paddingLeft: 2,
  },
  mediaTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  mediaTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  mediaTypeBtnActive: {
    backgroundColor: theme.colors.primary[500] + '15',
    borderColor: theme.colors.primary[400] + '60',
  },
  mediaTypeBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  mediaTypeBtnTextActive: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  syncStatusSection: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  syncStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  syncStatusTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  syncMetricRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  syncMetricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  syncMetricText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  durationSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  durationSelectorLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    flexShrink: 0,
  },
  durationScroll: {
    flexShrink: 1,
  },
  durationChip: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  durationChipActive: {
    backgroundColor: theme.colors.primary[300] + '20',
    borderColor: theme.colors.primary[300],
  },
  durationChipText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  durationChipTextActive: {
    color: theme.colors.primary[300],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  purposeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  purposeLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  purposeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  purposeChipText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  strategyHint: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.accent[400],
    paddingLeft: 2,
    marginTop: 4,
  },
  chipSection: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    gap: 8,
  },
  chipGroup: {
    gap: 6,
  },
  chipGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cleanVideoToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: theme.colors.accent[400] + '30',
  },
  cleanVideoToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cleanVideoToggleTextWrap: {
    flex: 1,
    gap: 2,
  },
  cleanVideoToggleLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  cleanVideoToggleDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 15,
  },
  cleanVideoSwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  cleanVideoSwitchActive: {
    backgroundColor: theme.colors.accent[500],
  },
  cleanVideoSwitchKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    transform: [{ translateX: 0 }],
  },
  cleanVideoSwitchKnobActive: {
    transform: [{ translateX: 18 }],
  },
  chipGroupLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chipPill: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  chipPillActive: {
    backgroundColor: theme.colors.primary[500],
    borderColor: theme.colors.primary[400],
  },
  chipPillText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  chipPillTextActive: {
    color: '#fff',
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  promptSection: {
    marginHorizontal: theme.spacing.md,
    marginVertical: 6,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: 10,
    gap: 8,
    borderWidth: 1.5,
    borderColor: theme.colors.primary[400] + '30',
    ...theme.shadows.card,
  },
  previewSection: {
    marginHorizontal: theme.spacing.md,
    marginVertical: 2,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '30',
    ...theme.shadows.card,
  },
  hookEditBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.accent[400] + '30',
  },
  hookEditInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
    paddingVertical: 4,
  },
  hookEditReset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surface,
  },
  hookEditResetText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  quickPromptSection: {
    marginTop: 10,
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  quickPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  quickPromptLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  quickPromptInput: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    minHeight: 48,
  },
  dualActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginHorizontal: theme.spacing.md,
  },
  dualActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    ...theme.shadows.card,
  },
  dualActionPrimary: {
    backgroundColor: theme.colors.primary[500],
  },
  dualActionSecondary: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  dualActionSecondaryActive: {
    borderColor: theme.colors.accent[400] + '60',
    backgroundColor: theme.colors.accent[400] + '15',
  },
  dualActionDisabled: {
    opacity: 0.5,
  },
  dualActionBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  dualActionBtnTextSecondary: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  advancedToggleText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  advancedPanel: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  advancedPanelLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  volumeSliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volumeSliderLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  volumeSliderValue: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.accent[300],
  },
  volumeSliderTrack: {
    height: 6,
    backgroundColor: theme.colors.dark.border,
    borderRadius: 3,
    marginVertical: 8,
    overflow: 'hidden',
  },
  volumeSliderFill: {
    height: '100%',
    backgroundColor: theme.colors.accent[400],
    borderRadius: 3,
  },
  volumeSliderBtns: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  volumeSliderBtnText: {
    fontSize: 20,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.accent[300],
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  promptTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  promptInput: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    minHeight: 80,
  },
  promptGenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    ...theme.shadows.card,
  },
  promptGenBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  regenBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary[500],
    borderRadius: theme.radius.md,
    paddingVertical: 16,
    ...theme.shadows.card,
  },
  regenBtnDisabled: {
    backgroundColor: theme.colors.dark.border,
  },
  regenBtnText: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  aiVideoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.primary[400] + '40',
  },
  aiVideoBtnDisabled: {
    opacity: 0.5,
  },
  photoGuardTooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.warning[500] + '15',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.warning[400] + '30',
  },
  photoGuardTooltipText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.warning[400],
  },
  aiVideoBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  hdUpgradingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.accent[400] + '15',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.accent[400] + '30',
  },
  hdUpgradingText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.accent[300],
  },
  hdReadyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.success[500] + '15',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.success[400] + '30',
  },
  hdReadyText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.success[400],
  },
  draftBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.warning[500] + '15',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  draftBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
  },
  videoErrorToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.error[500] + '15',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.colors.error[400] + '30',
  },
  videoErrorToastText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.error[400],
  },
  videoErrorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  confirmModal: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
    width: '85%',
    maxWidth: 320,
    gap: 14,
    ...theme.shadows.card,
  },
  videoGenModal: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
    width: '90%',
    maxWidth: 360,
    gap: 12,
    ...theme.shadows.card,
  },
  videoGenCloseBtn: {
    marginLeft: 'auto',
    padding: 4,
  },
  confirmModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmModalTitle: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  confirmModalDesc: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 19,
  },
  confirmModalBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  confirmCancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  confirmCancelBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  confirmOkBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
  },
  confirmOkBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  detailToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  synthManualSection: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.accent[400] + '20',
  },
  synthManualHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  synthManualTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[300],
    flex: 1,
  },
  synthModeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  synthModeBadgeVideo: {
    backgroundColor: theme.colors.primary[500] + '20',
  },
  synthModeBadgeImage: {
    backgroundColor: theme.colors.accent[400] + '20',
  },
  synthModeBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[300],
  },
  synthInputGroup: {
    gap: 4,
  },
  synthInputLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  synthSliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  synthSliderValue: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[300],
  },
  synthSliderTrack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 32,
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 4,
    position: 'relative',
  },
  synthSliderFill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: theme.colors.accent[400] + '22',
    borderRadius: theme.radius.sm,
  },
  synthSliderTick: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    zIndex: 1,
  },
  synthSliderTickActive: {
    backgroundColor: theme.colors.accent[400],
  },
  synthSliderTickLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  synthHint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  synthNegInput: {
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  synthToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  synthToggleLeft: {
    flex: 1,
    gap: 2,
  },
  synthToggleSwitch: {
    width: 40,
    height: 22,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  synthToggleSwitchActive: {
    backgroundColor: theme.colors.accent[400],
  },
  synthToggleKnob: {
    width: 18,
    height: 18,
    borderRadius: theme.radius.full,
    backgroundColor: '#fff',
    transform: [{ translateX: 0 }],
  },
  synthToggleKnobActive: {
    transform: [{ translateX: 18 }],
  },
  imageHeroContainer: {
    gap: 8,
  },
  imageHeroView: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.dark.bg,
  },
  imageHeroImg: {
    width: '100%',
    height: '100%',
  },
  imageThumbStrip: {
    flexGrow: 0,
  },
  imageThumbStripContent: {
    gap: 6,
    paddingHorizontal: 2,
  },
  imageThumbItem: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  imageThumbItemActive: {
    borderColor: theme.colors.accent[400],
  },
  imageHeroPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  imageHeroPlaceholderText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  pushPromptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  pushPromptCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    ...theme.shadows.elevated,
  },
  pushPromptIconWrap: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary[500] + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  pushPromptTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    lineHeight: 24,
  },
  pushPromptDesc: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
  pushPromptBtnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  pushPromptDeclineBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.dark.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pushPromptDeclineText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  pushPromptAcceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary[500],
  },
  pushPromptAcceptText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
