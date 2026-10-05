import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ViewStyle, AppState, type AppStateStatus } from 'react-native';
import { CameraView } from 'expo-camera';
import { useCameraPermissionsSafe } from '@/hooks/useCameraPermissionsSafe';
import { Camera, Image as ImageIcon, Loader, ShieldAlert, RotateCcw } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { compressCaptureFrameToBlob, compressImageToBase64WithUri } from '@/lib/imageEdit';
import { debugSaveRawCapture, debugSaveNormalizedCapture } from '@/lib/debugCapture';
import { withFileSettle, waitForFileChannelFlush } from '@/lib/smartResize';
import { getSafeVideoConstraints, clampCaptureDimensions } from '@/lib/captureConstraints';
import { useCameraVisibilityRecovery } from '@/hooks/useCameraVisibilityRecovery';
import * as FileSystem from 'expo-file-system/legacy';

export interface InlineViewfinderHandle {
  capture: () => Promise<{ base64: string; mimeType: string; blob?: Blob; uri?: string } | null>;
  isReady: () => boolean;
}

interface InlineCameraViewfinderProps {
  isActive: boolean;
  accentColor?: string;
  onPickFromGallery?: () => void;
  onCapture?: () => void;
  processing?: boolean;
  onReadyChange?: (ready: boolean) => void;
}

export const InlineCameraViewfinder = forwardRef<
  InlineViewfinderHandle,
  InlineCameraViewfinderProps
>(function InlineCameraViewfinder(
  { isActive, accentColor, onPickFromGallery, onCapture, processing, onReadyChange },
  ref,
) {
  const accent = accentColor ?? theme.colors.primary[400];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const nativeCameraRef = useRef<CameraView | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const streamGenRef = useRef(0);
  const captureLockRef = useRef(false);
  const captureInProgressRef = useRef(false);
  const captureQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [cameraKey, setCameraKey] = useState(0);
  const [nativeCameraActive, setNativeCameraActive] = useState(false);

  useEffect(() => {
    onReadyChange?.(cameraReady);
  }, [cameraReady, onReadyChange]);

  const [permission, requestPermission] = useCameraPermissionsSafe();

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
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('이 브라우저에서는 카메라를 지원하지 않습니다. HTTPS 환경에서 사용해주세요.');
        return;
      }
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
      console.error('[InlineCameraViewfinder] stream error:', msg, err);
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

  // On native: unmount CameraView when app goes to background so the
  // OS can reclaim the camera hardware. Remount it when returning to
  // active state. This prevents the permanent camera lock that blocks
  // other apps and freezes the viewfinder.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!isActive) return;
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        setCameraReady(false);
        setNativeCameraActive(false);
        setCameraKey((k) => k + 1);
      } else if (nextState === 'active') {
        setCameraKey((k) => k + 1);
        const reDelayId = setTimeout(() => {
          if (mountedRef.current && isActive && permission?.granted) {
            setNativeCameraActive(true);
          }
        }, 350);
        return () => clearTimeout(reDelayId);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [isActive, permission?.granted]);

  useEffect(() => {
    mountedRef.current = true;
    if (Platform.OS !== 'web') {
      setCameraReady(false);
      if (!permission?.granted || !isActive) {
        setNativeCameraActive(false);
        return () => setCameraReady(false);
      }
      // Delay mounting CameraView to allow the previous camera session's
      // HAL file descriptor to fully release. When the main screen's CameraView
      // unmounts and this one mounts in the same render cycle, Android's Camera
      // HAL hasn't released the FD yet, causing silent initialization failure.
      const delayId = setTimeout(() => {
        if (mountedRef.current && isActive && permission?.granted) {
          setNativeCameraActive(true);
        }
      }, 350);
      return () => {
        clearTimeout(delayId);
        setNativeCameraActive(false);
        setCameraReady(false);
      };
    }
    if (isActive) {
      const id = setTimeout(() => startWebStream(), 200);
      return () => {
        clearTimeout(id);
        stopStream();
      };
    }
    return () => stopStream();
  }, [isActive, permission?.granted, startWebStream, stopStream]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (Platform.OS === 'web') stopStream();
    };
  }, [stopStream]);

  const captureWeb = useCallback(async (): Promise<{ base64: string; mimeType: string; uri?: string } | null> => {
    if (Platform.OS !== 'web' || !videoRef.current || !cameraReady) return null;
    if (captureInProgressRef.current) return null;
    captureInProgressRef.current = true;
    try {
      const video = videoRef.current;
      const rawW = video.videoWidth || 1080;
      const rawH = video.videoHeight || 1920;
      const { width: w, height: h } = clampCaptureDimensions(rawW, rawH, 720);
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
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      const rawBase64 = dataUrl.split(',')[1];
      canvas.width = 0;
      canvas.height = 0;
      await debugSaveRawCapture(rawBase64, 'image/jpeg', w, h, 'inline-web-raw');
      const result = await compressCaptureFrameToBlob(rawBase64, 'image/jpeg');
      await debugSaveNormalizedCapture(result.base64, result.mimeType, w, h, 'inline-web-normalized');
      return result;
    } catch (err) {
      console.error('[InlineCameraViewfinder] captureWeb failed:', err);
      return null;
    } finally {
      captureInProgressRef.current = false;
      captureLockRef.current = false;
    }
  }, [cameraReady, facing]);

  const captureNative = useCallback(async (): Promise<{ base64: string; mimeType: string; uri?: string } | null> => {
    if (Platform.OS === 'web' || !nativeCameraRef.current || !cameraReady || !nativeCameraActive) return null;

    const runCapture = async (): Promise<{ base64: string; mimeType: string; uri?: string } | null> => {
      if (captureInProgressRef.current) {
        captureLockRef.current = false;
        return null;
      }
      captureInProgressRef.current = true;
      let capturedUri: string | null = null;
      try {
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (!mountedRef.current || !nativeCameraRef.current || !cameraReady || !nativeCameraActive) return null;
        const result = await nativeCameraRef.current.takePictureAsync({
          quality: 0.6,
        });
        if (!result?.uri) {
          return null;
        }
        capturedUri = result.uri;
        const docDir = FileSystem.documentDirectory;
        if (docDir && capturedUri.startsWith('file://') && !capturedUri.startsWith(docDir)) {
          const safePath = `${docDir}cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          await withFileSettle('copyToDocDir', () =>
            FileSystem.copyAsync({ from: capturedUri!, to: safePath }),
          );
          await waitForFileChannelFlush();
          await withFileSettle('deleteOrigCapture', () =>
            FileSystem.deleteAsync(capturedUri!, { idempotent: true }),
          ).catch(() => {});
          capturedUri = safePath;
        }
        const uriToDelete = capturedUri;
        const compressed = await compressImageToBase64WithUri(uriToDelete, 720, 0.8);
        await debugSaveNormalizedCapture(compressed.base64, compressed.mimeType, 720, 720, 'inline-native-normalized');
        await withFileSettle('deleteCapturedUri', () =>
          FileSystem.deleteAsync(uriToDelete, { idempotent: true }),
        ).catch(() => {});
        await waitForFileChannelFlush();
        capturedUri = null;
        return { base64: compressed.base64, mimeType: compressed.mimeType, uri: compressed.compressedUri ?? undefined };
      } catch (err) {
        console.error('[InlineCameraViewfinder] native capture failed:', err);
        if (capturedUri) {
          const errUri = capturedUri;
          await withFileSettle('deleteCapturedUriErr', () =>
            FileSystem.deleteAsync(errUri, { idempotent: true }),
          ).catch(() => {});
          await waitForFileChannelFlush();
        }
        // Remount the camera session only on actual failure.
        setCameraKey((k) => k + 1);
        return null;
      } finally {
        // Post-capture hardware cooldown: hold the lock for an extra 150ms
        // after all I/O completes so the camera sensor buffer fully drains
        // before the next capture is allowed to start.
        await new Promise((resolve) => setTimeout(resolve, 150));
        captureInProgressRef.current = false;
        captureLockRef.current = false;
      }
    };

    // Enqueue: each capture waits for the previous one to fully complete
    // (including its post-capture cooldown) before starting.
    const next = captureQueueRef.current.then(() => runCapture());
    captureQueueRef.current = next.catch(() => {});
    return next;
  }, [cameraReady, nativeCameraActive]);

  useImperativeHandle(
    ref,
    () => ({
      capture: () => (Platform.OS === 'web' ? captureWeb() : captureNative()),
      isReady: () => cameraReady,
    }),
    [captureWeb, captureNative, cameraReady, nativeCameraActive],
  );

  const handleFlip = () => {
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  };

  const handleCapturePress = useCallback(() => {
    if (captureLockRef.current || captureInProgressRef.current || processing) return;
    captureLockRef.current = true;
    onCapture?.();
    // Safety net: if the parent's onCapture early-returns without calling
    // viewfinder.capture() (which resets the lock in its finally block),
    // release the lock after a short delay so the shutter doesn't freeze.
    setTimeout(() => { captureLockRef.current = false; }, 2000);
  }, [onCapture, processing]);

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
            onPress={handleCapturePress}
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

  // Native platform — only mount CameraView when active to prevent
  // camera session leaks that crash when another app grabs the camera
  // or the OS reclaims resources while this tab is in the background.
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
        {nativeCameraActive && (
          <CameraView
            key={cameraKey}
            ref={nativeCameraRef}
            style={StyleSheet.absoluteFillObject}
            facing={facing === 'environment' ? 'back' : 'front'}
            mode="picture"
            onCameraReady={() => setCameraReady(true)}
            onMountError={(event) => {
              setCameraReady(false);
              setError(event.message || '카메라를 시작할 수 없습니다.');
            }}
          />
        )}
        {!cameraReady && !error && (
          <View style={[StyleSheet.absoluteFillObject as ViewStyle, { backgroundColor: '#000' }]}>
            <View style={styles.centerContent}>
              <Camera size={22} color={theme.colors.dark.textDim} strokeWidth={1.5} />
              <Text style={styles.loadingText}>카메라 시작 중...</Text>
            </View>
          </View>
        )}
        {error && (
          <View style={styles.errorOverlay}>
            <ShieldAlert size={28} color={theme.colors.warning[400]} strokeWidth={1.5} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={[styles.retrySmallBtn, { backgroundColor: accent }]} onPress={onPickFromGallery} activeOpacity={0.8}>
              <Text style={styles.retrySmallText}>갤러리에서 선택</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.guideFrame} pointerEvents="none">
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <View style={styles.crosshairH} pointerEvents="none" />
        <View style={styles.crosshairV} pointerEvents="none" />

        {!cameraReady && isActive && (
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
          onPress={handleCapturePress}
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
