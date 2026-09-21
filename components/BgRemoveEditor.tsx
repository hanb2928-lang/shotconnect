import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Platform,
  PanResponder,
  Image as RNImage,
} from 'react-native';
import { Eraser, RotateCcw, Undo2, Check, X, Loader } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useSafeTop } from '@/hooks/useSafeTop';

const { width: screenWidth } = Dimensions.get('window');

type BrushMode = 'erase' | 'restore';

interface BgRemoveEditorProps {
  visible: boolean;
  imageDataUrl: string;
  /** Initial alpha mask from the first AI pass — each pixel's alpha (0-255). */
  initialMask?: Uint8ClampedArray | null;
  imageWidth: number;
  imageHeight: number;
  onConfirm: (maskDataUrl: string) => void;
  onCancel: () => void;
}

export function BgRemoveEditor({
  visible,
  imageDataUrl,
  initialMask,
  imageWidth,
  imageHeight,
  onConfirm,
  onCancel,
}: BgRemoveEditorProps) {
  const safeTop = useSafeTop();
  const [brushMode, setBrushMode] = useState<BrushMode>('erase');
  const [brushSize, setBrushSize] = useState(40);
  const [processing, setProcessing] = useState(false);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const checkerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const checkerBuiltFor = useRef<string>('');
  const undoStackRef = useRef<ImageData[]>([]);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const isDrawingRef = useRef(false);

  // Compute display dimensions to fit screen while preserving aspect ratio
  useEffect(() => {
    if (!visible || !imageWidth || !imageHeight) return;
    const maxW = screenWidth - 32;
    const maxH = Dimensions.get('window').height * 0.5;
    const scale = Math.min(maxW / imageWidth, maxH / imageHeight);
    setDisplaySize({
      w: Math.round(imageWidth * scale),
      h: Math.round(imageHeight * scale),
    });
  }, [visible, imageWidth, imageHeight]);

  // Cleanup canvases when modal closes to free memory
  useEffect(() => {
    if (visible) return;
    if (Platform.OS !== 'web') return;
    [canvasRef, maskCanvasRef, overlayCanvasRef, checkerCanvasRef].forEach((r) => {
      if (r.current) {
        r.current.width = 0;
        r.current.height = 0;
        r.current = null;
      }
    });
    undoStackRef.current = [];
    checkerBuiltFor.current = '';
  }, [visible]);

  // Initialize canvases when modal opens
  useEffect(() => {
    if (!visible || !displaySize.w || !displaySize.h || Platform.OS !== 'web') return;
    setImageLoaded(false);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Main image canvas
      const canvas = document.createElement('canvas');
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, imageWidth, imageHeight);
      canvasRef.current = canvas;

      // Mask canvas — white = keep, black = remove
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = imageWidth;
      maskCanvas.height = imageHeight;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) return;

      if (initialMask && initialMask.length === imageWidth * imageHeight * 4) {
        // Build mask from initial alpha: if alpha < 128, pixel was removed (black), else keep (white)
        const maskImg = maskCtx.createImageData(imageWidth, imageHeight);
        for (let i = 0; i < imageWidth * imageHeight; i++) {
          const alpha = initialMask[i * 4 + 3];
          maskImg.data[i * 4] = alpha < 128 ? 0 : 255;
          maskImg.data[i * 4 + 1] = alpha < 128 ? 0 : 255;
          maskImg.data[i * 4 + 2] = alpha < 128 ? 0 : 255;
          maskImg.data[i * 4 + 3] = 255;
        }
        maskCtx.putImageData(maskImg, 0, 0);
      } else {
        // No initial mask — start with everything kept (white)
        maskCtx.fillStyle = 'white';
        maskCtx.fillRect(0, 0, imageWidth, imageHeight);
      }
      maskCanvasRef.current = maskCanvas;

      renderDisplay();
      setImageLoaded(true);
    };
    img.onerror = () => {
      setImageLoaded(false);
    };
    img.src = imageDataUrl;
  }, [visible, displaySize, imageDataUrl, imageWidth, imageHeight, initialMask]);

  const renderDisplay = useCallback(() => {
    if (!canvasRef.current || !maskCanvasRef.current || !displayCanvasRef.current || Platform.OS !== 'web') return;

    const displayCanvas = displayCanvasRef.current;
    const dCtx = displayCanvas.getContext('2d');
    if (!dCtx) return;

    dCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);

    dCtx.drawImage(canvasRef.current, 0, 0, displayCanvas.width, displayCanvas.height);

    const maskCanvas = maskCanvasRef.current;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;

    const maskData = maskCtx.getImageData(0, 0, imageWidth, imageHeight);

    // Reuse persistent overlay canvas
    if (!overlayCanvasRef.current) {
      overlayCanvasRef.current = document.createElement('canvas');
    }
    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas.width !== imageWidth || overlayCanvas.height !== imageHeight) {
      overlayCanvas.width = imageWidth;
      overlayCanvas.height = imageHeight;
    }
    const oCtx = overlayCanvas.getContext('2d');
    if (!oCtx) return;
    oCtx.clearRect(0, 0, imageWidth, imageHeight);
    const overlayData = oCtx.createImageData(imageWidth, imageHeight);
    for (let i = 0; i < imageWidth * imageHeight; i++) {
      const isRemoved = maskData.data[i * 4] < 128;
      if (isRemoved) {
        overlayData.data[i * 4] = 220;
        overlayData.data[i * 4 + 1] = 50;
        overlayData.data[i * 4 + 2] = 50;
        overlayData.data[i * 4 + 3] = 140;
      }
    }
    oCtx.putImageData(overlayData, 0, 0);
    dCtx.drawImage(overlayCanvas, 0, 0, displayCanvas.width, displayCanvas.height);

    // Build checkerboard once and cache
    const checkerKey = `${imageWidth}x${imageHeight}`;
    if (!checkerCanvasRef.current || checkerBuiltFor.current !== checkerKey) {
      const checkerCanvas = document.createElement('canvas');
      checkerCanvas.width = imageWidth;
      checkerCanvas.height = imageHeight;
      const cCtx = checkerCanvas.getContext('2d');
      if (!cCtx) return;
      const checkerSize = 12;
      for (let y = 0; y < imageHeight; y += checkerSize) {
        for (let x = 0; x < imageWidth; x += checkerSize) {
          const isLight = ((x / checkerSize) + (y / checkerSize)) % 2 === 0;
          cCtx.fillStyle = isLight ? '#e8e8e8' : '#c0c0c0';
          cCtx.fillRect(x, y, checkerSize, checkerSize);
        }
      }
      checkerCanvasRef.current = checkerCanvas;
      checkerBuiltFor.current = checkerKey;
    }

    const checkerCanvas = checkerCanvasRef.current!;
    const cCtx = checkerCanvas.getContext('2d');
    if (!cCtx) return;

    // Apply checker only to removed areas using composite ops on the checker itself
    cCtx.globalCompositeOperation = 'destination-in';
    const removedMask = document.createElement('canvas');
    removedMask.width = imageWidth;
    removedMask.height = imageHeight;
    const rCtx = removedMask.getContext('2d');
    if (!rCtx) return;
    const rData = rCtx.createImageData(imageWidth, imageHeight);
    for (let i = 0; i < imageWidth * imageHeight; i++) {
      const isRemoved = maskData.data[i * 4] < 128;
      rData.data[i * 4 + 3] = isRemoved ? 255 : 0;
    }
    rCtx.putImageData(rData, 0, 0);
    cCtx.drawImage(removedMask, 0, 0);
    cCtx.globalCompositeOperation = 'source-over';

    removedMask.width = 0;
    removedMask.height = 0;

    dCtx.globalCompositeOperation = 'destination-over';
    dCtx.drawImage(checkerCanvas, 0, 0, displayCanvas.width, displayCanvas.height);
    dCtx.globalCompositeOperation = 'source-over';
  }, [imageWidth, imageHeight]);

  // Convert display coordinates to mask coordinates
  const toMaskCoords = useCallback(
    (x: number, y: number) => {
      if (!displayCanvasRef.current) return { x: 0, y: 0 };
      const canvas = displayCanvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = imageWidth / rect.width;
      const scaleY = imageHeight / rect.height;
      return {
        x: (x - rect.left) * scaleX,
        y: (y - rect.top) * scaleY,
      };
    },
    [imageWidth, imageHeight],
  );

  // Draw a stroke on the mask canvas
  const drawStroke = useCallback(
    (x: number, y: number) => {
      if (!maskCanvasRef.current || Platform.OS !== 'web') return;
      const maskCtx = maskCanvasRef.current.getContext('2d');
      if (!maskCtx) return;

      const radius = brushSize * (imageWidth / displaySize.w);
      const color = brushMode === 'erase' ? 'black' : 'white';

      maskCtx.fillStyle = color;
      maskCtx.strokeStyle = color;
      maskCtx.lineWidth = radius * 2;
      maskCtx.lineCap = 'round';
      maskCtx.lineJoin = 'round';

      if (lastPointRef.current) {
        maskCtx.beginPath();
        maskCtx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
        maskCtx.lineTo(x, y);
        maskCtx.stroke();
      }

      maskCtx.beginPath();
      maskCtx.arc(x, y, radius, 0, Math.PI * 2);
      maskCtx.fill();

      lastPointRef.current = { x, y };
      renderDisplay();
    },
    [brushSize, brushMode, imageWidth, displaySize, renderDisplay],
  );

  // Pan responder for touch/mouse drawing
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Platform.OS !== 'web',
      onMoveShouldSetPanResponder: () => Platform.OS !== 'web',
      onPanResponderGrant: (evt) => {
        if (Platform.OS === 'web') return;
        isDrawingRef.current = true;
        saveUndoSnapshot();
        const { x, y } = toMaskCoords(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        drawStroke(x, y);
      },
      onPanResponderMove: (evt) => {
        if (!isDrawingRef.current || Platform.OS === 'web') return;
        const { x, y } = toMaskCoords(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        drawStroke(x, y);
      },
      onPanResponderRelease: () => {
        isDrawingRef.current = false;
        lastPointRef.current = null;
      },
    }),
  ).current;

  const saveUndoSnapshot = useCallback(() => {
    if (!maskCanvasRef.current || Platform.OS !== 'web') return;
    const ctx = maskCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const snapshot = ctx.getImageData(0, 0, imageWidth, imageHeight);
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
  }, [imageWidth, imageHeight]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0 || !maskCanvasRef.current || Platform.OS !== 'web') return;
    const snapshot = undoStackRef.current.pop()!;
    const ctx = maskCanvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(snapshot, 0, 0);
    renderDisplay();
  }, [renderDisplay]);

  const handleReset = useCallback(() => {
    if (!maskCanvasRef.current || Platform.OS !== 'web') return;
    saveUndoSnapshot();
    const ctx = maskCanvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, imageWidth, imageHeight);
    renderDisplay();
  }, [imageWidth, imageHeight, renderDisplay, saveUndoSnapshot]);

  // Web mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (Platform.OS !== 'web') return;
      isDrawingRef.current = true;
      saveUndoSnapshot();
      lastPointRef.current = null;
      const { x, y } = toMaskCoords(e.clientX, e.clientY);
      drawStroke(x, y);
    },
    [saveUndoSnapshot, toMaskCoords, drawStroke],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawingRef.current || Platform.OS !== 'web') return;
      const { x, y } = toMaskCoords(e.clientX, e.clientY);
      drawStroke(x, y);
    },
    [toMaskCoords, drawStroke],
  );

  const handleMouseUp = useCallback(() => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  // Generate the final result: apply mask to image, output as PNG data URL
  const handleConfirm = useCallback(() => {
    if (!canvasRef.current || !maskCanvasRef.current || Platform.OS !== 'web') {
      onConfirm('');
      return;
    }
    setProcessing(true);

    try {
      const resultCanvas = document.createElement('canvas');
      resultCanvas.width = imageWidth;
      resultCanvas.height = imageHeight;
      const rCtx = resultCanvas.getContext('2d');
      if (!rCtx) throw new Error('캔버스를 생성할 수 없습니다');

      // Draw the image
      rCtx.drawImage(canvasRef.current, 0, 0);

      // Apply the mask: set alpha based on mask (white = opaque, black = transparent)
      const imgData = rCtx.getImageData(0, 0, imageWidth, imageHeight);
      const maskCtx = maskCanvasRef.current.getContext('2d');
      if (!maskCtx) throw new Error('마스크를 읽을 수 없습니다');
      const maskData = maskCtx.getImageData(0, 0, imageWidth, imageHeight);

      for (let i = 0; i < imageWidth * imageHeight; i++) {
        const maskVal = maskData.data[i * 4]; // red channel: 255 = keep, 0 = remove
        imgData.data[i * 4 + 3] = maskVal; // set alpha directly
      }

      rCtx.putImageData(imgData, 0, 0);
      const dataUrl = resultCanvas.toDataURL('image/png');
      onConfirm(dataUrl);
    } catch {
      onConfirm('');
    } finally {
      setProcessing(false);
    }
  }, [imageWidth, imageHeight, onConfirm]);

  // Also generate a mask data URL for sending to the server
  const getMaskDataUrl = useCallback((): string => {
    if (!maskCanvasRef.current || Platform.OS !== 'web') return '';
    // Create a smaller mask for upload (grayscale, 512px max)
    const maxDim = 512;
    const scale = Math.min(1, maxDim / Math.max(imageWidth, imageHeight));
    const sw = Math.round(imageWidth * scale);
    const sh = Math.round(imageHeight * scale);
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = sw;
    smallCanvas.height = sh;
    const sCtx = smallCanvas.getContext('2d');
    if (!sCtx) return '';
    sCtx.drawImage(maskCanvasRef.current, 0, 0, sw, sh);
    return smallCanvas.toDataURL('image/png');
  }, [imageWidth, imageHeight]);

  if (Platform.OS !== 'web') {
    // On native, we can't use canvas-based interactive masking
    // Fall back to a simple confirmation that triggers server-side removal
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.nativeCard}>
            <Text style={styles.nativeTitle}>AI 배경 제거</Text>
            <Text style={styles.nativeDesc}>
              AI가 1차로 배경을 제거합니다. 완료 후 추가 편집이 필요하면 웹에서 이용할 수 있어요.
            </Text>
            <View style={styles.nativeActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
                <Text style={styles.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={() => onConfirm('')}
                disabled={processing}
                activeOpacity={0.7}
              >
                {processing ? (
                  <Loader size={16} color="#fff" strokeWidth={2} />
                ) : (
                  <Check size={16} color="#fff" strokeWidth={2} />
                )}
                <Text style={styles.confirmText}>배경 제거 시작</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.container, { paddingTop: safeTop + 8 }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onCancel} activeOpacity={0.7}>
              <X size={20} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>배경 제거 편집</Text>
            <TouchableOpacity
              style={styles.headerConfirmBtn}
              onPress={handleConfirm}
              disabled={processing || !imageLoaded}
              activeOpacity={0.7}
            >
              <Check size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.headerConfirmText}>완료</Text>
            </TouchableOpacity>
          </View>

          {/* Canvas area */}
          <View style={styles.canvasArea}>
            {!imageLoaded && (
              <View style={styles.loadingBox}>
                <Loader size={28} color={theme.colors.primary[400]} strokeWidth={2} />
                <Text style={styles.loadingText}>편집기를 준비하는 중...</Text>
              </View>
            )}
            {imageLoaded && displaySize.w > 0 && (
              <canvas
                ref={(el) => {
                  if (el) {
                    el.width = displaySize.w;
                    el.height = displaySize.h;
                    displayCanvasRef.current = el;
                    renderDisplay();
                  }
                }}
                style={{
                  width: displaySize.w,
                  height: displaySize.h,
                  borderRadius: 12,
                  cursor: brushMode === 'erase' ? 'crosshair' : 'cell',
                  touchAction: 'none',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            )}
          </View>

          {/* Brush tools */}
          <View style={styles.toolPanel}>
            {/* Mode toggle */}
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn, brushMode === 'erase' && styles.modeBtnActive]}
                onPress={() => setBrushMode('erase')}
                activeOpacity={0.7}
              >
                <Eraser size={16} color={brushMode === 'erase' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
                <Text style={[styles.modeText, brushMode === 'erase' && styles.modeTextActive]}>지우기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, brushMode === 'restore' && styles.modeBtnRestoreActive]}
                onPress={() => setBrushMode('restore')}
                activeOpacity={0.7}
              >
                <RotateCcw size={16} color={brushMode === 'restore' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
                <Text style={[styles.modeText, brushMode === 'restore' && styles.modeTextActive]}>복구</Text>
              </TouchableOpacity>
            </View>

            {/* Brush size slider */}
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>붓 크기</Text>
              <input
                type="range"
                min={10}
                max={80}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                style={{ flex: 1, accentColor: theme.colors.primary[400] }}
              />
              <Text style={styles.sliderValue}>{brushSize}px</Text>
            </View>

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleUndo} activeOpacity={0.7}>
                <Undo2 size={16} color={theme.colors.dark.text} strokeWidth={2} />
                <Text style={styles.actionText}>실행 취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={handleReset} activeOpacity={0.7}>
                <RotateCcw size={16} color={theme.colors.dark.text} strokeWidth={2} />
                <Text style={styles.actionText}>전체 복구</Text>
              </TouchableOpacity>
            </View>

            {/* Hint */}
            <Text style={styles.hintText}>
              빨간 영역이 제거될 부분이에요. 지우개로 추가 제거, 복구로 되살릴 수 있어요.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  headerConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary[500],
  },
  headerConfirmText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  canvasArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  loadingBox: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  toolPanel: {
    backgroundColor: theme.colors.dark.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  modeRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  modeBtnActive: {
    backgroundColor: theme.colors.error[500],
  },
  modeBtnRestoreActive: {
    backgroundColor: theme.colors.success[500],
  },
  modeText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  modeTextActive: {
    color: '#fff',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  sliderLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  sliderValue: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    minWidth: 36,
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  actionText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  hintText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  // Native fallback
  nativeCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    margin: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  nativeTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  nativeDesc: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 20,
  },
  nativeActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
  },
  confirmText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
