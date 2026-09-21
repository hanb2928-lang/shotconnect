import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image as RNImage,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Lightbulb, Check, Loader, Sun, Moon, Sparkles, Camera, Store, Palette } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useSafeTop } from '@/hooks/useSafeTop';
import { buildDataUrl, cleanBase64 } from '@/lib/base64';

type LightingPreset = 'studio' | 'natural' | 'sunset' | 'cozy' | 'retail' | 'clean';

interface PresetOption {
  id: LightingPreset;
  label: string;
  desc: string;
  icon: typeof Sun;
  gradient: [string, string];
}

const PRESETS: PresetOption[] = [
  { id: 'studio', label: '스튜디오', desc: '깔끔한 화이트 배경, 부드러운 조명', icon: Camera, gradient: ['#f8f8f8', '#e0e0e0'] },
  { id: 'natural', label: '자연광', desc: '아웃도어 느낌의 밝은 자연 조명', icon: Sun, gradient: ['#e8f5e9', '#a5d6a7'] },
  { id: 'sunset', label: '선셋', desc: '따뜻한 황금빛 노을 조명', icon: Palette, gradient: ['#fff3e0', '#ffcc80'] },
  { id: 'cozy', label: '감성', desc: '어두운 무드, 따뜻한 실내 조명', icon: Moon, gradient: ['#3e2723', '#5d4037'] },
  { id: 'retail', label: '매장', desc: '쇼핑몰 느낌의 깔끔한 디스플레이', icon: Store, gradient: ['#f5f5f5', '#cfd8dc'] },
  { id: 'clean', label: '클린', desc: '순수 백색, 제품만 돋보이는 미니멀', icon: Sparkles, gradient: ['#ffffff', '#fafafa'] },
];

interface LightingContextStudioProps {
  imageUrl: string;
  productName?: string;
  onUseImage: (dataUrl: string) => void;
}

export function LightingContextStudio({ imageUrl, productName, onUseImage }: LightingContextStudioProps) {
  const safeTop = useSafeTop();
  const [selectedPreset, setSelectedPreset] = useState<LightingPreset | null>(null);
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const dataUrl = imageUrl.startsWith('data:')
    ? imageUrl
    : imageUrl.startsWith('http')
      ? imageUrl
      : buildDataUrl(cleanBase64(imageUrl), 'image/jpeg');

  const applyPreset = useCallback(
    async (preset: LightingPreset) => {
      if (processing) return;
      setSelectedPreset(preset);
      setProcessing(true);
      setError(null);
      setResultDataUrl(null);

      try {
        if (Platform.OS === 'web') {
          const result = await compositeWithLightingWeb(dataUrl, preset);
          setResultDataUrl(result);
        } else {
          setResultDataUrl(dataUrl);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '연출 적용 실패');
      }
      setProcessing(false);
    },
    [dataUrl, processing],
  );

  const handleUse = useCallback(() => {
    if (resultDataUrl) {
      onUseImage(resultDataUrl);
    }
  }, [resultDataUrl, onUseImage]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Lightbulb size={18} color={theme.colors.accent[400]} strokeWidth={2} />
        <View style={styles.headerText}>
          <Text style={styles.title}>조명 & 배경 스튜디오</Text>
          <Text style={styles.desc}>
            제품은 원본 그대로, 배경과 조명만 AI로 다채롭게 변경하세요
          </Text>
        </View>
      </View>

      {/* Preset selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll} contentContainerStyle={styles.presetList}>
        {PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isActive = selectedPreset === preset.id;
          return (
            <TouchableOpacity
              key={preset.id}
              style={[styles.presetCard, isActive && styles.presetCardActive]}
              onPress={() => applyPreset(preset.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.presetIconBox, { backgroundColor: preset.gradient[0] }]}>
                <Icon size={16} color={theme.colors.dark.text} strokeWidth={2} />
              </View>
              <Text style={[styles.presetLabel, isActive && styles.presetLabelActive]}>{preset.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Result preview */}
      {processing && (
        <View style={styles.processingBox}>
          <ActivityIndicator size="small" color={theme.colors.primary[400]} />
          <Text style={styles.processingText}>조명 연출 적용 중...</Text>
        </View>
      )}

      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      {resultDataUrl && !processing && (
        <View style={styles.resultBox}>
          <RNImage source={{ uri: resultDataUrl }} style={styles.resultImage} resizeMode="contain" />
          <TouchableOpacity style={styles.useBtn} onPress={handleUse} activeOpacity={0.7}>
            <Check size={16} color="#fff" strokeWidth={2} />
            <Text style={styles.useBtnText}>이 이미지로 사용</Text>
          </TouchableOpacity>
        </View>
      )}

      {!resultDataUrl && !processing && !error && (
        <View style={styles.placeholderBox}>
          <RNImage source={{ uri: dataUrl }} style={styles.previewImage} resizeMode="contain" />
          <Text style={styles.placeholderHint}>위에서 조명/배경을 선택하세요</Text>
        </View>
      )}
    </View>
  );
}

/** Web-only: composite product on a lighting gradient background */
async function compositeWithLightingWeb(
  productDataUrl: string,
  preset: LightingPreset,
): Promise<string> {
  const presetConfig = PRESETS.find((p) => p.id === preset)!;
  const [color1, color2] = presetConfig.gradient;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new (global as unknown as { Image: typeof HTMLImageElement }).Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('이미지를 불러올 수 없습니다'));
    el.src = productDataUrl;
  });

  const canvas = document.createElement('canvas');
  const size = 1080;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 생성할 수 없습니다');

  // Draw gradient background
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Apply preset-specific lighting overlay
  if (preset === 'sunset') {
    const sunsetGrad = ctx.createRadialGradient(size * 0.3, size * 0.2, 0, size * 0.3, size * 0.2, size * 0.8);
    sunsetGrad.addColorStop(0, 'rgba(255, 200, 100, 0.3)');
    sunsetGrad.addColorStop(1, 'rgba(255, 150, 50, 0)');
    ctx.fillStyle = sunsetGrad;
    ctx.fillRect(0, 0, size, size);
  } else if (preset === 'cozy') {
    const cozyGrad = ctx.createRadialGradient(size * 0.5, size * 0.4, 0, size * 0.5, size * 0.4, size * 0.6);
    cozyGrad.addColorStop(0, 'rgba(255, 180, 80, 0.15)');
    cozyGrad.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    ctx.fillStyle = cozyGrad;
    ctx.fillRect(0, 0, size, size);
  } else if (preset === 'studio') {
    // Soft vignette
    const vignette = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.3, size * 0.5, size * 0.5, size * 0.7);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);
  } else if (preset === 'natural') {
    const natGrad = ctx.createLinearGradient(0, 0, 0, size);
    natGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    natGrad.addColorStop(0.5, 'rgba(200, 230, 200, 0.05)');
    natGrad.addColorStop(1, 'rgba(150, 200, 150, 0.1)');
    ctx.fillStyle = natGrad;
    ctx.fillRect(0, 0, size, size);
  }

  // Draw product image centered, scaled to 82% of canvas
  const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight) * 0.82;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const x = (size - w) / 2;
  const y = (size - h) / 2;

  // Drop shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 25;
  ctx.shadowOffsetY = 12;
  ctx.drawImage(img, x, y, w, h);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  return canvas.toDataURL('image/png', 0.95);
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  desc: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
  },
  presetScroll: {
    flexGrow: 0,
  },
  presetList: {
    gap: 8,
    paddingRight: theme.spacing.md,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  presetCardActive: {
    borderColor: theme.colors.accent[400],
    backgroundColor: theme.colors.accent[500] + '15',
  },
  presetIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  presetLabelActive: {
    color: theme.colors.dark.text,
    fontFamily: theme.typography.fontFamily.bold,
  },
  processingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 30,
  },
  processingText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  errorText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    textAlign: 'center',
    paddingVertical: 16,
  },
  resultBox: {
    gap: theme.spacing.sm,
  },
  resultImage: {
    width: '100%',
    height: 240,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  useBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.success[500],
  },
  useBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  placeholderBox: {
    alignItems: 'center',
    gap: 10,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  placeholderHint: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
});
