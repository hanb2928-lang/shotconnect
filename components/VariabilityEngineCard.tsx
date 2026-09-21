import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Shuffle, Eye, Type, Mic, Clock, Shield, Copy, Check, RefreshCw, Hash, TriangleAlert as AlertTriangle, TrendingUp } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  generateVisualParams,
  generateCaptionVariations,
  type VisualRandomizationParams,
  type CaptionVariation,
  mutateHashtags,
  generateTtsVariation,
  type TtsVariationParams,
  assessUploadSafety,
  type UploadRecord,
} from '@/lib/humanLikeEngine';

const ESSENTIAL_TAGS = ['내돈내산', '리뷰'];
const POOL_TAGS = [
  '꿀템', '가성비', '베스트', '후기', '추천',
  '한정', '신상', '할인', '소름', '인생템',
  '찐템', '재구매', '만족', '초특가', '핵심공유',
];

const PLATFORM_LABELS: Record<string, string> = {
  youtube_shorts: '유튜브 숏츠',
  instagram_reels: '인스타그램 릴스',
  tiktok: '틱톡',
};

type TabKey = 'visual' | 'caption' | 'hashtag' | 'voice' | 'pacing';

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof Eye;
  color: string;
}

const TABS: TabDef[] = [
  { key: 'visual', label: '시각 변주', icon: Eye, color: theme.colors.primary[400] },
  { key: 'caption', label: '문구 변주', icon: Type, color: theme.colors.accent[400] },
  { key: 'hashtag', label: '해시태그', icon: Hash, color: theme.colors.warning[400] },
  { key: 'voice', label: '음성 변주', icon: Mic, color: theme.colors.success[400] },
  { key: 'pacing', label: '업로드 페이싱', icon: Clock, color: theme.colors.error[400] },
];

export function VariabilityEngineCard() {
  const [activeTab, setActiveTab] = useState<TabKey>('visual');
  const [visualParams, setVisualParams] = useState<VisualRandomizationParams | null>(null);
  const [captionInput, setCaptionInput] = useState('');
  const [hookInput, setHookInput] = useState('');
  const [captionVariations, setCaptionVariations] = useState<CaptionVariation[]>([]);
  const [hashtagResult, setHashtagResult] = useState<string[]>([]);
  const [ttsParams, setTtsParams] = useState<TtsVariationParams | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [uploadRecords, setUploadRecords] = useState<UploadRecord[]>([]);

  const pacingAssessments = useMemo(() => {
    return Object.keys(PLATFORM_LABELS).map((platform) => ({
      platform,
      label: PLATFORM_LABELS[platform],
      ...assessUploadSafety(platform, uploadRecords),
    }));
  }, [uploadRecords]);

  const handleGenerateVisual = useCallback(() => {
    setVisualParams(generateVisualParams());
  }, []);

  const handleGenerateCaptions = useCallback(() => {
    if (!hookInput.trim() && !captionInput.trim()) return;
    const variations = generateCaptionVariations(
      hookInput.trim() || '이거 진짜 추천',
      captionInput.trim() || '사용해보니 너무 좋았어요',
      ESSENTIAL_TAGS,
      4,
    );
    setCaptionVariations(variations);
  }, [hookInput, captionInput]);

  const handleGenerateHashtags = useCallback(() => {
    setHashtagResult(mutateHashtags(ESSENTIAL_TAGS, POOL_TAGS, 12));
  }, []);

  const handleGenerateTts = useCallback(() => {
    setTtsParams(generateTtsVariation(1.0));
  }, []);

  const handleCopy = useCallback(async (text: string, idx: number) => {
    try {
      await Clipboard.setStringAsync(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // clipboard may be unavailable on some platforms
    }
  }, []);

  const safetyScore = useMemo(() => {
    let score = 0;
    if (visualParams) score += 25;
    if (captionVariations.length > 0) score += 25;
    if (hashtagResult.length > 0) score += 15;
    if (ttsParams) score += 20;
    score += 15;
    return Math.min(score, 100);
  }, [visualParams, captionVariations, hashtagResult, ttsParams]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Shuffle size={18} color={theme.colors.accent[400]} strokeWidth={2} />
          <View>
            <Text style={styles.title}>무작위 변주 엔진</Text>
            <Text style={styles.subtitle}>플랫폼 알고리즘 제재를 교묘히 회피하는 자동 다변화</Text>
          </View>
        </View>
        <View style={[styles.safetyBadge, { backgroundColor: safetyScore >= 80 ? theme.colors.success[500] + '20' : safetyScore >= 50 ? theme.colors.warning[500] + '20' : theme.colors.error[500] + '20' }]}>
          <Shield size={14} color={safetyScore >= 80 ? theme.colors.success[400] : safetyScore >= 50 ? theme.colors.warning[400] : theme.colors.error[400]} strokeWidth={2} />
          <Text style={[styles.safetyScore, { color: safetyScore >= 80 ? theme.colors.success[400] : safetyScore >= 50 ? theme.colors.warning[400] : theme.colors.error[400] }]}>{safetyScore}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, active && { backgroundColor: tab.color + '20', borderColor: tab.color + '60' }]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Icon size={13} color={active ? tab.color : theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={[styles.tabLabel, active && { color: tab.color }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.content}>
        {activeTab === 'visual' && (
          <View style={styles.panel}>
            <Text style={styles.panelDesc}>
              줌 속도, 방향, 색감, 텍스트 위치를 무작위로 변경하여 동일 템플릿이라도 시각적으로 다르게 보이게 합니다
            </Text>
            {visualParams ? (
              <View style={styles.paramsGrid}>
                <ParamRow label="줌 속도" value={visualParams.zoomSpeed.toFixed(2) + 'x'} />
                <ParamRow label="줌 방향" value={visualParams.zoomDirection === 'in' ? '인' : '아웃'} />
                <ParamRow label="텍스트 Y" value={visualParams.textYOffset > 0 ? `+${visualParams.textYOffset}px` : `${visualParams.textYOffset}px`} />
                <ParamRow label="텍스트 X" value={visualParams.textXOffset > 0 ? `+${visualParams.textXOffset}px` : `${visualParams.textXOffset}px`} />
                <ParamRow label="폰트 변형" value={`#${visualParams.fontVariant + 1}`} />
                <ParamRow label="전환 시간" value={`${Math.round(visualParams.transitionDuration)}ms`} />
                <ParamRow label="색조 이동" value={`${visualParams.hueShift > 0 ? '+' : ''}${visualParams.hueShift.toFixed(2)}%`} />
                <ParamRow label="노이즈 시드" value={Math.round(visualParams.noiseSeed).toString()} />
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Eye size={28} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
                <Text style={styles.emptyText}>생성 버튼을 눌러 시각 파라미터를 무작위화하세요</Text>
              </View>
            )}
            <TouchableOpacity style={styles.genBtn} onPress={handleGenerateVisual} activeOpacity={0.8}>
              <RefreshCw size={16} color="#fff" strokeWidth={2} />
              <Text style={styles.genBtnText}>시각 파라미터 생성</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'caption' && (
          <View style={styles.panel}>
            <Text style={styles.panelDesc}>
              동일한 의미를 유지하면서 후크 문구, 동의어, 문장 구조를 변형하여 중복 콘텐츠 패널티를 회피합니다
            </Text>
            <TextInput
              style={styles.textInput}
              value={hookInput}
              onChangeText={setHookInput}
              placeholder="후크 문구 (예: 이거 진짜 추천)"
              placeholderTextColor={theme.colors.dark.textFaint}
              maxLength={60}
            />
            <TextInput
              style={[styles.textInput, { minHeight: 60 }]}
              value={captionInput}
              onChangeText={setCaptionInput}
              placeholder="본문 문구 (예: 사용해보니 너무 좋았어요)"
              placeholderTextColor={theme.colors.dark.textFaint}
              multiline
              maxLength={200}
            />
            <TouchableOpacity style={styles.genBtn} onPress={handleGenerateCaptions} activeOpacity={0.8}>
              <Shuffle size={16} color="#fff" strokeWidth={2} />
              <Text style={styles.genBtnText}>문구 변주 4개 생성</Text>
            </TouchableOpacity>
            {captionVariations.length > 0 && (
              <View style={styles.variationList}>
                {captionVariations.map((v, i) => (
                  <View key={i} style={styles.variationCard}>
                    <View style={styles.variationHeader}>
                      <Text style={styles.variationNum}>V{i + 1}</Text>
                      <TouchableOpacity
                        style={styles.copyBtn}
                        onPress={() => handleCopy(`${v.hook}\n${v.caption}`, i)}
                        activeOpacity={0.7}
                      >
                        {copiedIdx === i ? (
                          <Check size={14} color={theme.colors.success[400]} strokeWidth={2.5} />
                        ) : (
                          <Copy size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
                        )}
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.variationHook}>{v.hook}</Text>
                    <Text style={styles.variationCaption}>{v.caption}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === 'hashtag' && (
          <View style={styles.panel}>
            <Text style={styles.panelDesc}>
              필수 태그는 유지하고 나머지 풀에서 무작위로 선택하여 매번 다른 해시태그 조합을 만듭니다
            </Text>
            {hashtagResult.length > 0 ? (
              <View style={styles.tagWrap}>
                {hashtagResult.map((tag, i) => (
                  <View key={i} style={[styles.tagChip, i < ESSENTIAL_TAGS.length && styles.tagChipEssential]}>
                    <Hash size={10} color={i < ESSENTIAL_TAGS.length ? theme.colors.warning[400] : theme.colors.dark.textDim} strokeWidth={2} />
                    <Text style={[styles.tagText, i < ESSENTIAL_TAGS.length && styles.tagTextEssential]}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Hash size={28} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
                <Text style={styles.emptyText}>생성 버튼을 눌러 해시태그 조합을 만드세요</Text>
              </View>
            )}
            <TouchableOpacity style={styles.genBtn} onPress={handleGenerateHashtags} activeOpacity={0.8}>
              <RefreshCw size={16} color="#fff" strokeWidth={2} />
              <Text style={styles.genBtnText}>해시태그 조합 생성</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'voice' && (
          <View style={styles.panel}>
            <Text style={styles.panelDesc}>
              TTS 속도에 미세한 지터를 추가하고, 필러 단어와 일시정지 마커를 무작위 삽입하여 자연스러운 음성을 만듭니다
            </Text>
            {ttsParams ? (
              <View style={styles.paramsGrid}>
                <ParamRow label="속도" value={ttsParams.speed.toFixed(2) + 'x'} />
                <ParamRow label="속도 지터" value={`${ttsParams.speedJitter > 0 ? '+' : ''}${ttsParams.speedJitter.toFixed(2)}`} />
                <ParamRow label="필러 단어" value={ttsParams.fillerWord || '없음'} />
                <ParamRow label="일시정지" value={ttsParams.pauseMarker || '없음'} />
                <ParamRow label="BGM 오프셋" value={`${ttsParams.bgmOffsetMs}ms`} />
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Mic size={28} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
                <Text style={styles.emptyText}>생성 버튼을 눌러 음성 변주 파라미터를 만드세요</Text>
              </View>
            )}
            <TouchableOpacity style={styles.genBtn} onPress={handleGenerateTts} activeOpacity={0.8}>
              <RefreshCw size={16} color="#fff" strokeWidth={2} />
              <Text style={styles.genBtnText}>음성 변주 생성</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'pacing' && (
          <View style={styles.panel}>
            <Text style={styles.panelDesc}>
              플랫폼별 업로드 간격을 추적하여 연속 발행으로 인한 섀도우밴 위험을 경고합니다
            </Text>
            <View style={styles.pacingCards}>
              {pacingAssessments.map((item) => {
                const isSafe = item.level === 'safe';
                const waitText = item.recommendedWaitMinutes > 0 ? `${item.recommendedWaitMinutes}분 대기` : '안전';
                return (
                  <View key={item.platform} style={styles.pacingCard}>
                    <View style={styles.pacingCardLeft}>
                      <Clock size={16} color={isSafe ? theme.colors.success[400] : theme.colors.warning[400]} strokeWidth={2} />
                      <Text style={styles.pacingLabel}>{item.label}</Text>
                    </View>
                    <View style={[styles.pacingStatus, { backgroundColor: isSafe ? theme.colors.success[500] + '15' : theme.colors.warning[500] + '15' }]}>
                      <Text style={[styles.pacingStatusText, { color: isSafe ? theme.colors.success[400] : theme.colors.warning[400] }]}>
                        {waitText}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <View style={styles.pacingInfo}>
              <AlertTriangle size={12} color={theme.colors.warning[400]} strokeWidth={2} />
              <Text style={styles.pacingInfoText}>
                동일 플랫폼에 90분 이내 연속 업로드 시 제재 위험이 증가합니다. 변주 엔진과 함께 페이싱을 관리하세요.
              </Text>
            </View>
          </View>
        )}
      </View>

      {safetyScore < 80 && (
        <View style={styles.tipBar}>
          <TrendingUp size={13} color={theme.colors.accent[400]} strokeWidth={2} />
          <Text style={styles.tipText}>
            모든 변주 탭을 활성화하면 안전 점수가 100에 도달하여 패널티 위험이 최소화됩니다
          </Text>
        </View>
      )}
    </View>
  );
}

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.paramRow}>
      <Text style={styles.paramLabel}>{label}</Text>
      <Text style={styles.paramValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    gap: 10,
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
    lineHeight: 15,
  },
  safetyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  safetyScore: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
  },
  tabScroll: {
    marginBottom: theme.spacing.md,
    marginHorizontal: -4,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
    backgroundColor: theme.colors.dark.bg,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  content: {
    minHeight: 180,
  },
  panel: {
    gap: 10,
  },
  panelDesc: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
  },
  textInput: {
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  genBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.accent[500],
    borderRadius: theme.radius.md,
    paddingVertical: 12,
  },
  genBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  paramsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  paramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 120,
    flex: 1,
    maxWidth: '48%',
  },
  paramLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  paramValue: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
  },
  variationList: {
    gap: 8,
  },
  variationCard: {
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    padding: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  variationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  variationNum: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.accent[400],
  },
  copyBtn: {
    padding: 4,
  },
  variationHook: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginBottom: 4,
  },
  variationCaption: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tagChipEssential: {
    backgroundColor: theme.colors.warning[500] + '15',
    borderWidth: 1,
    borderColor: theme.colors.warning[400] + '40',
  },
  tagText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  tagTextEssential: {
    color: theme.colors.warning[400],
  },
  pacingCards: {
    gap: 8,
  },
  pacingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pacingCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pacingLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  pacingStatus: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
  },
  pacingStatusText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
  },
  pacingInfo: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: theme.colors.warning[500] + '10',
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pacingInfoText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 15,
    flex: 1,
  },
  tipBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.accent[500] + '10',
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tipText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.accent[400],
    flex: 1,
    lineHeight: 15,
  },
});
