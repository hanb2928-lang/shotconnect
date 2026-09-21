import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Sparkles, TrendingUp, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Zap } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  calculateOriginalityScore,
  type OriginalityFactors,
  type OriginalityResult,
} from '@/lib/originalityScore';

interface OriginalityScoreCardProps {
  factors: OriginalityFactors;
  onApplySuggestion?: (suggestion: string) => void;
}

export function OriginalityScoreCard({ factors, onApplySuggestion }: OriginalityScoreCardProps) {
  const [result, setResult] = useState<OriginalityResult | null>(null);

  useEffect(() => {
    setResult(calculateOriginalityScore(factors));
  }, [factors]);

  const levelConfig = useCallback((level: OriginalityResult['level']) => {
    switch (level) {
      case 'unique':
        return { icon: Sparkles, color: theme.colors.accent[400], bg: theme.colors.accent[500] + '15' };
      case 'good':
        return { icon: CheckCircle, color: theme.colors.success[400], bg: theme.colors.success[500] + '15' };
      case 'caution':
        return { icon: TrendingUp, color: theme.colors.warning[400], bg: theme.colors.warning[500] + '15' };
      case 'danger':
        return { icon: AlertTriangle, color: theme.colors.error[400], bg: theme.colors.error[500] + '15' };
    }
  }, []);

  if (!result) return null;

  const cfg = levelConfig(result.level);
  const Icon = cfg.icon;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Icon size={18} color={cfg.color} strokeWidth={2} />
        <Text style={styles.headerTitle}>크리에이터 독창성 스코어</Text>
      </View>

      {/* Score display */}
      <View style={styles.scoreRow}>
        <View style={styles.scoreWrap}>
          <Text style={[styles.scoreNum, { color: cfg.color }]}>{result.score}</Text>
          <Text style={styles.scoreUnit}>/ 100</Text>
        </View>
        <View style={styles.scoreBarBg}>
          <View
            style={[styles.scoreBarFill, { width: `${result.score}%`, backgroundColor: cfg.color }]}
          />
        </View>
      </View>

      {/* Message */}
      <View style={[styles.messageBox, { backgroundColor: cfg.bg }]}>
        <Text style={[styles.messageText, { color: cfg.color }]}>{result.message}</Text>
      </View>

      {/* Suggestions */}
      {result.suggestions.length > 0 && (
        <View style={styles.suggestionsBox}>
          <Text style={styles.suggestionsLabel}>독창성 높이기</Text>
          {result.suggestions.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={styles.suggestionItem}
              onPress={() => onApplySuggestion?.(s)}
              activeOpacity={0.7}
            >
              <Zap size={11} color={theme.colors.warning[400]} strokeWidth={2} />
              <Text style={styles.suggestionText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Factor breakdown */}
      <View style={styles.factorsRow}>
        <FactorBadge active={factors.hasPersonaSignature} label="페르소나" />
        <FactorBadge active={factors.hasCustomTone} label="톤 설정" />
        <FactorBadge active={factors.hasVoiceClone} label="보이스" />
        <FactorBadge active={factors.hasMicroEdit} label="수동 편집" />
        <FactorBadge active={factors.hasUniqueAngle} label="고유 시각" />
      </View>
    </View>
  );
}

function FactorBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={[styles.factorBadge, active && styles.factorBadgeActive]}>
      <View style={[styles.factorDot, active && { backgroundColor: theme.colors.success[400] }]} />
      <Text style={[styles.factorLabel, active && styles.factorLabelActive]}>{label}</Text>
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
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: theme.spacing.md,
  },
  scoreWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreNum: {
    fontSize: 32,
    fontFamily: theme.typography.fontFamily.bold,
  },
  scoreUnit: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  scoreBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  messageBox: {
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: theme.spacing.md,
  },
  messageText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    lineHeight: 18,
  },
  suggestionsBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: theme.spacing.md,
  },
  suggestionsLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 6,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  suggestionText: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
  },
  factorsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  factorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  factorBadgeActive: {
    backgroundColor: theme.colors.success[500] + '15',
  },
  factorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.dark.textFaint,
  },
  factorLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  factorLabelActive: {
    color: theme.colors.success[400],
  },
});
