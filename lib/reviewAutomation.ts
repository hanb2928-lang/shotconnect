import { supabase } from '@/lib/supabase';

export interface CustomerReview {
  id: string;
  reviewer_name: string | null;
  review_text: string;
  rating: number;
  table_number: string | null;
  store_photo_url: string | null;
  reel_asset_url: string | null;
  reel_status: 'pending' | 'rendering' | 'completed' | 'failed';
  is_published: boolean;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  low_stock_threshold: number;
  category: string | null;
  is_active: boolean;
  last_updated: string;
  price?: number | null;
  original_price?: number | null;
  is_today_menu?: boolean;
  is_closing_sale?: boolean;
  auto_shortform?: boolean;
}

export interface PushAlert {
  id: string;
  alert_type: 'low_stock' | 'breaktime' | 'closing_soon' | 'custom';
  title: string;
  body: string;
  hook_phrase: string | null;
  prompt_text: string | null;
  inventory_item_id: string | null;
  is_read: boolean;
  is_acted_on: boolean;
  triggered_at: string;
  read_at: string | null;
}

export interface InventoryAlertSettings {
  id: number;
  enabled: boolean;
  breaktime_start: string;
  breaktime_end: string;
  closing_hour: number;
  closing_alert_minutes: number;
  updated_at: string;
}

const SETTINGS_ID = 1;

// ─── Customer Reviews ───────────────────────────────────────────

export async function fetchReviews(): Promise<CustomerReview[]> {
  const { data, error } = await supabase
    .from('customer_reviews')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as CustomerReview[];
}

export async function createReview(
  review: Pick<CustomerReview, 'review_text'> & Partial<CustomerReview>,
): Promise<CustomerReview | null> {
  const { data, error } = await supabase
    .from('customer_reviews')
    .insert({
      review_text: review.review_text,
      reviewer_name: review.reviewer_name ?? null,
      rating: review.rating ?? 5,
      table_number: review.table_number ?? null,
      store_photo_url: review.store_photo_url ?? null,
    })
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as CustomerReview | null;
}

export async function updateReviewStatus(
  id: string,
  status: CustomerReview['reel_status'],
  reelAssetUrl?: string,
): Promise<void> {
  const updates: Record<string, unknown> = { reel_status: status };
  if (reelAssetUrl !== undefined) updates.reel_asset_url = reelAssetUrl;
  if (status === 'completed') updates.is_published = true;
  const { error } = await supabase
    .from('customer_reviews')
    .update(updates)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteReview(id: string): Promise<void> {
  const { error } = await supabase
    .from('customer_reviews')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Inventory Items ────────────────────────────────────────────

export async function fetchInventoryItems(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .order('created_at' as never, { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as InventoryItem[];
}

export async function createInventoryItem(
  item: Pick<InventoryItem, 'name'> & Partial<InventoryItem>,
): Promise<InventoryItem | null> {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      name: item.name,
      quantity: item.quantity ?? 0,
      unit: item.unit ?? '개',
      low_stock_threshold: item.low_stock_threshold ?? 3,
      category: item.category ?? null,
      is_active: true,
      last_updated: new Date().toISOString(),
    })
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as InventoryItem | null;
}

export async function updateInventoryItem(
  id: string,
  updates: Partial<InventoryItem>,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .update({ ...updates, last_updated: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Push Alerts ────────────────────────────────────────────────

export async function fetchUnreadAlerts(): Promise<PushAlert[]> {
  const { data, error } = await supabase
    .from('push_alerts')
    .select('*')
    .eq('is_read', false)
    .order('triggered_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as PushAlert[];
}

export async function fetchAllAlerts(limit = 50): Promise<PushAlert[]> {
  const { data, error } = await supabase
    .from('push_alerts')
    .select('*')
    .order('triggered_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as PushAlert[];
}

export async function markAlertRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('push_alerts')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markAlertActedOn(id: string): Promise<void> {
  const { error } = await supabase
    .from('push_alerts')
    .update({ is_acted_on: true, is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createPushAlert(
  alert: Partial<Omit<PushAlert, 'id' | 'is_read' | 'is_acted_on' | 'triggered_at' | 'read_at'>> & Pick<PushAlert, 'alert_type' | 'title' | 'body'>,
): Promise<PushAlert | null> {
  const { data, error } = await supabase
    .from('push_alerts')
    .insert(alert)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PushAlert | null;
}

// ─── Alert Settings ─────────────────────────────────────────────

export async function getAlertSettings(): Promise<InventoryAlertSettings | null> {
  const { data, error } = await supabase
    .from('inventory_alert_settings')
    .select('*')
    .eq('id', SETTINGS_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as InventoryAlertSettings | null;
}

export async function updateAlertSettings(
  updates: Partial<InventoryAlertSettings>,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_alert_settings')
    .upsert({
      id: SETTINGS_ID,
      ...updates,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

// ─── Alert Trigger Logic ────────────────────────────────────────

export function checkInventoryAlerts(items: InventoryItem[]): InventoryItem[] {
  return items.filter((item) => item.is_active && item.quantity <= item.low_stock_threshold);
}

export function isInBreaktime(
  now: Date,
  startHHmm: string,
  endHHmm: string,
): boolean {
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const [sH, sM] = startHHmm.split(':').map(Number);
  const [eH, eM] = endHHmm.split(':').map(Number);
  const startMin = sH * 60 + sM;
  const endMin = eH * 60 + eM;
  return currentMin >= startMin && currentMin <= endMin;
}

export function isClosingSoon(
  now: Date,
  closingHour: number,
  alertMinutes: number,
): boolean {
  const closingMin = closingHour * 60;
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const diff = closingMin - currentMin;
  return diff > 0 && diff <= alertMinutes;
}

export function buildLowStockAlert(item: InventoryItem): {
  alert_type: 'low_stock';
  title: string;
  body: string;
  hook_phrase: string;
  prompt_text: string;
  inventory_item_id: string;
} {
  return {
    alert_type: 'low_stock',
    title: `재고 부족: ${item.name}`,
    body: `사장님, ${item.name}이(가) ${item.quantity}${item.unit} 남았어요. [지금 마감 떨이 숏폼 뚝딱 발송하기] 버튼을 눌러보세요!`,
    hook_phrase: '마감 떨이',
    prompt_text: `${item.name} 마감 떨이! 남은 수량 ${item.quantity}${item.unit}, 선착순 특가`,
    inventory_item_id: item.id,
  };
}

export function buildBreaktimeAlert(settings: InventoryAlertSettings): {
  alert_type: 'breaktime';
  title: string;
  body: string;
  hook_phrase: string;
  prompt_text: string;
} {
  return {
    alert_type: 'breaktime',
    title: '브레이크타임 마케팅 타이밍!',
    body: `사장님, 지금 ${settings.breaktime_start}~${settings.breaktime_end} 브레이크타임이에요. 한가한 시간 틈새 고객 모집 숏폼을 발송해보세요!`,
    hook_phrase: '틈새 특가',
    prompt_text: `오후 브레이크타임 틈새 특가! 지금 방문하시면 서비스 증정`,
  };
}

export function buildClosingSoonAlert(settings: InventoryAlertSettings): {
  alert_type: 'closing_soon';
  title: string;
  body: string;
  hook_phrase: string;
  prompt_text: string;
} {
  return {
    alert_type: 'closing_soon',
    title: '마감 1시간 전!',
    body: `사장님, 마감 ${settings.closing_alert_minutes}분 전이에요. 남은 재고 마감 떨이 숏폼을 지금 발송하면 매출 올라갑니다!`,
    hook_phrase: '마감 떨이',
    prompt_text: `오늘 마감 ${settings.closing_alert_minutes}분 전! 남은 메뉴 마감 떨이 특가`,
  };
}
