import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { safeFetch, friendlyApiError } from '@/lib/apiClient';
import { aiCachedCall } from '@/lib/aiCache';

export interface StockVideoClip {
  id: number;
  duration: number;
  width: number;
  height: number;
  previewUrl: string;
  thumbnailUrl: string;
  videoUrl: string;
  author: string;
  ratio: string;
  mediaType?: "video" | "image";
}

interface SearchResponse {
  clips: StockVideoClip[];
  totalResults: number;
}

const SEARCH_URL = `${supabaseUrl}/functions/v1/search-pexels-videos`;

export async function searchStockVideos(
  query: string,
  orientation: 'portrait' | 'landscape' | 'square' = 'portrait',
  perPage = 10,
  mediaType: "video" | "image" = "video",
): Promise<StockVideoClip[]> {
  const { data } = await aiCachedCall<StockVideoClip[]>(
    'pexels-search',
    { query, orientation, perPage, mediaType },
    async () => {
      try {
        const resp = await safeFetch(SEARCH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ query, orientation, perPage, mediaType }),
          timeoutMs: 20000,
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({ error: '영상 검색에 실패했습니다.' }));
          throw new Error(errData.error || `검색 실패 (${resp.status})`);
        }
        const data = (await resp.json()) as SearchResponse;
        if (!data.clips || !Array.isArray(data.clips)) {
          return [];
        }
        return data.clips;
      } catch (err) {
        throw new Error(friendlyApiError(err, '영상 검색 중 오류가 발생했습니다.'));
      }
    },
    'pexels-api',
  );
  return data;
}
