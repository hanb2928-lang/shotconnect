import { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Stethoscope, RefreshCw, TrendingUp, AlertTriangle, CheckCircle, Brain, RotateCcw, Zap, ChevronRight } from 'lucide-react-native';
import { SectionCard } from '@/components/SectionCard';
import { theme } from '@/lib/theme';
import { useMountedRef } from '@/hooks/useMountedRef';
import { getDiagnosticStats, getLearnedAdjustments, resetLearningState, analyzePatterns, type AutoFixRecommendation } from '@/lib/aiSelfDiagnostic';

export function AiDiagnosticCard() {
  const mounted = useMountedRef();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getDiagnosticStats>> | null>(null);
  const [adjustments, setAdjustments] = useState<Awaited<ReturnType<typeof getLearnedAdjustments>> | null>(null);
  const [patterns, setPatterns] = useState<Awaited<ReturnType<typeof analyzePatterns>> | null>(null);
  const [resetting, setResetting] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, a, p] = await Promise.all([
        getDiagnosticStats(),
        getLearnedAdjustments(),
        analyzePatterns(),
      ]);
      if (!mounted.current) return;
      setStats(s);
      setAdjustments(a);
      setPatterns(p);
    } catch {
      // non-fatal
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (mounted.current) setRefreshing(false);
  }, [load]);

  const handleReset = useCallback(async () => {
    setResetting(true);
    await resetLearningState();
    await load();
    if (mounted.current) setResetting(false);
  }, [load]);

  if (loading) {
    return (
      <SectionCard title="AI 자가검진 & 학습" icon={<Stethoscope size={18} color={theme.colors.accent[400]} strokeWidth={2} />}>
        <ActivityIndicator size="small" color={theme.colors.accent[400]} style={{ paddingVertical: 16 }} />
      </SectionCard>
    );
  }

  const successRate = stats ? Math.round(stats.successRate * 100) : 0;
  const successRateColor = successRate >= 80 ? theme.colors.success[400] : successRate >= 50 ? theme.colors.warning[400] : theme.colors.error[400];
  const avgRenderSec = stats ? Math.round(stats.avgRenderTimeMs / 1000) : 0;

  return (
    <SectionCard
      title="AI 자가검진 & 학습"
      subtitle={`총 ${stats?.totalAttempts ?? 0}회 시도 · 성공률 ${successRate}% · 평균 ${avgRenderSec}초`}
      icon={<Stethoscope size={18} color={theme.colors.accent[400]} strokeWidth={2} />}
      badge={stats && stats.successStreak >= 3 ? `${stats.successStreak}연속` : undefined}
      defaultExpanded={false}
    >
      {/* Stats overview */}
      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats?.totalAttempts ?? 0}</Text>
          <Text style={styles.statLabel}>총 시도</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: successRateColor }]}>{successRate}%</Text>
          <Text style={styles.statLabel}>성공률</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{avgRenderSec}s</Text>
          <Text style={styles.statLabel}>평균 렌더</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: theme.colors.warning[400] }]}>{stats?.successStreak ?? 0}</Text>
          <Text style={styles.statLabel}>연속 성공</Text>
        </View>
      </View>

      {/* Top failure category */}
      {stats?.topFailureCategory && stats.topFailureCategory !== 'unknown' && (
        <View style={styles.alertRow}>
          <AlertTriangle size={16} color={theme.colors.warning[400]} strokeWidth={2} />
          <Text style={styles.alertText}>
            최다 실패 원인: <Text style={styles.alertHighlight}>{translateCategory(stats.topFailureCategory)}</Text>
          </Text>
        </View>
      )}

      {/* Learned adjustments */}
      {adjustments && (
        <View style={styles.sectionGap}>
          <View style={styles.subHeader}>
            <Brain size={14} color={theme.colors.accent[400]} strokeWidth={2} />
            <Text style={styles.subHeaderText}>학습된 최적 파라미터</Text>
          </View>
          <View style={styles.adjustmentRow}>
            <Text style={styles.adjustmentLabel}>권장 해상도</Text>
            <Text style={styles.adjustmentValue}>{adjustments.optimalResolution}</Text>
          </View>
          <View style={styles.adjustmentRow}>
            <Text style={styles.adjustmentLabel}>권장 FPS</Text>
            <Text style={styles.adjustmentValue}>{adjustments.optimalFps}fps</Text>
          </View>
          <View style={styles.adjustmentRow}>
            <Text style={styles.adjustmentLabel}>권장 영상 길이</Text>
            <Text style={styles.adjustmentValue}>{adjustments.optimalDurationSec}초</Text>
          </View>
        </View>
      )}

      {/* Recommended auto-fixes */}
      {stats && stats.recommendedFixes.length > 0 && (
        <View style={styles.sectionGap}>
          <View style={styles.subHeader}>
            <Zap size={14} color={theme.colors.warning[400]} strokeWidth={2} />
            <Text style={styles.subHeaderText}>자가수정 이력 (상위 {stats.recommendedFixes.length})</Text>
          </View>
          {stats.recommendedFixes.map((fix: AutoFixRecommendation, idx: number) => (
            <View key={idx} style={styles.fixRow}>
              <View style={styles.fixInfo}>
                <Text style={styles.fixCategory}>{translateCategory(fix.category)}</Text>
                <Text style={styles.fixDescription} numberOfLines={2}>{fix.fix}</Text>
              </View>
              <View style={styles.fixStats}>
                <Text style={styles.fixRate}>{Math.round(fix.confidence * 100)}%</Text>
                <Text style={styles.fixCount}>{fix.successCount}/{fix.applyCount}회</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Server pattern analysis toggle */}
      <TouchableOpacity
        style={styles.patternToggle}
        onPress={() => setShowPatterns((prev) => !prev)}
        activeOpacity={0.7}
      >
        <View style={styles.subHeader}>
          <TrendingUp size={14} color={theme.colors.accent[400]} strokeWidth={2} />
          <Text style={styles.subHeaderText}>서버 패턴 분석 (24시간)</Text>
        </View>
        <ChevronRight
          size={16}
          color={theme.colors.dark.textDim}
          strokeWidth={2}
          style={[styles.chevron, showPatterns && styles.chevronOpen]}
        />
      </TouchableOpacity>

      {showPatterns && patterns && (
        <View style={styles.patternsContainer}>
          {patterns.totalEvents === 0 ? (
            <Text style={styles.emptyText}>최근 24시간 내 진단 데이터가 없습니다.</Text>
          ) : (
            <>
              <View style={styles.patternRow}>
                <Text style={styles.patternLabel}>분석된 이벤트</Text>
                <Text style={styles.patternValue}>{patterns.totalEvents}건</Text>
              </View>
              <View style={styles.patternRow}>
                <Text style={styles.patternLabel}>서버 성공률</Text>
                <Text style={styles.patternValue}>{Math.round(patterns.successRate * 100)}%</Text>
              </View>
              <View style={styles.patternRow}>
                <Text style={styles.patternLabel}>서버 평균 렌더</Text>
                <Text style={styles.patternValue}>{Math.round(patterns.avgRenderTimeMs / 1000)}초</Text>
              </View>
              {patterns.topIssues.length > 0 && (
                <View style={styles.sectionGap}>
                  <Text style={styles.subHeaderText}>주요 실패 원인</Text>
                  {patterns.topIssues.map((issue, idx) => (
                    <View key={idx} style={styles.issueRow}>
                      <Text style={styles.issueCategory}>{translateCategory(issue.category)}</Text>
                      <Text style={styles.issueCount}>{issue.count}회</Text>
                      <Text style={styles.issueFixRate}>수정 성공률 {Math.round(issue.fixSuccessRate * 100)}%</Text>
                    </View>
                  ))}
                </View>
              )}
              {patterns.recommendations.length > 0 && (
                <View style={styles.sectionGap}>
                  <Text style={styles.subHeaderText}>AI 권장사항</Text>
                  {patterns.recommendations.map((rec, idx) => (
                    <View key={idx} style={[styles.recRow, rec.priority === 'high' && styles.recHigh]}>
                      <Text style={styles.recMessage}>{rec.message}</Text>
                      <View style={[styles.recBadge, rec.priority === 'high' ? styles.recBadgeHigh : styles.recBadgeMed]}>
                        <Text style={styles.recBadgeText}>{rec.priority === 'high' ? '높음' : '보통'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleRefresh}
          disabled={refreshing}
          activeOpacity={0.7}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <RefreshCw size={14} color="#fff" strokeWidth={2} />
              <Text style={styles.actionButtonText}>새로고침</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}
          onPress={handleReset}
          disabled={resetting}
          activeOpacity={0.7}
        >
          {resetting ? (
            <ActivityIndicator size="small" color={theme.colors.error[400]} />
          ) : (
            <>
              <RotateCcw size={14} color={theme.colors.error[400]} strokeWidth={2} />
              <Text style={[styles.actionButtonText, { color: theme.colors.error[400] }]}>학습 초기화</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SectionCard>
  );
}

function translateCategory(category: string): string {
  const map: Record<string, string> = {
    payload_too_large: '용량 초과',
    memory_pressure: '메모리 부족',
    network_timeout: '네트워크 시간초과',
    network_unstable: '네트워크 불안정',
    rate_limited: '요청 한도 초과',
    server_error: '서버 오류',
    auth_error: '인증 오류',
    unknown: '알 수 없음',
  };
  return map[category] ?? category;
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(76, 125, 255, 0.08)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  alertText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    flex: 1,
  },
  alertHighlight: {
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
  },
  sectionGap: {
    gap: 6,
    marginBottom: 12,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  subHeaderText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  adjustmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  adjustmentLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  adjustmentValue: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
  },
  fixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 125, 255, 0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  fixInfo: {
    flex: 1,
  },
  fixCategory: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
  },
  fixDescription: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  fixStats: {
    alignItems: 'flex-end',
  },
  fixRate: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#FFFFFF',
  },
  fixCount: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  patternToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  chevron: {
    transform: [{ rotate: '0deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  patternsContainer: {
    gap: 4,
    marginBottom: 12,
  },
  patternRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  patternLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  patternValue: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#FFFFFF',
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  issueCategory: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    flex: 1,
  },
  issueCount: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
  },
  issueFixRate: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(76, 125, 255, 0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  recHigh: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  recMessage: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 16,
  },
  recBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  recBadgeHigh: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  recBadgeMed: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  recBadgeText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#FFFFFF',
  },
  emptyText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    paddingVertical: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(76, 125, 255, 0.15)',
    borderRadius: 10,
    paddingVertical: 10,
  },
  actionButtonText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#FFFFFF',
  },
});
