import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ViewStyle,
} from 'react-native';
import {
  Zap,
  Eye,
  Shield,
  Target,
  Repeat,
  ChevronDown,
  ChevronUp,
  Check,
  Volume2,
  Scissors,
  Music,
  Captions,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  buildViralFormula,
  formatFormulaTimeline,
  type ViralFormula,
  type FormulaPhase,
  type FormulaPhaseId,
} from '@/lib/viralFormulaEngine';

interface ViralFormulaCardProps {
  totalDurationSec?: number;
}

const PHASE_ICONS: Record<FormulaPhaseId, typeof Zap> = {
  pattern_interrupt: Zap,
  problem_agitation: Eye,
  social_proof_benefit: Shield,
  cta_loop: Target,
};

const PHASE_COLORS: Record<FormulaPhaseId, string> = {
  pattern_interrupt: theme.colors.warning[400],
  problem_agitation: theme.colors.accent[400],
  social_proof_benefit: theme.colors.success[400],
  cta_loop: theme.colors.primary[400],
};

const CHECKLIST_ICONS: Record<string, typeof Captions> = {
  caption: Captions,
  beat_sync: Scissors,
  tts: Volume2,
  loop: Repeat,
  retention: Target,
};

export function ViralFormulaCard({ totalDurationSec = 15 }: ViralFormulaCardProps) {
  const [showDetail, setShowDetail] = useState(false);
  const formula: ViralFormula = React.useMemo(
    () => buildViralFormula(totalDurationSec),
    [totalDurationSec],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconWrap}>
          <Zap size={16} color={theme.colors.warning[400]} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>상위 1% 숏폼 필승 구성안</Text>
          <Text style={styles.subtitle}>
            알고리즘 공식 반영 — Retention + Looping 동시 달성
          </Text>
        </View>
      </View>

      {/* Timeline bar */}
      <View style={styles.timelineBar}>
        {formula.phases.map((phase) => {
          const Icon = PHASE_ICONS[phase.id];
          const color = PHASE_COLORS[phase.id];
          const widthPct = (phase.durationSec / formula.totalDurationSec) * 100;
          return (
            <View
              key={phase.id}
              style={[styles.timelineSegment, { width: `${widthPct}%`, backgroundColor: color + '30', borderLeftColor: color }]}
            >
              <Icon size={10} color={color} strokeWidth={2.5} />
              <Text style={[styles.timelineLabel, { color }]} numberOfLines={1}>
                {phase.startSec}~{phase.endSec}s
              </Text>
            </View>
          );
        })}
      </View>

      {/* Phase cards */}
      <View style={styles.phasesContainer}>
        {formula.phases.map((phase) => (
          <PhaseRow key={phase.id} phase={phase} />
        ))}
      </View>

      {/* Loop structure */}
      <View style={styles.loopBox}>
        <View style={styles.loopHeader}>
          <Repeat size={13} color={theme.colors.primary[400]} strokeWidth={2.5} />
          <Text style={styles.loopTitle}>무한 반복 (Loop) 구조</Text>
        </View>
        <Text style={styles.loopText}>{formula.loop.transitionDescription}</Text>
        <View style={styles.loopFrames}>
          <View style={styles.loopFrameBox}>
            <Text style={styles.loopFrameLabel}>첫 프레임</Text>
            <Text style={styles.loopFrameText} numberOfLines={2}>{formula.loop.firstFrameHint}</Text>
          </View>
          <View style={styles.loopArrowWrap}>
            <Repeat size={14} color={theme.colors.primary[300]} strokeWidth={2} />
          </View>
          <View style={styles.loopFrameBox}>
            <Text style={styles.loopFrameLabel}>마지막 프레임</Text>
            <Text style={styles.loopFrameText} numberOfLines={2}>{formula.loop.lastFrameHint}</Text>
          </View>
        </View>
      </View>

      {/* Checklist */}
      <View style={styles.checklistContainer}>
        <Text style={styles.checklistTitle}>최종 체크리스트</Text>
        {formula.checklist.map((item) => {
          const Icon = CHECKLIST_ICONS[item.category] ?? Check;
          return (
            <View key={item.id} style={styles.checklistItem}>
              <View style={styles.checklistIconWrap}>
                <Icon size={11} color={theme.colors.success[400]} strokeWidth={2.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.checklistLabel}>{item.label}</Text>
                <Text style={styles.checklistDesc} numberOfLines={2}>{item.description}</Text>
              </View>
              <Check size={14} color={theme.colors.success[400]} strokeWidth={2.5} />
            </View>
          );
        })}
      </View>

      {/* Algorithm targets */}
      <View style={styles.algoBox}>
        <Text style={styles.algoTitle}>알고리즘 타겟 지표</Text>
        {formula.algorithmTargets.map((target, i) => (
          <View key={i} style={styles.algoItem}>
            <View style={styles.algoDot} />
            <Text style={styles.algoText}>{target}</Text>
          </View>
        ))}
      </View>

      {/* Detail toggle */}
      <TouchableOpacity
        style={styles.detailToggle}
        onPress={() => setShowDetail(!showDetail)}
        activeOpacity={0.7}
      >
        {showDetail ? (
          <ChevronUp size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
        ) : (
          <ChevronDown size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
        )}
        <Text style={styles.detailToggleText}>
          {showDetail ? '타임라인 상세 접기' : '타임라인 상세 보기'}
        </Text>
      </TouchableOpacity>

      {showDetail && (
        <View style={styles.timelineDetailBox}>
          <Text style={styles.timelineDetailText}>{formatFormulaTimeline(formula)}</Text>
        </View>
      )}
    </View>
  );
}

function PhaseRow({ phase }: { phase: FormulaPhase }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = PHASE_ICONS[phase.id];
  const color = PHASE_COLORS[phase.id];

  return (
    <View style={[styles.phaseRow, { borderLeftColor: color }]}>
      <TouchableOpacity
        style={styles.phaseHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={[styles.phaseIconWrap, { backgroundColor: color + '20' }]}>
          <Icon size={12} color={color} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.phaseLabel}>{phase.label}</Text>
          <Text style={styles.phaseTime}>
            {phase.startSec}~{phase.endSec}s ({phase.durationSec}s)
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
        ) : (
          <ChevronDown size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.phaseDetail}>
          <DetailRow icon={Eye} label="시각" content={phase.visual} color={theme.colors.accent[300]} />
          <DetailRow icon={Volume2} label="청각/나레이션" content={`${phase.audio}\n나레이션 톤: ${phase.narrationTone}`} color={theme.colors.success[400]} />
          <DetailRow icon={Scissors} label="컷 전환" content={phase.cutStrategy} color={theme.colors.warning[400]} />
          <DetailRow icon={Music} label="BGM 강도" content={`${Math.round(phase.bgmIntensity * 100)}% — ${phase.audio.split('BGM')[1]?.trim() || phase.strategy}`} color={theme.colors.primary[300]} />
          <View style={styles.retentionRow}>
            <Target size={10} color={color} strokeWidth={2.5} />
            <Text style={styles.retentionText}>{phase.retentionGoal}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function DetailRow({
  icon: Icon,
  label,
  content,
  color,
}: {
  icon: typeof Eye;
  label: string;
  content: string;
  color: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIconWrap}>
        <Icon size={9} color={color} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailContent}>{content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.warning[400] + '20',
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.spacing.sm + 2,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.warning[400] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  timelineBar: {
    flexDirection: 'row',
    height: 24,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.dark.surface,
  },
  timelineSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderLeftWidth: 2,
  },
  timelineLabel: {
    fontSize: 8,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  phasesContainer: {
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  phaseRow: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: 8,
    borderLeftWidth: 3,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phaseIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phaseLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  phaseTime: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 1,
  },
  phaseDetail: {
    marginTop: 8,
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 6,
  },
  detailIconWrap: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  detailLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 1,
  },
  detailContent: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 13,
  },
  retentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  retentionText: {
    flex: 1,
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  loopBox: {
    backgroundColor: theme.colors.primary[400] + '12',
    borderRadius: theme.radius.md,
    padding: 10,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary[400] + '60',
  },
  loopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  loopTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
  },
  loopText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 14,
    marginBottom: 8,
  },
  loopFrames: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loopFrameBox: {
    flex: 1,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: 6,
    padding: 6,
  },
  loopFrameLabel: {
    fontSize: 8,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 2,
  },
  loopFrameText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  loopArrowWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  checklistContainer: {
    marginBottom: theme.spacing.sm,
  },
  checklistTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginBottom: 6,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  checklistIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.success[400] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checklistLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  checklistDesc: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 12,
    marginTop: 1,
  },
  algoBox: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: 10,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  algoTitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 6,
  },
  algoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingVertical: 2,
  },
  algoDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.warning[400],
    marginTop: 5,
  },
  algoText: {
    flex: 1,
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 14,
  },
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  detailToggleText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  timelineDetailBox: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.sm,
    padding: 8,
    marginTop: 4,
  },
  timelineDetailText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 14,
  },
});
