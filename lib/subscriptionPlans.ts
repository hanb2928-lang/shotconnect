export interface SubscriptionPlan {
  id: 'basic' | 'pro' | 'business';
  name: string;
  monthlyPrice: number;
  quota: number;
  tagline: string;
  badge?: string;
  features: string[];
  accentColor: string;
}

export interface TokenPack {
  id: string;
  name: string;
  price: number;
  quota: number;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'basic',
    name: '베이직',
    monthlyPrice: 14900,
    quota: 100,
    tagline: '입문 및 소소한 부업용',
    accentColor: '#3B82F6',
    features: [
      '1~4단계 수직 가이드 및 기본 템플릿 사용',
      '사진 및 단일 숏폼 제작',
      '기본 TTS 내레이션 음성 2종 제공',
    ],
  },
  {
    id: 'pro',
    name: '프로',
    monthlyPrice: 39000,
    quota: 500,
    tagline: '성장형 마케터 추천',
    badge: '베스트셀러',
    accentColor: '#10B981',
    features: [
      '숏폼 만화(웹툰풍/팝아트풍) 및 멀티버스 에피소드 제작 무제한 해제',
      'AI 프리미엄 내레이션 음성 10종 및 속도·피치 세부 조절',
      '제휴 쇼핑 성과 분석 대시보드 및 우선 처리 큐(Queue) 적용',
    ],
  },
  {
    id: 'business',
    name: '비즈니스',
    monthlyPrice: 99000,
    quota: 2000,
    tagline: '팀 및 파워 마케터용',
    accentColor: '#F59E0B',
    features: [
      '모든 제휴 플랫폼(쿠팡, 네이버 등) API 다중 연동',
      'SNS 자동 포스팅 예약 및 멀티 채널 배포 시스템',
      '전용 AI 커스텀 톤앤매너 설정 및 우선 기술 지원',
    ],
  },
];

export const TOKEN_PACKS: TokenPack[] = [
  { id: 'standard', name: '스탠다드 충전 팩', price: 5900, quota: 50 },
  { id: 'pro', name: '프로 충전 팩', price: 9900, quota: 100 },
];

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}
