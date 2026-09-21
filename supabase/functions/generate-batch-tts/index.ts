import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface BatchTTSItem {
  languageCode: string;
  text: string;
  voice: string;
  instructions?: string;
  speed?: number;
}

interface BatchTTSRequest {
  items: BatchTTSItem[];
  ttsApiKey?: string;
}

interface BatchTTSResult {
  languageCode: string;
  audioBase64: string;
  mimeType: string;
  duration: number;
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: BatchTTSRequest = await req.json();

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return new Response(
        JSON.stringify({ error: "items array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.items.length > 12) {
      return new Response(
        JSON.stringify({ error: "Maximum 12 TTS items per batch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = body.ttsApiKey?.trim() || await resolveOpenAIKey();
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured. TTS is unavailable." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const CONCURRENCY = 3;
    const results: BatchTTSResult[] = new Array(body.items.length);

    for (let i = 0; i < body.items.length; i += CONCURRENCY) {
      const batch = body.items.slice(i, i + CONCURRENCY);
      let batchResults: BatchTTSResult[];
      try {
        batchResults = await Promise.all(
          batch.map(async (item, idx): Promise<BatchTTSResult> => {
            const itemIndex = i + idx;
            try {
              const text = item.text.slice(0, 500);
              if (!text.trim()) {
                return { languageCode: item.languageCode, audioBase64: "", mimeType: "audio/mpeg", duration: 0, error: "Empty text" };
              }

              const baseSpeed = Math.min(Math.max(item.speed || 1.0, 0.5), 2.0);

              // Check content cache first
              const cacheKey = `generate-tts:${contentHashTts(`${text}|${item.voice}|${baseSpeed}|${item.instructions ?? ''}`)}`;
              const cached = await checkTtsCache(cacheKey);
              if (cached) {
                return {
                  languageCode: item.languageCode,
                  audioBase64: cached,
                  mimeType: "audio/mpeg",
                  duration: estimateDuration(text, baseSpeed),
                };
              }

              // Apply speed jitter for human-like variation (±0.08)
              const speedJitter = (Math.random() - 0.5) * 0.16;
              const speed = Math.min(Math.max(baseSpeed + speedJitter, 0.5), 2.0);

              const ttsBody: Record<string, unknown> = {
                model: "gpt-4o-mini-tts",
                input: text,
                voice: item.voice,
                speed: speed,
                response_format: "mp3",
              };
              if (item.instructions?.trim()) {
                ttsBody.instructions = item.instructions.trim();
              }

              const ttsResponse = await fetchTtsWithRetry(openaiKey, ttsBody);

              if (!ttsResponse.ok) {
                return { languageCode: item.languageCode, audioBase64: "", mimeType: "audio/mpeg", duration: 0, error: `TTS error: ${ttsResponse.status}` };
              }

              const audioBuffer = await ttsResponse.arrayBuffer();
              const bytes = new Uint8Array(audioBuffer);
              let binary = "";
              const chunk = 0x8000;
              for (let j = 0; j < bytes.length; j += chunk) {
                binary += String.fromCharCode(...bytes.subarray(j, j + chunk));
              }
              const base64Audio = btoa(binary);

              // Store in cache (fire-and-forget)
              storeTtsCache(cacheKey, base64Audio).catch(() => {});

              return {
                languageCode: item.languageCode,
                audioBase64: base64Audio,
                mimeType: "audio/mpeg",
                duration: estimateDuration(text, baseSpeed),
              };
            } catch (err) {
              const msg = err instanceof Error && err.name === 'AbortError'
                ? 'TTS timeout'
                : err instanceof Error ? err.message : "TTS generation failed";
              return {
                languageCode: item.languageCode,
                audioBase64: "",
                mimeType: "audio/mpeg",
                duration: 0,
                error: msg,
              };
            }
          }),
        );
      } catch {
        batchResults = batch.map((item) => ({
          languageCode: item.languageCode,
          audioBase64: "",
          mimeType: "audio/mpeg",
          duration: 0,
          error: "Batch processing error",
        }));
      }
      for (let k = 0; k < batchResults.length; k++) {
        results[i + k] = batchResults[k];
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Batch TTS failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function estimateDuration(text: string, speed: number): number {
  const charsPerSecond = 12 * speed;
  return Math.max(Math.ceil(text.length / charsPerSecond), 1);
}

async function resolveOpenAIKey(): Promise<string | null> {
  const serverKey = Deno.env.get("OPENAI_API_KEY");
  if (serverKey) return serverKey;

  if (supabaseUrl && serviceRoleKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/user_settings?select=openai_api_key&order=created_at.desc&limit=1`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);
      if (resp.ok) {
        const rows = await resp.json() as Array<{ openai_api_key: string | null }>;
        const dbKey = rows[0]?.openai_api_key;
        if (dbKey) return dbKey;
      }
    } catch {
      // no fallback beyond env
    }
  }
  return null;
}

async function fetchTtsWithRetry(
  openaiKey: string,
  ttsBody: Record<string, unknown>,
  maxRetries = 2,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const resp = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify(ttsBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.status === 429 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return resp;
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("TTS max retries exceeded");
}

function contentHashTts(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const len = input.length;
  for (let i = 0; i < len; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

async function checkTtsCache(cacheKey: string): Promise<string | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/ai_content_cache?select=result&cache_key=eq.${cacheKey}`,
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
    const rows = await resp.json() as Array<{ result: { audioBase64?: string } | null }>;
    if (!rows[0]?.result?.audioBase64) return null;
    return rows[0].result.audioBase64 as string;
  } catch {
    return null;
  }
}

async function storeTtsCache(cacheKey: string, audioBase64: string): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await fetch(`${supabaseUrl}/rest/v1/ai_content_cache`, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        task_type: 'generate-tts',
        input_hash: cacheKey.split(':')[1] ?? '',
        result: { audioBase64 },
        model_used: 'gpt-4o-mini-tts',
        expires_at: expiresAt,
      }),
    });
  } catch {
    // cache write failure is non-fatal
  }
}
