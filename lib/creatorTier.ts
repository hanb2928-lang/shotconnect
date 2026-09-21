import { supabase } from '@/lib/supabase';

export type TierLevel = 'bronze' | 'silver' | 'gold' | 'master';

export interface CreatorTier {
  id: number;
  tier_level: TierLevel;
  total_scans: number;
  total_clicks: number;
  total_revenue: number;
  tier_points: number;
}

export const TIER_CONFIG: Record<TierLevel, {
  label: string;
  emoji: string;
  color: string;
  minPoints: number;
  nextTier: TierLevel | null;
  perks: string[];
}> = {
  bronze: {
    label: '브론즈',
    emoji: '🥉',
    color: '#cd7f32',
    minPoints: 0,
    nextTier: 'silver',
    perks: ['기본 AI 분석', '기본 카피 생성', '표준 TTS'],
  },
  silver: {
    label: '실버',
    emoji: '🥈',
    color: '#c0c0c0',
    minPoints: 500,
    nextTier: 'gold',
    perks: ['고급 카피 프롬프트', '변형 생성 2회 추가', '우선 처리 대기열'],
  },
  gold: {
    label: '골드',
    emoji: '🥇',
    color: '#ffd700',
    minPoints: 2000,
    nextTier: 'master',
    perks: ['프리미엄 AI 성우', '전용 템플릿 해금', '배치 TTS 5회'],
  },
  master: {
    label: '마스터',
    emoji: '👑',
    color: '#e8e8e8',
    minPoints: 5000,
    nextTier: null,
    perks: ['모든 기능 무제한', '독점 템플릿', 'VIP 처리 대기열', '맞춤형 AI 프롬프트'],
  },
};

export function calculateTierPoints(scans: number, clicks: number, revenue: number): number {
  return Math.floor(scans * 5 + clicks * 2 + revenue / 100);
}

export function determineTier(points: number): TierLevel {
  if (points >= 5000) return 'master';
  if (points >= 2000) return 'gold';
  if (points >= 500) return 'silver';
  return 'bronze';
}

export async function getOrCreateTier(): Promise<CreatorTier | null> {
  try {
    const { data: existing } = await supabase
      .from('creator_tier')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (existing) return existing as CreatorTier;

    const { data, error } = await supabase
      .from('creator_tier')
      .insert({ id: 1 })
      .select()
      .single();

    if (error || !data) return null;
    return data as CreatorTier;
  } catch {
    return null;
  }
}

export async function updateTierStats(
  scansDelta: number = 0,
  clicksDelta: number = 0,
  revenueDelta: number = 0,
): Promise<CreatorTier | null> {
  try {
    const tier = await getOrCreateTier();
    if (!tier) return null;

    const newScans = tier.total_scans + scansDelta;
    const newClicks = tier.total_clicks + clicksDelta;
    const newRevenue = tier.total_revenue + revenueDelta;
    const newPoints = calculateTierPoints(newScans, newClicks, newRevenue);
    const newLevel = determineTier(newPoints);

    const { data, error } = await supabase
      .from('creator_tier')
      .update({
        total_scans: newScans,
        total_clicks: newClicks,
        total_revenue: newRevenue,
        tier_points: newPoints,
        tier_level: newLevel,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select()
      .single();

    if (error || !data) return null;
    return data as CreatorTier;
  } catch {
    return null;
  }
}

export function getTierProgress(tier: CreatorTier): {
  current: number;
  next: number | null;
  percent: number;
  pointsToNext: number;
} {
  const config = TIER_CONFIG[tier.tier_level];
  if (!config.nextTier) {
    return { current: tier.tier_points, next: null, percent: 100, pointsToNext: 0 };
  }
  const nextConfig = TIER_CONFIG[config.nextTier];
  const range = nextConfig.minPoints - config.minPoints;
  const progress = tier.tier_points - config.minPoints;
  const percent = Math.min(100, Math.floor((progress / range) * 100));
  return {
    current: tier.tier_points,
    next: nextConfig.minPoints,
    percent,
    pointsToNext: Math.max(0, nextConfig.minPoints - tier.tier_points),
  };
}
