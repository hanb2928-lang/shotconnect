import { View, Text, StyleSheet } from 'react-native';
import { Camera, Wand2, Film, Send, PartyPopper } from 'lucide-react-native';
import { theme } from '@/lib/theme';

export type GuideStepKey = 'platform' | 'upload' | 'comic' | 'publish' | 'complete';

export interface StepGuideBannerProps {
  step: GuideStepKey;
  visible: boolean;
}

const GUIDE_CONFIG: Record<GuideStepKey, {
  num: string;
  icon: typeof Camera;
  color: string;
  title: string;
  desc: string;
}> = {
  platform: {
    num: '1',
    icon: Camera,
    color: theme.colors.accent[400],
    title: '1단계: 상품 사진 촬영 및 소스 수집',
    desc: '스마트폰으로 상품이나 매장을 촬영하거나 앨범에서 사진을 불러오세요. 제휴 링크를 연결하면 상품 정보도 자동으로 가져옵니다.',
  },
  upload: {
    num: '2',
    icon: Wand2,
    color: theme.colors.warning[400],
    title: '2단계: AI 보정 및 만화숏폼 생성',
    desc: 'AI가 원본 사진을 마케팅용으로 보정하고 4컷 만화숏폼을 자동 생성합니다. 원치 않으면 건너뛰어도 됩니다!',
  },
  comic: {
    num: '3',
    icon: Film,
    color: theme.colors.success[400],
    title: '3단계: 만화 숏폼 슬라이드쇼 확인',
    desc: 'AI가 만든 만화 컷 카드를 슬라이드쇼로 확인하세요. 하단 버튼으로 모든 컷 이미지를 한 번에 다운로드할 수 있습니다.',
  },
  publish: {
    num: '4',
    icon: Send,
    color: theme.colors.primary[400],
    title: '4단계: 제휴쇼핑 및 발행',
    desc: '제휴 링크와 홍보 문구를 터치 한 번으로 복사하고 SNS에 붙여넣어 수익을 만들어보세요!',
  },
  complete: {
    num: '✓',
    icon: PartyPopper,
    color: theme.colors.success[400],
    title: '수고하셨습니다!',
    desc: '첫 숏폼 마케팅 발행이 준비되었습니다. 인스타그램 릴스나 쇼츠 앱을 켜고 다운로드한 컷 이미지들을 슬라이드로 올려보세요!',
  },
};

export function StepGuideBanner({ step, visible }: StepGuideBannerProps) {
  if (!visible) return null;

  const config = GUIDE_CONFIG[step];
  const Icon = config.icon;

  return (
    <View style={[styles.container, { borderLeftColor: config.color }]}>
      <View style={[styles.iconWrap, { backgroundColor: config.color + '20' }]}>
        <Icon size={18} color={config.color} strokeWidth={2.5} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{config.title}</Text>
        <Text style={styles.desc}>{config.desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  desc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
  },
});
