import { supabase } from '@/lib/supabase';
import { getCached, setCached } from '@/lib/offlineCache';
import { hashObject } from '@/lib/contentHash';

const L1_TTL_MS = 5 * 60 * 1000;
const L2_TTL_DAYS = 30;
const L2_TTL_MS = L2_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface AiCacheEntry<T> {
  data: T;
  cached: boolean;
  source: 'l1' | 'l2' | 'miss';
}

export function buildCacheKey(taskType: string, inputHash: string): string {
  return `${taskType}:${inputHash}`;
}

async function getL1<T>(key: string): Promise<T | null> {
  return getCached<T>(`ai:${key}`);
}

async function setL1<T>(key: string, data: T): Promise<void> {
  await setCached(`ai:${key}`, data);
}

async function getL2<T>(cacheKey: string): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('ai_content_cache')
      .select('result, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (error || !data) return null;

    const expiresAt = new Date(data.expires_at as string).getTime();
    if (Date.now() > expiresAt) return null;

    supabase
      .from('ai_content_cache')
      .update({ hit_count: ((data as { hit_count?: number }).hit_count ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq('cache_key', cacheKey)
      .then(() => {}, () => {});

    return data.result as T;
  } catch {
    return null;
  }
}

async function setL2<T>(cacheKey: string, taskType: string, inputHash: string, result: T, modelUsed = 'unknown'): Promise<void> {
  try {
    await supabase
      .from('ai_content_cache')
      .upsert({
        cache_key: cacheKey,
        task_type: taskType,
        input_hash: inputHash,
        result: result as unknown as Record<string, unknown>,
        model_used: modelUsed,
        expires_at: new Date(Date.now() + L2_TTL_MS).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'cache_key' });
  } catch {
    // best-effort
  }
}

export async function aiCacheGet<T>(
  taskType: string,
  inputHash: string,
): Promise<AiCacheEntry<T> | null> {
  const key = buildCacheKey(taskType, inputHash);

  const l1 = await getL1<T>(key);
  if (l1) return { data: l1, cached: true, source: 'l1' };

  const l2 = await getL2<T>(key);
  if (l2) {
    await setL1(key, l2);
    return { data: l2, cached: true, source: 'l2' };
  }

  return null;
}

export async function aiCacheSet<T>(
  taskType: string,
  inputHash: string,
  data: T,
  modelUsed?: string,
): Promise<void> {
  const key = buildCacheKey(taskType, inputHash);
  await Promise.all([
    setL1(key, data),
    setL2(key, taskType, inputHash, data, modelUsed),
  ]);
}

export async function aiCachedCall<T>(
  taskType: string,
  input: Record<string, unknown>,
  fetcher: () => Promise<T>,
  modelUsed?: string,
): Promise<{ data: T; cached: boolean }> {
  const inputHash = hashObject(input);

  const cached = await aiCacheGet<T>(taskType, inputHash);
  if (cached) return { data: cached.data, cached: true };

  const fresh = await fetcher();
  if (fresh == null) {
    throw new Error('서버 응답이 비어 있습니다. 잠시 후 다시 시도해주세요.');
  }
  await aiCacheSet(taskType, inputHash, fresh, modelUsed);
  return { data: fresh, cached: false };
}

/**
 * Finds a cached result by task type whose input metadata matches a category/tone pattern.
 * This enables reusing AI results across different products in the same category without
 * waiting for a full AI call — the warm-cache fast path.
 */
export async function findSimilarCachedResult<T>(
  taskType: string,
  category: string,
  toneKeys: string[],
): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('ai_content_cache')
      .select('id, cache_key, result, expires_at, hit_count')
      .eq('task_type', taskType)
      .gte('expires_at', new Date().toISOString())
      .order('hit_count', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) return null;

    for (const row of data) {
      const result = row.result as Record<string, unknown>;
      const resultCategory = (result.productCategory as string) || '';
      if (resultCategory !== category) continue;

      const resultTone = (result.productMood as string) || (result.targetAudience as string) || '';
      if (toneKeys.length > 0 && !toneKeys.some((k) => resultTone.includes(k))) continue;

      // Bump hit count for the matched entry
      supabase
        .from('ai_content_cache')
        .update({ hit_count: ((row as { hit_count?: number }).hit_count ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', (row as { id: string }).id)
        .then(() => {}, () => {});

      // Promote to L1
      const cacheKey = (row as { cache_key: string }).cache_key;
      await setL1<T>(cacheKey, result as T);

      return result as T;
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Multi-angle analysis cache (ai_analysis_cache) ───

export interface MultiAngleCacheEntry {
  productContext: Record<string, unknown>;
  hookOptions: Record<string, unknown>;
  renderedVideoUrl: string;
}

/**
 * Checks the ai_analysis_cache table for a cached result matching the
 * given image hash + tone. Returns null on miss, error, or expiry.
 */
export async function getMultiAngleCache(
  imageHash: string,
  toneManner: string,
): Promise<MultiAngleCacheEntry | null> {
  try {
    const { data, error } = await supabase
      .from('ai_analysis_cache')
      .select('product_context, hook_options, rendered_video_url, expires_at')
      .eq('image_hash', imageHash)
      .eq('tone_manner', toneManner)
      .maybeSingle();

    if (error || !data) return null;

    const expiresAt = new Date(data.expires_at as string).getTime();
    if (Date.now() > expiresAt) return null;

    return {
      productContext: data.product_context as Record<string, unknown>,
      hookOptions: data.hook_options as Record<string, unknown>,
      renderedVideoUrl: data.rendered_video_url as string,
    };
  } catch {
    return null;
  }
}

/**
 * Stores a multi-angle analysis result in ai_analysis_cache.
 * Uses upsert on image_hash to handle re-captures of the same product.
 */
export async function setMultiAngleCache(
  imageHash: string,
  toneManner: string,
  productContext: Record<string, unknown>,
  hookOptions: Record<string, unknown>,
  renderedVideoUrl: string,
): Promise<void> {
  try {
    await supabase
      .from('ai_analysis_cache')
      .upsert({
        image_hash: imageHash,
        tone_manner: toneManner,
        product_context: productContext,
        hook_options: hookOptions,
        rendered_video_url: renderedVideoUrl,
        expires_at: new Date(Date.now() + L2_TTL_MS).toISOString(),
      }, { onConflict: 'image_hash' });
  } catch {
    // best-effort
  }
}

export { L1_TTL_MS, L2_TTL_DAYS };
