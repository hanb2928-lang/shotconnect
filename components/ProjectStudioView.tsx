import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  DimensionValue,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import {
  RefreshCw,
  CircleAlert as AlertCircle,
  CheckCircle2,
  UploadCloud,
  Film,
  Play,
  ArrowLeft,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useProjectPhase, type ProjectStep } from '@/hooks/useProjectPhase';
import { LoadingScreen } from '@/components/LoadingScreen';

interface ProjectStudioViewProps {
  jobId: string | null;
  onRetry?: () => void;
  onBack?: () => void;
}

const STEP_META: Record<ProjectStep, { label: string; icon: typeof Film; color: string }> = {
  idle: { label: '대기 중', icon: UploadCloud, color: theme.colors.dark.textDim },
  uploading: { label: '이미지 업로드 중', icon: UploadCloud, color: theme.colors.primary[400] },
  rendering: { label: 'AI 렌더링 중', icon: Film, color: theme.colors.accent[400] },
  completed: { label: '완료', icon: CheckCircle2, color: theme.colors.success[400] },
  failed: { label: '오류 발생', icon: AlertCircle, color: theme.colors.error[400] },
};

const STEP_ORDER: ProjectStep[] = ['uploading', 'rendering', 'completed'];

export function ProjectStudioView({ jobId, onRetry, onBack }: ProjectStudioViewProps) {
  const { step, data } = useProjectPhase(jobId);

  switch (step) {
    case 'idle':
      return <IdleState onBack={onBack} />;
    case 'uploading':
      return <UploadingState />;
    case 'rendering':
      return <RenderingState />;
    case 'completed':
      return <CompletedState videoUrl={data?.video_url ?? null} />;
    case 'failed':
      return <FailedState errorMsg={data?.error_message ?? null} onRetry={onRetry} onBack={onBack} />;
    default:
      return <LoadingScreen message="로딩 중..." />;
  }
}

function StepIndicator({ currentStep }: { currentStep: ProjectStep }) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <View style={stepStyles.container}>
      {STEP_ORDER.map((s, i) => {
        const meta = STEP_META[s];
        const Icon = meta.icon;
        const isReached = i <= currentIndex;
        const isCurrent = i === currentIndex;

        return (
          <View key={s} style={stepStyles.item}>
            <View
              style={[
                stepStyles.iconCircle,
                { backgroundColor: isReached ? meta.color + '22' : theme.colors.dark.surfaceLight },
                isCurrent && { borderColor: meta.color, borderWidth: 2 },
              ]}
            >
              <Icon size={18} color={isReached ? meta.color : theme.colors.dark.textDim} strokeWidth={2} />
            </View>
            <Text
              style={[
                stepStyles.label,
                { color: isReached ? meta.color : theme.colors.dark.textDim },
              ]}
            >
              {meta.label}
            </Text>
            {i < STEP_ORDER.length - 1 && (
              <View
                style={[
                  stepStyles.connector,
                  { backgroundColor: i < currentIndex ? meta.color : theme.colors.dark.border },
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function IdleState({ onBack }: { onBack?: () => void }) {
  return (
    <View style={styles.centerContainer}>
      <UploadCloud size={48} color={theme.colors.dark.textDim} strokeWidth={1.5} />
      <Text style={styles.titleText}>프로젝트 대기 중</Text>
      <Text style={styles.descText}>비디오 생성이 시작되면 여기에 표시됩니다.</Text>
      {onBack && (
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={18} color={theme.colors.dark.text} strokeWidth={2} />
          <Text style={styles.backBtnText}>돌아가기</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function UploadingState() {
  const shimmer = useSharedValue(0);

  shimmer.value = withRepeat(
    withSequence(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
    ),
    -1,
    false,
  );

  const barStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + shimmer.value * 0.6,
  }));

  return (
    <View style={styles.centerContainer}>
      <StepIndicator currentStep="uploading" />
      <Animated.View style={[styles.progressBar, barStyle]} />
      <Text style={styles.descText}>제품 이미지를 업로드하는 중입니다...</Text>
    </View>
  );
}

function RenderingState() {
  return (
    <View style={styles.centerContainer}>
      <StepIndicator currentStep="rendering" />
      <LoadingScreen message="AI가 멋진 쇼츠를 렌더링하고 있습니다..." fullScreen={false} />
      <Text style={styles.descText}>보통 1~3분 정도 소요됩니다. 완료되면 자동으로 표시됩니다.</Text>
    </View>
  );
}

function CompletedState({ videoUrl }: { videoUrl: string | null }) {
  if (!videoUrl) {
    return (
      <View style={styles.centerContainer}>
        <CheckCircle2 size={48} color={theme.colors.success[400]} strokeWidth={1.5} />
        <Text style={styles.titleText}>비디오 생성 완료</Text>
        <Text style={styles.descText}>영상 URL을 불러오는 중입니다...</Text>
        <ActivityIndicator size="small" color={theme.colors.primary[400]} />
      </View>
    );
  }

  return (
    <View style={styles.videoContainer}>
      <StepIndicator currentStep="completed" />
      <View style={styles.videoFrame}>
        {Platform.OS === 'web' ? (
          <video
            src={videoUrl}
            controls
            autoPlay
            loop
            muted
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              borderRadius: 12,
            }}
          />
        ) : (
          <Text style={styles.descText}>비디오를 재생하려면 웹 환경이 필요합니다.</Text>
        )}
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={() => {
            if (Platform.OS === 'web' && videoUrl) {
              window.open(videoUrl, '_blank');
            }
          }}
          activeOpacity={0.7}
        >
          <Play size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.shareBtnText}>새 창에서 보기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FailedState({
  errorMsg,
  onRetry,
  onBack,
}: {
  errorMsg: string | null;
  onRetry?: () => void;
  onBack?: () => void;
}) {
  return (
    <View style={styles.centerContainer}>
      <AlertCircle size={48} color={theme.colors.error[400]} strokeWidth={1.5} />
      <Text style={[styles.titleText, { color: theme.colors.error[400] }]}>생성 실패</Text>
      <Text style={styles.descText}>
        {errorMsg ?? '비디오 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'}
      </Text>
      <View style={styles.actionRow}>
        {onRetry && (
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.7}>
            <RefreshCw size={18} color={theme.colors.error[400]} strokeWidth={2} />
            <Text style={styles.retryBtnText}>다시 시도</Text>
          </TouchableOpacity>
        )}
        {onBack && (
          <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
            <ArrowLeft size={18} color={theme.colors.dark.text} strokeWidth={2} />
            <Text style={styles.backBtnText}>돌아가기</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  videoContainer: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  titleText: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  descText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 20,
  },
  progressBar: {
    width: '70%' as DimensionValue,
    maxWidth: 280,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.primary[400],
    marginTop: 4,
  },
  videoFrame: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 420,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.colors.dark.surface,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.error[500] + '18',
  },
  retryBtnText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.error[400],
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  backBtnText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary[500],
    ...theme.shadows.glowPrimary,
  },
  shareBtnText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
});

const stepStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 0,
    marginBottom: theme.spacing.md,
  },
  item: {
    alignItems: 'center',
    gap: 6,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
  },
  connector: {
    position: 'absolute',
    top: 20,
    left: '100%' as DimensionValue,
    width: 48,
    height: 2,
    marginLeft: -24,
    zIndex: -1,
  },
});
