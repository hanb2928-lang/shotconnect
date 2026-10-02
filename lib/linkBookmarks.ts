import { supabase } from '@/lib/supabase';
import { safeSupabaseCall } from '@/lib/apiClient';
import { createShortLink } from '@/lib/shortUrl';
import type { LinkBookmark } from '@/types/database';

export async function fetchLinkBookmarks(): Promise<LinkBookmark[]> {
  return safeSupabaseCall<LinkBookmark[]>(
    async () => {
      const result = await supabase
        .from('link_bookmarks')
        .select('*')
        .order('created_at', { ascending: false });
      return result as unknown as { data: LinkBookmark[] | null; error: { message: string } | null };
    },
  ).catch(() => [] as LinkBookmark[]);
}

export async function addLinkBookmark(
  label: string,
  url: string,
  platform: string,
  scanId?: string,
): Promise<LinkBookmark | null> {
  const shortUrl = await createShortLink(url, scanId);

  const { data, error } = await supabase
    .from('link_bookmarks')
    .insert({
      label,
      url,
      platform,
      short_url: shortUrl,
      scan_id: scanId || null,
    })
    .select()
    .single();

  if (error) return null;
  return data as LinkBookmark;
}

export async function deleteLinkBookmark(id: string): Promise<void> {
  const { error } = await supabase.from('link_bookmarks').delete().eq('id', id);
  if (error) throw new Error(`삭제 실패: ${error.message}`);
}

export async function fetchShortLinkClicks(): Promise<
  { slug: string; destination_url: string; click_count: number; last_clicked_at: string | null }[]
> {
  return safeSupabaseCall<
    { slug: string; destination_url: string; click_count: number; last_clicked_at: string | null }[]
  >(
    async () => {
      const result = await supabase
        .from('short_links')
        .select('slug,destination_url,click_count,last_clicked_at')
        .order('click_count', { ascending: false })
        .limit(50);
      return result as unknown as { data: { slug: string; destination_url: string; click_count: number; last_clicked_at: string | null }[] | null; error: { message: string } | null };
    },
  ).catch(() => [] as { slug: string; destination_url: string; click_count: number; last_clicked_at: string | null }[]);
}
