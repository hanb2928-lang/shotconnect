import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { theme } from '@/lib/theme';
import { EMOTION_PHASES, type EmotionPhase } from '@/lib/ttsEmotionCurve';

interface AidcaPhaseInfo {
  phase: EmotionPhase;
  label: string;
  emoji: string;
  ratio: number;
  color: string;
  desc: string;
}

const PHASE_RATIOS: Record<EmotionPhase, number> = {
  attention: 0.20,
  interest: 0.467,
  desire: 0.167,
  conviction: 0.10,
  action: 0.066,
};

const PHASE_META: Record<EmotionPhase, { color: string; desc: string }> = {
  attention: { color: theme.colors.warning[400], desc: '후킹 0-3s' },
  interest: { color: theme.colors.accent[400], desc: '신뢰 구축' },
  desire: { color: theme.colors.primary[400], desc: '제품 소구' },
  conviction: { color: theme.colors.success[400], desc: '구매 확신' },
  action: { color: theme.colors.error[400], desc: '클로징 · 공정위' },
};

const PHASE_LABELS: Record<EmotionPhase, { label: string; emoji: string }> = {
  attention: { label: '어텐션', emoji: '👀' },
  interest: { label: '관심', emoji: '🤔' },
  desire: { label: '욕구', emoji: '✨' },
  conviction: { label: '확신', emoji: '💪' },
  action: { label: '액션', emoji: '🔥' },
};

const PHASE_ORDER: EmotionPhase[] = ['attention', 'interest', 'desire', 'conviction', 'action'];

interface AidcaProgressTrackerProps {
  progressSV: SharedValue<number>;
  totalDurationSec?: number;
}

export function AidcaProgressTracker({ progressSV, totalDurationSec = 15 }: AidcaProgressTrackerProps) {
  const phases = useMemo<AidcaPhaseInfo[]>(() => {
    return PHASE_ORDER.map((phase) => ({
      phase,
      label: PHASE_LABELS[phase].label,
      emoji: PHASE_LABELS[phase].emoji,
      ratio: PHASE_RATIOS[phase],
      color: PHASE_META[phase].color,
      desc: PHASE_META[phase].desc,
    }));
  }, []);

  const currentPhaseIndex = useDerivedValue(() => {
    const pct = progressSV.value;
    let acc = 0;
    for (let i = 0; i < PHASE_ORDER.length; i++) {
      acc += PHASE_RATIOS[PHASE_ORDER[i]];
      if (pct <= acc) return i;
    }
    return PHASE_ORDER.length - 1;
  });

  const barFillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(progressSV.value, 1)) * 100}%`,
  }));

  const pctTextStyle = useAnimatedStyle(() => ({
    opacity: progressSV.value > 0.02 ? 1 : 0.3,
  }));

  const elapsedSec = useDerivedValue(() => Math.round(progressSV.value * totalDurationSec));
  const remainingSec = useDerivedValue(() => Math.max(0, totalDurationSec - elapsedSec.value));

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Animated.Text style={[styles.pctText, pctTextStyle]}>
          {Math.round(progressSV.value * 100)}%
        </Animated.Text>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{elapsedSec.value}s</Text>
          <Text style={styles.timeDimText}> / {totalDurationSec}s</Text>
        </View>
        {remainingSec.value > 0 && (
          <Text style={styles.remainingText}>남은 시간 ~{remainingSec.value}s</Text>
        )}
      </View>

      <View style={styles.barContainer}>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, barFillStyle]} />
        </View>

        {phases.map((p, i) => {
          const leftPct = phases.slice(0, i).reduce((sum, ph) => sum + ph.ratio, 0) * 100;
          const isActive = currentPhaseIndex.value === i;
          return (
            <View
              key={p.phase}
              style={[
                styles.phaseMarker,
                { left: `${leftPct}%`, width: `${p.ratio * 100}%` },
              ]}
            >
              <View style={[styles.phaseDot, { backgroundColor: p.color, opacity: isActive ? 1 : 0.3 }]} />
              <Text
                style={[
                  styles.phaseLabel,
                  { color: isActive ? p.color : theme.colors.dark.textDim },
                ]}
                numberOfLines={1}
              >
                {p.emoji} {p.label}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.phaseDescRow}>
        {phases.map((p, i) => (
          <View
            key={p.phase}
            style={[
              styles.phaseDescItem,
              { width: `${p.ratio * 100}%` },
            ]}
          >
            <Text
              style={[
                styles.phaseDescText,
                {
                  color: currentPhaseIndex.value === i ? p.color : theme.colors.dark.textFaint,
                },
              ]}
              numberOfLines={1}
            >
              {p.desc}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  pctText: {
    fontSize: 22,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.primary[300],
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  timeText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  timeDimText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  remainingText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginLeft: 'auto',
  },
  barContainer: {
    position: 'relative',
    width: '100%',
    height: 28,
  },
  barTrack: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: theme.colors.primary[500],
  },
  phaseMarker: {
    position: 'absolute',
    top: 0,
    height: 28,
    alignItems: 'center',
  },
  phaseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 2,
  },
  phaseLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    textAlign: 'center',
  },
  phaseDescRow: {
    flexDirection: 'row',
    width: '100%',
  },
  phaseDescItem: {
    alignItems: 'center',
  },
  phaseDescText: {
    fontSize: 8,
    fontFamily: theme.typography.fontFamily.regular,
    textAlign: 'center',
  },
});
