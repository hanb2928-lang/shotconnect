import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Users, Zap, MessageCircle, ShoppingCart, TrendingUp, CircleAlert as AlertCircle, ChevronDown, ChevronUp, Sparkles, Lightbulb, Trophy } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { friendlyError } from '@/lib/errors';
import { PERSONA_SIMULATOR_URL, supabaseAnonKey } from '@/lib/supabase';

interface PersonaReaction {
  persona: string;
  avatar: string;
  ageGroup: string;
  interestScore: number;
  commentCount: number;
  cartAddRate: number;
  predictedComments: string[];
  reactionSummary: string;
  recommendedAngle: string;
}

interface SimulationResult {
  bestPersona: string;
  overallScore: number;
  personas: PersonaReaction[];
  strategy: string;
}

interface PersonaSimulatorProps {
  productName: string;
  productCategory: string;
  priceEstimate: string;
  oneLiner: string;
  productAdvantages: string[];
  hook: string;
}

export function PersonaSimulator({
  productName,
  productCategory,
  priceEstimate,
  oneLiner,
  productAdvantages,
  hook,
}: PersonaSimulatorProps) {
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPersona, setExpandedPersona] = useState<number | null>(null);

  const handleSimulate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSimulation(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(PERSONA_SIMULATOR_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          productName,
          productCategory,
          priceEstimate,
          oneLiner,
          productAdvantages,
          hook,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error('시뮬레이션 실패');
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (!data.personas || !Array.isArray(data.personas)) throw new Error('시뮬레이션 응답 형식이 올바르지 않습니다');
      setSimulation(data as SimulationResult);
    } catch (err) {
      setError(friendlyError(err, '시뮬레이션을 실행하지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [productName, productCategory, priceEstimate, oneLiner, productAdvantages, hook]);

  const scoreColor = (score: number) => {
    if (score >= 80) return theme.colors.success[400];
    if (score >= 60) return theme.colors.primary[400];
    if (score >= 40) return theme.colors.warning[400];
    return theme.colors.error[400];
  };

  const bestPersonaIndex = simulation
    ? simulation.personas.findIndex((p) => p.persona === simulation.bestPersona)
    : -1;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <Users size={18} color={theme.colors.accent[400]} strokeWidth={2} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI 역추적 고객 반응 시뮬레이터</Text>
            <Text style={styles.headerSubtitle}>트렌드 예지몽 — 페르소나별 반응 예측</Text>
          </View>
        </View>
      </View>

      <Text style={styles.description}>
        AI가 가상의 틱톡/릴스 알고리즘과 소비자 집단을 시뮬레이션하여, 이 제품을 어떤 페르소나에게 노출했을 때 댓글창이 폭발하고 장바구니에 가장 많이 담길지 미리 예측합니다.
      </Text>

      {!simulation && !loading && !error && (
        <TouchableOpacity style={styles.simulateButton} onPress={handleSimulate} activeOpacity={0.8}>
          <Zap size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.simulateButtonText}>고객 반응 시뮬레이션 시작</Text>
        </TouchableOpacity>
      )}

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={theme.colors.accent[400]} />
          <Text style={styles.loadingText}>AI가 가상 소비자 집단을 시뮬레이션하는 중...</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorBox}>
          <AlertCircle size={14} color={theme.colors.error[400]} strokeWidth={2} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleSimulate} activeOpacity={0.7}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {simulation && !loading && (
        <View style={styles.resultBox}>
          <View style={styles.overallRow}>
            <View style={styles.overallScoreWrap}>
              <Text style={styles.overallLabel}>종합 반응 점수</Text>
              <View style={styles.overallScoreRow}>
                <Text style={[styles.overallScoreNum, { color: scoreColor(simulation.overallScore) }]}>
                  {simulation.overallScore}
                </Text>
                <Text style={styles.overallScoreUnit}>/ 100</Text>
              </View>
              <View style={styles.scoreBarBg}>
                <View
                  style={[styles.scoreBarFill, {
                    width: `${simulation.overallScore}%`,
                    backgroundColor: scoreColor(simulation.overallScore),
                  }]}
                />
              </View>
            </View>
            <View style={styles.bestPersonaBadge}>
              <Trophy size={16} color={theme.colors.warning[400]} strokeWidth={2} />
              <Text style={styles.bestPersonaLabel}>최적 타겟</Text>
              <Text style={styles.bestPersonaName}>{simulation.bestPersona}</Text>
            </View>
          </View>

          <View style={styles.strategyBox}>
            <Lightbulb size={14} color={theme.colors.warning[400]} strokeWidth={2} />
            <Text style={styles.strategyText}>{simulation.strategy}</Text>
          </View>

          <Text style={styles.sectionLabel}>페르소나별 반응 분석</Text>

          {simulation.personas.map((persona, i) => {
            const isExpanded = expandedPersona === i;
            const isBest = i === bestPersonaIndex;

            return (
              <View
                key={i}
                style={[styles.personaCard, isBest && styles.personaCardBest]}
              >
                <TouchableOpacity
                  style={styles.personaHeader}
                  onPress={() => setExpandedPersona(isExpanded ? null : i)}
                  activeOpacity={0.7}
                >
                  <View style={styles.personaLeft}>
                    <Text style={styles.personaAvatar}>{persona.avatar}</Text>
                    <View>
                      <View style={styles.personaNameRow}>
                        <Text style={styles.personaName}>{persona.persona}</Text>
                        {isBest && (
                          <View style={styles.bestTag}>
                            <Text style={styles.bestTagText}>BEST</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.personaAge}>{persona.ageGroup}세</Text>
                    </View>
                  </View>
                  <View style={styles.personaRight}>
                    <View style={styles.miniScoreWrap}>
                      <Text style={[styles.miniScoreNum, { color: scoreColor(persona.interestScore) }]}>
                        {persona.interestScore}
                      </Text>
                      <Text style={styles.miniScoreUnit}>점</Text>
                    </View>
                    {isExpanded
                      ? <ChevronUp size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
                      : <ChevronDown size={16} color={theme.colors.dark.textDim} strokeWidth={2} />}
                  </View>
                </TouchableOpacity>

                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <MessageCircle size={12} color={theme.colors.primary[300]} strokeWidth={2} />
                    <Text style={styles.metricValue}>{persona.commentCount}</Text>
                    <Text style={styles.metricLabel}>예상 댓글</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <ShoppingCart size={12} color={theme.colors.success[400]} strokeWidth={2} />
                    <Text style={styles.metricValue}>{persona.cartAddRate}%</Text>
                    <Text style={styles.metricLabel}>장바구니</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <TrendingUp size={12} color={theme.colors.accent[400]} strokeWidth={2} />
                    <Text style={styles.metricValue}>{persona.interestScore}점</Text>
                    <Text style={styles.metricLabel}>관심도</Text>
                  </View>
                </View>

                {isExpanded && (
                  <View style={styles.personaDetail}>
                    <Text style={styles.detailLabel}>반응 요약</Text>
                    <Text style={styles.detailText}>{persona.reactionSummary}</Text>

                    <Text style={styles.detailLabel}>예상 댓글</Text>
                    {persona.predictedComments.map((comment, ci) => (
                      <View key={ci} style={styles.commentBubble}>
                        <Text style={styles.commentText}>{comment}</Text>
                      </View>
                    ))}

                    <View style={styles.angleBox}>
                      <Sparkles size={12} color={theme.colors.accent[400]} strokeWidth={2} />
                      <View style={styles.angleTextWrap}>
                        <Text style={styles.angleLabel}>공략 각도</Text>
                        <Text style={styles.angleText}>{persona.recommendedAngle}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          <TouchableOpacity style={styles.resimulateButton} onPress={handleSimulate} activeOpacity={0.7}>
            <Text style={styles.resimulateIcon}>↻</Text>
            <Text style={styles.resimulateText}>다시 시뮬레이션</Text>
          </TouchableOpacity>
        </View>
      )}
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
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  description: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
  simulateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500],
  },
  simulateButtonText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  errorBox: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  errorText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  retryText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
  },
  resultBox: {
    marginTop: 4,
  },
  overallRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  overallScoreWrap: {
    flex: 1,
  },
  overallLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 4,
  },
  overallScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginBottom: 6,
  },
  overallScoreNum: {
    fontSize: 28,
    fontFamily: theme.typography.fontFamily.bold,
  },
  overallScoreUnit: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  scoreBarBg: {
    height: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surfaceLight,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: theme.radius.full,
  },
  bestPersonaBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.warning[500] + '15',
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.warning[400] + '40',
    minWidth: 80,
  },
  bestPersonaLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
    marginTop: 4,
  },
  bestPersonaName: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginTop: 2,
    textAlign: 'center',
  },
  strategyBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: theme.colors.warning[500] + '12',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  strategyText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.textDim,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  personaCard: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  personaCardBest: {
    borderColor: theme.colors.warning[400] + '50',
    backgroundColor: theme.colors.warning[500] + '08',
  },
  personaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  personaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  personaAvatar: {
    fontSize: 24,
  },
  personaNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  personaName: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  bestTag: {
    backgroundColor: theme.colors.warning[400],
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  bestTagText: {
    fontSize: 8,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#1a1a2e',
  },
  personaAge: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 1,
  },
  personaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniScoreWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 1,
  },
  miniScoreNum: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
  },
  miniScoreUnit: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.dark.border,
  },
  metricValue: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  metricLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  personaDetail: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
  },
  detailLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 4,
    marginTop: 6,
  },
  detailText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 18,
  },
  commentBubble: {
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  commentText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
    lineHeight: 16,
  },
  angleBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: theme.colors.accent[500] + '12',
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
  },
  angleTextWrap: {
    flex: 1,
  },
  angleLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
    marginBottom: 2,
  },
  angleText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
    lineHeight: 16,
  },
  resimulateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginTop: theme.spacing.sm,
  },
  resimulateIcon: {
    fontSize: 14,
    color: theme.colors.dark.textDim,
  },
  resimulateText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
});
