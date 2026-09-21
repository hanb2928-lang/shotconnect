import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Sparkles } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useSafeTop } from '@/hooks/useSafeTop';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PlatformModeSelectCard,
  type PlatformMode,
  type OutputMode,
} from '@/components/PlatformModeSelectCard';
import {
  ProductMoodPresetCard,
  type ProductMood,
} from '@/components/ProductMoodPresetCard';
import {
  SourceInputFittingPanel,
  type SourceImage,
} from '@/components/SourceInputFittingPanel';
import {
  GenerationModePanel,
  type GenMode,
} from '@/components/GenerationModePanel';
import { PreviewExportTray } from '@/components/PreviewExportTray';
import { submitVideoJobAsync, type VideoGenProgress } from '@/lib/aiVideoPipeline';
import { useResultPolling } from '@/hooks/useResultPolling';
import { VideoGenStepTracker } from '@/components/VideoGenStepTracker';
import { supabase } from '@/lib/supabase';

export default function SynthesisScreen() {
  const router = useRouter();
  const safeTop = useSafeTop();
  const insets = useSafeAreaInsets();

  const [platform, setPlatform] = useState<PlatformMode>('shortform');
  const [outputMode, setOutputMode] = useState<OutputMode>('image');
  const [mood, setMood] = useState<ProductMood>('studio_premium');
  const [productImages, setProductImages] = useState<SourceImage[]>([]);
  const [modelImage, setModelImage] = useState<SourceImage | null>(null);
  const [genMode, setGenMode] = useState<GenMode>('auto_3d');
  const [enableOrbit360, setEnableOrbit360] = useState(true);
  const [enableCaustics, setEnableCaustics] = useState(true);
  const [enableVirtualFitting, setEnableVirtualFitting] = useState(true);
  const [enableFabricPhysics, setEnableFabricPhysics] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
  const [manualPrompt, setManualPrompt] = useState('');
  const [cameraSpeed, setCameraSpeed] = useState(1.0);
  const [ttsSyncOffset, setTtsSyncOffset] = useState(0);
  const [captionText, setCaptionText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<VideoGenProgress | null>(null);
  const scanIdRef = useRef<string | null>(null);
  const genStartRef = useRef<number>(0);

  const productInputRef = useRef<HTMLInputElement | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);

  const fittingReady = productImages.length >= 3 && !!modelImage;

  const handlePlatformChange = useCallback((mode: PlatformMode) => {
    setPlatform(mode);
    const platformHooks: Record<PlatformMode, string> = {
      shortform: '3초 안에 궁금해지는 훅',
      feed: '스크롤 멈추는 한 줄',
      detail: '구매 욕구 자극 카피',
    };
    setCaptionText(platformHooks[mode]);
  }, []);

  const handleWebProductPick = useCallback(() => {
    if (Platform.OS !== 'web' || !productInputRef.current) return;
    productInputRef.current.click();
  }, []);

  const handleWebModelPick = useCallback(() => {
    if (Platform.OS !== 'web' || !modelInputRef.current) return;
    modelInputRef.current.click();
  }, []);

  const handleProductFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages: SourceImage[] = [];
    const remaining = 5 - productImages.length;
    const angleLabels = ['정면', '좌측', '우측', '후면', '상부'];
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      newImages.push({
        id: `prod-${Date.now()}-${i}`,
        uri: url,
        angle: angleLabels[productImages.length + i] || `사진 ${productImages.length + i + 1}`,
      });
    }
    if (newImages.length > 0) setProductImages((prev) => [...prev, ...newImages]);
    e.target.value = '';
  }, [productImages.length]);

  const handleModelFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    setModelImage({ id: `model-${Date.now()}`, uri: url });
    e.target.value = '';
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    return () => {
      productImages.forEach((img) => {
        if (img.uri.startsWith('blob:')) URL.revokeObjectURL(img.uri);
      });
      if (modelImage?.uri.startsWith('blob:')) URL.revokeObjectURL(modelImage.uri);
    };
  }, [productImages, modelImage]);

  const [jobId, setJobId] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (productImages.length < 3) {
      setError('제품 사진을 최소 3컷 등록해주세요.');
      return;
    }
    if (genMode === 'universal_synthesis' && !modelImage) {
      setError('AI 범용 합성 모드에서는 모델 사진이 필요합니다.');
      return;
    }
    setError(null);
    setIsGenerating(true);
    setResultImageUrl(null);
    setResultVideoUrl(null);
    setVideoProgress({ phase: 'submitting', progress: 0.05, message: '준비 중...', elapsedSec: 0 });
    genStartRef.current = Date.now();

    const modeLabel = genMode === 'auto_3d' ? '입체컷 오토' : genMode === 'universal_synthesis' ? 'AI 범용 합성' : '수동';

    const productName = '프리미엄 추천 상품';
    const aspectRatio = (outputMode === 'video' ? '9:16' : '1:1') as '9:16' | '16:9' | '1:1' | '4:5';
    const promptText = genMode === 'manual' && manualPrompt.trim()
      ? manualPrompt.trim()
      : `Cinematic ${modeLabel} product showcase. ${captionText || '시선 집중! 지금 바로 확인하세요'}`;

    try {
      const { data: scanData, error: scanError } = await supabase
        .from('scans')
        .insert({
          image_url: productImages[0]?.uri ?? '',
          scan_source: 'multi',
          product_name: productName,
          additional_image_urls: productImages.slice(1).map((img) => img.uri),
        })
        .select('id')
        .single();

      if (scanError || !scanData) {
        throw new Error('스캔 레코드 생성에 실패했습니다.');
      }
      scanIdRef.current = scanData.id;

      setVideoProgress({ phase: 'submitting', progress: 0.08, message: 'AI 렌더링 요청 전송 중...', elapsedSec: 0 });

      const submitResult = await submitVideoJobAsync(promptText, {
        durationSec: 5,
        aspectRatio,
        productName,
        scanId: scanData.id,
        captionText: captionText || '시선 집중! 지금 바로 확인하세요',
        platform: platform === 'shortform' ? 'shorts' : platform,
        isCleanVideoMode: genMode === 'auto_3d',
        selectedMode: genMode,
        enableOrbit360,
        enableCaustics: genMode === 'auto_3d' ? enableCaustics : undefined,
        orbitSpeed: enableOrbit360 ? cameraSpeed : undefined,
        enableVirtualFitting: genMode === 'universal_synthesis' ? enableVirtualFitting : undefined,
        enableFabricPhysics,
        draft: true,
      });
      setJobId(submitResult.taskId);
      setVideoProgress({ phase: 'generating', progress: 0.12, message: 'AI가 영상을 렌더링하고 있어요...', elapsedSec: 0 });
    } catch (err) {
      setIsGenerating(false);
      setVideoProgress(null);
      setError(err instanceof Error ? err.message : 'AI 영상 생성 요청에 실패했습니다.');
    }
  }, [productImages, outputMode, genMode, modelImage, enableOrbit360, enableCaustics, enableVirtualFitting, enableFabricPhysics, cameraSpeed, manualPrompt, captionText, platform]);

  const polling = useResultPolling(jobId, {
    scanId: scanIdRef.current,
    onCompleted: (videoUrl) => {
      setIsGenerating(false);
      setVideoProgress((prev) => prev ? { ...prev, phase: 'completed', progress: 1.0, message: '영상 생성 완료' } : null);
      if (outputMode === 'image') {
        setResultImageUrl(videoUrl);
      } else {
        setResultVideoUrl(videoUrl);
      }
    },
    onError: (errMsg) => {
      setIsGenerating(false);
      setVideoProgress((prev) => prev ? { ...prev, phase: 'error', progress: 0, message: errMsg } : null);
      setError(errMsg);
    },
  });

  useEffect(() => {
    if (!isGenerating) return;
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - genStartRef.current) / 1000);
      setVideoProgress((prev) => {
        if (!prev) return prev;
        const pctMatch = polling.progressMessage.match(/\((\d+)%\)/);
        const polledProgress = pctMatch ? parseInt(pctMatch[1], 10) / 100 : null;
        const baseProgress = prev.progress;
        const timeBasedProgress = Math.min(0.9, 0.12 + elapsed * 0.005);
        const nextProgress = polledProgress ?? Math.max(baseProgress, timeBasedProgress);
        return { ...prev, message: polling.progressMessage || prev.message, elapsedSec: elapsed, progress: nextProgress };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isGenerating, polling.progressMessage]);

  const handleDownload = useCallback(() => {
    setIsExporting(true);
    setTimeout(() => setIsExporting(false), 1000);
  }, []);

  const handleShare = useCallback(() => {
    if (Platform.OS === 'web') {
      Alert.alert('공유', 'SNS 공유 기능이 곧 제공됩니다.');
    }
  }, []);

  const autoDetectedMood: ProductMood | null = productImages.length >= 3 ? mood : null;

  const modeOptions = genMode === 'auto_3d'
    ? [
        {
          key: 'orbit360',
          label: '360° 궤도 회전',
          description: '제품 주위를 회전하는 입체 카메라 무빙',
          enabled: enableOrbit360,
          onToggle: () => setEnableOrbit360((v) => !v),
        },
        {
          key: 'caustics',
          label: '주얼리 광채 강화',
          description: '보석·금속의 빛 반사와 굴절 효과 극대화',
          enabled: enableCaustics,
          onToggle: () => setEnableCaustics((v) => !v),
        },
      ]
    : genMode === 'universal_synthesis'
    ? [
        {
          key: 'virtualFitting',
          label: '가상 피팅',
          description: '모델에게 제품을 자연스럽게 착용시키는 합성',
          enabled: enableVirtualFitting,
          onToggle: () => setEnableVirtualFitting((v) => !v),
        },
        {
          key: 'fabricPhysics',
          label: '원단 물리 엔진',
          description: '의류 원단의 주름과 흐름을 실사 수준으로 시뮬레이션',
          enabled: enableFabricPhysics,
          onToggle: () => setEnableFabricPhysics((v) => !v),
        },
        {
          key: 'orbit360',
          label: '360° 궤도 회전',
          description: '모델과 의류를 360도 회전하며 앞·옆·뒷모습 실루엣 연출',
          enabled: enableOrbit360,
          onToggle: () => setEnableOrbit360((v) => !v),
        },
      ]
    : [];

  return (
    <View style={styles.container}>
      {/* Hidden file inputs for web */}
      {Platform.OS === 'web' && (
        <>
          <input
            ref={productInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleProductFileChange}
          />
          <input
            ref={modelInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleModelFileChange}
          />
        </>
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: safeTop + 12 }]}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={22} color={theme.colors.dark.text} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Sparkles size={16} color={theme.colors.primary[400]} strokeWidth={2} />
          <Text style={styles.topTitle}>AI 범용 합성 편집</Text>
        </View>
        <View style={styles.iconButtonPlaceholder} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + theme.spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <PlatformModeSelectCard
          platform={platform}
          outputMode={outputMode}
          onPlatformChange={handlePlatformChange}
          onOutputModeChange={setOutputMode}
        />

        <ProductMoodPresetCard
          autoDetectedMood={autoDetectedMood}
          mood={mood}
          onMoodChange={setMood}
        />

        <SourceInputFittingPanel
          productImages={productImages}
          modelImage={modelImage}
          onProductImageAdd={setProductImages}
          onModelImageSet={setModelImage}
          fittingReady={fittingReady}
          onWebProductPick={handleWebProductPick}
          onWebModelPick={handleWebModelPick}
        />

        <GenerationModePanel
          mode={genMode}
          onModeChange={setGenMode}
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
          manualPrompt={manualPrompt}
          onManualPromptChange={setManualPrompt}
          cameraSpeed={cameraSpeed}
          onCameraSpeedChange={setCameraSpeed}
          ttsSyncOffset={ttsSyncOffset}
          onTtsSyncOffsetChange={setTtsSyncOffset}
          captionText={captionText}
          onCaptionTextChange={setCaptionText}
          modeOptions={modeOptions}
        />

        <PreviewExportTray
          outputMode={outputMode}
          resultImageUrl={resultImageUrl}
          resultVideoUrl={resultVideoUrl}
          onDownload={handleDownload}
          onShare={handleShare}
          isExporting={isExporting}
        />

        {isGenerating && videoProgress && (
          <VideoGenStepTracker progress={videoProgress} variant="inline" />
        )}

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topTitle: {
    fontSize: 17,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonPlaceholder: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  } as ViewStyle,
  errorBanner: {
    backgroundColor: theme.colors.error[500] + '20',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.error[400],
  },
  errorText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
});
