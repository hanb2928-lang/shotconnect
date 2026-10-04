import { supabase } from '@/lib/supabase';
import { getStaleCached, setCached } from '@/lib/offlineCache';

export interface ArchiveItem {
  id: string;
  title: string;
  productName: string;
  productCategory: string;
  imageUrl: string;
  videoUrl: string;
  muxedVideoUrl: string | null;
  ttsUrl: string | null;
  oneLiner: string;
  motionTemplate: string | null;
  createdAt: string;
}

interface ArchiveRow {
  id: string;
  title: string | null;
  product_name: string | null;
  product_category: string | null;
  image_url: string;
  video_url: string | null;
  muxed_video_url: string | null;
  tts_url: string | null;
  one_liner: string | null;
  template_data: { motionTemplate?: string } | null;
  created_at: string;
}

function mapArchiveItem(row: ArchiveRow): ArchiveItem {
  return {
    id: row.id,
    title: row.title ?? '',
    productName: row.product_name ?? '',
    productCategory: row.product_category ?? '',
    imageUrl: row.image_url,
    videoUrl: row.muxed_video_url || row.video_url || '',
    muxedVideoUrl: row.muxed_video_url ?? null,
    ttsUrl: row.tts_url ?? null,
    oneLiner: row.one_liner ?? '',
    motionTemplate: row.template_data?.motionTemplate ?? null,
    createdAt: row.created_at,
  };
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
      'id, title, product_name, product_category, image_url, video_url, muxed_video_url, tts_url, one_liner, template_data, created_at',
      { count: 'exact' },
    )
    .not('video_url', 'is', null)
    .order('created_at', { ascending: sort === 'oldest' })
    .range(offset, offset + PAGE_SIZE - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`보관함 조회 실패: ${error.message}`);

  const items: ArchiveItem[] = (data ?? []).map((row) => mapArchiveItem(row as ArchiveRow));

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
      'id, title, product_name, product_category, image_url, video_url, muxed_video_url, tts_url, one_liner, template_data, created_at',
    )
    .eq('id', id)
    .not('video_url', 'is', null)
    .maybeSingle();

  if (error || !data) return null;

  return mapArchiveItem(data as ArchiveRow);
}
