import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ViewStyle } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Camera, Image as ImageIcon, Loader, ShieldAlert, RotateCcw } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { compressCaptureFrameToBlob } from '@/lib/imageEdit';
import { getSafeVideoConstraints, clampCaptureDimensions } from '@/lib/captureConstraints';
import { useCameraVisibilityRecovery } from '@/hooks/useCameraVisibilityRecovery';

export interface InlineViewfinderHandle {
  capture: () => Promise<{ base64: string; mimeType: string; blob?: Blob } | null>;
  isReady: () => boolean;
}

interface InlineCameraViewfinderProps {
  isActive: boolean;
  accentColor?: string;
  onPickFromGallery?: () => void;
  onCapture?: () => void;
  processing?: boolean;
}

export const InlineCameraViewfinder = forwardRef<
  InlineViewfinderHandle,
  InlineCameraViewfinderProps
>(function InlineCameraViewfinder(
  { isActive, accentColor, onPickFromGallery, onCapture, processing },
  ref,
) {
  const accent = accentColor ?? theme.colors.primary[400];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraRef = useRef<CameraView>(null);
  const mountedRef = useRef(true);
  const streamGenRef = useRef(0);

  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');

  const nativeFacing: CameraType = facing === 'environment' ? 'back' : 'front';

  const [permission, requestPermission] = useCameraPermissions();

  const stopStream = useCallback(() => {
    if (Platform.OS === 'web' && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch { /* element may be detached */ }
    }
    setCameraReady(false);
  }, []);

  const startWebStream = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    stopStream();
    const gen = ++streamGenRef.current;
    setError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: getSafeVideoConstraints(facing),
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!mountedRef.current || gen !== streamGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      // Detect hardware-level track termination (another app grabs camera,
      // USB disconnect, device sleep) so we don't keep a dead stream.
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (streamRef.current === stream) {
            streamRef.current = null;
            setCameraReady(false);
          }
        });
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch((playErr: unknown) => {
          if (playErr instanceof DOMException && playErr.name === 'AbortError') return;
        });
        if (
          mountedRef.current &&
          gen === streamGenRef.current &&
          videoRef.current &&
          videoRef.current.srcObject === stream
        ) {
          setCameraReady(true);
        } else {
          stream.getTracks().forEach((t) => t.stop());
          if (streamRef.current === stream) streamRef.current = null;
        }
      }
    } catch (err) {
      if (!mountedRef.current || gen !== streamGenRef.current) return;
      const msg = err instanceof Error ? err.message : '카메라 접근 실패';
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setError('카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라를 허용해주세요.');
      } else if (msg.includes('NotFound') || msg.includes('NotReadable')) {
        setError('카메라를 찾을 수 없습니다. 갤러리에서 사진을 선택해주세요.');
      } else {
        setError('카메라를 시작할 수 없습니다: ' + msg);
      }
    }
  }, [facing, stopStream]);

  const getStream = useCallback(() => streamRef.current, []);

  useCameraVisibilityRecovery({
    getStream,
    isActive,
    restartStream: () => startWebStream(),
    stopStream,
  });

  useEffect(() => {
    mountedRef.current = true;
    if (isActive && Platform.OS === 'web') {
      const id = setTimeout(() => startWebStream(), 200);
      return () => {
        clearTimeout(id);
        stopStream();
      };
    }
    return () => {
      if (Platform.OS === 'web') stopStream();
    };
  }, [isActive, startWebStream, stopStream]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (Platform.OS === 'web') stopStream();
    };
  }, [stopStream]);

  const captureWeb = useCallback(async (): Promise<{ base64: string; mimeType: string } | null> => {
    if (Platform.OS !== 'web' || !videoRef.current || !cameraReady) return null;
    try {
      const video = videoRef.current;
      const rawW = video.videoWidth || 1080;
      const rawH = video.videoHeight || 1920;
      const { width: w, height: h } = clampCaptureDimensions(rawW, rawH, 1080);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      if (facing === 'user') {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const rawBase64 = dataUrl.split(',')[1];
      canvas.width = 0;
      canvas.height = 0;
      return await compressCaptureFrameToBlob(rawBase64, 'image/jpeg');
    } catch {
      return null;
    }
  }, [cameraReady, facing]);

  const captureNative = useCallback(async (): Promise<{ base64: string; mimeType: string } | null> => {
    if (!nativeCameraRef.current) return null;
    try {
      const photo = await nativeCameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
        shutterSound: false,
      });
      if (photo?.base64) {
        return await compressCaptureFrameToBlob(photo.base64, 'image/jpeg');
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      capture: () => (Platform.OS === 'web' ? captureWeb() : captureNative()),
      isReady: () => cameraReady,
    }),
    [captureWeb, captureNative, cameraReady],
  );

  const handleFlip = () => {
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrapper}>
        <View style={styles.viewfinder}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: facing === 'user' ? 'scaleX(-1)' : 'none',
            }}
          />
          {/* Guideline frame overlay */}
          <View style={styles.guideFrame} pointerEvents="none">
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          {/* Center crosshair */}
          <View style={styles.crosshairH} pointerEvents="none" />
          <View style={styles.crosshairV} pointerEvents="none" />

          {!cameraReady && !error && (
            <View style={styles.loadingOverlay}>
              <Loader size={22} color={theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={styles.loadingText}>카메라 시작 중...</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorOverlay}>
              <ShieldAlert size={28} color={theme.colors.warning[400]} strokeWidth={1.5} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={[styles.retrySmallBtn, { backgroundColor: accent }]}
                onPress={() => startWebStream()}
                activeOpacity={0.8}
              >
                <Text style={styles.retrySmallText}>다시 시도</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Flip button */}
          {cameraReady && !error && (
            <TouchableOpacity
              style={styles.flipBtn}
              onPress={handleFlip}
              activeOpacity={0.7}
            >
              <RotateCcw size={16} color="#fff" strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        {/* Small action buttons row */}
        <View style={styles.smallBtnRow}>
          <TouchableOpacity
            style={styles.smallBtn}
            onPress={onPickFromGallery}
            activeOpacity={0.7}
          >
            <ImageIcon size={18} color={theme.colors.dark.text} strokeWidth={2} />
            <Text style={styles.smallBtnLabel}>갤러리</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.captureSmallBtn, !cameraReady && styles.captureSmallBtnDisabled]}
            onPress={onCapture}
            disabled={!cameraReady || processing}
            activeOpacity={0.85}
          >
            {processing ? (
              <Loader size={20} color="#fff" strokeWidth={2} />
            ) : (
              <Camera size={20} color="#fff" strokeWidth={2.5} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Native platform
  if (!permission) {
    return (
      <View style={styles.wrapper}>
        <View style={[styles.viewfinder, styles.centerContent]}>
          <Loader size={22} color={theme.colors.dark.textDim} strokeWidth={2} />
          <Text style={styles.loadingText}>카메라 준비 중...</Text>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.wrapper}>
        <View style={[styles.viewfinder, styles.centerContent]}>
          <ShieldAlert size={28} color={theme.colors.warning[400]} strokeWidth={1.5} />
          <Text style={styles.errorText}>카메라 권한이 필요합니다</Text>
          <TouchableOpacity
            style={[styles.retrySmallBtn, { backgroundColor: accent }]}
            onPress={requestPermission}
            activeOpacity={0.8}
          >
            <Text style={styles.retrySmallText}>권한 허용</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.viewfinder}>
        <CameraView
          ref={nativeCameraRef}
          style={StyleSheet.absoluteFillObject as ViewStyle}
          facing={nativeFacing}
          onCameraReady={() => setCameraReady(true)}
        />
        <View style={styles.guideFrame} pointerEvents="none">
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <View style={styles.crosshairH} pointerEvents="none" />
        <View style={styles.crosshairV} pointerEvents="none" />

        {!cameraReady && (
          <View style={styles.loadingOverlay}>
            <Loader size={22} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.loadingText}>카메라 시작 중...</Text>
          </View>
        )}

        {cameraReady && (
          <TouchableOpacity style={styles.flipBtn} onPress={handleFlip} activeOpacity={0.7}>
            <RotateCcw size={16} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.smallBtnRow}>
        <TouchableOpacity style={styles.smallBtn} onPress={onPickFromGallery} activeOpacity={0.7}>
          <ImageIcon size={18} color={theme.colors.dark.text} strokeWidth={2} />
          <Text style={styles.smallBtnLabel}>갤러리</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.captureSmallBtn, !cameraReady && styles.captureSmallBtnDisabled]}
          onPress={onCapture}
          disabled={!cameraReady || processing}
          activeOpacity={0.85}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {processing ? (
            <Loader size={20} color="#fff" strokeWidth={2} />
          ) : (
            <Camera size={20} color="#fff" strokeWidth={2.5} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  viewfinder: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#000',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  guideFrame: {
    position: 'absolute',
    top: '12%',
    left: '10%',
    right: '10%',
    bottom: '12%',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  crosshairH: {
    position: 'absolute',
    top: '50%',
    left: '35%',
    right: '35%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  crosshairV: {
    position: 'absolute',
    left: '50%',
    top: '35%',
    bottom: '35%',
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(5, 8, 18, 0.6)',
  },
  loadingText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(5, 8, 18, 0.85)',
    paddingHorizontal: 16,
  },
  errorText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 17,
  },
  retrySmallBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    marginTop: 4,
  },
  retrySmallText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  flipBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surface,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  smallBtnLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  captureSmallBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  captureSmallBtnDisabled: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
});
