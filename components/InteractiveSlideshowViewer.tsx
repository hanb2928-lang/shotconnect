import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  Loader,
  Check,
  Film,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import type { PsychScene } from '@/lib/psychologyEngine';

const SCREEN_WIDTH = Dimensions.get('window').width;

export interface SlideshowScene {
  scene: PsychScene;
  imageUrl?: string;
  index: number;
}

export interface InteractiveSlideshowViewerProps {
  scenes: PsychScene[];
  sceneImages?: (string | null)[];
  productName?: string;
  disclosureText?: string;
  affiliateUrl?: string;
}

const EMOTION_LABELS: Record<string, string> = {
  curiosity: '호기심',
  shock: '충격',
  empathy: '공감',
  desire: '욕구',
  action: '행동',
};

export function InteractiveSlideshowViewer({
  scenes,
  sceneImages,
  productName,
  disclosureText,
  affiliateUrl,
}: InteractiveSlideshowViewerProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const slideProgress = useSharedValue(0);

  const total = scenes.length;

  useEffect(() => {
    slideProgress.value = withTiming(currentIdx / Math.max(total - 1, 1), {
      duration: 300,
      easing: Easing.inOut(Easing.ease),
    });
  }, [currentIdx, total]);

  const goToSlide = useCallback((idx: number) => {
    if (idx < 0 || idx >= total) return;
    setCurrentIdx(idx);
    scrollRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
  }, [total]);

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const x = event.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_WIDTH);
    if (idx !== currentIdx && idx >= 0 && idx < total) {
      runOnJS(setCurrentIdx)(idx);
    }
  }, [currentIdx, total]);

  const handleDownloadAll = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloaded(false);
    try {
      if (Platform.OS === 'web') {
        const imageUrls: string[] = [];
        for (let i = 0; i < total; i++) {
          const img = sceneImages?.[i];
          if (img) imageUrls.push(img);
        }
        for (let i = 0; i < imageUrls.length; i++) {
          try {
            const a = document.createElement('a');
            a.href = imageUrls[i];
            a.download = `snapconnect-cut-${i + 1}-${Date.now()}.png`;
            a.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
          } catch { /* skip failed download */ }
        }
        setDownloaded(true);
        setTimeout(() => setDownloaded(false), 3000);
      }
    } catch {
      // download failed
    } finally {
      setDownloading(false);
    }
  }, [downloading, sceneImages, total]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.max(slideProgress.value * 100, 5)}%`,
  }));

  if (total === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Film size={16} color={theme.colors.success[400]} strokeWidth={2} />
          <Text style={styles.headerTitle}>AI 스토리보드 프리뷰</Text>
        </View>
        <Text style={styles.counter}>{currentIdx + 1} / {total}</Text>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressBar, progressStyle]} />
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.slideScroll}
      >
        {scenes.map((scene, idx) => {
          const img = sceneImages?.[idx] ?? null;
          return (
            <View key={idx} style={styles.slide}>
              <View style={styles.slideImageWrap}>
                {img ? (
                  <Image
                    source={{ uri: img }}
                    style={styles.slideImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.slideImagePlaceholder}>
                    <ImageIcon size={40} color="rgba(255,255,255,0.2)" strokeWidth={1.5} />
                  </View>
                )}
                <View
                  style={[
                    styles.slideOverlay,
                    { backgroundColor: scene.colorTheme.overlay },
                  ]}
                />
                <View style={styles.slideContent}>
                  <View style={styles.emotionBadge}>
                    <Text style={styles.emotionBadgeText}>
                      {EMOTION_LABELS[scene.emotion] ?? scene.emotion}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.slideMainText,
                      {
                        fontSize: Math.min(scene.fontSize * 0.55, 22),
                        color: '#fff',
                      },
                    ]}
                  >
                    {scene.textOverlay}
                  </Text>
                  <Text
                    style={[
                      styles.slideSubText,
                      { color: scene.colorTheme.accent },
                    ]}
                  >
                    {scene.subtext}
                  </Text>
                  {disclosureText && (
                    <View style={styles.slideDisclosure}>
                      <Text style={styles.slideDisclosureText} numberOfLines={2}>
                        {disclosureText}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.slideMeta}>
                <View style={styles.slideMetaRow}>
                  <Text style={styles.slideMetaLabel}>시간</Text>
                  <Text style={styles.slideMetaValue}>{scene.time}</Text>
                </View>
                <View style={styles.slideMetaRow}>
                  <Text style={styles.slideMetaLabel}>훅</Text>
                  <Text style={styles.slideMetaValue} numberOfLines={2}>{scene.hook}</Text>
                </View>
                <View style={styles.slideMetaRow}>
                  <Text style={styles.slideMetaLabel}>연출</Text>
                  <Text style={styles.slideMetaValue}>{scene.desc}</Text>
                </View>
                <View style={styles.slideMetaRow}>
                  <Text style={styles.slideMetaLabel}>모션</Text>
                  <Text style={styles.slideMetaValue}>{scene.motionType}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navBtn, currentIdx === 0 && styles.navBtnDisabled]}
          onPress={() => goToSlide(currentIdx - 1)}
          disabled={currentIdx === 0}
          activeOpacity={0.7}
        >
          <ChevronLeft size={20} color={currentIdx === 0 ? theme.colors.dark.textFaint : '#fff'} strokeWidth={2} />
        </TouchableOpacity>

        <View style={styles.dotRow}>
          {scenes.map((_, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.dot, idx === currentIdx && styles.dotActive]}
              onPress={() => goToSlide(idx)}
              activeOpacity={0.7}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.navBtn, currentIdx === total - 1 && styles.navBtnDisabled]}
          onPress={() => goToSlide(currentIdx + 1)}
          disabled={currentIdx === total - 1}
          activeOpacity={0.7}
        >
          <ChevronRight size={20} color={currentIdx === total - 1 ? theme.colors.dark.textFaint : '#fff'} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.downloadBtn, downloading && styles.downloadBtnDisabled]}
          onPress={handleDownloadAll}
          disabled={downloading}
          activeOpacity={0.85}
        >
          {downloading ? (
            <Loader size={16} color="#fff" strokeWidth={2} />
          ) : downloaded ? (
            <Check size={16} color="#fff" strokeWidth={2} />
          ) : (
            <Download size={16} color="#fff" strokeWidth={2} />
          )}
          <Text style={styles.downloadBtnText}>
            {downloading ? '다운로드 중...' : downloaded ? '다운로드 완료' : '전체 컷 이미지 다운로드'}
          </Text>
        </TouchableOpacity>
      </View>

      {Platform.OS === 'web' && (
        <View style={styles.guideBox}>
          <Text style={styles.guideText}>
            팁: 브라우저 화면 녹화 기능(Win+G 또는 Cmd+Shift+5)으로 슬라이드쇼를 영상으로 캡처할 수 있습니다.
          </Text>
        </View>
      )}

      {productName && (
        <Text style={styles.productNameTag} numberOfLines={1}>{productName}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
  },
  counter: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  progressTrack: {
    height: 3,
    backgroundColor: theme.colors.dark.border,
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.success[400],
    borderRadius: 2,
  },
  slideScroll: {
    flexGrow: 0,
  },
  slide: {
    width: SCREEN_WIDTH - theme.spacing.sm * 2,
    gap: 8,
  },
  slideImageWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 360,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: '#0a0f1e',
  },
  slideImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  slideImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  slideOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.4,
  },
  slideContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    justifyContent: 'flex-end',
  },
  emotionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(10,15,30,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    marginBottom: 8,
  },
  emotionBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  slideMainText: {
    fontFamily: theme.typography.fontFamily.bold,
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    lineHeight: 26,
    marginBottom: 6,
  },
  slideSubText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    lineHeight: 17,
  },
  slideDisclosure: {
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  slideDisclosureText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: 'rgba(255,255,255,0.7)',
  },
  slideMeta: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.sm,
    padding: 10,
    gap: 4,
  },
  slideMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  slideMetaLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    width: 36,
    flexShrink: 0,
  },
  slideMetaValue: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    flex: 1,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 4,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.dark.border,
  },
  dotActive: {
    backgroundColor: theme.colors.success[400],
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  actionsRow: {
    marginTop: 10,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.success[500],
  },
  downloadBtnDisabled: {
    opacity: 0.6,
  },
  downloadBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  guideBox: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.sm,
  },
  guideText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 15,
  },
  productNameTag: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
    marginTop: 6,
  },
});
