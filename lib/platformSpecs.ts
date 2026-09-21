export type PlatformKey =
  | 'tiktok'
  | 'reels'
  | 'shorts'
  | 'threads'
  | 'naverclip'
  | 'pinterest';

export interface PlatformSpec {
  key: PlatformKey;
  label: string;
  ratio: string;
  width: number;
  height: number;
  color: string;
  safeZoneTop: number;
  safeZoneBottom: number;
  safeZoneSides: number;
  desc: string;
}

export const PLATFORM_SPECS: PlatformSpec[] = [
  {
    key: 'tiktok',
    label: '틱톡',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    color: '#FF0050',
    safeZoneTop: 220,
    safeZoneBottom: 280,
    safeZoneSides: 60,
    desc: '세로 전용 · 상단 UI 영역 + 하단 캡션/버튼 회피',
  },
  {
    key: 'reels',
    label: '인스타 릴스',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    color: '#E1306C',
    safeZoneTop: 200,
    safeZoneBottom: 300,
    safeZoneSides: 50,
    desc: '세로 전용 · 하단 계정명·캡션·음악 정보 회피',
  },
  {
    key: 'shorts',
    label: '유튜브 숏츠',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    color: '#FF0000',
    safeZoneTop: 180,
    safeZoneBottom: 320,
    safeZoneSides: 50,
    desc: '세로 전용 · 하단 채널명·구독 버튼 + 우측 버튼군 회피',
  },
  {
    key: 'threads',
    label: '스레드',
    ratio: '9:16',
    width: 1080,
    height: 1350,
    color: '#8B5CF6',
    safeZoneTop: 140,
    safeZoneBottom: 160,
    safeZoneSides: 48,
    desc: '세로 4:5 영역 · 상단 프로필 + 하단 인터페이스 회피',
  },
  {
    key: 'naverclip',
    label: '네이버클립',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    color: '#03C75A',
    safeZoneTop: 160,
    safeZoneBottom: 240,
    safeZoneSides: 50,
    desc: '세로 전용 · 상단 타이틀 + 하단 댓글 입력창 회피',
  },
  {
    key: 'pinterest',
    label: '핀터레스트',
    ratio: '2:3',
    width: 1000,
    height: 1500,
    color: '#E60023',
    safeZoneTop: 120,
    safeZoneBottom: 180,
    safeZoneSides: 48,
    desc: '세로 2:3 비율 · 핀 제목/설명 영역 회피',
  },
];

export function getPlatformSpec(key: PlatformKey): PlatformSpec | undefined {
  return PLATFORM_SPECS.find((p) => p.key === key);
}

export function aspectRatioValue(spec: PlatformSpec): number {
  return spec.width / spec.height;
}

export interface SafeZoneRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function getSafeZone(spec: PlatformSpec): SafeZoneRect {
  return {
    top: spec.safeZoneTop,
    bottom: spec.safeZoneBottom,
    left: spec.safeZoneSides,
    right: spec.safeZoneSides,
  };
}
