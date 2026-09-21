import { supabase } from '@/lib/supabase';
import type { RevenueRecord } from '@/types/database';

export async function addRevenueRecord(
  platform: string,
  amount: number,
  periodMonth: string,
  note?: string,
  scanId?: string,
): Promise<RevenueRecord | null> {
  const { data, error } = await supabase
    .from('revenue_records')
    .insert({
      platform,
      amount,
      period_month: periodMonth,
      note: note || null,
      scan_id: scanId || null,
    })
    .select()
    .single();

  if (error) throw new Error(`수익 기록 실패: ${error.message}`);
  return data as RevenueRecord;
}

export async function fetchRevenueRecords(limit = 50): Promise<RevenueRecord[]> {
  const { data, error } = await supabase
    .from('revenue_records')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as RevenueRecord[];
}

export async function deleteRevenueRecord(id: string): Promise<void> {
  const { error } = await supabase.from('revenue_records').delete().eq('id', id);
  if (error) throw new Error(`삭제 실패: ${error.message}`);
}
