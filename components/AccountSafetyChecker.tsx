import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Shield, ShieldCheck, ShieldAlert, Clock, X, Info, RefreshCw } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { getItem, setItem } from '@/lib/storage';
import {
  assessUploadSafety,
  recordUpload,
  calculateOverallSafety,
  type UploadRecord,
  type SafetyAssessment,
  type OverallSafetyScore,
} from '@/lib/humanLikeEngine';

const STORAGE_KEY = 'upload_records';

const PLATFORM_LABELS: Record<string, string> = {
  shortform: '쇼츠·릴스·틱톡',
  instagram: '인스타그램',
  naverBlog: '네이버 블로그',
  twitter: 'X(트위터)',
  threads: '스레드',
  pinterest: '핀터레스트',
  smartstore: '스마트스토어',
};

interface AccountSafetyCheckerProps {
  platform: string;
  visible: boolean;
  onClose: () => void;
  onProceed?: () => void;
}

export function AccountSafetyChecker({
  platform,
  visible,
  onClose,
  onProceed,
}: AccountSafetyCheckerProps) {
  const [records, setRecords] = useState<UploadRecord[]>([]);
  const [visualRandomized, setVisualRandomized] = useState(true);
  const [captionSpun, setCaptionSpun] = useState(true);
  const [voiceVaried, setVoiceVaried] = useState(true);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const stored = await getItem(STORAGE_KEY);
      if (stored) {
        try {
          setRecords(JSON.parse(stored));
        } catch {
          setRecords([]);
        }
      }
    })();
  }, [visible]);

  const assessment: SafetyAssessment = useMemo(
    () => assessUploadSafety(platform, records),
    [platform, records],
  );

  const overallScore: OverallSafetyScore = useMemo(
    () => calculateOverallSafety(visualRandomized, captionSpun, voiceVaried, assessment),
    [visualRandomized, captionSpun, voiceVaried, assessment],
  );

  const handleProceed = useCallback(async () => {
    const updated = recordUpload(platform, records);
    setRecords(updated);
    await setItem(STORAGE_KEY, JSON.stringify(updated));
    onClose();
    onProceed?.();
  }, [platform, records, onClose, onProceed]);

  const levelConfig = {
    safe: { icon: ShieldCheck, color: theme.colors.success[400], bg: theme.colors.success[500] + '15', label: '안전' },
    caution: { icon: Shield, color: theme.colors.warning[400], bg: theme.colors.warning[500] + '15', label: '주의' },
    danger: { icon: ShieldAlert, color: theme.colors.error[400], bg: theme.colors.error[500] + '15', label: '위험' },
  };

  const config = levelConfig[assessment.level];
  const LevelIcon = config.icon;
  const platformLabel = PLATFORM_LABELS[platform] ?? platform;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerIcon, { backgroundColor: config.bg }]}>
                <LevelIcon size={18} color={config.color} strokeWidth={2} />
              </View>
              <Text style={styles.headerTitle}>계정 안전 헬스체커</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Overall score */}
            <View style={[styles.scoreBox, { backgroundColor: config.bg }]}>
              <Text style={styles.scoreLabel}>종합 안전 점수</Text>
              <Text style={[styles.scoreValue, { color: config.color }]}>{overallScore.overall}</Text>
              <Text style={styles.scoreUnit}>/ 100</Text>
            </View>

            {/* Platform cooldown */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{platformLabel} 발행 간격</Text>
              <View style={styles.cooldownRow}>
                <Clock size={16} color={config.color} strokeWidth={2} />
                <Text style={styles.cooldownText}>{assessment.message}</Text>
              </View>
              {assessment.recommendedWaitMinutes > 0 && (
                <View style={styles.waitBox}>
                  <Text style={styles.waitText}>
                    추천 대기 시간: 약 {assessment.recommendedWaitMinutes}분
                  </Text>
                </View>
              )}
            </View>

            {/* Factor breakdown */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>안전 요소 분석</Text>
              {[
                { label: '시각적 무작위화', score: overallScore.visualRandomization, on: visualRandomized, setOn: setVisualRandomized },
                { label: '캡션 다변화', score: overallScore.captionVariation, on: captionSpun, setOn: setCaptionSpun },
                { label: '음성 가변화', score: overallScore.voiceVariation, on: voiceVaried, setOn: setVoiceVaried },
                { label: '발행 간격', score: overallScore.uploadPacing, on: assessment.level === 'safe', setOn: null },
              ].map((factor, i) => (
                <View key={i} style={styles.factorRow}>
                  <View style={styles.factorLabelWrap}>
                    {factor.setOn ? (
                      <TouchableOpacity
                        style={[styles.toggle, factor.on && styles.toggleOn]}
                        onPress={() => factor.setOn!(!factor.on)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.toggleKnob, factor.on && styles.toggleKnobOn]} />
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.statusDot, factor.on ? styles.statusDotOn : styles.statusDotOff]} />
                    )}
                    <Text style={styles.factorLabel}>{factor.label}</Text>
                  </View>
                  <Text style={[styles.factorScore, { color: factor.score >= 80 ? theme.colors.success[400] : factor.score >= 50 ? theme.colors.warning[400] : theme.colors.error[400] }]}>
                    {factor.score}
                  </Text>
                </View>
              ))}
            </View>

            {/* Recommendations */}
            {overallScore.recommendations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>추천 행동</Text>
                {overallScore.recommendations.map((rec, i) => (
                  <View key={i} style={styles.recRow}>
                    <Info size={12} color={theme.colors.warning[400]} strokeWidth={2} />
                    <Text style={styles.recText}>{rec}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Info banner */}
            <View style={styles.infoBox}>
              <Info size={12} color={theme.colors.dark.textFaint} strokeWidth={2} />
              <Text style={styles.infoText}>
                유튜브, 인스타그램, 틱톡 알고리즘은 기계적 반복 패턴을 감지하여 계정을 제한합니다.
                충분한 발행 간격과 창의적 변형이 계정 안전성을 지켜줍니다.
              </Text>
            </View>
          </ScrollView>

          {/* Bottom actions */}
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.proceedBtn, assessment.level === 'danger' && styles.proceedBtnDanger]}
              onPress={handleProceed}
              activeOpacity={0.7}
            >
              <RefreshCw size={15} color="#fff" strokeWidth={2} />
              <Text style={styles.proceedBtnText}>
                {assessment.level === 'danger' ? '그래도 발행하기' : '발행하기'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.dark.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  scoreBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  scoreLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  scoreValue: {
    fontSize: 32,
    fontFamily: theme.typography.fontFamily.bold,
  },
  scoreUnit: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  section: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cooldownRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cooldownText: {
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 19,
  },
  waitBox: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warning[500] + '12',
    borderWidth: 1,
    borderColor: theme.colors.warning[400] + '30',
  },
  waitText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.warning[400],
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  factorLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggle: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleOn: {
    backgroundColor: theme.colors.success[500],
  },
  toggleKnob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  toggleKnobOn: {
    transform: [{ translateX: 16 }],
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOn: {
    backgroundColor: theme.colors.success[400],
  },
  statusDotOff: {
    backgroundColor: theme.colors.error[400],
  },
  factorLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  factorScore: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  recText: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 17,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.bg,
    marginBottom: theme.spacing.md,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    lineHeight: 16,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  proceedBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.success[500],
  },
  proceedBtnDanger: {
    backgroundColor: theme.colors.error[500],
  },
  proceedBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
