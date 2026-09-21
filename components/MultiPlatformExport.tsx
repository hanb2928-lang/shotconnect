import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
  Dimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Instagram, Youtube, FileText, Download, Loader as Loader2, Check, Zap, Image as ImageIcon, MessageCircle, Send, Share, Crop, RotateCcw, Check as CheckIcon } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { uploadAssetBlob, uploadAssetFromFileUri, saveAssetRecord } from '@/lib/savedAssets';
import { urlToDataUrl } from '@/lib/base64';
import { getUserSettings } from '@/lib/settings';
import { applyWatermarks } from '@/lib/qrWatermark';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import type { PlatformKey } from '@/types/database';

interface MultiPlatformExportProps {
  imageUrl: string;
  hook: string;
  title: string;
  hashtags: string[];
  accentColor: string;
  category: string;
  fileName: string;
  affiliatePlatforms?: string[];
  platform?: PlatformKey;
  shortUrl?: string;
}

type ExportFormat = {
  key: string;
  label: string;
  sub: string;
  ratio: string;
  width: number;
  height: number;
  icon: typeof Instagram;
  color: string;
};

const ALL_FORMATS: ExportFormat[] = [
  { key: 'instagram', label: '인스타 피드', sub: '1:1', ratio: '1:1', width: 1080, height: 1080, icon: Instagram, color: '#E1306C' },
  { key: 'reels', label: '릴스/쇼츠', sub: '9:16', ratio: '9:16', width: 1080, height: 1920, icon: Youtube, color: '#FF0000' },
  { key: 'threads', label: '스레드', sub: '9:16', ratio: '9:16', width: 1080, height: 1350, icon: MessageCircle, color: '#0F0F0F' },
  { key: 'twitter', label: 'X(트위터)', sub: '16:9', ratio: '16:9', width: 1600, height: 900, icon: Send, color: '#1DA1F2' },
  { key: 'blog', label: '블로그/유튜브', sub: '16:9', ratio: '16:9', width: 1920, height: 1080, icon: FileText, color: '#03C75A' },
  { key: 'pinterest', label: '핀터레스트', sub: '2:3', ratio: '2:3', width: 1000, height: 1500, icon: ImageIcon, color: '#E60023' },
];

const PLATFORM_FORMAT_PRIORITY: Record<PlatformKey, string[]> = {
  naverBlog: ['blog', 'instagram', 'pinterest'],
  shortform: ['reels', 'instagram', 'pinterest'],
  instagram: ['instagram', 'reels', 'pinterest'],
  threads: ['threads', 'instagram', 'reels'],
  twitter: ['twitter', 'instagram', 'reels'],
  pinterest: ['pinterest', 'instagram', 'blog'],
  smartstore: ['blog', 'instagram', 'pinterest'],
};

function getFormatsForPlatform(platform?: PlatformKey): ExportFormat[] {
  if (!platform) return ALL_FORMATS.slice(0, 3);
  const priority = PLATFORM_FORMAT_PRIORITY[platform] || ['instagram', 'reels', 'blog'];
  return priority
    .map((key) => ALL_FORMATS.find((f) => f.key === key))
    .filter((f): f is ExportFormat => !!f);
}

const PLATFORM_LABELS_SHORT: Record<PlatformKey, string> = {
  naverBlog: '네이버 블로그',
  shortform: '숏폼',
  instagram: '인스타그램',
  threads: '스레드',
  twitter: 'X(트위터)',
  pinterest: '핀터레스트',
  smartstore: '스마트스토어',
};

function platformLabelShort(platform: PlatformKey): string {
  return PLATFORM_LABELS_SHORT[platform] || platform;
}

type GenState = 'idle' | 'editing' | 'generating' | 'done';

type CropAdjust = {
  offsetX: number;
  offsetY: number;
  zoom: number;
};

// ─── Web-only canvas helpers ─────────────────────────────────────────────

function drawTextLines(
  ctx: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const chars = Array.from(text);
  let line = '';
  let currentY = y;
  for (const char of chars) {
    if (char === '\n') {
      ctx.fillText(line, x, currentY);
      line = '';
      currentY += lineHeight;
      continue;
    }
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line !== '') {
      ctx.fillText(line, x, currentY);
      line = char;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, currentY);
  return currentY;
}

function loadImage(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

async function renderFormat(
  fmt: ExportFormat,
  img: any,
  crop: CropAdjust,
  opts: {
    hook: string;
    title: string;
    hashtags: string[];
    accentColor: string;
    affiliatePlatforms: string[];
    shortUrl: string;
    autoDisclosure: boolean;
  },
): Promise<any> {
  const canvas = document.createElement('canvas');
  canvas.width = fmt.width;
  canvas.height = fmt.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unsupported');

  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(0, 0, fmt.width, fmt.height);

  // Cover base: image fills canvas at zoom=1
  const imgRatio = img.width / img.height;
  const canvasRatio = fmt.width / fmt.height;
  let baseDrawW: number, baseDrawH: number;
  if (imgRatio > canvasRatio) {
    baseDrawH = fmt.height;
    baseDrawW = baseDrawH * imgRatio;
  } else {
    baseDrawW = fmt.width;
    baseDrawH = baseDrawW / imgRatio;
  }

  // zoom > 1 crops tighter (image gets larger relative to frame)
  const drawW = baseDrawW * crop.zoom;
  const drawH = baseDrawH * crop.zoom;

  // offset shifts image within frame, normalized -1..1
  const maxShiftX = (drawW - fmt.width) / 2;
  const maxShiftY = (drawH - fmt.height) / 2;
  const px = maxShiftX * crop.offsetX;
  const py = maxShiftY * crop.offsetY;

  const drawX = (fmt.width - drawW) / 2 + px;
  const drawY = (fmt.height - drawH) / 2 + py;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  const grad = ctx.createLinearGradient(0, 0, 0, fmt.height);
  grad.addColorStop(0, 'rgba(10,15,30,0.1)');
  grad.addColorStop(0.5, 'rgba(10,15,30,0.3)');
  grad.addColorStop(1, 'rgba(10,15,30,0.7)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, fmt.width, fmt.height);

  ctx.fillStyle = '#fff';
  ctx.font = '700 42px sans-serif';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  drawTextLines(ctx, opts.hook, 60, fmt.height * 0.72, fmt.width - 120, 54);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Draw QR + logo watermarks if a short URL is available
  if (opts.shortUrl) {
    await applyWatermarks(ctx, fmt.width, fmt.height, opts.shortUrl);
  }

  // Disclosure text is NOT drawn on the image — it is prepended to the caption
  // when uploading to platforms, to keep the visual template clean.

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob: Blob | null) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob failed'));
    }, 'image/png');
  });
}

// ─── Native format card (mobile) ─────────────────────────────────────────

const { width: screenWidth } = Dimensions.get('window');
const NATIVE_CARD_WIDTH = Math.min(screenWidth - 48, 360);

function NativeFormatCard({
  fmt,
  imageUrl,
  hook,
  crop,
  cardRef,
}: {
  fmt: ExportFormat;
  imageUrl: string;
  hook: string;
  crop: CropAdjust;
  title: string;
  hashtags: string[];
  accentColor: string;
  affiliatePlatforms: string[];
  shortUrl: string;
  cardRef: (ref: View | null) => void;
}) {
  const cardHeight = Math.round(NATIVE_CARD_WIDTH * (fmt.height / fmt.width));
  const scale = crop.zoom;

  return (
    <View
      ref={cardRef}
      collapsable={false}
      style={[nativeStyles.card, { width: NATIVE_CARD_WIDTH, height: cardHeight }]}
    >
      <View style={nativeStyles.imageContainer}>
        <Image
          source={{ uri: imageUrl }}
          style={[
            nativeStyles.image,
            {
              transform: [
                { scale },
                { translateX: crop.offsetX * 100 },
                { translateY: crop.offsetY * 100 },
              ],
            },
          ]}
          resizeMode="cover"
        />
      </View>
      <View style={nativeStyles.overlay} />

      <View style={nativeStyles.hookWrap}>
        <Text style={nativeStyles.hookText} numberOfLines={3}>
          {hook}
        </Text>
      </View>
    </View>
  );
}

const nativeStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0a0f1e',
    position: 'relative',
  },
  imageContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 15, 30, 0.35)',
  },
  hookWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
  },
  hookText: {
    fontSize: 22,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
    lineHeight: 30,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});

// ─── Crop Editor Component ───────────────────────────────────────────────

const CROP_EDITOR_HEIGHT = 320;

function CropEditor({
  fmt,
  imageUrl,
  crop,
  onCropChange,
}: {
  fmt: ExportFormat;
  imageUrl: string;
  crop: CropAdjust;
  onCropChange: (crop: CropAdjust) => void;
}) {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const dragState = useRef({ active: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 });

  const fmtAspect = fmt.width / fmt.height;

  // Load image natural aspect ratio
  useEffect(() => {
    if (!imageUrl) return;
    if (Platform.OS === 'web') {
      const el = new (window as any).Image();
      el.onload = () => setImgAspect(el.naturalWidth / el.naturalHeight);
      el.onerror = () => setImgAspect(null);
      el.src = imageUrl;
    } else {
      Image.getSize(
        imageUrl,
        (w, h) => setImgAspect(w / h),
        () => setImgAspect(null),
      );
    }
  }, [imageUrl]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setContainerSize({ width, height: CROP_EDITOR_HEIGHT });
  }, []);

  // Compute displayed image rect (contain mode) within the preview area
  const imgRect = useMemo(() => {
    if (!containerSize.width || !imgAspect) return null;
    const cw = containerSize.width;
    const ch = containerSize.height;
    let dw: number, dh: number;
    if (imgAspect > cw / ch) {
      dw = cw;
      dh = cw / imgAspect;
    } else {
      dh = ch;
      dw = ch * imgAspect;
    }
    return {
      x: (cw - dw) / 2,
      y: (ch - dh) / 2,
      w: dw,
      h: dh,
    };
  }, [containerSize, imgAspect]);

  // Compute crop frame rect within the displayed image
  const frameRect = useMemo(() => {
    if (!imgRect) return null;
    const { x, y, w, h } = imgRect;
    const tr = fmtAspect;
    // Max frame at zoom=1
    let maxFrameW: number, maxFrameH: number;
    if (tr > w / h) {
      maxFrameW = w;
      maxFrameH = w / tr;
    } else {
      maxFrameH = h;
      maxFrameW = h * tr;
    }
    const frameW = maxFrameW / crop.zoom;
    const frameH = maxFrameH / crop.zoom;
    // Position: offset moves frame center within image bounds
    const maxShiftX = (w - frameW) / 2;
    const maxShiftY = (h - frameH) / 2;
    const cx = x + w / 2 + crop.offsetX * maxShiftX;
    const cy = y + h / 2 + crop.offsetY * maxShiftY;
    return {
      left: cx - frameW / 2,
      top: cy - frameH / 2,
      width: frameW,
      height: frameH,
    };
  }, [imgRect, fmtAspect, crop]);

  const onPointerDown = useCallback((e: any) => {
    dragState.current = {
      active: true,
      startX: e.clientX ?? e.nativeEvent?.clientX ?? e.pageX ?? 0,
      startY: e.clientY ?? e.nativeEvent?.clientY ?? e.pageY ?? 0,
      startOffsetX: crop.offsetX,
      startOffsetY: crop.offsetY,
    };
  }, [crop]);

  const onPointerMove = useCallback((e: any) => {
    if (!dragState.current.active || !imgRect) return;
    const clientX = e.clientX ?? e.nativeEvent?.clientX ?? e.pageX ?? 0;
    const clientY = e.clientY ?? e.nativeEvent?.clientY ?? e.pageY ?? 0;
    const dx = clientX - dragState.current.startX;
    const dy = clientY - dragState.current.startY;
    // Normalize to image displayed size (half = full range)
    const dxNorm = imgRect.w > 0 ? dx / (imgRect.w / 2) : 0;
    const dyNorm = imgRect.h > 0 ? dy / (imgRect.h / 2) : 0;
    const newOffsetX = Math.max(-1, Math.min(1, dragState.current.startOffsetX + dxNorm));
    const newOffsetY = Math.max(-1, Math.min(1, dragState.current.startOffsetY + dyNorm));
    onCropChange({ ...crop, offsetX: newOffsetX, offsetY: newOffsetY });
  }, [crop, onCropChange, imgRect]);

  const onPointerUp = useCallback(() => {
    dragState.current.active = false;
  }, []);

  // Global listeners so drag continues even if pointer leaves the frame
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const moveHandler = (e: PointerEvent | MouseEvent | TouchEvent) => {
      let clientX = 0, clientY = 0;
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      }
      if (!dragState.current.active || !imgRect) return;
      const dx = clientX - dragState.current.startX;
      const dy = clientY - dragState.current.startY;
      const dxNorm = imgRect.w > 0 ? dx / (imgRect.w / 2) : 0;
      const dyNorm = imgRect.h > 0 ? dy / (imgRect.h / 2) : 0;
      const newOffsetX = Math.max(-1, Math.min(1, dragState.current.startOffsetX + dxNorm));
      const newOffsetY = Math.max(-1, Math.min(1, dragState.current.startOffsetY + dyNorm));
      onCropChange({ ...crop, offsetX: newOffsetX, offsetY: newOffsetY });
    };
    const upHandler = () => { dragState.current.active = false; };
    window.addEventListener('pointermove', moveHandler);
    window.addEventListener('pointerup', upHandler);
    window.addEventListener('touchmove', moveHandler as any, { passive: false });
    window.addEventListener('touchend', upHandler);
    return () => {
      window.removeEventListener('pointermove', moveHandler);
      window.removeEventListener('pointerup', upHandler);
      window.removeEventListener('touchmove', moveHandler as any);
      window.removeEventListener('touchend', upHandler);
    };
  }, [crop, onCropChange, imgRect]);

  const handleZoom = useCallback((delta: number) => {
    const newZoom = Math.max(1, Math.min(3, crop.zoom + delta));
    onCropChange({ ...crop, zoom: newZoom });
  }, [crop, onCropChange]);

  const handleResetCrop = useCallback(() => {
    onCropChange({ offsetX: 0, offsetY: 0, zoom: 1 });
  }, [onCropChange]);

  return (
    <View style={cropStyles.container}>
      <View style={cropStyles.header}>
        <View style={cropStyles.headerLeft}>
          <Crop size={14} color={theme.colors.warning[400]} strokeWidth={2} />
          <Text style={cropStyles.title}>
            {fmt.label} 영역 편집
          </Text>
        </View>
        <Text style={cropStyles.hint}>드래그로 이동 · 버튼으로 확대</Text>
      </View>

      <View style={cropStyles.previewArea} onLayout={onLayout}>
        {containerSize.width > 0 && (
          <View
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={cropStyles.previewInner}
          >
            {/* Full original image (contain mode) */}
            <Image
              source={{ uri: imageUrl }}
              style={cropStyles.fullImage}
              resizeMode="contain"
            />

            {/* Dim overlay outside crop frame */}
            {frameRect && imgRect && (
              <>
                {/* Top dim */}
                <View pointerEvents="none" style={[cropStyles.dimRect, {
                  left: imgRect.x, top: imgRect.y,
                  width: imgRect.w, height: frameRect.top - imgRect.y,
                }]} />
                {/* Bottom dim */}
                <View pointerEvents="none" style={[cropStyles.dimRect, {
                  left: imgRect.x, top: frameRect.top + frameRect.height,
                  width: imgRect.w,
                  height: (imgRect.y + imgRect.h) - (frameRect.top + frameRect.height),
                }]} />
                {/* Left dim */}
                <View pointerEvents="none" style={[cropStyles.dimRect, {
                  left: imgRect.x, top: frameRect.top,
                  width: frameRect.left - imgRect.x, height: frameRect.height,
                }]} />
                {/* Right dim */}
                <View pointerEvents="none" style={[cropStyles.dimRect, {
                  left: frameRect.left + frameRect.width, top: frameRect.top,
                  width: (imgRect.x + imgRect.w) - (frameRect.left + frameRect.width),
                  height: frameRect.height,
                }]} />

                {/* Crop frame border */}
                <View pointerEvents="none" style={[
                  cropStyles.cropBorder,
                  {
                    left: frameRect.left,
                    top: frameRect.top,
                    width: frameRect.width,
                    height: frameRect.height,
                  },
                ]}>
                  {/* Grid lines */}
                  <View style={cropStyles.gridV1} />
                  <View style={cropStyles.gridV2} />
                  <View style={cropStyles.gridH1} />
                  <View style={cropStyles.gridH2} />
                  {/* Corner indicators */}
                  <View style={[cropStyles.corner, cropStyles.cornerTL]} />
                  <View style={[cropStyles.corner, cropStyles.cornerTR]} />
                  <View style={[cropStyles.corner, cropStyles.cornerBL]} />
                  <View style={[cropStyles.corner, cropStyles.cornerBR]} />
                </View>
              </>
            )}
          </View>
        )}
      </View>

      <View style={cropStyles.controls}>
        <TouchableOpacity
          style={cropStyles.controlBtn}
          onPress={() => handleZoom(-0.2)}
          activeOpacity={0.7}
        >
          <Text style={cropStyles.controlBtnText}>축소</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={cropStyles.controlBtn}
          onPress={() => handleZoom(0.2)}
          activeOpacity={0.7}
        >
          <Text style={cropStyles.controlBtnText}>확대</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={cropStyles.controlBtn}
          onPress={handleResetCrop}
          activeOpacity={0.7}
        >
          <RotateCcw size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
          <Text style={cropStyles.controlBtnText}>초기화</Text>
        </TouchableOpacity>
      </View>

      <View style={cropStyles.zoomBar}>
        <Text style={cropStyles.zoomLabel}>줌</Text>
        <View style={cropStyles.zoomTrack}>
          <View
            style={[
              cropStyles.zoomFill,
              { width: `${((crop.zoom - 1) / 2) * 100}%` },
            ]}
          />
        </View>
        <Text style={cropStyles.zoomValue}>{crop.zoom.toFixed(1)}x</Text>
      </View>
    </View>
  );
}

const cropStyles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  hint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  previewArea: {
    width: '100%',
    backgroundColor: '#0a0f1e',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  previewInner: {
    width: '100%',
    height: CROP_EDITOR_HEIGHT,
    position: 'relative',
  },
  fullImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  dimRect: {
    position: 'absolute',
    backgroundColor: 'rgba(10, 15, 30, 0.65)',
  },
  cropBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: theme.colors.warning[400],
    overflow: 'hidden',
  },
  gridV1: {
    position: 'absolute',
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  gridV2: {
    position: 'absolute',
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  gridH1: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  gridH2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  corner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: theme.colors.warning[400],
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surface,
  },
  controlBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  zoomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoomLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  zoomTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.dark.surface,
    overflow: 'hidden',
  },
  zoomFill: {
    height: '100%',
    backgroundColor: theme.colors.warning[400],
    borderRadius: 2,
  },
  zoomValue: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
    minWidth: 32,
  },
});

// ─── Main component ──────────────────────────────────────────────────────

export function MultiPlatformExport({
  imageUrl,
  hook,
  title,
  hashtags,
  accentColor,
  fileName,
  affiliatePlatforms = [],
  platform,
  shortUrl = '',
}: MultiPlatformExportProps) {
  const [state, setState] = useState<GenState>('idle');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ url: string; blob?: any; uri?: string; format: ExportFormat }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [autoDisclosure, setAutoDisclosure] = useState(true);
  const cloudSavingRef = useRef(false);
  const cardRefs = useRef<(View | null)[]>([]);

  const formats = useMemo(() => getFormatsForPlatform(platform), [platform]);

  // Per-format crop adjustments
  const defaultCrop: CropAdjust = { offsetX: 0, offsetY: 0, zoom: 1 };
  const [crops, setCrops] = useState<Record<string, CropAdjust>>({});
  const [activeFormatIndex, setActiveFormatIndex] = useState(0);

  const getCrop = useCallback((key: string): CropAdjust => {
    return crops[key] || defaultCrop;
  }, [crops]);

  const updateCrop = useCallback((key: string, crop: CropAdjust) => {
    setCrops((prev) => ({ ...prev, [key]: crop }));
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    let mounted = true;
    getUserSettings().then((s) => { if (mounted && s) setAutoDisclosure(s.auto_disclosure ?? true); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Revoke any remaining blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (Platform.OS === 'web') {
        setResults((prev) => {
          for (const r of prev) {
            if (r.url.startsWith('blob:')) URL.revokeObjectURL(r.url);
          }
          return prev;
        });
      }
    };
  }, []);

  // ── Web: canvas-based generation ──────────────────────────────────────
  const handleGenerateWeb = useCallback(async () => {
    setState('generating');
    setProgress(0);
    for (const r of results) URL.revokeObjectURL(r.url);
    setResults([]);

    try {
      const safeUrl = await urlToDataUrl(imageUrl);
      const img = await loadImage(safeUrl);
      const generated: { url: string; blob: any; format: ExportFormat }[] = [];

      for (let i = 0; i < formats.length; i++) {
        const fmt = formats[i];
        const crop = getCrop(fmt.key);
        const blob = await renderFormat(fmt, img, crop, {
          hook,
          title,
          hashtags,
          accentColor,
          affiliatePlatforms,
          shortUrl,
          autoDisclosure,
        });
        const url = URL.createObjectURL(blob);
        generated.push({ url, blob, format: fmt });
        setProgress(Math.round(((i + 1) / formats.length) * 100));
      }

      setResults(generated);
      setState('done');
    } catch {
      setState('editing');
      showToast('이미지 변환에 실패했어요. 다시 시도해주세요');
    }
  }, [imageUrl, hook, title, hashtags, accentColor, affiliatePlatforms, shortUrl, showToast, formats, getCrop, autoDisclosure]);

  // ── Mobile: native view capture ───────────────────────────────────────
  const handleGenerateMobile = useCallback(async () => {
    setState('generating');
    setProgress(0);
    setResults([]);

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        showToast('사진 접근 권한이 필요해요. 설정에서 허용해주세요');
        setState('editing');
        return;
      }

      const generated: { url: string; uri: string; format: ExportFormat }[] = [];

      for (let i = 0; i < formats.length; i++) {
        const ref = cardRefs.current[i];
        if (!ref) continue;
        try {
          const uri = await captureRef(ref, {
            format: 'png',
            quality: 1,
            fileName: `${fileName.replace(/\.\w+$/, '')}-${formats[i].key}.png`,
          });
          generated.push({ url: uri, uri, format: formats[i] });
        } catch {
          // continue to next
        }
        setProgress(Math.round(((i + 1) / formats.length) * 100));
      }

      if (generated.length === 0) {
        showToast('이미지 캡처에 실패했어요');
        setState('editing');
        return;
      }

      // Save all to gallery
      for (const g of generated) {
        try {
          const asset = await MediaLibrary.createAssetAsync(g.uri);
          try {
            await MediaLibrary.createAlbumAsync('숏커넥트', asset, false);
          } catch {
            // Album creation can fail on scoped storage; the asset is already saved to gallery.
          }
        } catch {
          // continue
        }
      }

      setResults(generated);
      setState('done');
      showToast(`${generated.length}개 포맷을 갤러리에 저장했어요`);
    } catch {
      setState('editing');
      showToast('이미지 변환에 실패했어요. 다시 시도해주세요');
    }
  }, [formats, fileName, showToast]);

  const handleGenerate = useCallback(() => {
    if (Platform.OS === 'web') {
      handleGenerateWeb();
    } else {
      handleGenerateMobile();
    }
  }, [handleGenerateWeb, handleGenerateMobile]);

  // ── Download / share handlers ─────────────────────────────────────────

  const handleDownloadAll = useCallback(() => {
    if (Platform.OS !== 'web') return;
    for (const r of results) {
      const a = document.createElement('a');
      a.href = r.url;
      a.download = `${fileName.replace(/\.\w+$/, '')}-${r.format.key}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    showToast(`${results.length}개 포맷 다운로드를 시작했어요`);
  }, [results, fileName, showToast]);

  const handleDownloadOne = useCallback((r: { url: string; format: ExportFormat }) => {
    if (Platform.OS !== 'web') return;
    const a = document.createElement('a');
    a.href = r.url;
    a.download = `${fileName.replace(/\.\w+$/, '')}-${r.format.key}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [fileName]);

  const handleShareMobile = useCallback(async () => {
    if (Platform.OS === 'web' || results.length === 0) return;
    try {
      const firstUri = results[0].uri;
      if (!firstUri) return;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(firstUri, {
          mimeType: 'image/png',
          dialogTitle: '숏커넥트 - 멀티 플랫폼 이미지',
        });
      }
    } catch {
      showToast('공유 중 오류가 발생했어요');
    }
  }, [results, showToast]);

  const handleSaveAllToCloud = useCallback(async () => {
    if (cloudSavingRef.current) return;
    cloudSavingRef.current = true;
    setCloudSaving(true);
    let saved = 0;
    try {
      for (const r of results) {
        const cloudName = `${fileName.replace(/\.\w+$/, '')}-${r.format.key}-${Date.now()}.png`;
        let fileUrl: string | null = null;

        if (Platform.OS === 'web' && r.blob) {
          fileUrl = await uploadAssetBlob(r.blob, cloudName, 'image/png');
        } else if (r.uri) {
          fileUrl = await uploadAssetFromFileUri(r.uri, cloudName, 'image/png');
        }

        if (!fileUrl) continue;
        await saveAssetRecord({
          scan_id: null,
          asset_type: 'image',
          title: `${title} - ${r.format.label}`,
          file_url: fileUrl,
          file_name: cloudName,
          file_size: null,
          mime_type: 'image/png',
          thumbnail_url: imageUrl,
          platform: r.format.key as PlatformKey,
          affiliate_platform: affiliatePlatforms.join(',') || null,
        });
        saved++;
      }
      if (saved > 0) {
        showToast(`${saved}개를 클라우드에 저장했어요. 내 제작물에서 확인하세요`);
      } else {
        showToast('클라우드 저장에 실패했어요');
      }
    } catch {
      showToast('저장 중 오류가 발생했어요');
    }
    cloudSavingRef.current = false;
    setCloudSaving(false);
  }, [results, fileName, title, imageUrl, affiliatePlatforms, showToast]);

  const handleReset = useCallback(() => {
    if (Platform.OS === 'web') {
      for (const r of results) URL.revokeObjectURL(r.url);
    }
    setResults([]);
    setState('idle');
    setProgress(0);
  }, [results]);

  const handleEnterEditor = useCallback(() => {
    setState('editing');
    setActiveFormatIndex(0);
  }, []);

  const handleResetCrops = useCallback(() => {
    setCrops({});
  }, []);

  const isWeb = Platform.OS === 'web';
  const activeFormat = formats[activeFormatIndex];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Zap size={18} color={isWeb ? theme.colors.warning[400] : theme.colors.accent[400]} strokeWidth={2} />
          <Text style={styles.headerTitle}>원탭 멀티 플랫폼 변환</Text>
        </View>
        {state === 'done' && (
          <TouchableOpacity onPress={handleReset} activeOpacity={0.7}>
            <Text style={styles.resetText}>초기화</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.description}>
        {platform ? `${platformLabelShort(platform)} 우선 — ` : ''}
        각 플랫폼 비율에 맞춰 사진을 자동 변환합니다. 핵심 피사체가 잘리지 않도록 영역을 직접 편집할 수 있어요.
      </Text>

      {/* Hidden native cards for mobile capture */}
      {!isWeb && state === 'generating' && (
        <View style={styles.hiddenCardsContainer}>
          {formats.map((fmt, i) => (
            <View key={fmt.key} style={styles.hiddenCardWrap} collapsable={false}>
              <NativeFormatCard
                fmt={fmt}
                imageUrl={imageUrl}
                hook={hook}
                crop={getCrop(fmt.key)}
                title={title}
                hashtags={hashtags}
                accentColor={accentColor}
                affiliatePlatforms={affiliatePlatforms}
                shortUrl={shortUrl}
                cardRef={(ref) => { cardRefs.current[i] = ref; }}
              />
            </View>
          ))}
        </View>
      )}

      <View style={styles.formatPreviewRow}>
        {formats.map((fmt) => {
          const Icon = fmt.icon;
          return (
            <View key={fmt.key} style={styles.formatPreviewCard}>
              <View style={[styles.formatIconWrap, { backgroundColor: fmt.color + '20' }]}>
                <Icon size={16} color={fmt.color} strokeWidth={2} />
              </View>
              <Text style={styles.formatLabel}>{fmt.label}</Text>
              <Text style={styles.formatSub}>{fmt.sub}</Text>
            </View>
          );
        })}
      </View>

      {state === 'idle' && (
        <TouchableOpacity
          style={[styles.generateButton, !isWeb && { backgroundColor: theme.colors.accent[500] }]}
          onPress={handleEnterEditor}
          activeOpacity={0.8}
        >
          <Crop size={20} color="#fff" strokeWidth={2} />
          <Text style={styles.generateButtonText}>
            영역 편집 후 {formats.length}가지 비율 생성
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Crop Editor ─────────────────────────────────────────────── */}
      {state === 'editing' && activeFormat && (
        <View style={styles.editorWrap}>
          {/* Format selector tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.formatTabsScroll}>
            {formats.map((fmt, i) => {
              const Icon = fmt.icon;
              const isActive = i === activeFormatIndex;
              return (
                <TouchableOpacity
                  key={fmt.key}
                  style={[
                    styles.formatTab,
                    isActive && { backgroundColor: fmt.color + '20', borderColor: fmt.color },
                  ]}
                  onPress={() => setActiveFormatIndex(i)}
                  activeOpacity={0.7}
                >
                  <Icon size={12} color={isActive ? fmt.color : theme.colors.dark.textDim} strokeWidth={2} />
                  <Text
                    style={[
                      styles.formatTabText,
                      isActive && { color: fmt.color },
                    ]}
                  >
                    {fmt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Crop editor for active format */}
          <CropEditor
            fmt={activeFormat}
            imageUrl={imageUrl}
            crop={getCrop(activeFormat.key)}
            onCropChange={(crop) => updateCrop(activeFormat.key, crop)}
          />

          {/* Navigation between formats */}
          <View style={styles.editorNav}>
            <TouchableOpacity
              style={[styles.navBtn, activeFormatIndex === 0 && styles.navBtnDisabled]}
              onPress={() => activeFormatIndex > 0 && setActiveFormatIndex(activeFormatIndex - 1)}
              disabled={activeFormatIndex === 0}
              activeOpacity={0.7}
            >
              <Text style={[styles.navBtnText, activeFormatIndex === 0 && styles.navBtnTextDisabled]}>
                이전
              </Text>
            </TouchableOpacity>

            <Text style={styles.navPosition}>
              {activeFormatIndex + 1} / {formats.length}
            </Text>

            {activeFormatIndex < formats.length - 1 ? (
              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => setActiveFormatIndex(activeFormatIndex + 1)}
                activeOpacity={0.7}
              >
                <Text style={styles.navBtnText}>다음</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.navBtn, styles.navBtnDone]}
                onPress={handleGenerate}
                activeOpacity={0.7}
              >
                <CheckIcon size={14} color="#fff" strokeWidth={2} />
                <Text style={styles.navBtnDoneText}>완료</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Generate all button */}
          <TouchableOpacity
            style={[styles.generateButton, !isWeb && { backgroundColor: theme.colors.accent[500] }]}
            onPress={handleGenerate}
            activeOpacity={0.8}
          >
            <Zap size={20} color="#fff" strokeWidth={2} />
            <Text style={styles.generateButtonText}>
              {isWeb ? `${formats.length}가지 비율 동시 생성` : `${formats.length}가지 비율 만들고 갤러리 저장`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resetCropsBtn}
            onPress={handleResetCrops}
            activeOpacity={0.7}
          >
            <RotateCcw size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.resetCropsText}>모든 편집 초기화</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'generating' && (
        <View style={styles.progressWrap}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: isWeb ? theme.colors.warning[400] : theme.colors.accent[400] }]} />
          </View>
          <View style={styles.progressLabelRow}>
            <ActivityIndicator size="small" color={isWeb ? theme.colors.warning[400] : theme.colors.accent[400]} />
            <Text style={styles.progressText}>변환 중... {progress}%</Text>
          </View>
        </View>
      )}

      {state === 'done' && results.length > 0 && (
        <View style={styles.resultsWrap}>
          {/* Mobile: show saved confirmation + previews */}
          {!isWeb && (
            <View style={styles.savedBanner}>
              <Check size={16} color={theme.colors.success[400]} strokeWidth={2} />
              <Text style={styles.savedBannerText}>{results.length}개 포맷이 갤러리에 저장됐어요</Text>
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScroll}>
            {results.map((r) => {
              const Icon = r.format.icon;
              if (isWeb) {
                return (
                  <TouchableOpacity
                    key={r.format.key}
                    style={styles.previewCard}
                    onPress={() => handleDownloadOne(r)}
                    activeOpacity={0.8}
                  >
                    {/* @ts-ignore web img */}
                    <img
                      src={r.url}
                      style={{
                        width: '100%',
                        aspectRatio: r.format.width / r.format.height,
                        borderRadius: 12,
                        objectFit: 'cover',
                      }}
                    />
                    <View style={styles.previewInfo}>
                      <View style={styles.previewLabelRow}>
                        <Icon size={12} color={r.format.color} strokeWidth={2} />
                        <Text style={styles.previewLabel}>{r.format.label}</Text>
                      </View>
                      <Text style={styles.previewSub}>{r.format.sub}</Text>
                    </View>
                    <View style={styles.downloadBadge}>
                      <Download size={12} color="#fff" strokeWidth={2} />
                    </View>
                  </TouchableOpacity>
                );
              }
              return (
                <View key={r.format.key} style={styles.previewCard}>
                  <Image
                    source={{ uri: r.uri }}
                    style={{
                      width: '100%',
                      aspectRatio: r.format.width / r.format.height,
                      borderRadius: 12,
                    }}
                    resizeMode="cover"
                  />
                  <View style={styles.previewInfo}>
                    <View style={styles.previewLabelRow}>
                      <Icon size={12} color={r.format.color} strokeWidth={2} />
                      <Text style={styles.previewLabel}>{r.format.label}</Text>
                    </View>
                    <Text style={styles.previewSub}>{r.format.sub}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.resultButtons}>
            {isWeb ? (
              <TouchableOpacity style={styles.downloadAllButton} onPress={handleDownloadAll} activeOpacity={0.8}>
                <Download size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.downloadAllText}>전체 다운로드</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.downloadAllButton} onPress={handleShareMobile} activeOpacity={0.8}>
                <Share size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.downloadAllText}>공유하기</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.cloudButton}
              onPress={handleSaveAllToCloud}
              disabled={cloudSaving}
              activeOpacity={0.7}
            >
              {cloudSaving ? (
                <Loader2 size={16} color={theme.colors.primary[300]} strokeWidth={2} />
              ) : (
                <ImageIcon size={16} color={theme.colors.primary[300]} strokeWidth={2} />
              )}
              <Text style={styles.cloudButtonText}>
                {cloudSaving ? '저장 중...' : '클라우드 저장'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {toast && (
        <View style={styles.toastBox}>
          <Check size={14} color={theme.colors.success[400]} strokeWidth={2} />
          <Text style={styles.toastText}>{toast}</Text>
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
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
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
  hiddenCardsContainer: {
    position: 'absolute',
    opacity: 0,
    pointerEvents: 'none',
    left: -9999,
  },
  hiddenCardWrap: {
    marginBottom: 8,
  },
  formatPreviewRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  formatPreviewCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    gap: 2,
  },
  formatIconWrap: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  formatLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  formatSub: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warning[500],
    ...theme.shadows.card,
  },
  generateButtonText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  editorWrap: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  formatTabsScroll: {
    flexDirection: 'row',
  },
  formatTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: 'transparent',
    marginRight: 8,
  },
  formatTabText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  editorNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  navBtnTextDisabled: {
    color: theme.colors.dark.textFaint,
  },
  navPosition: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  navBtnDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.success[500],
  },
  navBtnDoneText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  resetCropsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  resetCropsText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  progressWrap: {
    gap: 10,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: theme.colors.warning[400],
  },
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  resultsWrap: {
    gap: theme.spacing.md,
  },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.success[500] + '15',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  savedBannerText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
  },
  previewScroll: {
    flexDirection: 'row',
  },
  previewCard: {
    width: 120,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 6,
    position: 'relative',
    marginRight: theme.spacing.sm,
  },
  previewInfo: {
    marginTop: 6,
    gap: 1,
  },
  previewLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  previewSub: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  downloadBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(10,15,30,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  downloadAllButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warning[500],
  },
  downloadAllText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  cloudButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500] + '15',
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '30',
  },
  cloudButtonText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  resetText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  toastBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.success[500] + '15',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.success[400],
  },
  toastText: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.success[400],
    lineHeight: 20,
  },
});
