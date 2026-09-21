import { supabase } from '@/lib/supabase';

export interface LinkInBioPage {
  id: string;
  slug: string;
  title: string;
  bio: string;
  scan_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LinkInBioProduct {
  scan_id: string;
  product_name: string;
  product_category: string;
  image_url: string;
  affiliate_url: string | null;
  short_url: string | null;
  price_estimate: string | null;
}

function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  for (let i = 0; i < 8; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)];
  }
  return slug;
}

export async function getOrCreateLinkInBio(): Promise<LinkInBioPage | null> {
  try {
    const { data: existing } = await supabase
      .from('link_in_bio')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return existing as LinkInBioPage;

    const slug = generateSlug();
    const { data, error } = await supabase
      .from('link_in_bio')
      .insert({ slug, title: '내 상품 모음', bio: '' })
      .select()
      .single();

    if (error || !data) return null;
    return data as LinkInBioPage;
  } catch {
    return null;
  }
}

export async function updateLinkInBio(
  id: string,
  updates: Partial<Pick<LinkInBioPage, 'title' | 'bio' | 'scan_ids'>>,
): Promise<LinkInBioPage | null> {
  try {
    const { data, error } = await supabase
      .from('link_in_bio')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return null;
    return data as LinkInBioPage;
  } catch {
    return null;
  }
}

export async function getLinkInBioBySlug(slug: string): Promise<LinkInBioPage | null> {
  try {
    const { data } = await supabase
      .from('link_in_bio')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    return data as LinkInBioPage | null;
  } catch {
    return null;
  }
}

export async function getProductsForLinkInBio(
  scanIds: string[],
): Promise<LinkInBioProduct[]> {
  if (scanIds.length === 0) return [];
  try {
    const { data } = await supabase
      .from('scans')
      .select('id, product_name, product_category, image_url, edited_image_url, custom_affiliate_links, short_url, price_estimate')
      .in('id', scanIds);

    if (!data) return [];
    return data.map((scan: any) => ({
      scan_id: scan.id,
      product_name: scan.product_name || '',
      product_category: scan.product_category || '',
      image_url: scan.edited_image_url || scan.image_url,
      affiliate_url: scan.custom_affiliate_links?.[0]?.url ?? null,
      short_url: scan.short_url ?? null,
      price_estimate: scan.price_estimate ?? null,
    }));
  } catch {
    return [];
  }
}

export function buildLinkInBioUrl(slug: string): string {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://snapconnect.app';
  return `${baseUrl}/bio/${slug}`;
}
