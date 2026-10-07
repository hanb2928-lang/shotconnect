/**
 * Shared LLM result caching utility for edge functions.
 *
 * Uses the `ai_content_cache` table with 30-day TTL, matching the pattern
 * established in generate-copy. Functions build a cache key from their
 * input parameters, check the cache before calling OpenAI, and store
 * results on success.
 */

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function llmContentHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const len = input.length;
  const step = Math.max(1, Math.floor(len / 2048));
  for (let i = 0; i < len; i += step) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h2 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function buildCacheKey(taskType: string, input: Record<string, unknown>): string {
  return `${taskType}:${llmContentHash(JSON.stringify(input))}`;
}

export async function checkLlmCache(
  supabaseUrl: string,
  serviceRoleKey: string,
  cacheKey: string,
): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/ai_content_cache?select=result,hit_count&cache_key=eq.${encodeURIComponent(cacheKey)}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
    if (!resp.ok) return null;
    const rows = await resp.json() as Array<{ result: unknown; hit_count: number }>;
    if (!rows[0]?.result) return null;

    fetch(`${supabaseUrl}/rest/v1/ai_content_cache?cache_key=eq.${encodeURIComponent(cacheKey)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ hit_count: (rows[0].hit_count ?? 0) + 1, updated_at: new Date().toISOString() }),
    }).catch(() => {});

    return rows[0].result;
  } catch {
    return null;
  }
}

export async function storeLlmCache(
  supabaseUrl: string,
  serviceRoleKey: string,
  cacheKey: string,
  taskType: string,
  result: unknown,
  modelUsed: string,
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
    await fetch(`${supabaseUrl}/rest/v1/ai_content_cache`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        task_type: taskType,
        input_hash: cacheKey.split(':')[1] ?? '',
        result,
        model_used: modelUsed,
        expires_at: expiresAt,
      }),
    });
  } catch {
    // cache write failure is non-fatal
  }
}
