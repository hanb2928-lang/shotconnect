import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
} from 'react-native';
import {
  Film,
  Sparkles,
  Zap,
  Clock,
  AudioLines,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Type,
  Music2,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { runSoloDirector, SoloDirectorResult, SoloDirectorInput } from '@/lib/aiSoloDirector';

interface AiSoloDirectorCardProps {
  productName: string;
  platform: string;
  scanId?: string | null;
  customPrompt?: string;
  onResult?: (result: SoloDirectorResult) => void;
}

export function AiSoloDirectorCard({
  productName,
  platform,
  scanId = null,
  customPrompt = '',
  onResult,
}: AiSoloDirectorCardProps) {
  const [result, setResult] = useState<SoloDirectorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const input: SoloDirectorInput = {
        productName,
        platform,
        scanId,
        customPrompt,
      };
      const res = await runSoloDirector(input);
      setResult(res);
      if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      onResult?.(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI 연출가 분석 실패';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [productName, platform, scanId, customPrompt, onResult]);

  const toggleExpanded = () => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpanded((v) => !v);
  };

  const c = theme.colors;

  return (
    <View style={[styles.container, { backgroundColor: c.dark.surface, borderColor: c.dark.border }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconBadge, { backgroundColor: c.accent[400] + '20' }]}>
            <Film size={18} color={c.accent[400]} strokeWidth={2} />
          </View>
          <View>
            <Text style={[styles.title, { color: c.dark.text }]}>AI 1인 연출가</Text>
            <Text style={[styles.subtitle, { color: c.dark.textDim }]}>
              상위 1% 바이럴 공식 기반 대본·자막·연출 자동 완성
            </Text>
          </View>
        </View>
        {result && (
          <TouchableOpacity onPress={toggleExpanded} style={styles.expandBtn} activeOpacity={0.7}>
            {expanded ? (
              <ChevronUp size={18} color={c.dark.textDim} strokeWidth={2} />
            ) : (
              <ChevronDown size={18} color={c.dark.textDim} strokeWidth={2} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {loading && (
        <View style={styles.loadingSection}>
          <ActivityIndicator size="small" color={c.accent[400]} />
          <Text style={[styles.loadingText, { color: c.dark.textDim }]}>
            AI 연출가가 대본과 자막 후킹을 설계 중...
          </Text>
        </View>
      )}

      {error && (
        <View style={[styles.errorBox, { backgroundColor: c.error[400] + '15' }]}>
          <Text style={[styles.errorText, { color: c.error[400] }]}>{error}</Text>
        </View>
      )}

      {!loading && !result && (
        <TouchableOpacity
          style={[styles.runButton, { backgroundColor: c.accent[400] }]}
          onPress={handleRun}
          activeOpacity={0.8}
        >
          <Sparkles size={16} color="#fff" strokeWidth={2} />
          <Text style={styles.runButtonText}>AI 연출가 분석 시작</Text>
        </TouchableOpacity>
      )}

      {result && !loading && (
        <View style={styles.resultSection}>
          <View style={styles.metricRow}>
            <View style={[styles.metricChip, { backgroundColor: c.dark.surfaceLight }]}>
              <TrendingUp size={11} color={c.primary[300]} strokeWidth={2} />
              <Text style={[styles.metricText, { color: c.dark.textDim }]}>
                예상 전환율 +{result.estimatedConversionBoost}%
              </Text>
            </View>
            <View style={[styles.metricChip, { backgroundColor: c.dark.surfaceLight }]}>
              <AudioLines size={11} color={c.accent[400]} strokeWidth={2} />
              <Text style={[styles.metricText, { color: c.dark.textDim }]}>
                {result.syncAccuracyLabel}
              </Text>
            </View>
            <View style={[styles.metricChip, { backgroundColor: c.dark.surfaceLight }]}>
              <Clock size={11} color={c.primary[300]} strokeWidth={2} />
              <Text style={[styles.metricText, { color: c.dark.textDim }]}>
                {Math.round(result.syncProfile.totalDurationSec)}초
              </Text>
            </View>
          </View>

          <View style={[styles.scriptBox, { backgroundColor: c.dark.surfaceLight, borderColor: c.dark.border }]}>
            <View style={styles.scriptHeader}>
              <Zap size={12} color={c.warning[400]} strokeWidth={2} />
              <Text style={[styles.scriptLabel, { color: c.dark.text }]}>초반 2초 훅</Text>
            </View>
            <Text style={[styles.hookText, { color: c.dark.text }]}>{result.script.hook}</Text>
          </View>

          {expanded && (
            <View style={styles.expandedSection}>
              <Text style={[styles.sectionTitle, { color: c.dark.text }]}>전체 대본</Text>
              {result.script.segments.map((seg, i) => (
                <View key={i} style={[styles.scriptSegment, { borderColor: c.dark.border }]}>
                  <Text style={[styles.segmentTime, { color: c.primary[300] }]}>
                    {seg.startSec}-{seg.endSec}초
                  </Text>
                  <Text style={[styles.segmentText, { color: c.dark.textDim }]}>{seg.text}</Text>
                </View>
              ))}

              <View style={styles.sectionSpacer} />
              <Text style={[styles.sectionTitle, { color: c.dark.text }]}>자막 후킹 배치</Text>
              <View style={[styles.typographyBox, { backgroundColor: c.dark.surfaceLight }]}>
                <Type size={11} color={c.accent[400]} strokeWidth={2} />
                <Text style={[styles.typographyText, { color: c.dark.textDim }]}>
                  {result.captionPlan.hookKeywordTypography}
                </Text>
              </View>
              {result.captionPlan.captions.slice(0, 5).map((cap, i) => (
                <View key={i} style={[styles.captionRow, { borderColor: c.dark.border }]}>
                  <Text style={[styles.captionTime, { color: c.primary[300] }]}>
                    {cap.startSec.toFixed(1)}-{cap.endSec.toFixed(1)}s
                  </Text>
                  <Text
                    style={[
                      styles.captionText,
                      { color: cap.emphasis ? c.dark.text : c.dark.textDim },
                      cap.emphasis && { fontFamily: theme.typography.fontFamily.semiBold },
                    ]}
                    numberOfLines={2}
                  >
                    {cap.text}
                  </Text>
                </View>
              ))}

              <View style={styles.sectionSpacer} />
              <Text style={[styles.sectionTitle, { color: c.dark.text }]}>오디오-비주얼 동기화</Text>
              <View style={styles.syncInfoRow}>
                <View style={[styles.syncInfoChip, { backgroundColor: c.dark.surfaceLight }]}>
                  <Music2 size={10} color={c.accent[400]} strokeWidth={2} />
                  <Text style={[styles.syncInfoText, { color: c.dark.textDim }]}>
                    BGM {result.editPlan.bgmTemplate.bpm}BPM
                  </Text>
                </View>
                <View style={[styles.syncInfoChip, { backgroundColor: c.dark.surfaceLight }]}>
                  <AudioLines size={10} color={c.primary[300]} strokeWidth={2} />
                  <Text style={[styles.syncInfoText, { color: c.dark.textDim }]}>
                    {result.directingPlan.beatSync.cutPoints.length}개 컷 포인트
                  </Text>
                </View>
              </View>

              <View style={styles.sectionSpacer} />
              <Text style={[styles.sectionTitle, { color: c.dark.text }]}>연출 요약</Text>
              <Text style={[styles.summaryText, { color: c.dark.textDim }]}>
                {result.directingSummary}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.rerunButton, { borderColor: c.accent[400] }]}
            onPress={handleRun}
            activeOpacity={0.7}
          >
            <Sparkles size={13} color={c.accent[400]} strokeWidth={2} />
            <Text style={[styles.rerunButtonText, { color: c.accent[400] }]}>다시 분석</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    marginBottom: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    marginTop: 2,
  },
  expandBtn: {
    padding: 6,
  },
  loadingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: theme.spacing.md,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
  },
  errorBox: {
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
  },
  runButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
  },
  runButtonText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  resultSection: {
    marginTop: theme.spacing.xs,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: theme.spacing.sm,
  },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: theme.radius.full,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  metricText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
  },
  scriptBox: {
    borderRadius: theme.radius.md,
    padding: 12,
    borderWidth: 1,
    marginBottom: theme.spacing.sm,
  },
  scriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  scriptLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  hookText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    lineHeight: 20,
  },
  expandedSection: {
    marginTop: theme.spacing.xs,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    marginBottom: 8,
  },
  scriptSegment: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  segmentTime: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    width: 55,
    flexShrink: 0,
  },
  segmentText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    flex: 1,
    lineHeight: 17,
  },
  sectionSpacer: {
    height: theme.spacing.md,
  },
  typographyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  typographyText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    flex: 1,
    lineHeight: 16,
  },
  captionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  captionTime: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    width: 65,
    flexShrink: 0,
  },
  captionText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    flex: 1,
    lineHeight: 17,
  },
  syncInfoRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  syncInfoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: theme.radius.full,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  syncInfoText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
  },
  summaryText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    lineHeight: 18,
  },
  rerunButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    borderWidth: 1,
    marginTop: theme.spacing.sm,
  },
  rerunButtonText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
});
