import { supabase } from '@/lib/supabase';
import { getStaleCached, setCached } from '@/lib/offlineCache';

export interface ArchiveItem {
  id: string;
  title: string;
  productName: string;
  productCategory: string;
  imageUrl: string;
  videoUrl: string;
  ttsUrl: string | null;
  oneLiner: string;
  createdAt: string;
}

export interface ArchiveListResponse {
  items: ArchiveItem[];
  total: number;
  hasMore: boolean;
}

export type ArchiveSort = 'recent' | 'oldest';

const PAGE_SIZE = 20;
const CACHE_KEY = 'archive_list';

export async function fetchArchiveList(
  page = 0,
  sort: ArchiveSort = 'recent',
): Promise<ArchiveListResponse> {
  const offset = page * PAGE_SIZE;

  const query = supabase
    .from('scans')
    .select(
      'id, title, product_name, product_category, image_url, video_url, tts_url, one_liner, created_at',
      { count: 'exact' },
    )
    .not('video_url', 'is', null)
    .order('created_at', { ascending: sort === 'oldest' })
    .range(offset, offset + PAGE_SIZE - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`보관함 조회 실패: ${error.message}`);

  const items: ArchiveItem[] = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? '',
    productName: row.product_name ?? '',
    productCategory: row.product_category ?? '',
    imageUrl: row.image_url,
    videoUrl: row.video_url ?? '',
    ttsUrl: row.tts_url ?? null,
    oneLiner: row.one_liner ?? '',
    createdAt: row.created_at,
  }));

  const total = count ?? items.length;
  const hasMore = offset + PAGE_SIZE < total;

  if (page === 0) {
    setCached(CACHE_KEY, { items, total, hasMore }).catch(() => {});
  }

  return { items, total, hasMore };
}

export async function fetchArchiveListCached(): Promise<ArchiveListResponse | null> {
  const stale = await getStaleCached<ArchiveListResponse>(CACHE_KEY);
  return stale ?? null;
}

export async function fetchArchiveItem(id: string): Promise<ArchiveItem | null> {
  const { data, error } = await supabase
    .from('scans')
    .select(
      'id, title, product_name, product_category, image_url, video_url, tts_url, one_liner, created_at',
    )
    .eq('id', id)
    .not('video_url', 'is', null)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    title: data.title ?? '',
    productName: data.product_name ?? '',
    productCategory: data.product_category ?? '',
    imageUrl: data.image_url,
    videoUrl: data.video_url ?? '',
    ttsUrl: data.tts_url ?? null,
    oneLiner: data.one_liner ?? '',
    createdAt: data.created_at,
  };
}
