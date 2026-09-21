import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  Dimensions,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { getThumbnailUrl } from '@/lib/imageUtils';
import type { PsychScene } from '@/lib/psychologyEngine';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

export interface GalleryScene {
  scene: PsychScene;
  imageUrl?: string | null;
  index: number;
}

export interface FullScreenGalleryModalProps {
  visible: boolean;
  onClose: () => void;
  scenes: PsychScene[];
  sceneImages?: (string | null)[];
  beforeImage?: string | null;
  afterImage?: string | null;
  initialTab?: 'beforeAfter' | 'comic';
  productName?: string;
  disclosureText?: string;
}

export function FullScreenGalleryModal({
  visible,
  onClose,
  scenes,
  sceneImages,
  beforeImage,
  afterImage,
  initialTab = 'comic',
  productName,
  disclosureText,
}: FullScreenGalleryModalProps) {
  const [activeTab, setActiveTab] = useState<'beforeAfter' | 'comic'>(initialTab);
  const [currentIdx, setCurrentIdx] = useState(0);
  const slideProgress = useSharedValue(0);
  const opacity = useSharedValue(0);

  const total = scenes.length;

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
      setActiveTab(initialTab);
      setCurrentIdx(0);
    } else {
      opacity.value = 0;
    }
  }, [visible, initialTab]);

  useEffect(() => {
    slideProgress.value = withTiming(currentIdx / Math.max(total - 1, 1), {
      duration: 300,
      easing: Easing.inOut(Easing.ease),
    });
  }, [currentIdx, total]);

  const goToSlide = useCallback((idx: number) => {
    if (idx < 0 || idx >= total) return;
    setCurrentIdx(idx);
  }, [total]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.max(slideProgress.value * 100, 5)}%`,
  }));

  const hasBeforeAfter = !!(beforeImage || afterImage);
  const hasComic = total > 0;

  const handleClose = useCallback(() => {
    opacity.value = withTiming(0, { duration: 150 }, () => {
      onClose();
    });
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Animated.View style={[styles.overlayBg, overlayStyle]} />
      </Pressable>

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {productName ?? '미리보기'}
          </Text>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
            <X size={20} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Tab switcher */}
        {hasBeforeAfter && hasComic && (
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'beforeAfter' && styles.tabActive]}
              onPress={() => setActiveTab('beforeAfter')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'beforeAfter' && styles.tabTextActive]}>
                보정 전/후
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'comic' && styles.tabActive]}
              onPress={() => setActiveTab('comic')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'comic' && styles.tabTextActive]}>
                만화 컷 ({total})
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Before/After tab */}
        {activeTab === 'beforeAfter' && hasBeforeAfter && (
          <ScrollView style={styles.beforeAfterScroll} contentContainerStyle={styles.beforeAfterContent}>
            <View style={styles.baRow}>
              <View style={styles.baItem}>
                <Text style={styles.baLabel}>원본</Text>
                {beforeImage ? (
                  <Image source={{ uri: getThumbnailUrl(beforeImage, 600) }} style={styles.baImage} resizeMode="contain" />
                ) : (
                  <View style={styles.baPlaceholder}>
                    <Text style={styles.baPlaceholderText}>원본 없음</Text>
                  </View>
                )}
              </View>
              <View style={styles.baItem}>
                <Text style={styles.baLabel}>AI 보정</Text>
                {afterImage ? (
                  <Image source={{ uri: getThumbnailUrl(afterImage, 600) }} style={styles.baImage} resizeMode="contain" />
                ) : (
                  <View style={styles.baPlaceholder}>
                    <Text style={styles.baPlaceholderText}>보정 전</Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        )}

        {/* Comic cuts tab */}
        {activeTab === 'comic' && hasComic && (
          <View style={styles.comicSection}>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressBar, progressStyle]} />
            </View>

            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.comicScroll}
              onScroll={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                const idx = Math.round(x / SCREEN_WIDTH);
                if (idx !== currentIdx && idx >= 0 && idx < total) {
                  setCurrentIdx(idx);
                }
              }}
              scrollEventThrottle={16}
            >
              {scenes.map((scene, idx) => {
                const img = sceneImages?.[idx] ?? null;
                return (
                  <View key={idx} style={styles.cutSlide}>
                    <View style={styles.cutImageWrap}>
                      {img ? (
                        <Image source={{ uri: img }} style={styles.cutImage} resizeMode="contain" />
                      ) : (
                        <View style={styles.cutPlaceholder}>
                          <Text style={styles.cutPlaceholderText}>이미지 없음</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.cutInfo}>
                      <View style={styles.cutInfoRow}>
                        <Text style={styles.cutInfoTime}>{scene.time}</Text>
                        <Text style={styles.cutInfoEmotion}>{scene.emotion}</Text>
                      </View>
                      <Text style={styles.cutInfoText} numberOfLines={3}>{scene.textOverlay}</Text>
                      <Text style={styles.cutInfoSub} numberOfLines={2}>{scene.subtext}</Text>
                      <Text style={styles.cutInfoDesc} numberOfLines={2}>{scene.desc}</Text>
                      {disclosureText && (
                        <Text style={styles.cutDisclosure} numberOfLines={2}>{disclosureText}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Navigation */}
            <View style={styles.comicNav}>
              <TouchableOpacity
                style={[styles.navBtn, currentIdx === 0 && styles.navBtnDisabled]}
                onPress={() => goToSlide(currentIdx - 1)}
                disabled={currentIdx === 0}
                activeOpacity={0.7}
              >
                <ChevronLeft size={22} color={currentIdx === 0 ? theme.colors.dark.textFaint : '#fff'} strokeWidth={2} />
              </TouchableOpacity>

              <Text style={styles.comicCounter}>{currentIdx + 1} / {total}</Text>

              <TouchableOpacity
                style={[styles.navBtn, currentIdx === total - 1 && styles.navBtnDisabled]}
                onPress={() => goToSlide(currentIdx + 1)}
                disabled={currentIdx === total - 1}
                activeOpacity={0.7}
              >
                <ChevronRight size={22} color={currentIdx === total - 1 ? theme.colors.dark.textFaint : '#fff'} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Footer with download hint */}
        <View style={styles.footer}>
          <Download size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
          <Text style={styles.footerText}>
            컷 이미지는 2단계에서 일괄 다운로드할 수 있습니다
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    zIndex: 0,
  },
  overlayBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  content: {
    flex: 1,
    backgroundColor: '#0a0f1e',
    marginTop: 40,
    marginBottom: 20,
    marginHorizontal: 8,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.dark.border,
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  tabActive: {
    backgroundColor: theme.colors.primary[500],
  },
  tabText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  tabTextActive: {
    color: '#fff',
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  beforeAfterScroll: {
    flex: 1,
  },
  beforeAfterContent: {
    padding: 16,
    alignItems: 'center',
  },
  baRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  baItem: {
    flex: 1,
    gap: 8,
  },
  baLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  baImage: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.5,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  baPlaceholder: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.5,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  baPlaceholderText: {
    fontSize: 12,
    color: theme.colors.dark.textFaint,
  },
  comicSection: {
    flex: 1,
  },
  progressTrack: {
    height: 3,
    backgroundColor: theme.colors.dark.border,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.success[400],
    borderRadius: 2,
  },
  comicScroll: {
    flex: 1,
  },
  cutSlide: {
    width: SCREEN_WIDTH - 16,
    padding: 16,
    alignItems: 'center',
  },
  cutImageWrap: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: SCREEN_HEIGHT * 0.55,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  cutImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  cutPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cutPlaceholderText: {
    fontSize: 12,
    color: theme.colors.dark.textFaint,
  },
  cutInfo: {
    width: '100%',
    marginTop: 12,
    paddingHorizontal: 8,
    gap: 4,
  },
  cutInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cutInfoTime: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.success[400],
  },
  cutInfoEmotion: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.accent[400],
  },
  cutInfoText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
    lineHeight: 20,
  },
  cutInfoSub: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
  },
  cutInfoDesc: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    lineHeight: 14,
  },
  cutDisclosure: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  comicNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  comicCounter: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
  },
  footerText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
});
