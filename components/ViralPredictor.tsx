import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { TrendingUp, Zap, Sparkles, CircleAlert as AlertCircle, ChevronDown, ChevronUp, Lightbulb, Info } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { VIRAL_PREDICT_FUNCTION_URL, supabaseAnonKey } from '@/lib/supabase';

interface ViralFactor {
  label: string;
  positive: boolean;
  detail: string;
}

interface ViralSuggestion {
  type: string;
  label: string;
  detail: string;
}

interface ViralPrediction {
  score: number;
  grade: string;
  factors: ViralFactor[];
  suggestions: ViralSuggestion[];
  predictedViews: string;
}

interface ViralPredictorProps {
  hook: string;
  title: string;
  productName: string;
  productCategory: string;
  hashtags: string[];
  comicStyle?: string;
  panelCount?: number;
  hasTTS?: boolean;
  episodeMode?: boolean;
  trendingKeywords?: string[];
  onSuggestionApply?: (suggestion: ViralSuggestion) => void;
}

export function ViralPredictor({
  hook,
  title,
  productName,
  productCategory,
  hashtags,
  comicStyle,
  panelCount,
  hasTTS,
  episodeMode,
  trendingKeywords,
  onSuggestionApply,
}: ViralPredictorProps) {
  const [prediction, setPrediction] = useState<ViralPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [guideExpanded, setGuideExpanded] = useState(false);

  const handlePredict = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPrediction(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(VIRAL_PREDICT_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          hook,
          title,
          productName,
          productCategory,
          hashtags,
          comicStyle,
          panelCount,
          hasTTS,
          episodeMode,
          trendingKeywords,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.error) { setError(data.error); setLoading(false); return; }
        if (typeof data.score !== 'number' || !data.factors || !Array.isArray(data.factors)) { setError('예측 응답 형식이 올바르지 않습니다'); setLoading(false); return; }
        setPrediction(data);
      } else {
        setError('예측에 실패했어요. 다시 시도해주세요');
      }
    } catch {
      setError('네트워크 오류로 예측에 실패했어요');
    }
    setLoading(false);
  }, [hook, title, productName, productCategory, hashtags, comicStyle, panelCount, hasTTS, episodeMode, trendingKeywords]);

  const gradeColor = (grade: string) => {
    if (grade === 'S') return theme.colors.accent[400];
    if (grade === 'A') return theme.colors.success[400];
    if (grade === 'B') return theme.colors.primary[400];
    if (grade === 'C') return theme.colors.warning[400];
    return theme.colors.error[400];
  };

  const scoreColor = (score: number) => {
    if (score >= 85) return theme.colors.accent[400];
    if (score >= 70) return theme.colors.success[400];
    if (score >= 55) return theme.colors.primary[400];
    if (score >= 40) return theme.colors.warning[400];
    return theme.colors.error[400];
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TrendingUp size={18} color={theme.colors.accent[400]} strokeWidth={2} />
          <Text style={styles.headerTitle}>바이럴 예측 AI</Text>
        </View>
      </View>

      <Text style={styles.description}>
        AI가 틱톡·릴스·쇼츠 알고리즘 트렌드를 실시간 분석하여 콘텐츠의 바이럴 확률을 0~100점 점수로 예측합니다. 후킹 문구, 해시태그, 트렌드 키워드, 내레이션 등 6가지 요소를 평가하고 점수를 올릴 수 있는 최적화 제안을 제공합니다.
      </Text>

      <TouchableOpacity
        style={styles.guideToggle}
        onPress={() => setGuideExpanded(!guideExpanded)}
        activeOpacity={0.7}
      >
        <Info size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
        <Text style={styles.guideToggleText}>사용법 {guideExpanded ? '접기' : '펼치기'}</Text>
        {guideExpanded ? <ChevronUp size={12} color={theme.colors.dark.textDim} strokeWidth={2} /> : <ChevronDown size={12} color={theme.colors.dark.textDim} strokeWidth={2} />}
      </TouchableOpacity>

      {guideExpanded && (
        <View style={styles.guideBox}>
          <View style={styles.guideStep}>
            <Text style={styles.guideStepNum}>1</Text>
            <Text style={styles.guideStepText}>현재 후킹 문구, 해시태그, 제품 정보를 자동으로 수집합니다</Text>
          </View>
          <View style={styles.guideStep}>
            <Text style={styles.guideStepNum}>2</Text>
            <Text style={styles.guideStepText}>"바이럴 점수 예측하기" 버튼을 누르면 AI가 트렌드를 분석합니다</Text>
          </View>
          <View style={styles.guideStep}>
            <Text style={styles.guideStepNum}>3</Text>
            <Text style={styles.guideStepText}>S~D 등급과 예상 조회수를 확인하고 분석 요소를 펼쳐보세요</Text>
          </View>
          <View style={styles.guideStep}>
            <Text style={styles.guideStepNum}>4</Text>
            <Text style={styles.guideStepText}>AI 최적화 제안의 "적용" 버튼으로 카피를 개선하고 다시 예측하세요</Text>
          </View>
          <View style={styles.guideTipRow}>
            <Lightbulb size={10} color={theme.colors.warning[400]} strokeWidth={2} />
            <Text style={styles.guideTipText}>점수가 70점 이상이면 알고리즘 선택 확률이 높습니다</Text>
          </View>
        </View>
      )}

      {!prediction && !loading && !error && (
        <TouchableOpacity style={styles.predictButton} onPress={handlePredict} activeOpacity={0.8}>
          <Zap size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.predictButtonText}>바이럴 점수 예측하기</Text>
        </TouchableOpacity>
      )}

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={theme.colors.accent[400]} />
          <Text style={styles.loadingText}>AI가 트렌드를 분석하고 있어요...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <AlertCircle size={14} color={theme.colors.error[400]} strokeWidth={2} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handlePredict} activeOpacity={0.7}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {prediction && !loading && (
        <View style={styles.resultBox}>
          <View style={styles.scoreRow}>
            <View style={[styles.gradeBadge, { backgroundColor: gradeColor(prediction.grade) + '20', borderColor: gradeColor(prediction.grade) }]}>
              <Text style={[styles.gradeText, { color: gradeColor(prediction.grade) }]}>{prediction.grade}</Text>
            </View>
            <View style={styles.scoreWrap}>
              <Text style={[styles.scoreNumber, { color: scoreColor(prediction.score) }]}>{prediction.score}</Text>
              <Text style={styles.scoreUnit}>점</Text>
            </View>
            <View style={styles.viewsWrap}>
              <Text style={styles.viewsLabel}>예상 조회수</Text>
              <Text style={styles.viewsValue}>{prediction.predictedViews}</Text>
            </View>
          </View>

          <View style={styles.scoreBarBg}>
            <View style={[styles.scoreBarFill, { width: `${prediction.score}%`, backgroundColor: scoreColor(prediction.score) }]} />
          </View>

          <TouchableOpacity
            style={styles.expandButton}
            onPress={() => setExpanded(!expanded)}
            activeOpacity={0.7}
          >
            <Text style={styles.expandButtonText}>분석 요인 {expanded ? '접기' : '펼치기'}</Text>
            {expanded ? <ChevronUp size={14} color={theme.colors.dark.textDim} strokeWidth={2} /> : <ChevronDown size={14} color={theme.colors.dark.textDim} strokeWidth={2} />}
          </TouchableOpacity>

          {expanded && (
            <View style={styles.factorsBox}>
              {prediction.factors.map((factor, i) => (
                <View key={i} style={styles.factorRow}>
                  <View style={[styles.factorDot, { backgroundColor: factor.positive ? theme.colors.success[400] : theme.colors.error[400] }]} />
                  <View style={styles.factorTextWrap}>
                    <Text style={styles.factorLabel}>{factor.label}</Text>
                    <Text style={styles.factorDetail}>{factor.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {prediction.suggestions.length > 0 && (
            <View style={styles.suggestionsBox}>
              <View style={styles.suggestionsHeader}>
                <Lightbulb size={12} color={theme.colors.warning[400]} strokeWidth={2} />
                <Text style={styles.suggestionsTitle}>AI 최적화 제안</Text>
              </View>
              {prediction.suggestions.map((sug, i) => (
                <View key={i} style={styles.suggestionRow}>
                  <View style={styles.suggestionIconWrap}>
                    <Sparkles size={10} color={theme.colors.warning[400]} strokeWidth={2} />
                  </View>
                  <View style={styles.suggestionTextWrap}>
                    <Text style={styles.suggestionLabel}>{sug.label}</Text>
                    <Text style={styles.suggestionDetail}>{sug.detail}</Text>
                  </View>
                  {onSuggestionApply && (
                    <TouchableOpacity
                      style={styles.applyButton}
                      onPress={() => onSuggestionApply(sug)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.applyButtonText}>적용</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.repredictButton} onPress={handlePredict} activeOpacity={0.7}>
            <RefreshIcon />
            <Text style={styles.repredictText}>다시 예측</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function RefreshIcon() {
  return <Text style={styles.refreshIcon}>↻</Text>;
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
    gap: 8,
  },
  headerTitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  description: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  predictButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500],
    ...theme.shadows.card,
  },
  predictButtonText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: theme.spacing.md,
  },
  loadingText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.error[500] + '15',
  },
  errorText: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.error[400],
  },
  retryButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.error[500] + '20',
  },
  retryText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.error[400],
  },
  resultBox: {
    gap: theme.spacing.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  gradeBadge: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  gradeText: {
    fontSize: 22,
    fontFamily: theme.typography.fontFamily.bold,
  },
  scoreWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreNumber: {
    fontSize: 36,
    fontFamily: theme.typography.fontFamily.bold,
  },
  scoreUnit: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    marginLeft: 2,
  },
  viewsWrap: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
  },
  viewsLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  viewsValue: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginTop: 2,
  },
  scoreBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  expandButtonText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  factorsBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: 8,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  factorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  factorTextWrap: {
    flex: 1,
  },
  factorLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  factorDetail: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 15,
    marginTop: 2,
  },
  suggestionsBox: {
    backgroundColor: theme.colors.warning[500] + '0D',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.warning[400] + '20',
  },
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  suggestionsTitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.warning[400],
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  suggestionIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.warning[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  suggestionTextWrap: {
    flex: 1,
  },
  suggestionLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  suggestionDetail: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 15,
    marginTop: 2,
  },
  applyButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.warning[500] + '30',
    marginTop: 1,
  },
  applyButtonText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.warning[400],
  },
  repredictButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  refreshIcon: {
    fontSize: 14,
    color: theme.colors.dark.textDim,
  },
  repredictText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  guideToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    marginBottom: theme.spacing.sm,
  },
  guideToggleText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    flex: 1,
  },
  guideBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: 8,
  },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  guideStepNum: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.accent[500] + '30',
    color: theme.colors.accent[400],
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    textAlign: 'center',
    lineHeight: 18,
    overflow: 'hidden',
  },
  guideStepText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 15,
  },
  guideTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
  },
  guideTipText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.warning[400],
  },
});
