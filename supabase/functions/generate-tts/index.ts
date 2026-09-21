import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface TTSRequest {
  text: string;
  voice?: string;
  speed?: number;
  pitch?: number;
  instructions?: string;
  ttsApiKey?: string;
  viralProsodyInstructions?: string;
  targetDurationSec?: number;
  phaseSpeedOverrides?: Array<{ startSec: number; endSec: number; speed: number }>;
  // Human-level TTS parameters
  processedText?: string;
  sampleRateHz?: number;
  bitDepth?: number;
  silenceMarkers?: Array<{ position: number; durationMs: number; type: string }>;
  tempoCurvePoints?: Array<{ timeSec: number; speedMultiplier: number }>;
  audioPostProcessing?: {
    compressor?: { thresholdDb: number; ratio: number; attackMs: number; releaseMs: number; makeupGainDb: number };
    exciter?: { frequencyHz: number; driveDb: number; mix: number };
    highpassFilterHz?: number;
    deEsser?: { frequencyHz: number; thresholdDb: number; reductionDb: number };
  };
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
    const body: TTSRequest = await req.json();

    if (!body.text || body.text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Use processedText (with silence markers) if provided, otherwise raw text
    const rawText = body.text.slice(0, 800);
    const text = (body.processedText?.trim() || rawText).slice(0, 800);
    const voice = body.voice || "alloy";
    const baseSpeed = Math.min(Math.max(body.speed || 1.0, 0.5), 2.0);

    // Merge viral prosody instructions with base instructions
    const viralInstructions = body.viralProsodyInstructions?.trim() || undefined;
    const baseInstructions = body.instructions?.trim() || undefined;
    
    // Build human-level audio spec note for the model
    const hifiNote = body.sampleRateHz && body.bitDepth
      ? `Output audio at ${body.sampleRateHz / 1000}kHz / ${body.bitDepth}-bit fidelity. Ensure crystal-clear pronunciation with no sibilance or metallic artifacts.`
      : undefined;
    
    const instructions = [viralInstructions, baseInstructions, hifiNote].filter(Boolean).join('\n\n') || undefined;

    // Apply phase-specific speed overrides for time-boxing sync
    let effectiveSpeed = baseSpeed;
    if (body.targetDurationSec && body.phaseSpeedOverrides && body.phaseSpeedOverrides.length > 0) {
      const estimatedDurationSec = estimateDuration(rawText, baseSpeed);
      if (estimatedDurationSec > 0) {
        const speedAdjustment = body.targetDurationSec / estimatedDurationSec;
        effectiveSpeed = Math.min(Math.max(baseSpeed * speedAdjustment, 0.5), 2.0);
      }
    }

    // Apply tempo curve multiplier if provided (accelerando/ritardando)
    if (body.tempoCurvePoints && body.tempoCurvePoints.length > 0) {
      const avgMultiplier = body.tempoCurvePoints.reduce((sum, p) => sum + p.speedMultiplier, 0) / body.tempoCurvePoints.length;
      effectiveSpeed = Math.min(Math.max(effectiveSpeed * avgMultiplier, 0.5), 2.0);
    }

    // Human-like TTS variation: apply subtle speed jitter (±0.08)
    // to avoid identical audio waveforms across generations
    const speedJitter = (Math.random() - 0.5) * 0.16;
    const speed = Math.min(Math.max(effectiveSpeed + speedJitter, 0.5), 2.0);

    // Try ttsApiKey first, fall back to resolved OpenAI key from env/DB
    const primaryKey = body.ttsApiKey?.trim() || null;
    const fallbackKey = await resolveOpenAIKey();
    const openaiKey = primaryKey || fallbackKey;

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured. TTS is unavailable." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Content Cache: check for cached TTS by text+voice+speed hash ─────
    const cacheText = body.processedText?.trim() || rawText;
    const ttsCacheKey = `generate-tts:${contentHashTts(`${cacheText}|${voice}|${baseSpeed}|${body.pitch ?? 0}|${instructions ?? ''}`)}`;
    const cachedTts = await checkTtsCache(ttsCacheKey);
    if (cachedTts) {
      return new Response(
        JSON.stringify({
          audioBase64: cachedTts,
          mimeType: "audio/mpeg",
          duration: estimateDuration(text, baseSpeed),
          cached: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ttsBody: Record<string, unknown> = {
      model: "gpt-4o-mini-tts",
      input: text,
      voice: voice,
      speed: speed,
      response_format: "mp3",
    };
    if (instructions) {
      ttsBody.instructions = instructions;
    }

    // Try primary key; on auth failure, retry with fallback key
    const keysToTry = [openaiKey];
    if (primaryKey && fallbackKey && primaryKey !== fallbackKey) {
      keysToTry.push(fallbackKey);
    }

    let ttsResponse: Response | null = null;
    let lastErrorDetail = "";

    for (let i = 0; i < keysToTry.length; i++) {
      const tryKey = keysToTry[i];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tryKey}`,
          },
          body: JSON.stringify(ttsBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (ttsResponse.ok) break;

        const errText = await ttsResponse.text().catch(() => "");
        lastErrorDetail = `OpenAI TTS error: ${ttsResponse.status} — ${errText.slice(0, 300)}`;

        // Only retry with fallback on auth errors (401/403)
        if ((ttsResponse.status === 401 || ttsResponse.status === 403) && i < keysToTry.length - 1) {
          continue;
        }
        throw new Error(lastErrorDetail);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("TTS 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
        }
        if (i < keysToTry.length - 1 && !(err instanceof Error && err.message.includes("TTS error"))) {
          continue;
        }
        throw err;
      }
    }

    if (!ttsResponse || !ttsResponse.ok) {
      throw new Error(lastErrorDetail || "OpenAI TTS request failed");
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64Audio = btoa(binary);

    // Store in cache for future hits (fire-and-forget)
    storeTtsCache(ttsCacheKey, base64Audio).catch(() => {});

    // Include audio post-processing metadata in response for client-side rendering
    const audioMeta = body.audioPostProcessing || undefined;
    return new Response(
      JSON.stringify({
        audioBase64: base64Audio,
        mimeType: "audio/mpeg",
        duration: estimateDuration(rawText, baseSpeed),
        sampleRateHz: body.sampleRateHz ?? 44100,
        bitDepth: body.bitDepth ?? 24,
        silenceMarkers: body.silenceMarkers ?? [],
        tempoCurvePoints: body.tempoCurvePoints ?? [],
        audioPostProcessing: audioMeta,
        humanLevel: !!(body.processedText || body.silenceMarkers?.length),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError'
      ? 'TTS 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
      : err instanceof Error ? err.message : 'TTS generation failed';
    return new Response(
      JSON.stringify({ error: msg }),
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

// ─── TTS Content Cache helpers ──────────────────────────────────────────
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
    const rows = await resp.json() as Array<{ result: any }>;
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
      method: 'POST',
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
