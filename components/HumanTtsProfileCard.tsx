import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  Mic,
  Wind,
  Gauge,
  Waves,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Volume2,
  Check,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  buildHumanTtsProfile,
  getHumanTtsSummary,
  getMoodLabel,
  getMoodDescription,
  type VisionMood,
  MOOD_STYLE_MAP,
  type HumanTtsProfile,
} from '@/lib/humanTtsEngine';
import type { EmotionPhase } from '@/lib/ttsEmotionCurve';
import { generateEmotionCurve } from '@/lib/ttsEmotionCurve';

interface HumanTtsProfileCardProps {
  narrationText: string;
  moodLabel?: string;
  totalDurationSec?: number;
  voiceKey?: string;
  onProfileBuilt?: (profile: HumanTtsProfile) => void;
}

const MOOD_OPTIONS: VisionMood[] = [
  'urgent', 'trendy', 'emotional', 'trustworthy', 'playful', 'luxurious', 'casual',
];

export function HumanTtsProfileCard({
  narrationText,
  moodLabel = '트렌디',
  totalDurationSec = 15,
  voiceKey = 'bright_female_1',
  onProfileBuilt,
}: HumanTtsProfileCardProps) {
  const [selectedMood, setSelectedMood] = useState<VisionMood>(
    MOOD_STYLE_MAP[moodLabelToVisionMoodLocal(moodLabel)] ? moodLabelToVisionMoodLocal(moodLabel) : 'trendy',
  );
  const [showDetail, setShowDetail] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);

  const profile = useMemo<HumanTtsProfile | null>(() => {
    if (!generated || !narrationText.trim()) return null;
    const emotionCurve = generateEmotionCurve(totalDurationSec);
    const phases = emotionCurve.segments.map((seg) => ({
      phase: seg.phase as EmotionPhase,
      startSec: seg.startSec,
      endSec: seg.endSec,
      speed: seg.speed,
    }));
    return buildHumanTtsProfile(
      narrationText,
      getMoodLabel(selectedMood),
      phases,
      totalDurationSec,
    );
  }, [generated, narrationText, selectedMood, totalDurationSec]);

  const handleGenerate = useCallback(() => {
    if (!narrationText.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setGenerated(true);
      if (profile) {
        onProfileBuilt?.(profile);
      }
    }, 100);
  }, [narrationText, profile, onProfileBuilt]);

  const summary = profile ? getHumanTtsSummary(profile) : '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconWrap}>
          <Mic size={16} color={theme.colors.primary[400]} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>휴먼 레벨 TTS 프로파일</Text>
          <Text style={styles.subtitle}>
            실제 성우 수준의 감정선, 호흡, 리듬감을 적용합니다
          </Text>
        </View>
      </View>

      {!generated ? (
        <>
          <Text style={styles.sectionLabel}>무드 선택 (Vision AI 연동)</Text>
          <View style={styles.moodGrid}>
            {MOOD_OPTIONS.map((mood) => {
              const isActive = selectedMood === mood;
              const params = MOOD_STYLE_MAP[mood];
              return (
                <TouchableOpacity
                  key={mood}
                  style={[styles.moodChip, isActive && styles.moodChipActive]}
                  onPress={() => setSelectedMood(mood)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.moodChipText, isActive && styles.moodChipTextActive]}>
                    {getMoodLabel(mood)}
                  </Text>
                  <Text style={[styles.moodChipEnergy, isActive && styles.moodChipEnergyActive]}>
                    에너지 {Math.round(params.energyLevel * 100)}%
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.moodDescription}>
            {getMoodDescription(selectedMood)}
          </Text>

          <TouchableOpacity
            style={[styles.generateBtn, loading && styles.generateBtnDisabled]}
            onPress={handleGenerate}
            disabled={loading || !narrationText.trim()}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Sparkles size={14} color="#fff" strokeWidth={2.5} />
                <Text style={styles.generateBtnText}>휴먼 TTS 프로파일 생성</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <ScrollView style={styles.profileScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {/* Summary */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryHeader}>
              <Check size={12} color={theme.colors.success[400]} strokeWidth={2.5} />
              <Text style={styles.summaryLabel}>생성 완료</Text>
              <View style={styles.fidelityBadge}>
                <Text style={styles.fidelityText}>{profile!.fidelityLabel}</Text>
              </View>
            </View>
            <Text style={styles.summaryText}>{summary}</Text>
          </View>

          {/* Emotion style params */}
          <View style={styles.paramCard}>
            <View style={styles.paramHeader}>
              <Volume2 size={13} color={theme.colors.accent[400]} strokeWidth={2} />
              <Text style={styles.paramTitle}>감정 스타일 파라미터</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>기본 피치</Text>
              <Text style={styles.paramValue}>{profile!.styleParams.basePitch.toFixed(2)}</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>피치 범위</Text>
              <Text style={styles.paramValue}>{profile!.styleParams.pitchRange.toFixed(2)}</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>따뜻함</Text>
              <Text style={styles.paramValue}>{Math.round(profile!.styleParams.warmth * 100)}%</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>호흡감</Text>
              <Text style={styles.paramValue}>{Math.round(profile!.styleParams.breathiness * 100)}%</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>에너지</Text>
              <Text style={styles.paramValue}>{Math.round(profile!.styleParams.energyLevel * 100)}%</Text>
            </View>
          </View>

          {/* Tempo curve */}
          <View style={styles.paramCard}>
            <View style={styles.paramHeader}>
              <Gauge size={13} color={theme.colors.warning[400]} strokeWidth={2} />
              <Text style={styles.paramTitle}>템포 커브 (가속/감속)</Text>
            </View>
            <View style={styles.tempoBar}>
              {profile!.tempoCurve.points.map((pt, i) => {
                const heightPct = ((pt.speedMultiplier - 0.8) / 0.5) * 100;
                return (
                  <View
                    key={i}
                    style={[styles.tempoDot, { height: `${Math.max(Math.min(heightPct, 100), 20)}%` }]}
                  />
                );
              })}
            </View>
            <Text style={styles.tempoDesc}>{profile!.tempoCurve.description}</Text>
          </View>

          {/* Silence intervals */}
          <View style={styles.paramCard}>
            <View style={styles.paramHeader}>
              <Wind size={13} color={theme.colors.success[400]} strokeWidth={2} />
              <Text style={styles.paramTitle}>호흡 및 휴지 구간</Text>
            </View>
            <View style={styles.silenceList}>
              {profile!.silenceIntervals.slice(0, 8).map((interval, i) => (
                <View key={i} style={styles.silenceRow}>
                  <View style={[styles.silenceTypeDot, getSilenceColor(interval.type)]} />
                  <Text style={styles.silenceType}>{getSilenceTypeLabel(interval.type)}</Text>
                  <Text style={styles.silenceDuration}>{interval.durationMs}ms</Text>
                </View>
              ))}
              {profile!.silenceIntervals.length > 8 && (
                <Text style={styles.silenceMore}>
                  외 {profile!.silenceIntervals.length - 8}개 구간
                </Text>
              )}
            </View>
            <Text style={styles.silenceTotal}>
              총 휴지: {profile!.totalSilenceMs}ms ({(profile!.totalSilenceMs / 1000).toFixed(1)}초)
            </Text>
          </View>

          {/* Audio post-processing */}
          <View style={styles.paramCard}>
            <View style={styles.paramHeader}>
              <Waves size={13} color={theme.colors.primary[400]} strokeWidth={2} />
              <Text style={styles.paramTitle}>오디오 정제 스펙</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>샘플링</Text>
              <Text style={styles.paramValue}>{profile!.audioSpec.sampleRateHz / 1000}kHz / {profile!.audioSpec.bitDepth}-bit</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>컴프레서</Text>
              <Text style={styles.paramValue}>
                {profile!.audioSpec.compressor.thresholdDb}dB / {profile!.audioSpec.compressor.ratio}:1
              </Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>이스너</Text>
              <Text style={styles.paramValue}>
                {profile!.audioSpec.exciter.frequencyHz}Hz / +{profile!.audioSpec.exciter.driveDb}dB
              </Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>디이서</Text>
              <Text style={styles.paramValue}>
                {profile!.audioSpec.deEsser.frequencyHz}Hz / -{profile!.audioSpec.deEsser.reductionDb}dB
              </Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramKey}>하이패스</Text>
              <Text style={styles.paramValue}>{profile!.audioSpec.highpassFilterHz}Hz</Text>
            </View>
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
              {showDetail ? '상세 지시문 접기' : '상세 지시문 보기'}
            </Text>
          </TouchableOpacity>

          {showDetail && (
            <View style={styles.instructionsBox}>
              <Text style={styles.instructionsText}>{profile!.instructions}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function moodLabelToVisionMoodLocal(label: string): VisionMood {
  const map: Record<string, VisionMood> = {
    '긴박감': 'urgent', '트렌디': 'trendy', '감성': 'emotional', '신뢰': 'trustworthy',
    '재미': 'playful', '럭셔리': 'luxurious', '일상': 'casual',
    '하이텐션': 'urgent', '시네마틱': 'emotional', '로파이': 'casual', 'ASMR': 'emotional',
  };
  return map[label] ?? 'trendy';
}

function getSilenceColor(type: string): { backgroundColor: string } {
  switch (type) {
    case 'breath':
      return { backgroundColor: theme.colors.success[400] };
    case 'dramatic':
      return { backgroundColor: theme.colors.warning[400] };
    case 'hook-transition':
      return { backgroundColor: theme.colors.accent[400] };
    case 'sentence':
      return { backgroundColor: theme.colors.primary[400] };
    default:
      return { backgroundColor: theme.colors.dark.border };
  }
}

function getSilenceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'breath': '호흡',
    'comma': '쉼표',
    'sentence': '문장',
    'dramatic': '드라마틱',
    'hook-transition': '훅 전환',
  };
  return labels[type] ?? type;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '25',
  },
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
    backgroundColor: theme.colors.primary[400] + '20',
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
  sectionLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 8,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  moodChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surface,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  moodChipActive: {
    backgroundColor: theme.colors.primary[400] + '20',
    borderColor: theme.colors.primary[400],
  },
  moodChipText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  moodChipTextActive: {
    color: theme.colors.primary[400],
  },
  moodChipEnergy: {
    fontSize: 8,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  moodChipEnergyActive: {
    color: theme.colors.primary[300],
  },
  moodDescription: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginBottom: 10,
    lineHeight: 14,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary[400],
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  generateBtnDisabled: {
    opacity: 0.5,
  },
  generateBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  profileScroll: {
    maxHeight: 550,
  },
  summaryBox: {
    backgroundColor: theme.colors.success[400] + '12',
    borderRadius: theme.radius.sm,
    padding: 10,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.success[400] + '60',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
    flex: 1,
  },
  fidelityBadge: {
    backgroundColor: theme.colors.primary[400] + '20',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  fidelityText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
  },
  summaryText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 15,
  },
  paramCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  paramHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  paramTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  paramRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  paramKey: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  paramValue: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  tempoBar: {
    flexDirection: 'row',
    height: 40,
    alignItems: 'flex-end',
    gap: 2,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  tempoDot: {
    flex: 1,
    backgroundColor: theme.colors.warning[400],
    borderRadius: 2,
    minHeight: 4,
  },
  tempoDesc: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 13,
  },
  silenceList: {
    gap: 4,
    marginBottom: 6,
  },
  silenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  silenceTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  silenceType: {
    flex: 1,
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  silenceDuration: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  silenceMore: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  silenceTotal: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
    marginTop: 4,
  },
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  detailToggleText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  instructionsBox: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.sm,
    padding: 10,
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 15,
  },
});
