import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import Animated, { useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { theme } from '@/lib/theme';
import { Camera, RotateCcw, Zap, X, Image as ImageIcon, Sparkles, Check, ShieldAlert, Video, Square } from 'lucide-react-native';
import { cleanBase64, getMimeTypeFromDataUrl } from '@/lib/base64';
import { prepareImageForApi } from '@/lib/imageEdit';
import { startVideoRecording, stopVideoRecording, blobToBase64, type VideoRecordingResult } from '@/lib/videoRecorder';
import { getSafeVideoConstraints, clampCaptureDimensions, CAPTURE_MAX_WIDTH } from '@/lib/captureConstraints';
import { useCameraVisibilityRecovery } from '@/hooks/useCameraVisibilityRecovery';

export type CaptureModeType = 'single' | 'video';

export interface WebCameraHandle {
  captureFrame: () => Promise<{ base64: string; mimeType: string } | null>;
  isReady: () => boolean;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<{ base64: string; mimeType: string } | null>;
  isRecording: () => boolean;
}

interface WebCameraViewProps {
  onCapture: (base64: string, mimeType: string) => void;
  onPickImage: () => void;
  isActive: boolean;
  safeTop: number;
  tabBarHeight: number;
  bottomInset: number;
  captureMode: CaptureModeType;
  onCaptureModeChange: (mode: CaptureModeType) => void;
  autoSaving: boolean;
  autoSaveToast: string | null;
  autoSaveStep: number;
  onMultiAnglePress: () => void;
  onCameraReady?: (ready: boolean) => void;
  cameraRole?: 'template' | 'video';
  simplified?: boolean;
}

type Facing = 'user' | 'environment';

const ALL_MODE_META: { key: CaptureModeType; label: string; icon: typeof Camera; desc: string }[] = [
  { key: 'single', label: '입체컷', icon: Camera, desc: '5각도 입체 합성 컷' },
];

const MODE_META = (role: 'template' | 'video'): typeof ALL_MODE_META =>
  role === 'video' ? [] : ALL_MODE_META;

export const WebCameraView = forwardRef<WebCameraHandle, WebCameraViewProps>(function WebCameraView({
  onCapture,
  onPickImage,
  isActive,
  safeTop,
  tabBarHeight,
  bottomInset,
  captureMode,
  onCaptureModeChange,
  autoSaving,
  autoSaveToast,
  autoSaveStep,
  onMultiAnglePress,
  onCameraReady,
  cameraRole = 'template',
  simplified = false,
}, ref) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedRef = useRef(true);
  const streamGenRef = useRef(0);
  const [facing, setFacing] = useState<Facing>('environment');
  const [gridVisible, setGridVisible] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'permission' | 'notfound' | 'generic'>('generic');
  const [capturing, setCapturing] = useState(false);
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string>('image/jpeg');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingPromiseRef = useRef<Promise<VideoRecordingResult> | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseScale = useSharedValue(1);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch { /* element may be detached */ }
    }
    setCameraReady(false);
    onCameraReady?.(false);
  }, [onCameraReady]);

  const startStream = useCallback(async (face: Facing, withAudio = false) => {
    if (Platform.OS !== 'web') return;
    stopStream();
    const gen = ++streamGenRef.current;
    setError(null);
    setCameraReady(false);
    try {
      const constraints: MediaStreamConstraints = {
        video: getSafeVideoConstraints(face),
        audio: withAudio,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!mountedRef.current || gen !== streamGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (streamRef.current === stream) {
            streamRef.current = null;
            setCameraReady(false);
            onCameraReady?.(false);
          }
        });
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        if (mountedRef.current && gen === streamGenRef.current) {
          setCameraReady(true);
          onCameraReady?.(true);
        }
      }
    } catch (err) {
      if (!mountedRef.current || gen !== streamGenRef.current) return;
      const msg = err instanceof Error ? err.message : '카메라 접근 실패';
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setError('카메라 권한이 거부되었습니다. 브라우저 또는 기기 설정에서 카메라 접근을 허용해주세요.');
        setErrorKind('permission');
      } else if (msg.includes('NotFound') || msg.includes('NotReadable')) {
        setError('사용 가능한 카메라를 찾을 수 없습니다. 카메라가 다른 앱에서 사용 중이거나 기기에 카메라가 없습니다.');
        setErrorKind('notfound');
      } else {
        setError('카메라를 시작할 수 없습니다: ' + msg);
        setErrorKind('generic');
      }
    }
  }, [stopStream, onCameraReady]);

  const getStream = useCallback(() => streamRef.current, []);

  useCameraVisibilityRecovery({
    getStream,
    isActive,
    restartStream: () => startStream(facing),
    stopStream,
  });

  useEffect(() => {
    if (isActive && !previewBase64) {
      const id = setTimeout(() => startStream(facing), 100);
      return () => {
        clearTimeout(id);
        stopStream();
      };
    }
    return () => {
      stopStream();
    };
  }, [isActive, facing, previewBase64, startStream, stopStream]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        stopVideoRecording(recorderRef.current);
      }
      stopStream();
    };
  }, [stopStream]);

  useEffect(() => {
    setPreviewBase64(null);
    setPreviewMime('image/jpeg');
    setError(null);
    setErrorKind('generic');
    setGridVisible(false);
    if (isRecording && recorderRef.current) {
      stopVideoRecording(recorderRef.current);
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    recorderRef.current = null;
    recordingPromiseRef.current = null;
  }, [captureMode, isRecording]);

  const captureFrame = useCallback(async (): Promise<string | null> => {
    if (!videoRef.current || !cameraReady) return null;
    setCapturing(true);
    try {
      const video = videoRef.current;
      const rawW = video.videoWidth || 1080;
      const rawH = video.videoHeight || 1920;
      const { width: w, height: h } = clampCaptureDimensions(rawW, rawH, CAPTURE_MAX_WIDTH);
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 미지원');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (facing === 'user') {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      canvas.width = 0;
      canvas.height = 0;
      const compressed = await prepareImageForApi(dataUrl, 1280, 0.85);
      const b64 = cleanBase64(compressed);
      const mime = getMimeTypeFromDataUrl(compressed);
      return `${mime}|${b64}`;
    } catch {
      setError('촬영에 실패했습니다. 다시 시도해주세요.');
      return null;
    } finally {
      setCapturing(false);
    }
  }, [cameraReady, facing]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (!cameraReady || isRecording || Platform.OS !== 'web') return false;
    const stream = streamRef.current;
    if (!stream) return false;
    const hasAudio = stream.getAudioTracks().length > 0;
    if (!hasAudio) {
      stopStream();
      await startStream(facing, true);
      await new Promise((r) => setTimeout(r, 300));
    }
    const currentStream = streamRef.current;
    if (!currentStream) return false;
    const result = startVideoRecording(currentStream, {
      maxDurationMs: 30000,
      videoBitsPerSecond: 4_000_000,
    });
    if (!result) return false;
    recorderRef.current = result.recorder;
    recordingPromiseRef.current = result.promise;
    setIsRecording(true);
    setRecordingDuration(0);
    const startTime = Date.now();
    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration(Date.now() - startTime);
    }, 100);
    return true;
  }, [cameraReady, isRecording, facing, startStream, stopStream]);

  const stopRecording = useCallback(async (): Promise<{ base64: string; mimeType: string } | null> => {
    if (!isRecording || !recorderRef.current || !recordingPromiseRef.current) return null;
    stopVideoRecording(recorderRef.current);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    try {
      const result = await recordingPromiseRef.current;
      const { base64, mimeType } = await blobToBase64(result.blob);
      setIsRecording(false);
      setRecordingDuration(0);
      recorderRef.current = null;
      recordingPromiseRef.current = null;
      // Restart stream without audio to release the microphone track,
      // preventing audio hardware from staying active after recording.
      const hadAudio = streamRef.current?.getAudioTracks().length ?? 0;
      if (hadAudio > 0) {
        await startStream(facing, false);
      }
      return { base64, mimeType };
    } catch {
      setIsRecording(false);
      setRecordingDuration(0);
      recorderRef.current = null;
      recordingPromiseRef.current = null;
      setError('비디오 녹화 저장에 실패했습니다.');
      return null;
    }
  }, [isRecording, facing, startStream]);

  useImperativeHandle(ref, () => ({
    captureFrame: async () => {
      const result = await captureFrame();
      if (!result) return null;
      const [mimeType, base64] = result.split('|');
      return { base64, mimeType };
    },
    isReady: () => cameraReady,
    startRecording,
    stopRecording,
    isRecording: () => isRecording,
  }), [captureFrame, cameraReady, startRecording, stopRecording, isRecording]);

  const handleVideoCapture = useCallback(async () => {
    if (!cameraReady || autoSaving) return;
    if (isRecording) {
      const result = await stopRecording();
      if (result) {
        onCapture(result.base64, result.mimeType);
      }
    } else {
      await startRecording();
    }
  }, [cameraReady, autoSaving, isRecording, startRecording, stopRecording, onCapture]);

  const handleCapture = useCallback(async () => {
    if (!cameraReady || capturing || autoSaving) return;
    if (captureMode === 'single') {
      onMultiAnglePress();
      return;
    }
    if (captureMode === 'video') {
      await handleVideoCapture();
      return;
    }
    const result = await captureFrame();
    if (!result) return;
    const [mime, b64] = result.split('|');
    onCapture(b64, mime);
  }, [cameraReady, capturing, autoSaving, captureMode, captureFrame, onCapture, onMultiAnglePress, handleVideoCapture]);

  const handleConfirm = useCallback(() => {
    if (previewBase64) {
      onCapture(previewBase64, previewMime);
      setPreviewBase64(null);
    }
  }, [previewBase64, previewMime, onCapture]);

  const handleRetake = useCallback(() => {
    setPreviewBase64(null);
  }, []);

  const handleFlip = useCallback(() => {
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  }, []);

  const hasPreview = !!previewBase64;

  useEffect(() => {
    if (autoSaving) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        false,
      );
    } else {
      pulseScale.value = 1;
    }
  }, [autoSaving, pulseScale]);

  return (
    <View style={styles.container}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Auto-save toast */}
      {autoSaveToast && (
        <View style={[styles.toastWrap, { bottom: tabBarHeight + bottomInset + 220 }]}>
          <View style={styles.toastInner}>
            <Check size={18} color={theme.colors.success[400]} strokeWidth={2.5} />
            <Text style={styles.toastText}>{autoSaveToast}</Text>
          </View>
        </View>
      )}

      {/* Auto-saving overlay */}
      {autoSaving && !hasPreview && (
        <View style={styles.autoSavingWrap}>
          <View style={styles.autoSavingCard}>
            <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
              <Sparkles size={28} color={theme.colors.primary[400]} strokeWidth={2} />
            </Animated.View>
            <Text style={styles.autoSavingTitle}>AI가 매뉴를 분석 중입니다</Text>
            <View style={styles.autoSavingStepRow}>
              <View style={[styles.autoSavingStepDot, autoSaveStep >= 1 && styles.autoSavingStepDotActive]} />
              <View style={[styles.autoSavingStepDot, autoSaveStep >= 2 && styles.autoSavingStepDotActive]} />
              <View style={[styles.autoSavingStepDot, autoSaveStep >= 3 && styles.autoSavingStepDotActive]} />
            </View>
            <Text style={styles.autoSavingSub}>
              {autoSaveStep === 1 ? '사진 촬영 완료! 매뉴 인식 중...' :
               autoSaveStep === 2 ? 'AI 비전 분석 중, 숏폼 생성 준비 중...' :
               '보관함에 자동 저장 중, 거의 다 됐어요!'}
            </Text>
          </View>
        </View>
      )}

      {/* Photo preview overlay */}
      {hasPreview ? (
        <View style={styles.previewWrap}>
          <Image
            source={{ uri: `data:${previewMime};base64,${previewBase64}` }}
            style={styles.previewImg}
            resizeMode="contain"
          />
          <View style={[styles.previewTopBar, { top: safeTop + 8 }]}>
            <TouchableOpacity style={styles.topBtn} onPress={handleRetake} activeOpacity={0.7}>
              <X size={22} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
            <Text style={styles.previewTitle}>촬영 결과</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={[styles.previewBottom, { paddingBottom: tabBarHeight + bottomInset + theme.spacing.sm }]}>
            <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake} activeOpacity={0.8}>
              <RotateCcw size={22} color="#fff" strokeWidth={2} />
              <Text style={styles.retakeText}>다시 촬영</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} activeOpacity={0.85}>
              <Zap size={24} color="#fff" strokeWidth={2.5} />
              <Text style={styles.confirmText}>이 사진으로</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {/* Camera viewfinder */}
          <View style={styles.cameraWrap}>
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

            {/* Grid overlay */}
            {gridVisible && (
              <View style={styles.gridOverlay} pointerEvents="none">
                <View style={styles.gridLineV1} />
                <View style={styles.gridLineV2} />
                <View style={styles.gridLineH1} />
                <View style={styles.gridLineH2} />
              </View>
            )}

            {/* Loading / error state overlay */}
            {!cameraReady && !error && (
              <View style={styles.loadingWrap}>
                <Camera size={36} color={theme.colors.dark.textDim} strokeWidth={1.5} />
                <Text style={styles.loadingText}>카메라 시작 중...</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorWrap}>
                {errorKind === 'permission' ? (
                  <>
                    <ShieldAlert size={36} color={theme.colors.warning[400]} strokeWidth={1.5} />
                    <Text style={styles.errorTitle}>카메라 권한이 필요합니다</Text>
                    <Text style={styles.errorMsg}>{error}</Text>
                    <View style={styles.permissionGuide}>
                      <Text style={styles.permissionGuideTitle}>권한 허용 방법:</Text>
                      <Text style={styles.permissionGuideStep}>1. 브라우저 주소창 좌측 자물쇠 아이콘 클릭</Text>
                      <Text style={styles.permissionGuideStep}>2. 사이트 설정에서 카메라를 허용으로 변경</Text>
                      <Text style={styles.permissionGuideStep}>3. 페이지 새로고침 후 다시 시도</Text>
                    </View>
                    <View style={styles.permissionBtnRow}>
                      <TouchableOpacity
                        style={styles.retryBtn}
                        onPress={() => startStream(facing)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.retryText}>다시 시도</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.galleryFallbackBtn}
                        onPress={onPickImage}
                        activeOpacity={0.8}
                      >
                        <ImageIcon size={16} color="#fff" strokeWidth={2} />
                        <Text style={styles.galleryFallbackText}>갤러리에서 선택</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.errorTitle}>카메라를 사용할 수 없습니다</Text>
                    <Text style={styles.errorMsg}>{error}</Text>
                    <TouchableOpacity
                      style={styles.retryBtn}
                      onPress={() => startStream(facing)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.retryText}>다시 시도</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>

          {/* Top bar: flip + recording indicator */}
          {!simplified && (
            <View style={[styles.topBar, { top: safeTop + 8 }]}>
              <View style={styles.topBarLeft}>
                {isRecording && (
                  <View style={styles.recordingIndicator}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingTimer}>
                      {Math.floor(recordingDuration / 60000)}:{String(Math.floor((recordingDuration % 60000) / 1000)).padStart(2, '0')}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.topBarRight}>
                <TouchableOpacity style={styles.topBtn} onPress={handleFlip} activeOpacity={0.7} disabled={!cameraReady}>
                  <RotateCcw size={20} color="#fff" strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Bottom bar — only shown when not simplified (parent provides its own) */}
          {!simplified && (
            <View style={[styles.bottomBar, { paddingBottom: tabBarHeight + bottomInset + theme.spacing.lg }]}>
              {error && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              )}

              <View style={styles.modeToggleWrap}>
                {MODE_META(cameraRole).map((mode, idx) => {
                  const Icon = mode.icon;
                  const isActiveMode = captureMode === mode.key;
                  return (
                    <TouchableOpacity
                      key={mode.key}
                      style={[
                        styles.modeToggleBtn,
                        idx === 0 && styles.modeToggleBtnFirst,
                        idx === MODE_META(cameraRole).length - 1 && styles.modeToggleBtnLast,
                        isActiveMode && styles.modeToggleBtnActive,
                        autoSaving && styles.modeToggleBtnDisabled,
                      ]}
                      onPress={() => onCaptureModeChange(mode.key)}
                      disabled={autoSaving}
                      activeOpacity={0.7}
                    >
                      <Icon size={15} color={isActiveMode ? '#fff' : theme.colors.dark.textDim} strokeWidth={2.2} />
                      <Text style={[styles.modeToggleText, isActiveMode && styles.modeToggleTextActive]}>
                        {mode.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.bottomControlsRow}>
                <TouchableOpacity
                  style={[
                    styles.shutterBtn,
                    !cameraReady && styles.shutterBtnDisabled,
                    (capturing || autoSaving) && styles.shutterBtnCapturing,
                    isRecording && styles.shutterBtnRecording,
                  ]}
                  onPress={handleCapture}
                  disabled={!cameraReady || capturing || autoSaving}
                  activeOpacity={0.85}
                >
                  {captureMode === 'video' && isRecording ? (
                    <Square size={28} color="#fff" strokeWidth={2.5} />
                  ) : captureMode === 'video' ? (
                    <Video size={28} color="#fff" strokeWidth={2.5} />
                  ) : (
                    <Camera size={30} color="#fff" strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.shutterHint}>
                {autoSaving ? 'AI 자동 분석 중...' :
                 capturing ? '촬영 중...' :
                 captureMode === 'single' ? '정면·좌측·우측·후면·상부 순차 촬영' :
                 isRecording ? '녹화 중 — 버튼을 눌러 정지' :
                 '촬영 버튼을 눌러주세요'}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  cameraWrap: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  gridLineV1: {
    position: 'absolute',
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gridLineV2: {
    position: 'absolute',
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gridLineH1: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gridLineH2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  loadingWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  errorWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
    backgroundColor: 'rgba(5, 8, 18, 0.8)',
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    textAlign: 'center',
  },
  errorMsg: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: theme.spacing.sm,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary[600],
    borderRadius: theme.radius.lg,
  },
  retryText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  permissionGuide: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
    gap: 4,
  },
  permissionGuideTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 2,
  },
  permissionGuideStep: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
  },
  permissionBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  galleryFallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.lg,
  },
  galleryFallbackText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    zIndex: 20,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(10, 15, 30, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBtnPlaceholder: {
    width: 40,
    height: 40,
  },
  bottomBar: {
    backgroundColor: 'rgba(5, 8, 18, 0.85)',
    paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  errorBanner: {
    backgroundColor: theme.colors.error[500] + '18',
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: theme.spacing.sm,
  },
  errorBannerText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    textAlign: 'center',
  },
  modeToggleWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(10, 15, 30, 0.6)',
    borderRadius: theme.radius.full,
    padding: 3,
    marginBottom: theme.spacing.sm,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: theme.radius.full,
  },
  modeToggleBtnFirst: {
    borderTopLeftRadius: theme.radius.full,
    borderBottomLeftRadius: theme.radius.full,
  },
  modeToggleBtnLast: {
    borderTopRightRadius: theme.radius.full,
    borderBottomRightRadius: theme.radius.full,
  },
  modeToggleBtnActive: {
    backgroundColor: theme.colors.primary[600],
  },
  modeToggleBtnDisabled: {
    opacity: 0.4,
  },
  modeToggleText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  modeToggleTextActive: {
    color: '#fff',
  },
  bottomControlsRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
  },
  shutterBtn: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  shutterBtnDisabled: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  shutterBtnCapturing: {
    opacity: 0.6,
  },
  shutterBtnRecording: {
    backgroundColor: theme.colors.error[500],
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(220, 38, 38, 0.25)',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.error[400],
  },
  recordingTimer: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  shutterHint: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    marginTop: 4,
  },
  autoSavingWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 8, 18, 0.7)',
    zIndex: 40,
  },
  autoSavingCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
    maxWidth: 320,
  },
  autoSavingTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  autoSavingSub: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 18,
  },
  autoSavingStepRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 6,
  },
  autoSavingStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  autoSavingStepDotActive: {
    backgroundColor: theme.colors.primary[400],
  },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 60,
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.full,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
  },
  previewWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.dark.bg,
    zIndex: 50,
  },
  previewImg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  previewTopBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    zIndex: 10,
  },
  previewTitle: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  previewBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    backgroundColor: 'rgba(5, 8, 18, 0.85)',
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: theme.radius.lg,
  },
  retakeText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: theme.colors.primary[600],
    borderRadius: theme.radius.lg,
  },
  confirmText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
