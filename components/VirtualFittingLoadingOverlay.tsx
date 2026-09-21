import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  cancelAnimation,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';
import { Layers, User, Scan, Sparkles, Check } from 'lucide-react-native';
import { theme } from '@/lib/theme';

interface VirtualFittingLoadingOverlayProps {
  visible: boolean;
  onClose?: () => void;
}

interface LoadingStage {
  id: string;
  label: string;
  icon: typeof Layers;
  color: string;
  durationMs: number;
}

const STAGES: LoadingStage[] = [
  { id: 'scan', label: 'AI가 제품 원본을 스캔 중입니다...', icon: Scan, color: theme.colors.primary[400], durationMs: 1800 },
  { id: 'body', label: 'AI가 모델 체형 라인을 분석 중입니다...', icon: User, color: theme.colors.accent[400], durationMs: 2400 },
  { id: 'fit', label: 'AI가 제품을 배경에 자연스럽게 합성 중입니다...', icon: Layers, color: theme.colors.warning[400], durationMs: 3000 },
  { id: 'render', label: 'AI가 최종 결과를 렌더링 중입니다...', icon: Sparkles, color: theme.colors.success[400], durationMs: 1800 },
];

const TOTAL_DURATION = STAGES.reduce((sum, s) => sum + s.durationMs, 0);

export function VirtualFittingLoadingOverlay({ visible }: VirtualFittingLoadingOverlayProps) {
  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const progressSV = useSharedValue(0);
  const stageProgressSV = useSharedValue(0);
  const pulseSV = useSharedValue(0);
  const scanLineSV = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;

    progressSV.value = 0;
    stageProgressSV.value = 0;
    setCurrentStageIdx(0);
    pulseSV.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    scanLineSV.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );

    let elapsed = 0;
    const stageTimers: ReturnType<typeof setTimeout>[] = [];

    STAGES.forEach((stage, idx) => {
      const stageStart = elapsed;
      stageTimers.push(
        setTimeout(() => {
          setCurrentStageIdx(idx);
          stageProgressSV.value = 0;
          stageProgressSV.value = withTiming(1, { duration: stage.durationMs, easing: Easing.linear });
        }, stageStart),
      );
      elapsed += stage.durationMs;
    });

    progressSV.value = withTiming(1, { duration: TOTAL_DURATION, easing: Easing.linear });

    return () => {
      stageTimers.forEach(clearTimeout);
      cancelAnimation(pulseSV);
      cancelAnimation(scanLineSV);
      cancelAnimation(progressSV);
      cancelAnimation(stageProgressSV);
    };
  }, [visible]);

  if (!visible) return null;

  const progressPercent = Math.round(interpolate(progressSV.value, [0, 1], [0, 100]));

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <Text style={styles.title}>AI 범용 합성 생성 중</Text>
          <Text style={styles.subtitle}>제품과 배경 사진을 합성하는 동안 잠시만 기다려주세요</Text>

          {/* Animated preview area */}
          <View style={styles.previewArea}>
            <ScanArea stageIdx={currentStageIdx} scanLineSV={scanLineSV} pulseSV={pulseSV} />
          </View>

          {/* Stage list */}
          <View style={styles.stageList}>
            {STAGES.map((stage, idx) => {
              const isActive = idx === currentStageIdx;
              const isDone = idx < currentStageIdx;
              const StageIcon = stage.icon;
              return (
                <View key={stage.id} style={styles.stageRow}>
                  <StageIconRow
                    isActive={isActive}
                    isDone={isDone}
                    color={stage.color}
                    Icon={StageIcon}
                    pulseSV={pulseSV}
                  />
                  <Text
                    style={[
                      styles.stageLabel,
                      isActive && styles.stageLabelActive,
                      isDone && styles.stageLabelDone,
                    ]}
                    numberOfLines={1}
                  >
                    {stage.label}
                  </Text>
                  {isDone && <Check size={12} color={theme.colors.success[400]} strokeWidth={2.5} />}
                  {isActive && <ActiveIndicator color={stage.color} />}
                </View>
              );
            })}
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View
              style={[styles.progressFill, { width: `${progressPercent}%` }]}
            />
          </View>
          <Text style={styles.progressPercent}>{progressPercent}%</Text>
        </View>
      </View>
    </Modal>
  );
}

function ScanArea({
  stageIdx,
  scanLineSV,
  pulseSV,
}: {
  stageIdx: number;
  scanLineSV: SharedValue<number>;
  pulseSV: SharedValue<number>;
}) {
  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scanLineSV.value, [0, 1], [-40, 40]) }],
    opacity: interpolate(scanLineSV.value, [0, 0.1, 0.9, 1], [0, 1, 1, 0]),
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulseSV.value, [0, 1], [1, 1.08]) }],
    opacity: 0.3 + pulseSV.value * 0.3,
  }));

  return (
    <View style={styles.scanArea}>
      <View style={styles.scanAreaImageBox}>
        <Layers size={36} color={theme.colors.primary[400]} strokeWidth={1.5} />
        <Text style={styles.scanAreaLabel}>제품</Text>
      </View>

      <Animated.View style={[styles.scanCenter, pulseStyle]}>
        {stageIdx < 3 ? (
          <Scan size={28} color={theme.colors.accent[400]} strokeWidth={2} />
        ) : (
          <Sparkles size={28} color={theme.colors.success[400]} strokeWidth={2} />
        )}
      </Animated.View>

      <View style={styles.scanAreaImageBox}>
        <User size={36} color={theme.colors.warning[400]} strokeWidth={1.5} />
        <Text style={styles.scanAreaLabel}>모델</Text>
      </View>

      <Animated.View style={[styles.scanLine, scanLineStyle]} pointerEvents="none" />
    </View>
  );
}

function StageIconRow({
  isActive,
  isDone,
  color,
  Icon,
  pulseSV,
}: {
  isActive: boolean;
  isDone: boolean;
  color: string;
  Icon: typeof Layers;
  pulseSV: SharedValue<number>;
}) {
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: isActive ? interpolate(pulseSV.value, [0, 1], [1, 1.15]) : 1 }],
  }));

  return (
    <Animated.View
      style={[
        styles.stageIconWrap,
        { backgroundColor: isActive || isDone ? color + '20' : theme.colors.dark.surfaceLight },
        { borderColor: isActive ? color : 'transparent' },
        pulseStyle,
      ]}
    >
      <Icon size={14} color={isDone ? theme.colors.success[400] : color} strokeWidth={2} />
    </Animated.View>
  );
}

function ActiveIndicator({ color }: { color: string }) {
  const dotSV = useSharedValue(0);
  useEffect(() => {
    dotSV.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0, { duration: 400 }),
      ),
      -1,
      false,
    );
  }, []);
  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotSV.value,
    transform: [{ scale: interpolate(dotSV.value, [0, 1], [0.8, 1.2]) }],
  }));
  return (
    <Animated.View style={[styles.activeDot, { backgroundColor: color }, dotStyle]} />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    ...theme.shadows.elevated,
  } as ViewStyle,
  title: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  previewArea: {
    marginBottom: 16,
  },
  scanArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 16,
    height: 100,
    overflow: 'hidden',
  },
  scanAreaImageBox: {
    alignItems: 'center',
    gap: 4,
  },
  scanAreaLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  scanCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: theme.colors.accent[400],
    opacity: 0.6,
  },
  stageList: {
    gap: 8,
    marginBottom: 16,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stageIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  stageLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  stageLabelActive: {
    color: theme.colors.dark.text,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  stageLabelDone: {
    color: theme.colors.dark.textFaint,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  progressTrack: {
    height: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.accent[400],
    borderRadius: 2,
  },
  progressPercent: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textAlign: 'right',
    marginTop: 4,
  },
});
