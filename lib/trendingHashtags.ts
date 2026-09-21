import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';
import { safeFetch } from './apiClient';
import { aiCachedCall } from './aiCache';

const TRENDING_URL = `${supabaseUrl}/functions/v1/naver-trending`;

interface MatchedHashtagsResult {
  hashtags: string[];
  category: string | null;
}

let cachedAllHashtags: string[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000;

export async function fetchMatchedTrendingHashtags(
  productCategory: string,
  tags: string[],
  productName: string,
): Promise<MatchedHashtagsResult> {
  const now = Date.now();
  if (!cachedAllHashtags || now - cacheTimestamp >= CACHE_TTL) {
    try {
      const resp = await safeFetch(`${TRENDING_URL}?hashtags=true`, {
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.allHashtags) {
          cachedAllHashtags = data.allHashtags as string[];
          cacheTimestamp = now;
        }
      }
    } catch {
      // use empty fallback
    }
  }

  const { data } = await aiCachedCall<MatchedHashtagsResult>(
    'trending-hashtags-match',
    { productCategory, tags: tags.join(','), productName },
    async () => {
      const params = new URLSearchParams();
      if (productCategory) params.set('productCategory', productCategory);
      if (tags && tags.length > 0) params.set('tags', tags.join(','));
      if (productName) params.set('productName', productName);

      try {
        const resp = await safeFetch(`${TRENDING_URL}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.hashtags && Array.isArray(data.hashtags)) {
            return { hashtags: data.hashtags, category: data.category || null };
          }
        }
      } catch {
        // fall through to cache
      }

      if (cachedAllHashtags && cachedAllHashtags.length > 0) {
        return { hashtags: cachedAllHashtags.slice(0, 10), category: null };
      }

      return { hashtags: [], category: null };
    },
    'naver-trending',
  );
  return data;
}

export function getTrendingSuggestions(
  trendingHashtags: string[],
  existingHashtags: string[],
  max: number = 8,
): string[] {
  const existingLower = new Set(existingHashtags.map((h) => h.toLowerCase()));
  return trendingHashtags
    .filter((h) => !existingLower.has(h.toLowerCase()))
    .slice(0, max);
}
