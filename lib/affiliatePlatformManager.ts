import { supabase } from '@/lib/supabase';
import type { AffiliatePlatformKey } from '@/components/AffiliatePlatformSwitch';

export interface AffiliatePlatformRecord {
  id: string;
  key: string;
  label: string;
  partners_id: string;
  tracking_param: string;
  tracking_url_template: string;
  color: string;
  is_enabled: boolean;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
}

export interface ManagedAffiliatePlatform extends AffiliatePlatformRecord {
  hasId: boolean;
}

function toManaged(ap: AffiliatePlatformRecord): ManagedAffiliatePlatform {
  return { ...ap, hasId: ap.partners_id.trim().length > 0 };
}

export async function fetchAffiliatePlatforms(): Promise<ManagedAffiliatePlatform[]> {
  const { data, error } = await supabase
    .from('affiliate_platforms')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data as AffiliatePlatformRecord[]).map(toManaged);
}

export async function fetchEnabledAffiliatePlatforms(): Promise<ManagedAffiliatePlatform[]> {
  const { data, error } = await supabase
    .from('affiliate_platforms')
    .select('*')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data as AffiliatePlatformRecord[]).map(toManaged);
}

export async function updateAffiliatePlatformId(id: string, partnersId: string): Promise<void> {
  const { error } = await supabase
    .from('affiliate_platforms')
    .update({ partners_id: partnersId })
    .eq('id', id);

  if (error) throw error;
}

export async function toggleAffiliatePlatformEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('affiliate_platforms')
    .update({ is_enabled: enabled })
    .eq('id', id);

  if (error) throw error;
}

export async function addCustomAffiliatePlatform(params: {
  label: string;
  partnersId: string;
  trackingParam: string;
  color?: string;
}): Promise<ManagedAffiliatePlatform> {
  const key = `custom_${Date.now()}`;
  const { data: maxRow } = await supabase
    .from('affiliate_platforms')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = (maxRow?.[0]?.sort_order ?? 6) + 1;

  const { data, error } = await supabase
    .from('affiliate_platforms')
    .insert({
      key,
      label: params.label,
      partners_id: params.partnersId,
      tracking_param: params.trackingParam,
      tracking_url_template: '',
      color: params.color ?? '#6366F1',
      is_enabled: true,
      is_builtin: false,
      sort_order: nextOrder,
    })
    .select('*')
    .single();

  if (error) throw error;
  return toManaged(data as AffiliatePlatformRecord);
}

export async function deleteCustomAffiliatePlatform(id: string): Promise<void> {
  const { error } = await supabase
    .from('affiliate_platforms')
    .delete()
    .eq('id', id)
    .eq('is_builtin', false);

  if (error) throw error;
}

/**
 * Inject tracking code into a product URL using a managed affiliate platform's config.
 * Returns the original URL if no injection is possible.
 */
export function injectTrackingCode(
  productUrl: string,
  platform: ManagedAffiliatePlatform,
): string {
  if (!platform.partners_id.trim()) return productUrl;
  if (!platform.tracking_param.trim()) return productUrl;

  const sep = productUrl.includes('?') ? '&' : '?';
  return `${productUrl}${sep}${platform.tracking_param}=${encodeURIComponent(platform.partners_id)}`;
}

/**
 * Generate a search-style affiliate link from a query string using the platform's URL template.
 * Returns empty string if the platform has no template or no partners_id.
 */
export function generateSearchAffiliateLink(
  query: string,
  platform: ManagedAffiliatePlatform,
): string {
  if (!platform.partners_id.trim() || !platform.tracking_url_template) return '';
  const encodedQuery = encodeURIComponent(query);
  return platform.tracking_url_template
    .replace('{QUERY}', encodedQuery)
    .replace('{ID}', encodeURIComponent(platform.partners_id));
}

/**
 * Match a product URL to a managed affiliate platform by key.
 */
export function findPlatformByUrl(
  productUrl: string,
  platforms: ManagedAffiliatePlatform[],
): ManagedAffiliatePlatform | null {
  const urlLower = productUrl.toLowerCase();
  const keyMap: Record<string, string[]> = {
    Coupang: ['coupang.com'],
    Toss: ['toss.to', 'toss.im'],
    BrandConnect: ['smartstore.naver.com', 'brand.naver.com', 'search.shopping.naver.com'],
    Amazon: ['amazon.com', 'amazon.co.uk', 'amazon.co.jp', 'amazon.de', 'amazon.fr'],
    AliExpress: ['aliexpress.com', 'aliexpress.kr'],
    Shopee: ['shopee.com', 'shopee.co'],
  };

  for (const platform of platforms) {
    if (!platform.is_enabled || !platform.hasId) continue;
    const patterns = keyMap[platform.key];
    if (patterns && patterns.some((p) => urlLower.includes(p))) {
      return platform;
    }
  }

  // Check custom platforms by key prefix match on the URL (custom platforms store their
  // own domain pattern in tracking_param — we skip that here and just return null for custom)
  return null;
}
