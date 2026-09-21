import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import {
  Camera,
  Sparkles,
  Share2,
  TrendingUp,
  Check,
  Link2,
  Zap,
  Send,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';

const { width: screenWidth } = Dimensions.get('window');

interface OnboardingStep {
  icon: React.ReactNode;
  title: string;
  desc: string;
  accentColor: string;
}

const STEPS: OnboardingStep[] = [
  {
    icon: <Camera size={40} color={theme.colors.primary[400]} strokeWidth={1.8} />,
    title: '사진 한 장으로 시작',
    desc: '제품 사진을 찍거나 업로드하면 AI가 자동으로 상품을 분석합니다. 단품과 다각도 모드를 지원해요.',
    accentColor: theme.colors.primary[400],
  },
  {
    icon: <Sparkles size={40} color={theme.colors.accent[400]} strokeWidth={1.8} />,
    title: 'AI 자동 콘텐츠 생성',
    desc: '분석 결과에서 숏폼 카드, 카피라이팅, 해시태그, 제휴 링크까지 한 번에 만들어집니다. 플랫폼별 맞춤 스타일도 지원해요.',
    accentColor: theme.colors.accent[400],
  },
  {
    icon: <Share2 size={40} color={theme.colors.success[400]} strokeWidth={1.8} />,
    title: '원클릭 멀티 공유',
    desc: '인스타, 틱톡, 블로그 등 여러 플랫폼용으로 동시에 내보낼 수 있습니다. 숏링크로 클릭 추적까지 한 번에.',
    accentColor: theme.colors.success[400],
  },
  {
    icon: <TrendingUp size={40} color={theme.colors.warning[400]} strokeWidth={1.8} />,
    title: '트렌드 & 수익 분석',
    desc: '실시간 인기 상품과 키워드 트렌드를 확인하고, 클릭 및 수익 데이터를 한 곳에서 관리하세요.',
    accentColor: theme.colors.warning[400],
  },
];

type TutorialPhase = 'intro' | 'demo-paste' | 'demo-generate' | 'demo-share';

interface DemoStep {
  phase: TutorialPhase;
  label: string;
  title: string;
  desc: string;
}

const DEMO_STEPS: DemoStep[] = [
  {
    phase: 'demo-paste',
    label: '15초 체험 1/3',
    title: '상품 링크 붙여넣기',
    desc: '쿠팡·네이버 상품 URL을 붙여넣으면 AI가 상품을 자동 인식합니다. 지금 가상 링크로 체험해보세요.',
  },
  {
    phase: 'demo-generate',
    label: '15초 체험 2/3',
    title: 'AI 숏폼 자동 완성',
    desc: '제품 사진, 마케팅 카피, 해시태그, 제휴 링크가 자동으로 완성됩니다. 3초면 충분해요.',
  },
  {
    phase: 'demo-share',
    label: '15초 체험 3/3',
    title: '원클릭 공유',
    desc: '완성된 콘텐츠를 인스타·틱톡·유튜브 숏츠에 바로 공유할 수 있어요. 숏링크로 클릭 추적까지 됩니다.',
  },
];

interface OnboardingModalProps {
  visible: boolean;
  onComplete: () => void;
}

export function OnboardingModal({ visible, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<TutorialPhase>('intro');
  const [demoStep, setDemoStep] = useState(0);
  const [demoLinkPasted, setDemoLinkPasted] = useState(false);
  const [demoGenerating, setDemoGenerating] = useState(false);
  const [demoGenerated, setDemoGenerated] = useState(false);
  const [demoShared, setDemoShared] = useState(false);
  const progress = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentTranslate = useSharedValue(20);
  const mountAnim = useSharedValue(0);
  const demoProgressAnim = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setStep(0);
      setPhase('intro');
      setDemoStep(0);
      setDemoLinkPasted(false);
      setDemoGenerating(false);
      setDemoGenerated(false);
      setDemoShared(false);
      mountAnim.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
      animateStep(0);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  const animateStep = (targetStep: number) => {
    contentOpacity.value = withSequence(
      withTiming(0, { duration: 150 }),
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
    contentTranslate.value = withSequence(
      withTiming(15, { duration: 150 }),
      withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
    progress.value = withTiming((targetStep + 1) / STEPS.length, { duration: 400 });
  };

  const animateDemoStep = (target: number) => {
    contentOpacity.value = withSequence(
      withTiming(0, { duration: 150 }),
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
    contentTranslate.value = withSequence(
      withTiming(15, { duration: 150 }),
      withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
    demoProgressAnim.value = withTiming((target + 1) / DEMO_STEPS.length, { duration: 400 });
  };

  const handleNext = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (phase === 'intro') {
      if (step < STEPS.length - 1) {
        const next = step + 1;
        setStep(next);
        animateStep(next);
      } else {
        startDemo();
      }
    }
  };

  const startDemo = () => {
    setPhase('demo-paste');
    setDemoStep(0);
    setDemoLinkPasted(false);
    setDemoGenerating(false);
    setDemoGenerated(false);
    setDemoShared(false);
    animateDemoStep(0);
  };

  const handlePasteLink = () => {
    setDemoLinkPasted(true);
    timerRef.current = setTimeout(() => {
      runOnJS(goToGenerateStep)();
    }, 600);
  };

  const goToGenerateStep = () => {
    setPhase('demo-generate');
    setDemoStep(1);
    setDemoGenerating(true);
    animateDemoStep(1);
    timerRef.current = setTimeout(() => {
      runOnJS(finishGenerate)();
    }, 1800);
  };

  const finishGenerate = () => {
    setDemoGenerating(false);
    setDemoGenerated(true);
  };

  const handleDemoGenerate = () => {
    if (demoGenerated) {
      setPhase('demo-share');
      setDemoStep(2);
      animateDemoStep(2);
    }
  };

  const handleDemoShare = () => {
    setDemoShared(true);
    timerRef.current = setTimeout(() => {
      runOnJS(handleComplete)();
    }, 500);
  };

  const handleSkip = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    handleComplete();
  };

  const handleComplete = () => {
    mountAnim.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(onComplete)();
    });
  };

  const mountStyle = useAnimatedStyle(() => ({
    opacity: mountAnim.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslate.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const demoProgressStyle = useAnimatedStyle(() => ({
    width: `${demoProgressAnim.value * 100}%`,
  }));

  if (!visible) return null;

  const current = STEPS[step];
  const isLastIntro = step === STEPS.length - 1;
  const currentDemo = DEMO_STEPS[demoStep];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleSkip}>
      <Animated.View style={[styles.overlay, mountStyle]}>
        <View style={styles.card}>
          {phase === 'intro' ? (
            <>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressBar, progressStyle]} />
              </View>

              <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.7}>
                <Text style={styles.skipText}>건너뛰기</Text>
              </TouchableOpacity>

              <Animated.View style={contentStyle} key={step}>
                <View style={[styles.iconWrap, { backgroundColor: current.accentColor + '18' }]}>
                  {current.icon}
                </View>
                <Text style={styles.title}>{current.title}</Text>
                <Text style={styles.desc}>{current.desc}</Text>
              </Animated.View>

              <View style={styles.dotsRow}>
                {STEPS.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]}
                  >
                    {i < step && <Check size={8} color="#fff" strokeWidth={3} />}
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: current.accentColor }]}
                onPress={handleNext}
                activeOpacity={0.8}
              >
                <Text style={styles.actionText}>
                  {isLastIntro ? '15초 체험하기' : '다음'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressBar, { backgroundColor: theme.colors.accent[400] }, demoProgressStyle]} />
              </View>

              <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.7}>
                <Text style={styles.skipText}>건너뛰기</Text>
              </TouchableOpacity>

              <Animated.View style={contentStyle} key={phase}>
                <View style={styles.demoLabelWrap}>
                  <Zap size={13} color={theme.colors.accent[400]} strokeWidth={2} />
                  <Text style={styles.demoLabel}>{currentDemo.label}</Text>
                </View>
                <Text style={styles.title}>{currentDemo.title}</Text>
                <Text style={styles.desc}>{currentDemo.desc}</Text>

                {phase === 'demo-paste' && (
                  <View style={styles.demoContent}>
                    <View style={styles.mockUrlBox}>
                      <Link2 size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
                      <Text style={styles.mockUrlText}>
                        {demoLinkPasted ? 'coupang.com/p/제주감귤30입' : '상품 URL을 붙여넣으세요'}
                      </Text>
                      {demoLinkPasted && <Check size={14} color={theme.colors.success[400]} strokeWidth={2} />}
                    </View>
                    <TouchableOpacity
                      style={[styles.demoBtn, demoLinkPasted && styles.demoBtnDisabled]}
                      onPress={handlePasteLink}
                      disabled={demoLinkPasted}
                      activeOpacity={0.8}
                    >
                      {demoLinkPasted ? (
                        <Text style={styles.demoBtnText}>링크 인식 완료</Text>
                      ) : (
                        <Text style={styles.demoBtnText}>가상 링크 붙여넣기</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {phase === 'demo-generate' && (
                  <View style={styles.demoContent}>
                    <View style={styles.mockGenCard}>
                      <View style={styles.mockGenCardHeader}>
                        <Sparkles size={14} color={theme.colors.accent[400]} strokeWidth={2} />
                        <Text style={styles.mockGenCardTitle}>AI 생성 중...</Text>
                      </View>
                      {demoGenerating ? (
                        <View style={styles.mockGenLoadingRow}>
                          <View style={styles.mockGenLoadingBar} />
                        </View>
                      ) : (
                        <View style={styles.mockGenResultWrap}>
                          <View style={styles.mockGenResultRow}>
                            <Check size={12} color={theme.colors.success[400]} strokeWidth={2.5} />
                            <Text style={styles.mockGenResultText}>제품 사진 합성 완료</Text>
                          </View>
                          <View style={styles.mockGenResultRow}>
                            <Check size={12} color={theme.colors.success[400]} strokeWidth={2.5} />
                            <Text style={styles.mockGenResultText}>마케팅 카피 생성 완료</Text>
                          </View>
                          <View style={styles.mockGenResultRow}>
                            <Check size={12} color={theme.colors.success[400]} strokeWidth={2.5} />
                            <Text style={styles.mockGenResultText}>해시태그 12개 추출 완료</Text>
                          </View>
                          <View style={styles.mockGenResultRow}>
                            <Check size={12} color={theme.colors.success[400]} strokeWidth={2.5} />
                            <Text style={styles.mockGenResultText}>제휴 링크 생성 완료</Text>
                          </View>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[styles.demoBtn, !demoGenerated && styles.demoBtnDisabled]}
                      onPress={handleDemoGenerate}
                      disabled={!demoGenerated}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.demoBtnText}>
                        {demoGenerating ? '생성 중...' : demoGenerated ? '공유 단계로 →' : '잠시만요...'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {phase === 'demo-share' && (
                  <View style={styles.demoContent}>
                    <View style={styles.mockShareCard}>
                      <View style={styles.mockSharePreview}>
                        <View style={styles.mockShareImg} />
                        <View style={styles.mockShareInfo}>
                          <Text style={styles.mockShareTitle}>제주 감귤 30입</Text>
                          <Text style={styles.mockShareCopy}>겨울철 꿀맛 감귤 🍊</Text>
                          <Text style={styles.mockShareTags}>#감귤 #제주 #겨울과일</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.mockSharePlatforms}>
                      {['인스타', '틱톡', '유튜브'].map((p) => (
                        <View key={p} style={[styles.mockSharePlatform, demoShared && styles.mockSharePlatformDone]}>
                          <Send size={12} color={demoShared ? theme.colors.success[400] : theme.colors.dark.textDim} strokeWidth={2} />
                          <Text style={[styles.mockSharePlatformText, demoShared && styles.mockSharePlatformTextDone]}>{p}</Text>
                          {demoShared && <Check size={10} color={theme.colors.success[400]} strokeWidth={2.5} />}
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={[styles.demoBtn, demoShared && styles.demoBtnDisabled]}
                      onPress={handleDemoShare}
                      disabled={demoShared}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.demoBtnText}>
                        {demoShared ? '공유 완료!' : '전체 공유하기'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>

              <View style={styles.dotsRow}>
                {DEMO_STEPS.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, i === demoStep && styles.dotActive, i < demoStep && styles.dotDone]}
                  >
                    {i < demoStep && <Check size={8} color="#fff" strokeWidth={3} />}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const cardWidth = Math.min(screenWidth - 48, 380);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: cardWidth,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    ...theme.shadows.elevated,
  },
  progressTrack: {
    height: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: 2,
    marginBottom: theme.spacing.lg,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.primary[400],
    borderRadius: 2,
  },
  skipButton: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.lg,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  skipText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    alignSelf: 'center',
  },
  title: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  desc: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: theme.spacing.xl,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: theme.spacing.xl,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotActive: {
    backgroundColor: theme.colors.primary[400],
    transform: [{ scale: 1.2 }],
  },
  dotDone: {
    backgroundColor: theme.colors.success[500],
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  actionText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  demoLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 8,
  },
  demoLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
  },
  demoContent: {
    gap: 12,
    marginBottom: theme.spacing.md,
  },
  mockUrlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  mockUrlText: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  demoBtn: {
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500],
    alignItems: 'center',
  },
  demoBtnDisabled: {
    backgroundColor: theme.colors.success[500],
  },
  demoBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  mockGenCard: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  mockGenCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  mockGenCardTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
  },
  mockGenLoadingRow: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.dark.bg,
    overflow: 'hidden',
  },
  mockGenLoadingBar: {
    height: '100%',
    width: '60%',
    borderRadius: 3,
    backgroundColor: theme.colors.accent[400],
  },
  mockGenResultWrap: {
    gap: 7,
  },
  mockGenResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mockGenResultText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  mockShareCard: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  mockSharePreview: {
    flexDirection: 'row',
    gap: 12,
  },
  mockShareImg: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warning[500] + '30',
  },
  mockShareInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  mockShareTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  mockShareCopy: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 3,
  },
  mockShareTags: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.accent[400],
    marginTop: 3,
  },
  mockSharePlatforms: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  mockSharePlatform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  mockSharePlatformDone: {
    backgroundColor: theme.colors.success[500] + '15',
    borderColor: theme.colors.success[500] + '40',
  },
  mockSharePlatformText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  mockSharePlatformTextDone: {
    color: theme.colors.success[400],
  },
});
