import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  Image as RNImage,
  LayoutChangeEvent,
  GestureResponderEvent,
} from 'react-native';
import { Check, X, RotateCw, Crop } from 'lucide-react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { theme } from '@/lib/theme';
import { buildDataUrl, cleanBase64 } from '@/lib/base64';

interface ImageCropModalProps {
  visible: boolean;
  imageBase64: string;
  mimeType: string;
  onConfirm: (base64: string, mimeType: string) => void;
  onCancel: () => void;
}

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_CROP_SIZE = 60;

export function ImageCropModal({
  visible,
  imageBase64,
  mimeType,
  onConfirm,
  onCancel,
}: ImageCropModalProps) {
  const [rotation, setRotation] = useState(0);
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const [imageDim, setImageDim] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; rect: CropRect; mode: 'move' | 'resize' } | null>(null);
  const [processing, setProcessing] = useState(false);
  const dataUrl = useMemo(() => buildDataUrl(imageBase64, mimeType), [imageBase64, mimeType]);
  const previewRect = useMemo(() => {
    if (!layout.w || !layout.h || !imageDim.w || !imageDim.h) {
      return { x: 0, y: 0, w: layout.w, h: layout.h };
    }
    const scale = Math.min(layout.w / imageDim.w, layout.h / imageDim.h);
    const w = imageDim.w * scale;
    const h = imageDim.h * scale;
    return { x: (layout.w - w) / 2, y: (layout.h - h) / 2, w, h };
  }, [layout, imageDim]);
  const imageRect = useMemo(() => {
    const rotated = rotation % 180 === 0 ? imageDim : { w: imageDim.h, h: imageDim.w };
    if (!layout.w || !layout.h || !rotated.w || !rotated.h) {
      return { x: 0, y: 0, w: layout.w, h: layout.h };
    }
    const scale = Math.min(layout.w / rotated.w, layout.h / rotated.h);
    const w = rotated.w * scale;
    const h = rotated.h * scale;
    return { x: (layout.w - w) / 2, y: (layout.h - h) / 2, w, h };
  }, [layout, imageDim, rotation]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout({ w: width, h: height });
  }, []);

  const handleImageLoad = useCallback((e: { nativeEvent: { source?: { width?: number; height?: number }; dimensions?: { width: number; height: number } } }) => {
    const source = e.nativeEvent.source;
    const dimensions = e.nativeEvent.dimensions;
    const width = source?.width ?? dimensions?.width ?? 0;
    const height = source?.height ?? dimensions?.height ?? 0;
    if (width && height) {
      setImageDim({ w: width, h: height });
      setCrop({ x: 0, y: 0, w: 0, h: 0 });
    } else if (dataUrl) {
      RNImage.getSize(
        dataUrl,
        (w, h) => setImageDim({ w, h }),
        () => {},
      );
    }
  }, [dataUrl]);

  useEffect(() => {
    if (imageRect.w > 0 && imageRect.h > 0 && crop.w === 0) {
      setCrop({ x: imageRect.x, y: imageRect.y, w: imageRect.w, h: imageRect.h });
    }
  }, [imageRect, crop.w]);

  const handleRotate = () => {
    const nextRotation = (rotation + 90) % 360;
    const rotated = nextRotation % 180 === 0 ? imageDim : { w: imageDim.h, h: imageDim.w };
    const scale = rotated.w && rotated.h
      ? Math.min(layout.w / rotated.w, layout.h / rotated.h)
      : 0;
    const w = rotated.w * scale;
    const h = rotated.h * scale;
    setRotation(nextRotation);
    setCrop({ x: (layout.w - w) / 2, y: (layout.h - h) / 2, w, h });
  };

  const handleDragStart = (e: GestureResponderEvent, mode: 'move' | 'resize') => {
    if (!imageRect.w || !imageRect.h) return;
    setDragStart({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, rect: crop, mode });
  };

  const handleDragMove = (e: GestureResponderEvent) => {
    if (!dragStart) return;
    const dx = e.nativeEvent.pageX - dragStart.x;
    const dy = e.nativeEvent.pageY - dragStart.y;
    if (dragStart.mode === 'move') {
      const x = Math.max(imageRect.x, Math.min(imageRect.x + imageRect.w - dragStart.rect.w, dragStart.rect.x + dx));
      const y = Math.max(imageRect.y, Math.min(imageRect.y + imageRect.h - dragStart.rect.h, dragStart.rect.y + dy));
      setCrop({ ...dragStart.rect, x, y });
      return;
    }
    const newW = Math.max(MIN_CROP_SIZE, Math.min(dragStart.rect.w + dx, imageRect.x + imageRect.w - dragStart.rect.x));
    const newH = Math.max(MIN_CROP_SIZE, Math.min(dragStart.rect.h + dy, imageRect.y + imageRect.h - dragStart.rect.y));
    setCrop({ ...dragStart.rect, w: newW, h: newH });
  };

  const handleDragEnd = () => {
    setDragStart(null);
  };

  const handleConfirm = async () => {
    if (processing || !imageRect.w || !imageRect.h || !imageDim.w || !imageDim.h) return;
    setProcessing(true);
    try {
      const result = Platform.OS === 'web'
        ? await cropOnWeb(dataUrl, crop, imageRect, rotation, imageDim)
        : await cropOnNative(dataUrl, crop, imageRect, rotation, imageDim);
      const b64 = cleanBase64(result);
      onConfirm(b64, result.match(/^data:(image\/\w+);/)?.[1] || 'image/jpeg');
    } catch {
      onConfirm(imageBase64, mimeType);
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setRotation(0);
    setCrop({ x: imageRect.x, y: imageRect.y, w: imageRect.w, h: imageRect.h });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <Text style={styles.title}>사진 자르기</Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <View style={styles.imageArea} onLayout={handleLayout}>
            {layout.w > 0 && (
              <RNImage
                source={{ uri: dataUrl }}
                style={[
                  styles.previewImage,
                  {
                    left: previewRect.x,
                    top: previewRect.y,
                    width: previewRect.w,
                    height: previewRect.h,
                    transform: [{ rotate: `${rotation}deg` }],
                  },
                ]}
                resizeMode="contain"
                onLoad={handleImageLoad}
              />
            )}
            <View
              style={[
                styles.cropBox,
                {
                  left: crop.x,
                  top: crop.y,
                  width: crop.w,
                  height: crop.h,
                },
              ]}
              onStartShouldSetResponder={() => true}
              onResponderGrant={(e) => handleDragStart(e, 'move')}
              onResponderMove={handleDragMove}
              onResponderRelease={handleDragEnd}
            >
              <View style={styles.cropCornerTL} />
              <View style={styles.cropCornerTR} />
              <View style={styles.cropCornerBL} />
              <View
                style={styles.cropCornerBR}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(e) => handleDragStart(e, 'resize')}
                onResponderMove={handleDragMove}
                onResponderRelease={handleDragEnd}
              />
              <View
                style={styles.cropHandle}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(e) => handleDragStart(e, 'resize')}
                onResponderMove={handleDragMove}
                onResponderRelease={handleDragEnd}
              />
            </View>
          </View>

          <Text style={styles.hint}>사각형을 드래그하여 영역을 조절하세요</Text>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleReset} activeOpacity={0.7}>
              <Crop size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={styles.actionBtnText}>초기화</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleRotate} activeOpacity={0.7}>
              <RotateCw size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={styles.actionBtnText}>회전</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} disabled={processing} activeOpacity={0.8}>
              <Check size={18} color="#fff" strokeWidth={2.5} />
              <Text style={styles.confirmBtnText}>{processing ? '처리 중...' : '확인'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function cropOnWeb(
  dataUrl: string,
  crop: CropRect,
  imageRect: { x: number; y: number; w: number; h: number },
  rotation: number,
  imageDim: { w: number; h: number },
): Promise<string> {
  const MAX_INTERMEDIATE = 2048;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const sourceW = img.naturalWidth || imageDim.w;
      const sourceH = img.naturalHeight || imageDim.h;
      const rotatedW = rotation % 180 === 0 ? sourceW : sourceH;
      const rotatedH = rotation % 180 === 0 ? sourceH : sourceW;
      const scaleX = rotatedW / imageRect.w;
      const scaleY = rotatedH / imageRect.h;
      const cropX = Math.max(0, (crop.x - imageRect.x) * scaleX);
      const cropY = Math.max(0, (crop.y - imageRect.y) * scaleY);
      const cropW = Math.min(rotatedW - cropX, crop.w * scaleX);
      const cropH = Math.min(rotatedH - cropY, crop.h * scaleY);

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(cropW));
      canvas.height = Math.max(1, Math.round(cropH));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas error'));
        return;
      }

      const intermediateScale = Math.min(1, MAX_INTERMEDIATE / Math.max(rotatedW, rotatedH));
      const interW = Math.max(1, Math.round(rotatedW * intermediateScale));
      const interH = Math.max(1, Math.round(rotatedH * intermediateScale));

      const rotatedCanvas = document.createElement('canvas');
      rotatedCanvas.width = interW;
      rotatedCanvas.height = interH;
      const rotatedCtx = rotatedCanvas.getContext('2d');
      if (!rotatedCtx) {
        reject(new Error('canvas error'));
        return;
      }
      rotatedCtx.save();
      if (rotation === 90) {
        rotatedCtx.translate(interW, 0);
        rotatedCtx.rotate(Math.PI / 2);
      } else if (rotation === 180) {
        rotatedCtx.translate(interW, interH);
        rotatedCtx.rotate(Math.PI);
      } else if (rotation === 270) {
        rotatedCtx.translate(0, interH);
        rotatedCtx.rotate(-Math.PI / 2);
      }
      rotatedCtx.drawImage(img, 0, 0, sourceW, sourceH, 0, 0, interW, interH);
      rotatedCtx.restore();

      const adjCropX = cropX * intermediateScale;
      const adjCropY = cropY * intermediateScale;
      const adjCropW = cropW * intermediateScale;
      const adjCropH = cropH * intermediateScale;
      ctx.drawImage(rotatedCanvas, adjCropX, adjCropY, adjCropW, adjCropH, 0, 0, canvas.width, canvas.height);

      rotatedCanvas.width = 0;
      rotatedCanvas.height = 0;

      resolve(canvas.toDataURL('image/jpeg', 0.85));
      canvas.width = 0;
      canvas.height = 0;
    };
    img.onerror = () => reject(new Error('image load error'));
    img.src = dataUrl;
  });
}

async function cropOnNative(
  dataUrl: string,
  crop: CropRect,
  imageRect: { x: number; y: number; w: number; h: number },
  rotation: number,
  imageDim: { w: number; h: number },
): Promise<string> {
  const rotated = rotation % 180 === 0 ? imageDim : { w: imageDim.h, h: imageDim.w };
  const scaleX = rotated.w / imageRect.w;
  const scaleY = rotated.h / imageRect.h;

  const actions: ImageManipulator.Action[] = [];
  if (rotation > 0) {
    actions.push({ rotate: rotation } as ImageManipulator.Action);
  }

  const cropX = Math.max(0, Math.round((crop.x - imageRect.x) * scaleX));
  const cropY = Math.max(0, Math.round((crop.y - imageRect.y) * scaleY));
  const cropW = Math.min(rotated.w - cropX, Math.round(crop.w * scaleX));
  const cropH = Math.min(rotated.h - cropY, Math.round(crop.h * scaleY));

  if (cropW > 0 && cropH > 0) {
    actions.push({
      crop: { originX: cropX, originY: cropY, width: cropW, height: cropH },
    } as ImageManipulator.Action);
  }

  if (actions.length === 0) return dataUrl;

  const result = await ImageManipulator.manipulateAsync(dataUrl, actions, {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const base64 = await FileSystem.readAsStringAsync(result.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:image/jpeg;base64,${base64}`;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageArea: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#000',
    borderRadius: theme.radius.md,
    overflow: 'visible',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    position: 'absolute',
  },
  cropBox: {
    position: 'absolute',
    borderColor: theme.colors.primary[400],
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  cropCornerTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 20,
    height: 20,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: theme.colors.primary[300],
  },
  cropCornerTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: theme.colors.primary[300],
  },
  cropCornerBL: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 20,
    height: 20,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: theme.colors.primary[300],
  },
  cropCornerBR: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: theme.colors.primary[300],
  },
  cropHandle: {
    position: 'absolute',
    bottom: -16,
    right: -16,
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary[400],
    borderWidth: 3,
    borderColor: '#fff',
  },
  hint: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    marginTop: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  actionBtnText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[400],
    marginLeft: 'auto',
  },
  confirmBtnText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
});
