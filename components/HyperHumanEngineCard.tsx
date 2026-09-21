import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Zap, Volume2, Film, RefreshCw } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  HOOK_TEMPLATES,
  generateHook,
  type HookType,
  type HookResult,
} from '@/lib/hyperHumanEngine';
import {
  generateEmotionCurve,
  getPhaseLabel,
  getPhaseEmoji,
  type EmotionCurve,
} from '@/lib/ttsEmotionCurve';
import {
  generateSyncTimeline,
  getEffectLabel,
  getEffectEmoji,
  type MicroSyncTimeline,
} from '@/lib/microSyncRenderer';

interface HyperHumanEngineCardProps {
  productName: string;
  caption: string;
  hashtags: string[];
  videoDurationSec?: number;
}

const HOOK_TYPES: { key: HookType; label: string; emoji: string }[] = [
  { key: 'reversal', label: '반전형', emoji: '🔄' },
  { key: 'empathy', label: '공감형', emoji: '🤝' },
  { key: 'selfDeprecating', label: '자학 유머형', emoji: '😂' },
];

export function HyperHumanEngineCard({
  productName,
  caption,
  hashtags,
  videoDurationSec = 15,
}: HyperHumanEngineCardProps) {
  const [selectedHookType, setSelectedHookType] = useState<HookType>('reversal');
  const [hookResult, setHookResult] = useState<HookResult | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const emotionCurve = useMemo(
    () => generateEmotionCurve(videoDurationSec),
    [videoDurationSec],
  );

  const syncTimeline = useMemo(
    () => generateSyncTimeline(caption, videoDurationSec),
    [caption, videoDurationSec],
  );

  const regenerateHook = useCallback(() => {
    setRegenerating(true);
    setTimeout(() => {
      const result = generateHook(selectedHookType, productName, caption, hashtags);
      setHookResult(result);
      setRegenerating(false);
    }, 100);
  }, [selectedHookType, productName, caption, hashtags]);

  const handleHookTypeSelect = useCallback((type: HookType) => {
    setSelectedHookType(type);
    const result = generateHook(type, productName, caption, hashtags);
    setHookResult(result);
  }, [productName, caption, hashtags]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Zap size={18} color={theme.colors.accent[400]} strokeWidth={2} />
        <Text style={styles.headerTitle}>1% 크리에이터 AI 엔진</Text>
      </View>

      {/* Hook Type Selector */}
      <Text style={styles.sectionLabel}>3초 역발상 훅 파서</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hookScroll}>
        {HOOK_TYPES.map((ht) => (
          <TouchableOpacity
            key={ht.key}
            style={[styles.hookChip, selectedHookType === ht.key && styles.hookChipActive]}
            onPress={() => handleHookTypeSelect(ht.key)}
            activeOpacity={0.7}
          >
            <Text style={styles.hookEmoji}>{ht.emoji}</Text>
            <Text style={[styles.hookLabel, selectedHookType === ht.key && styles.hookLabelActive]}>
              {ht.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Generated Hook */}
      {hookResult && (
        <View style={styles.hookResultBox}>
          <View style={styles.hookResultHeader}>
            <Text style={styles.hookResultLabel}>생성된 오프닝 훅</Text>
            <TouchableOpacity onPress={regenerateHook} disabled={regenerating} activeOpacity={0.7}>
              <RefreshCw
                size={14}
                color={theme.colors.accent[400]}
                strokeWidth={2}
                style={regenerating ? { transform: [{ rotate: '180deg' }] } : undefined}
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.hookText}>"{hookResult.hook}"</Text>
          <Text style={styles.hookCaptionPreview} numberOfLines={3}>{hookResult.caption}</Text>
        </View>
      )}

      {/* Emotion Curve */}
      <View style={styles.sectionHeader}>
        <Volume2 size={14} color={theme.colors.primary[300]} strokeWidth={2} />
        <Text style={styles.sectionTitle}>오디오 감정 곡선 엔진</Text>
      </View>
      <View style={styles.emotionCurveRow}>
        {emotionCurve.segments.map((seg, i) => (
          <View
            key={i}
            style={[
              styles.emotionPhase,
              { flex: seg.endSec - seg.startSec },
              i === 0 && styles.emotionPhaseFirst,
              i === emotionCurve.segments.length - 1 && styles.emotionPhaseLast,
            ]}
          >
            <Text style={styles.emotionEmoji}>{getPhaseEmoji(seg.phase)}</Text>
            <Text style={styles.emotionLabel}>{getPhaseLabel(seg.phase)}</Text>
            <Text style={styles.emotionSpeed}>{seg.speed.toFixed(2)}x</Text>
          </View>
        ))}
      </View>
      <View style={styles.emotionDetailRow}>
        {emotionCurve.segments.map((seg, i) => (
          <View key={i} style={[styles.emotionDetail, { flex: seg.endSec - seg.startSec }]}>
            <Text style={styles.emotionDetailText}>
              {seg.startSec.toFixed(0)}~{seg.endSec.toFixed(0)}s
            </Text>
            {seg.pauseSec > 0 && (
              <Text style={styles.emotionDetailSub}>쉼 {seg.pauseSec}s</Text>
            )}
            <Text style={styles.emotionDetailSub}>
              스타일 +{(seg.styleExaggeration * 100).toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>

      {/* Micro Sync Timeline */}
      <View style={styles.sectionHeader}>
        <Film size={14} color={theme.colors.success[400]} strokeWidth={2} />
        <Text style={styles.sectionTitle}>마이크로 비트 동기화</Text>
      </View>
      <View style={styles.syncStatsRow}>
        <View style={styles.syncStat}>
          <Text style={styles.syncStatNum}>{syncTimeline.markers.length}</Text>
          <Text style={styles.syncStatLabel}>비트 마커</Text>
        </View>
        <View style={styles.syncStat}>
          <Text style={styles.syncStatNum}>{syncTimeline.tempoLayers.length}</Text>
          <Text style={styles.syncStatLabel}>템포 레이어</Text>
        </View>
        <View style={styles.syncStat}>
          <Text style={styles.syncStatNum}>{videoDurationSec}s</Text>
          <Text style={styles.syncStatLabel}>총 길이</Text>
        </View>
      </View>

      {/* Sync Markers Preview */}
      {syncTimeline.markers.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.markerScroll}>
          {syncTimeline.markers.slice(0, 12).map((m) => (
            <View key={m.id} style={styles.markerChip}>
              <Text style={styles.markerEmoji}>{getEffectEmoji(m.effect)}</Text>
              <Text style={styles.markerTime}>{m.timeSec.toFixed(1)}s</Text>
              <Text style={styles.markerKeyword}>"{m.keyword}"</Text>
            </View>
          ))}
        </ScrollView>
      )}

      <Text style={styles.footerNote}>
        상위 1% 마케터의 후킹 기법, 감정선, 비트 동기화를 AI가 자동 적용합니다
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 6,
  },
  hookScroll: {
    flexDirection: 'row',
    marginHorizontal: -4,
    marginBottom: theme.spacing.sm,
  },
  hookChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginRight: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  hookChipActive: {
    borderColor: theme.colors.accent[400],
    backgroundColor: theme.colors.accent[500] + '15',
  },
  hookEmoji: {
    fontSize: 14,
  },
  hookLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  hookLabelActive: {
    color: theme.colors.accent[300],
  },
  hookResultBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: theme.spacing.md,
  },
  hookResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  hookResultLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  hookText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.accent[300],
    lineHeight: 20,
    marginBottom: 4,
  },
  hookCaptionPreview: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  emotionCurveRow: {
    flexDirection: 'row',
    height: 60,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    marginBottom: 4,
  },
  emotionPhase: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  emotionPhaseFirst: {
    backgroundColor: theme.colors.warning[500] + '25',
  },
  emotionPhaseLast: {
    backgroundColor: theme.colors.success[500] + '25',
  },
  emotionEmoji: {
    fontSize: 16,
  },
  emotionLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  emotionSpeed: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  emotionDetailRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.sm,
  },
  emotionDetail: {
    alignItems: 'center',
    gap: 1,
  },
  emotionDetailText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  emotionDetailSub: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  syncStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  syncStat: {
    flex: 1,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 2,
  },
  syncStatNum: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.success[400],
  },
  syncStatLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  markerScroll: {
    flexDirection: 'row',
    marginHorizontal: -4,
    marginBottom: theme.spacing.sm,
  },
  markerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginRight: 4,
  },
  markerEmoji: {
    fontSize: 12,
  },
  markerTime: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  markerKeyword: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[300],
  },
  footerNote: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
    marginTop: 4,
  },
});
