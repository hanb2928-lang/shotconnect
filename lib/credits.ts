import { supabase } from '@/lib/supabase';

export interface CreditBalance {
  balance: number;
  total_purchased: number;
  total_consumed: number;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  balance_after: number;
  type: 'purchase' | 'consumption' | 'refund' | 'bonus' | 'admin';
  description: string;
  feature: string | null;
  package_id: string | null;
  created_at: string;
}

export type CreditFeature =
  | 'photo_analysis'
  | 'multi_shot_analysis'
  | 'copy_generation'
  | 'comic_scenario'
  | 'review_generation'
  | 'tts_generation'
  | 'batch_tts'
  | 'variant_generation'
  | 'remove_bg'
  | 'ocr_extract'
  | 'viral_predict'
  | 'trend_match'
  | 'persona_simulator'
  | 'localize'
  | 'shortform_guide';

export const CREDIT_COSTS: Record<CreditFeature, number> = {
  photo_analysis: 1,
  multi_shot_analysis: 2,
  copy_generation: 1,
  comic_scenario: 2,
  review_generation: 1,
  tts_generation: 1,
  batch_tts: 3,
  variant_generation: 2,
  remove_bg: 2,
  ocr_extract: 1,
  viral_predict: 1,
  trend_match: 1,
  persona_simulator: 1,
  localize: 1,
  shortform_guide: 1,
};

export const CREDIT_PACKAGES = [
  { id: 'starter', name: '스타터 팩', credits: 50, price: 5900, badge: null as string | null },
  { id: 'pro', name: '프로 팩', credits: 120, price: 9900, badge: '인기' },
  { id: 'business', name: '비즈니스 팩', credits: 300, price: 19900, badge: '가성비' },
  { id: 'mega', name: '메가 팩', credits: 600, price: 39900, badge: '최대혜택' },
] as const;

export async function getCreditBalance(): Promise<CreditBalance> {
  const { data, error } = await supabase
    .from('credit_balance')
    .select('balance, total_purchased, total_consumed')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw new Error(`크레딧 잔액 조회 실패: ${error.message}`);
  if (!data) return { balance: 0, total_purchased: 0, total_consumed: 0 };
  return data as CreditBalance;
}

export async function getCreditHistory(limit: number = 20): Promise<CreditTransaction[]> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as CreditTransaction[];
}

export async function deductCredits(
  feature: CreditFeature,
  customAmount?: number,
): Promise<number> {
  const amount = customAmount ?? CREDIT_COSTS[feature];
  const { data, error } = await supabase.rpc('deduct_credits', {
    p_amount: amount,
    p_feature: feature,
    p_description: `${feature} 생성`,
  });

  if (error) {
    if (error.message.includes('INSUFFICIENT_CREDITS')) {
      throw new Error('크레딧이 부족합니다. 충전 후 이용해주세요.');
    }
    throw new Error(`크레딧 차감 실패: ${error.message}`);
  }
  if (data == null) throw new Error('크레딧 차감 실패: 응답이 없습니다.');
  return data;
}

export async function addCredits(
  amount: number,
  type: 'purchase' | 'bonus' | 'admin' = 'purchase',
  description: string = '',
  packageId?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('add_credits', {
    p_amount: amount,
    p_type: type,
    p_description: description,
    p_package_id: packageId ?? null,
  });

  if (error) {
    throw new Error(`크레딧 충전 실패: ${error.message}`);
  }
  return data as number;
}

export async function checkCredits(feature: CreditFeature): Promise<boolean> {
  try {
    const { balance } = await getCreditBalance();
    return balance >= CREDIT_COSTS[feature];
  } catch {
    return false;
  }
}

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}

export function formatCredits(amount: number): string {
  return `${amount.toLocaleString()} 크레딧`;
}
