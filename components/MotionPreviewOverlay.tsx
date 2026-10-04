import { useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Image, AppState, type AppStateStatus } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
  cancelAnimation,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Sparkles } from 'lucide-react-native';
import { theme } from '@/lib/theme';

interface MotionPreviewOverlayProps {
  visible: boolean;
  images: string[];
  label?: string;
  progressMessage?: string;
  /** 0..1 progress from the actual generation pipeline */
  progress?: number;
}

const CROSSFADE_MS = 1800;
const KEN_BURNS_SCALE = 1.12;
const KEN_BURNS_PAN = 16;

type PanDirection = 'left' | 'right' | 'up' | 'down' | 'center';

const PAN_DIRECTIONS: PanDirection[] = ['right', 'left', 'up', 'down', 'center'];

/**
 * Optimistic UI overlay that plays an instant Ken Burns cross-dissolve
 * slideshow of the user's captured product images while the real AI
 * video is being generated. This eliminates perceived wait time — the
 * user sees motion immediately after pressing generate.
 */
export function MotionPreviewOverlay({
  visible,
  images,
  label = 'AI 영상 생성 중',
  progressMessage,
  progress,
}: MotionPreviewOverlayProps) {
  const currentIndex = useSharedValue(0);
  const opacityA = useSharedValue(1);
  const opacityB = useSharedValue(0);
  const scaleA = useSharedValue(1);
  const scaleB = useSharedValue(KEN_BURNS_SCALE);
  const translateA = useSharedValue(0);
  const translateB = useSharedValue(0);
  const sparkleRotate = useSharedValue(0);
  const progressBarSV = useSharedValue(0);
  const appStateRef = useRef<AppStateStatus>('active');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const validImages = images.filter((uri) => uri && uri.length > 0);
  const hasImages = validImages.length >= 2;

  const advanceSlide = useCallback(() => {
    if (validImages.length < 2) return;
    const next = (currentIndex.value + 1) % validImages.length;

    // Crossfade: A fades out while B fades in with Ken Burns motion
    opacityA.value = withTiming(0, { duration: CROSSFADE_MS, easing: Easing.inOut(Easing.ease) });
    opacityB.value = withTiming(1, { duration: CROSSFADE_MS, easing: Easing.inOut(Easing.ease) });

    // Ken Burns on the incoming image (B)
    const panDir = PAN_DIRECTIONS[next % PAN_DIRECTIONS.length];
    const panX = panDir === 'left' ? -KEN_BURNS_PAN : panDir === 'right' ? KEN_BURNS_PAN : 0;
    const panY = panDir === 'up' ? -KEN_BURNS_PAN : panDir === 'down' ? KEN_BURNS_PAN : 0;
    scaleB.value = 1;
    translateB.value = 0;
    scaleB.value = withTiming(KEN_BURNS_SCALE, { duration: CROSSFADE_MS * 1.6, easing: Easing.out(Easing.quad) });
    translateB.value = withTiming(panX, { duration: CROSSFADE_MS * 1.6, easing: Easing.inOut(Easing.quad) });

    currentIndex.value = next;

    // After the crossfade, swap roles: the now-visible image becomes A
    setTimeout(() => {
      opacityA.value = 1;
      opacityB.value = 0;
      scaleA.value = KEN_BURNS_SCALE;
      translateA.value = panX;
      const nextNext = (next + 1) % validImages.length;
      const nextPanDir = PAN_DIRECTIONS[nextNext % PAN_DIRECTIONS.length];
      const nextPanX = nextPanDir === 'left' ? -KEN_BURNS_PAN : nextPanDir === 'right' ? KEN_BURNS_PAN : 0;
      scaleA.value = withTiming(1, { duration: 50 });
      translateA.value = withTiming(0, { duration: 50 });
      // Reset B for next cycle
      scaleB.value = 1;
      translateB.value = nextPanDir === 'left' ? -KEN_BURNS_PAN : nextPanDir === 'right' ? KEN_BURNS_PAN : 0;
    }, CROSSFADE_MS + 50);
  }, [validImages.length, currentIndex, opacityA, opacityB, scaleA, scaleB, translateA, translateB]);

  // Start/stop the slideshow timer
  useEffect(() => {
    if (!visible || !hasImages) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Kick off first transition immediately for instant motion
    const startDelay = setTimeout(() => {
      advanceSlide();
      timerRef.current = setInterval(advanceSlide, CROSSFADE_MS + 200);
    }, 400);

    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, hasImages, advanceSlide]);

  // Sparkle rotation animation
  useEffect(() => {
    if (!visible) {
      cancelAnimation(sparkleRotate);
      return;
    }
    sparkleRotate.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => { cancelAnimation(sparkleRotate); };
  }, [visible, sparkleRotate]);

  // Progress bar
  useEffect(() => {
    if (typeof progress === 'number' && progress >= 0) {
      progressBarSV.value = withTiming(Math.min(1, Math.max(0, progress)), {
        duration: 500,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [progress, progressBarSV]);

  // Pause on background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      appStateRef.current = state;
      if (state === 'background' || state === 'inactive') {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        cancelAnimation(sparkleRotate);
      } else if (state === 'active' && visible && hasImages && !timerRef.current) {
        sparkleRotate.value = withRepeat(
          withTiming(360, { duration: 3000, easing: Easing.linear }),
          -1,
          false,
        );
        timerRef.current = setInterval(advanceSlide, CROSSFADE_MS + 200);
      }
    });
    return () => { sub.remove(); };
  }, [visible, hasImages, advanceSlide, sparkleRotate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      cancelAnimation(opacityA);
      cancelAnimation(opacityB);
      cancelAnimation(scaleA);
      cancelAnimation(scaleB);
      cancelAnimation(sparkleRotate);
    };
  }, [opacityA, opacityB, scaleA, scaleB, sparkleRotate]);

  const imageAStyle = useAnimatedStyle(() => ({
    opacity: opacityA.value,
    transform: [
      { scale: scaleA.value },
      { translateX: translateA.value },
    ],
  }));

  const imageBStyle = useAnimatedStyle(() => ({
    opacity: opacityB.value,
    transform: [
      { scale: scaleB.value },
      { translateX: translateB.value },
    ],
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sparkleRotate.value}deg` }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressBarSV.value * 100}%`,
  }));

  if (!visible) return null;

  const displayImageA = validImages[0] ?? null;
  const displayImageB = validImages[1] ?? validImages[0] ?? null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.backdrop} pointerEvents="auto">
        <View style={styles.card}>
          {/* Motion preview area */}
          <View style={styles.previewArea}>
            {hasImages && displayImageA ? (
              <>
                <Animated.View style={[styles.imageLayer, imageAStyle]}>
                  <Image source={{ uri: displayImageA }} style={styles.image} resizeMode="cover" />
                </Animated.View>
                <Animated.View style={[styles.imageLayer, imageBStyle]}>
                  <Image source={{ uri: displayImageB }} style={styles.image} resizeMode="cover" />
                </Animated.View>
                <View style={styles.vignette} />
              </>
            ) : (
              <View style={styles.fallbackGradient} />
            )}

            {/* Sparkle accent */}
            <Animated.View style={[styles.sparkleWrap, sparkleStyle]} pointerEvents="none">
              <Sparkles size={20} color={theme.colors.primary[300]} strokeWidth={2.5} />
            </Animated.View>

            {/* "OPTIMISTIC PREVIEW" badge */}
            <View style={styles.previewBadge}>
              <View style={styles.previewBadgeDot} />
              <Text style={styles.previewBadgeText}>실시간 프리뷰</Text>
            </View>
          </View>

          {/* Status text */}
          <Text style={styles.label}>{label}</Text>
          {progressMessage ? (
            <Text style={styles.sublabel} numberOfLines={2}>{progressMessage}</Text>
          ) : null}

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, progressStyle]} />
          </View>

          {/* Step hint */}
          <Text style={styles.hint}>
            {hasImages
              ? '촬영하신 이미지로 모션 프리뷰를 재생하는 동안 AI가 영상을 생성하고 있어요'
              : 'AI가 영상을 생성하고 있어요. 완료될 때까지 잠시만 기다려주세요'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: '85%',
    maxWidth: 360,
    ...theme.shadows.elevated,
  },
  previewArea: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.dark.surfaceLight,
    position: 'relative',
  },
  imageLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  vignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  fallbackGradient: {
    flex: 1,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  sparkleWrap: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
  },
  previewBadge: {
    position: 'absolute',
    bottom: theme.spacing.sm,
    left: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  previewBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.success[400],
  },
  previewBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  label: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginTop: theme.spacing.xs,
  },
  sublabel: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: theme.colors.dark.border,
    borderRadius: 1.5,
    marginTop: theme.spacing.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary[400],
    borderRadius: 1.5,
  },
  hint: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
    marginTop: 2,
  },
});
