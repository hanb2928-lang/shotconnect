import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {
  Sparkles,
  Clock,
  X,
  AlertCircle,
  RotateCcw,
  Image as ImageIcon,
} from 'lucide-react-native';
import { ShortFormPreviewPlayer } from '@/components/ShortFormPreviewPlayer';
import { VideoGenStepTracker } from '@/components/VideoGenStepTracker';
import { theme } from '@/lib/theme';
import { getThumbnailUrl } from '@/lib/imageUtils';
import type { ShortFormEditPlan } from '@/lib/shortFormEditEngine';
import type { NarrativePlan } from '@/lib/humanRealityNarrativeEngine';
import type { VideoGenProgress } from '@/lib/aiVideoPipeline';
import type { CopyOverlayTimeline } from '@/lib/promptBuilder';

export interface ImageGenProgressInfo {
  phase: 'submitting' | 'generating' | 'completed' | 'error';
  progress: number;
  message: string;
  completedCount: number;
  totalCount: number;
}

export interface ResultPreviewSectionProps {
  mediaUrl: string | null;
  mediaType: 'video' | 'image';
  captureImages?: string[];
  isProcessing: boolean;
  progressMessage: string;
  onDownload: () => void;
  // Extended props for the full preview section
  generatedImages: string[];
  selectedImageIndex: number;
  onSelectImage: (index: number) => void;
  onOpenImageViewer: (index: number) => void;
  isGeneratingVideo: boolean;
  isGeneratingImage: boolean;
  isRegenerating: boolean;
  visionAnalyzing: boolean;
  videoGenProgress: VideoGenProgress | null;
  imageGenProgress: ImageGenProgressInfo | null;
  bgJobNotice: string | null;
  onDismissBgJobNotice: () => void;
  videoGenError: string | null;
  imageGenError: string | null;
  onRetryVideo: () => void;
  onRetryImage: () => void;
  onDismissVideoError: () => void;
  onDismissImageError: () => void;
  previewEditPlan: ShortFormEditPlan;
  narrativePlan: NarrativePlan | null;
  bgmVolume: number;
  copyOverlays: CopyOverlayTimeline[] | null;
  narrationActive: boolean;
  ttsUrl: string | null;
}

function RotatingLoader({
  size,
  color,
  strokeWidth = 2,
}: {
  size: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <Sparkles size={size} color={color} strokeWidth={strokeWidth} />
  );
}

export function ResultPreviewSection({
  mediaUrl,
  mediaType,
  generatedImages,
  selectedImageIndex,
  onSelectImage,
  onOpenImageViewer,
  isGeneratingVideo,
  isGeneratingImage,
  isRegenerating,
  visionAnalyzing,
  videoGenProgress,
  imageGenProgress,
  bgJobNotice,
  onDismissBgJobNotice,
  videoGenError,
  imageGenError,
  onRetryVideo,
  onRetryImage,
  onDismissVideoError,
  onDismissImageError,
  previewEditPlan,
  narrativePlan,
  bgmVolume,
  copyOverlays,
  narrationActive,
  ttsUrl,
}: ResultPreviewSectionProps) {
  return (
    <View style={styles.previewSection}>
      {isRegenerating && (
        <View style={styles.regenBanner}>
          <Sparkles size={14} color={theme.colors.primary[300]} strokeWidth={2} />
          <Text style={styles.regenBannerText}>AI가 새로운 비주얼 생성 중...</Text>
        </View>
      )}
      {isGeneratingVideo && mediaType === 'video' && (
        <VideoGenStepTracker progress={videoGenProgress} variant="inline" />
      )}
      {bgJobNotice && mediaType === 'video' && (
        <View style={styles.bgJobBanner}>
          <Clock size={13} color={theme.colors.accent[300]} strokeWidth={2} />
          <Text style={styles.bgJobText}>{bgJobNotice}</Text>
          <TouchableOpacity onPress={onDismissBgJobNotice} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      )}
      {isGeneratingImage && mediaType === 'image' && (
        <View style={styles.imageGenProgressContainer}>
          <View style={styles.imageGenProgressHeader}>
            <RotatingLoader size={14} color={theme.colors.accent[300]} />
            <Text style={styles.regenBannerText}>
              {imageGenProgress?.message ?? '5장 옴니버스 이미지 병렬 생성 중...'}
            </Text>
            <Text style={styles.imageGenProgressPercent}>
              {imageGenProgress ? `${Math.round(imageGenProgress.progress * 100)}%` : '0%'}
            </Text>
          </View>
          <View style={styles.imageGenProgressBarTrack}>
            <View
              style={[
                styles.imageGenProgressBarFill,
                {
                  width: `${(imageGenProgress?.progress ?? 0) * 100}%`,
                  backgroundColor:
                    imageGenProgress?.phase === 'error'
                      ? theme.colors.error[400]
                      : theme.colors.accent[400],
                },
              ]}
            />
          </View>
          {imageGenProgress && imageGenProgress.totalCount > 0 && (
            <Text style={styles.imageGenProgressCount}>
              {imageGenProgress.completedCount}/{imageGenProgress.totalCount}장 완료
            </Text>
          )}
        </View>
      )}
      {visionAnalyzing && (
        <View style={styles.regenBanner}>
          <Sparkles size={14} color={theme.colors.accent[300]} strokeWidth={2} />
          <Text style={styles.regenBannerText}>Vision AI가 제품을 분석하는 중...</Text>
        </View>
      )}
      {videoGenError && mediaType === 'video' && (
        <View style={styles.videoErrorToast}>
          <AlertCircle size={13} color={theme.colors.error[400]} strokeWidth={2} />
          <Text style={styles.videoErrorToastText} numberOfLines={5}>
            AI 영상 생성 실패: {videoGenError}
          </Text>
          <View style={styles.videoErrorActions}>
            <TouchableOpacity onPress={onRetryVideo} activeOpacity={0.7}>
              <RotateCcw size={14} color={theme.colors.error[400]} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onDismissVideoError} activeOpacity={0.7}>
              <X size={13} color={theme.colors.dark.textDim} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      )}
      {imageGenError && mediaType === 'image' && (
        <View style={styles.videoErrorToast}>
          <AlertCircle size={13} color={theme.colors.error[400]} strokeWidth={2} />
          <Text style={styles.videoErrorToastText} numberOfLines={5}>{imageGenError}</Text>
          <View style={styles.videoErrorActions}>
            <TouchableOpacity onPress={onRetryImage} activeOpacity={0.7}>
              <RotateCcw size={14} color={theme.colors.error[400]} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onDismissImageError} activeOpacity={0.7}>
              <X size={13} color={theme.colors.dark.textDim} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {mediaType === 'video' ? (
        <ShortFormPreviewPlayer
          editPlan={previewEditPlan}
          videoUri={mediaUrl}
          narrativePlan={narrativePlan}
          videoGenProgress={videoGenProgress}
          bgmVolume={bgmVolume}
          copyOverlays={copyOverlays}
          narrationActive={narrationActive}
          ttsUrl={ttsUrl}
        />
      ) : generatedImages.length > 0 ? (
        <View style={styles.imageHeroContainer}>
          <TouchableOpacity
            style={styles.imageHeroView}
            onPress={() => onOpenImageViewer(selectedImageIndex)}
            activeOpacity={0.95}
          >
            <Image
              source={{ uri: generatedImages[selectedImageIndex] ?? generatedImages[0] }}
              style={styles.imageHeroImg}
              resizeMode="contain"
            />
          </TouchableOpacity>
          {generatedImages.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.imageThumbStrip}
              contentContainerStyle={styles.imageThumbStripContent}
            >
              {generatedImages.map((imgUri, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => onSelectImage(idx)}
                  activeOpacity={0.85}
                >
                  <Image
                    source={{ uri: getThumbnailUrl(imgUri, 120) }}
                    style={[
                      styles.imageThumbItem,
                      idx === selectedImageIndex && styles.imageThumbItemActive,
                    ]}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      ) : (
        <View style={styles.imageHeroPlaceholder}>
          <ImageIcon size={32} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
          <Text style={styles.imageHeroPlaceholderText}>
            이미지 모드 — AI 자동 생성을 눌러 5장 이미지를 만들어보세요
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  previewSection: {
    marginHorizontal: theme.spacing.md,
    marginVertical: 2,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '30',
    ...theme.shadows.card,
  },
  regenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500] + '15',
    marginBottom: 4,
  },
  regenBannerText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  bgJobBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500] + '12',
    borderWidth: 1,
    borderColor: theme.colors.accent[400] + '30',
    marginBottom: 4,
  },
  bgJobText: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.accent[300],
    lineHeight: 16,
  },
  imageGenProgressContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500] + '12',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: theme.colors.accent[400] + '20',
  },
  imageGenProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  imageGenProgressPercent: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.accent[300],
    marginLeft: 'auto',
  },
  imageGenProgressBarTrack: {
    height: 4,
    backgroundColor: theme.colors.dark.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  imageGenProgressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  imageGenProgressCount: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    marginTop: 4,
  },
  videoErrorToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.error[500] + '15',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.colors.error[400] + '30',
  },
  videoErrorToastText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.error[400],
  },
  videoErrorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  imageHeroContainer: {
    gap: 8,
  },
  imageHeroView: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.dark.bg,
  },
  imageHeroImg: {
    width: '100%',
    height: '100%',
  },
  imageThumbStrip: {
    flexGrow: 0,
  },
  imageThumbStripContent: {
    gap: 6,
    paddingHorizontal: 2,
  },
  imageThumbItem: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  imageThumbItemActive: {
    borderColor: theme.colors.accent[400],
  },
  imageHeroPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  imageHeroPlaceholderText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
