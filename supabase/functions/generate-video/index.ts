import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
function safeWaitUntil(p: Promise<unknown>): void {
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
}

interface ProductVisionData {
  productName: string;
  productCategory: string;
  visualFeatures: string[];
  marketingPoints: string[];
  textureDescription: string;
  colorPalette: string[];
  shapeDescription: string;
  materialGuess: string;
  keyAngles: { angle: string; description: string }[];
  orbitalFocusPoint: string;
  parallaxDepthLayers: string[];
  suggestedCopyLayers: { primary: string; secondary: string; tertiary: string };
}

interface GenerateVideoRequest {
  mode?: "submit" | "poll" | "webhook";
  taskId?: string;
  prompt?: string;
  runwayPrompt?: string;
  durationSec?: number;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  productName?: string;
  scanId?: string;
  variationSeed?: number;
  bgmMood?: string;
  captionText?: string;
  platform?: string;
  hookCategory?: string;
  cutCount?: number;
  productVision?: ProductVisionData | null;
  draft?: boolean;
  isCleanVideoMode?: boolean;
  promptStrength?: number;
  negativePrompt?: string;
  bgStyle?: string;
  outfitIntensity?: number;
  zoomSpeed?: number;
  cameraRotation?: number;
  transitionEffect?: string;
  hdUpscale?: boolean;
  qualityTier?: 'standard' | 'pro';
  resolution?: string;
  fps?: number;
  stylePreset?: string;
  detailRestoration?: boolean;
  durationSec?: number;
  isDraft?: boolean;
  selectedMode?: 'auto_3d' | 'universal_synthesis' | 'manual';
  enableOrbit360?: boolean;
  enableCaustics?: boolean;
  enableVirtualFitting?: boolean;
  enableFabricPhysics?: boolean;
  orbitSpeed?: number;
  mainImageUrl?: string;
  modelImageUrl?: string;
  memeFormat?: string;
  memeText?: string;
  idempotencyKey?: string;
  // webhook fields (sent by Runway callback)
  status?: string;
  output?: string[] | { url?: string } | string;
  failure?: string;
  error?: string;
}

const MAX_RETRIES = 3; // Max retry attempts for transient API errors (4 total attempts)
const RETRY_INITIAL_DELAY_MS = 1500; // Base delay for first retry, doubled each attempt
const RUNWAY_SUBMIT_TIMEOUT_MS = 45000;
const RUNWAY_POLL_TIMEOUT_MS = 10000;
const EDGE_WALL_CLOCK_BUDGET_MS = 120000;
const ZOMBIE_JOB_TIMEOUT_MS = 300000; // 5 min — give HD videos enough room to finish
const SERVER_POLL_MAX_ATTEMPTS = 60; // ~5 min of polling at 5s avg — aligned with 300s zombie timeout
const SERVER_POLL_INITIAL_DELAY_MS = 1500;
const SERVER_POLL_MAX_DELAY_MS = 4000;
const SERVER_POLL_SELF_INVOKE_TIMEOUT_MS = 10000; // AbortController timeout for self-reinvocation fetch
const JITTER_MAX_MS = 1000; // Random jitter added to each backoff delay to desynchronize concurrent polls
const FIRST_POLL_BUFFER_MS = 500; // Grace period before first Runway poll — runway_task_id propagates within ~0.5s
const DRAFT_POLL_INITIAL_DELAY_MS = 1000; // Drafts render faster — poll more aggressively in pre-rendering phases
const VIDEO_DAILY_LIMIT = 10; // Max AI video generations per IP per day

const VIDEO_UNKNOWN_PATTERNS = [
  /알\s*수\s*없/gi,
  /알수없/gi,
  /unknown/gi,
  /미확인/gi,
  /미상/gi,
  /unidentified/gi,
  /not\s*identified/gi,
];
const VIDEO_FALLBACK_PRODUCT_NAME = "지금 가장 핫한 추천 아이템";
const VIDEO_FALLBACK_CAPTION = "시선 집중! 지금 바로 확인하세요";
const VIDEO_FALLBACK_COPY_LAYERS = {
  primary: "시선 집중! 하이엔드 럭셔리 컬렉션",
  secondary: "내 몸에 완벽하게 감기는 핏",
  tertiary: "지금 바로 확인하세요",
};

function sanitizeCopyLayers(layers: { primary: string; secondary: string; tertiary: string }): { primary: string; secondary: string; tertiary: string } {
  const sanitize = (val: string, fallback: string) => {
    const trimmed = (val || "").trim();
    if (!trimmed) return fallback;
    for (const pattern of VIDEO_UNKNOWN_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(trimmed)) return fallback;
    }
    return trimmed;
  };
  return {
    primary: sanitize(layers.primary, VIDEO_FALLBACK_COPY_LAYERS.primary),
    secondary: sanitize(layers.secondary, VIDEO_FALLBACK_COPY_LAYERS.secondary),
    tertiary: sanitize(layers.tertiary, VIDEO_FALLBACK_COPY_LAYERS.tertiary),
  };
}

function sanitizeVideoProductName(name: string | undefined): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return VIDEO_FALLBACK_PRODUCT_NAME;
  for (const pattern of VIDEO_UNKNOWN_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(trimmed)) {
      return VIDEO_FALLBACK_PRODUCT_NAME;
    }
  }
  return trimmed;
}

function sanitizeVideoText(text: string | undefined): string {
  if (!text || !text.trim()) return "";
  let result = text;
  for (const pattern of VIDEO_UNKNOWN_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, VIDEO_FALLBACK_CAPTION);
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const queryMode = url.searchParams.get("mode");

    let body: GenerateVideoRequest;
    if (queryMode === "webhook") {
      const webhookSecret = Deno.env.get("RUNWAY_WEBHOOK_SECRET") ?? "";
      const providedSecret = url.searchParams.get("secret") ?? "";
      if (!webhookSecret || providedSecret.length !== webhookSecret.length) {
        return new Response(
          JSON.stringify({ error: "웹훅 서명 검증에 실패했습니다." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Constant-time comparison to prevent timing attacks on the webhook secret.
      let secretMatch = 0;
      for (let i = 0; i < webhookSecret.length; i++) {
        secretMatch |= providedSecret.charCodeAt(i) ^ webhookSecret.charCodeAt(i);
      }
      if (secretMatch !== 0) {
        return new Response(
          JSON.stringify({ error: "웹훅 서명 검증에 실패했습니다." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      body = {
        mode: "webhook",
        taskId: url.searchParams.get("taskId") ?? undefined,
        scanId: url.searchParams.get("scanId") ?? undefined,
      };
      const contentType = req.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          const jsonBody = await req.json();
          body.status = jsonBody.status;
          body.output = jsonBody.output;
          body.failure = jsonBody.failure;
          body.error = jsonBody.error;
          // Runway sends its own task ID in the callback body. Extract it
          // so handleWebhook can look up the job by runway_task_id even when
          // the URL query params don't include taskId.
          if (!body.taskId) {
            body.taskId = jsonBody.taskId ?? jsonBody.id ?? jsonBody.task_id ?? undefined;
          }
        } catch {
          // Runway may send form-encoded or empty body
        }
      }
      return await handleWebhook(body);
    }

    body = await req.json();
    const mode = body.mode ?? "submit";

    // Validate required fields per mode
    const validModes = ["submit", "poll", "server-poll", "webhook", "warmup"];
    if (!validModes.includes(mode)) {
      return new Response(
        JSON.stringify({ error: `지원하지 않는 모드입니다: ${mode}`, step: "validation", provider: "unknown" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "warmup") {
      return new Response(
        JSON.stringify({ status: "warm", message: "Edge function ready" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "submit") {
      // At least one of prompt, scanId, productName, or productVision must be present
      const hasAnyContext = body.prompt || body.scanId || body.productName || body.productVision;
      // warmup mode already returned above; submit requires context
      if (!hasAnyContext) {
        return new Response(
          JSON.stringify({ error: "prompt, scanId, productName 중 하나 이상은 필수입니다.", step: "validation", provider: "unknown" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Rate limit: max VIDEO_DAILY_LIMIT submissions per IP per day
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      const rateLimitOk = await checkRateLimit(clientIp);
      if (!rateLimitOk) {
        return new Response(
          JSON.stringify({
            error: `일일 AI 비디오 생성 한도(${VIDEO_DAILY_LIMIT}회)를 초과했습니다. 내일 다시 이용해주세요.`,
            step: "rate_limit",
            provider: "none",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // poll and server-poll need the Runway key to poll the Runway API
    if (mode === "poll" || mode === "server-poll") {
      const runwayKey = await resolveRunwayKey();
      if (!runwayKey) {
        return new Response(
          JSON.stringify({
            error: "AI 비디오 생성을 위한 Runway API 키가 설정되지 않았습니다. 설정에서 Runway API 키를 등록해주세요.",
            step: "key_resolution",
            provider: "none",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (mode === "poll") return await handlePoll(body, runwayKey);
      return await handleServerPoll(body, runwayKey);
    }

    return await handleSubmit(body);
  } catch (err) {
    console.error("[generate-video] Unhandled error:", err);
    return new Response(
      JSON.stringify({
        error: "비디오 생성 중 오류가 발생했습니다.",
        step: "unhandled",
        provider: "unknown",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function handleSubmit(body: GenerateVideoRequest): Promise<Response> {
  const modeTokens = buildModeRenderingTokens(body.selectedMode, body.enableOrbit360, body.enableCaustics, body.enableVirtualFitting, body.enableFabricPhysics, typeof body.orbitSpeed === 'number' ? body.orbitSpeed : undefined);
  console.log("[generate-video] Submit:", JSON.stringify({
    scanId: body.scanId,
    selectedMode: body.selectedMode ?? 'none',
    durationSec: body.durationSec,
    hasMainImageUrl: !!body.mainImageUrl,
    tokens: modeTokens.length,
    hasIdempotencyKey: !!body.idempotencyKey,
  }));

  // Idempotency: if the client sent an idempotency key, check for an existing
  // non-terminal job with the same key. If found, return its taskId instead
  // of creating a duplicate — this prevents wasted Runway API calls when the
  // client retries after a network drop (e.g. entering a tunnel).
  if (body.idempotencyKey) {
    const existing = await findJobByIdempotencyKey(body.idempotencyKey);
    if (existing) {
      console.log(`[generate-video] Idempotency hit: returning existing job ${existing.taskId} for key ${body.idempotencyKey}`);
      return new Response(
        JSON.stringify({
          mode: "submit",
          taskId: existing.taskId,
          provider: "runway",
          status: existing.status,
          idempotent: true,
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  const isDraft = body.draft === true;
  const requestedDuration = Math.min(Math.max(Math.round(body.durationSec ?? 5), 2), 30);
  // Drafts cap at 5s — shorter clips render in roughly half the time on Runway.
  const durationSec = isDraft ? Math.min(requestedDuration, 5) : requestedDuration;

  const sanitizedProductName = sanitizeVideoProductName(body.productName);
  const sanitizedCaptionText = sanitizeVideoText(body.captionText);

  const sanitizedMemeText = sanitizeVideoText(body.memeText);

  let effectivePrompt = body.prompt ?? "";
  if (effectivePrompt.trim().length === 0) {
    effectivePrompt = buildAutoPrompt(sanitizedProductName, body.productVision, sanitizedCaptionText, body.isCleanVideoMode === true, requestedDuration, body.enableOrbit360 === true, typeof body.orbitSpeed === 'number' ? body.orbitSpeed : undefined, body.enableFabricPhysics === true, body.memeFormat, sanitizedMemeText, body.selectedMode, body.enableVirtualFitting === true);
  }
  const aspectRatio = body.aspectRatio ?? "9:16";
  const variationSeed = body.variationSeed ?? 0;

  const hdUpscale = body.hdUpscale === true;
  // Drafts always render at 720p/24fps regardless of HD settings — the HD
  // upgrade stage handles the high-res pass. This cuts draft render time
  // roughly in half so users see a result much sooner.
  const effectiveHd = isDraft ? false : hdUpscale;
  const qualityTier = effectiveHd ? 'pro' : (body.qualityTier ?? 'standard');
  const resolution = isDraft ? '720p' : (body.resolution ?? (hdUpscale ? '1080p' : '720p'));
  const fps = isDraft ? 24 : (body.fps ?? (hdUpscale ? 30 : 24));

  // Generate internal job ID immediately — no waiting for Runway API
  const internalJobId = crypto.randomUUID();

  // Save PENDING row to DB immediately. The idempotency_key is included
  // so the unique index prevents a racing duplicate INSERT from creating
  // a second job — the caught error triggers a re-query for the first row.
  if (body.scanId) {
    const saved = await saveVideoJob(body.scanId, internalJobId, isDraft, hdUpscale, body.idempotencyKey, undefined, aspectRatio, durationSec, fps);
    if (!saved) {
      if (body.idempotencyKey) {
        const existing = await findJobByIdempotencyKey(body.idempotencyKey);
        if (existing) {
          console.log(`[generate-video] Idempotency race: INSERT failed, returning existing job ${existing.taskId}`);
          return new Response(
            JSON.stringify({ mode: "submit", taskId: existing.taskId, provider: "runway", status: existing.status, idempotent: true }),
            { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
      console.error("[generate-video] saveVideoJob failed — cannot proceed without a DB job row");
      return new Response(
        JSON.stringify({ error: "영상 생성 작업 저장에 실패했습니다. 잠시 후 다시 시도해주세요.", step: "planning", provider: "runway" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  const runwayPrompt = buildCompactRunwayPrompt({
    userPrompt: effectivePrompt,
    productName: sanitizedProductName,
    aspectRatio,
    variationSeed,
    bgmMood: body.bgmMood,
    captionText: sanitizedCaptionText,
    platform: body.platform ?? "shorts",
    hookCategory: body.hookCategory ?? "curiosity",
    productVision: body.productVision ?? null,
    isCleanVideoMode: body.isCleanVideoMode === true,
    promptStrength: body.promptStrength,
    negativePrompt: body.negativePrompt,
    bgStyle: body.bgStyle,
    outfitIntensity: body.outfitIntensity,
    zoomSpeed: body.zoomSpeed,
    cameraRotation: body.cameraRotation,
    transitionEffect: body.transitionEffect,
    qualityTier,
    resolution,
    fps,
    selectedMode: body.selectedMode,
    enableOrbit360: body.enableOrbit360,
    orbitSpeed: typeof body.orbitSpeed === 'number' && body.orbitSpeed > 0 ? body.orbitSpeed : undefined,
    enableCaustics: body.enableCaustics,
    enableVirtualFitting: body.enableVirtualFitting,
    enableFabricPhysics: body.enableFabricPhysics,
    isDraft,
    memeFormat: body.memeFormat,
    memeText: sanitizedMemeText,
  });
  console.log("[generate-video] Prompt length:", runwayPrompt.length, "| tokens:", modeTokens.length);

  // Store the built prompt on the job row so the server can auto-submit
  // the HD upgrade without the client being present (Fire & Forget).
  if (body.scanId && supabaseUrl && serviceRoleKey) {
    try {
      const pc = new AbortController();
      const pt = setTimeout(() => pc.abort(), 5000);
      await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(body.scanId)}&task_id=eq.${encodeURIComponent(internalJobId)}`, {
        method: "PATCH",
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ runway_prompt: runwayPrompt }),
        signal: pc.signal,
      });
      clearTimeout(pt);
    } catch { /* non-fatal — HD auto-submit will skip if prompt is missing */ }
  }

  // Directly call Runway API in the background using safeWaitUntil —
  // eliminates the HTTP self-invoke round-trip that added 1-3s latency.
  if (supabaseUrl && serviceRoleKey) {
    const runwayKey = await resolveRunwayKey();
    if (runwayKey) {
      safeWaitUntil((async () => {
        try {
          await updateVideoJobStep(body.scanId, internalJobId, "submitting");

          const webhookSecret = Deno.env.get("RUNWAY_WEBHOOK_SECRET") ?? "";
          const webhookBase = `${supabaseUrl}/functions/v1/generate-video?mode=webhook`;
          const webhookParams = webhookSecret ? `&secret=${encodeURIComponent(webhookSecret)}` : ``;
          const webhookUrl = `${webhookBase}&scanId=${encodeURIComponent(body.scanId)}${webhookParams}`;

          let promptImage: string | null = body.mainImageUrl ?? null;
          if (!promptImage) {
            promptImage = await fetchScanImageUrl(body.scanId);
          }
          // For universal_synthesis + virtual fitting, the model image is
          // essential — Runway needs it to map the garment onto the person.
          // Without it, the render silently produces an empty/irrelevant clip.
          const modelImage = body.enableVirtualFitting === true ? (body.modelImageUrl ?? null) : null;

          const runwayTaskId = await submitWithRetry(
            () => submitRunwayTask(runwayPrompt, runwayKey, aspectRatio, durationSec, isDraft, webhookUrl, body.scanId, promptImage, isDraft ? false : hdUpscale, resolution, fps, modelImage),
            MAX_RETRIES,
          );

          await updateRunwayTaskId(body.scanId, internalJobId, runwayTaskId);
          console.log(`[generate-video] inline submit: Runway task ${runwayTaskId} saved for job ${internalJobId}`);

          // Kick off server-poll via self-invoke (one hop, not two)
          const selfUrl = `${supabaseUrl}/functions/v1/generate-video`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), SERVER_POLL_SELF_INVOKE_TIMEOUT_MS);
          await fetch(selfUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
            body: JSON.stringify({ mode: "server-poll", taskId: runwayTaskId, scanId: body.scanId, variationSeed: 0, isDraft }),
            signal: controller.signal,
          }).then(() => clearTimeout(timeoutId)).catch(() => clearTimeout(timeoutId));
        } catch (err) {
          console.error("[generate-video] inline runway submit failed:", err);
          if (body.scanId) {
            await markVideoJobFailed(body.scanId, internalJobId, err instanceof Error ? err.message : "Runway API 호출에 실패했습니다.");
          }
        }
      })());
    } else {
      console.error("[generate-video] No Runway API key available");
      if (body.scanId) {
        await markVideoJobFailed(body.scanId, internalJobId, "Runway API 키가 설정되지 않았습니다.");
      }
    }
  }

  // Return HTTP 202 Accepted immediately — client polls via Realtime/poll mode
  return new Response(
    JSON.stringify({
      mode: "submit",
      taskId: internalJobId,
      provider: "runway",
      motionPrompt: runwayPrompt,
      durationSec,
      aspectRatio,
      variationSeed,
      draft: isDraft,
      status: "PENDING",
      step: "planning",
    }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function handlePoll(body: GenerateVideoRequest, runwayKey: string): Promise<Response> {
  const taskId = body.taskId;
  if (!taskId) {
    return new Response(
      JSON.stringify({ error: "폴링 모드에서는 taskId가 필요합니다.", step: "poll", provider: "runway" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (body.scanId) {
    // Skip the scans-table lookup in early phases — the webhook cannot
    // have fired before the job reaches at least "rendering". This saves
    // one DB round-trip per poll cycle during submitting/queued.
    const jobStatus = await checkVideoJobStatus(body.scanId, taskId);
    const earlyPhase = !jobStatus || jobStatus.step === "planning" || jobStatus.step === "submitting" || jobStatus.step === "pending";
    const cached = earlyPhase ? null : await checkWebhookResult(body.scanId);
    if (cached) {
      return new Response(
        JSON.stringify({
          mode: "poll",
          status: "SUCCESS",
          videoUrl: cached,
          taskId,
          provider: "runway",
          persisted: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (jobStatus?.status === "FAILED") {
      return new Response(
        JSON.stringify({
          mode: "poll",
          status: "FAILED",
          step: jobStatus.step ?? "failed",
          error: jobStatus.error ?? "Runway 비디오 생성에 실패했습니다.",
          taskId,
          provider: "runway",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Idempotency: if the job is already SUCCESS in DB, return immediately
    // without polling Runway again. This prevents redundant API calls from
    // repeated client polls after completion.
    if (jobStatus?.status === "SUCCESS" && jobStatus.videoUrl) {
      return new Response(
        JSON.stringify({
          mode: "poll",
          status: "SUCCESS",
          step: jobStatus.step ?? "completed",
          videoUrl: jobStatus.videoUrl,
          taskId,
          provider: "runway",
          persisted: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // The client starts with the internal job ID. Until the async submission
    // stores the real Runway task ID, there is no external task to poll.
    // Try a fallback: look up the latest job by scanId — the runway_task_id
    // may have been persisted under a different internal job ID (e.g. after
    // a retry or idempotency hit).
    if (!jobStatus || !jobStatus.runwayTaskId) {
      const fallbackJob = await findLatestJobByScanId(body.scanId);
      if (fallbackJob?.runwayTaskId && fallbackJob.status !== "SUCCESS" && fallbackJob.status !== "FAILED") {
        // Found the runway task ID via scan_id fallback — use it
        const pollStatus = await pollRunwayTask(fallbackJob.runwayTaskId, runwayKey);
        if (pollStatus.status === "SUCCESS" && pollStatus.videoUrl) {
          const originalUrl = pollStatus.videoUrl;
          const finalUrl = await persistVideoInBackground(originalUrl, body.scanId, fallbackJob.internalJobId ?? taskId);
          return new Response(
            JSON.stringify({
              mode: "poll",
              status: "SUCCESS",
              step: "completed",
              videoUrl: finalUrl,
              taskId,
              provider: "runway",
              persisted: true,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (pollStatus.status === "FAILED") {
          if (supabaseUrl && serviceRoleKey) {
            await markVideoJobFailed(body.scanId, fallbackJob.internalJobId ?? taskId, pollStatus.error ?? "Runway 생성 실패");
          }
          return new Response(
            JSON.stringify({
              mode: "poll",
              status: "FAILED",
              step: "failed",
              error: pollStatus.error ?? "Runway 비디오 생성에 실패했습니다.",
              taskId,
              provider: "runway",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const runwayStep = RUNWAY_STATUS_TO_STEP[pollStatus.status] ?? "rendering";
        return new Response(
          JSON.stringify({
            mode: "poll",
            status: pollStatus.status,
            step: runwayStep,
            progress: pollStatus.progress ?? "",
            taskId,
            provider: "runway",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Also check if the fallback job is already complete
      if (fallbackJob?.status === "SUCCESS" && fallbackJob.videoUrl) {
        return new Response(
          JSON.stringify({
            mode: "poll",
            status: "SUCCESS",
            step: "completed",
            videoUrl: fallbackJob.videoUrl,
            taskId,
            provider: "runway",
            persisted: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          mode: "poll",
          status: "PROCESSING",
          step: jobStatus?.step ?? fallbackJob?.step ?? "submitting",
          progress: "Runway 작업 등록 중...",
          taskId,
          provider: "runway",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const runwayTaskId = jobStatus.runwayTaskId;

    const pollStatus = await pollRunwayTask(runwayTaskId, runwayKey);

    if (pollStatus.status === "SUCCESS" && pollStatus.videoUrl) {
      const originalUrl = pollStatus.videoUrl;
      const finalUrl = await persistVideoInBackground(originalUrl, body.scanId, taskId);
      return new Response(
        JSON.stringify({
          mode: "poll",
          status: "SUCCESS",
          step: "completed",
          videoUrl: finalUrl,
          taskId,
          provider: "runway",
          persisted: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (pollStatus.status === "FAILED") {
      if (supabaseUrl && serviceRoleKey) {
        await markVideoJobFailed(body.scanId, taskId, pollStatus.error ?? "Runway 생성 실패");
      }
      return new Response(
        JSON.stringify({
          mode: "poll",
          status: "FAILED",
          step: "failed",
          error: pollStatus.error ?? "Runway 비디오 생성에 실패했습니다.",
          taskId,
          provider: "runway",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const runwayStep = RUNWAY_STATUS_TO_STEP[pollStatus.status] ?? "rendering";
    await updateVideoJobStep(body.scanId, taskId, runwayStep);
    return new Response(
      JSON.stringify({
        mode: "poll",
        status: pollStatus.status,
        step: runwayStep,
        progress: pollStatus.progress ?? "",
        taskId,
        provider: "runway",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // scanId is required for poll mode — without it we cannot look up the
  // runway_task_id from the DB, and polling Runway with the raw internal
  // UUID produces spurious 404s.
  return new Response(
    JSON.stringify({ error: "폴링 모드에서는 scanId가 필요합니다.", step: "poll", provider: "runway" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// === Runway API ===

async function handleServerPoll(body: GenerateVideoRequest, runwayKey: string): Promise<Response> {
  const taskId = body.taskId;
  const scanId = body.scanId;
  const attempt = body.variationSeed ?? 0; // reuse field as poll attempt counter

  if (!taskId || !scanId) {
    return new Response(
      JSON.stringify({ error: "server-poll 모드에서는 taskId와 scanId가 필요합니다." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Check if the job was already completed by a webhook.
  // Skip this lookup in early phases — the webhook cannot have fired
  // before the job reaches at least "rendering".
  const earlyJobInfo = await findJobByRunwayTaskId(scanId, taskId);
  const earlyPhase = !earlyJobInfo || earlyJobInfo.status === "PENDING";
  const cached = earlyPhase ? null : await checkWebhookResult(scanId);
  if (cached) {
    return new Response(
      JSON.stringify({ mode: "server-poll", status: "SUCCESS", videoUrl: cached, taskId, persisted: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Reuse the earlyJobInfo lookup from above to avoid a redundant DB query.
  // If that column was not persisted, recover the internal ID by scan_id.
  const resolvedJob = earlyJobInfo ?? await findLatestJobByScanId(scanId);
  if (resolvedJob?.status === "FAILED") {
    return new Response(
      JSON.stringify({ mode: "server-poll", status: "FAILED", error: resolvedJob.error, taskId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (resolvedJob?.status === "SUCCESS" && resolvedJob.videoUrl) {
    return new Response(
      JSON.stringify({ mode: "server-poll", status: "SUCCESS", videoUrl: resolvedJob.videoUrl, taskId, persisted: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const internalJobId = resolvedJob?.internalJobId ?? taskId;

  // Hard gate: never poll Runway unless the real runway_task_id has been
  // persisted to the DB. Without this, a transient DB lookup failure could
  // substitute the internal UUID for the Runway task ID, producing 404s.
  if (!resolvedJob?.runwayTaskId) {
    if (attempt >= SERVER_POLL_MAX_ATTEMPTS) {
      await markVideoJobFailed(scanId, internalJobId, "Runway 작업 ID가 저장되지 않아 폴링을 시작할 수 없습니다. 다시 시도해주세요.");
      return new Response(
        JSON.stringify({ mode: "server-poll", status: "FAILED", error: "Runway 작업 ID 미저장", taskId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // Reschedule with buffer delay to give runway-submit time to persist the ID.
    // Includes retry-on-failure so a cold-start abort doesn't permanently break the chain.
    const runwayIdWaitDelay = 4000;
    const rescheduleSelfInvoke = (retryNum: number, resolveOuter?: () => void) => {
      if (retryNum >= 3) {
        console.error(`[generate-video] server-poll runway-task-id wait exhausted retries for task ${taskId}`);
        resolveOuter?.();
        return;
      }
      setTimeout(() => {
        const selfUrl = `${supabaseUrl}/functions/v1/generate-video`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => { controller.abort(); resolveOuter?.(); }, SERVER_POLL_SELF_INVOKE_TIMEOUT_MS);
        fetch(selfUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
          body: JSON.stringify({ mode: "server-poll", taskId, scanId, variationSeed: attempt + 1 }),
          signal: controller.signal,
        }).then(() => {
          clearTimeout(timeoutId);
          resolveOuter?.();
        }).catch(() => {
          clearTimeout(timeoutId);
          const retryDelay = 5000 * Math.pow(2, retryNum);
          console.log(`[generate-video] server-poll runway-id-wait retry ${retryNum + 1}/3 in ${retryDelay}ms`);
          rescheduleSelfInvoke(retryNum + 1, resolveOuter);
        });
      }, runwayIdWaitDelay);
    };
    safeWaitUntil(new Promise<void>((resolve) => rescheduleSelfInvoke(0, resolve)));
    return new Response(
      JSON.stringify({ mode: "server-poll", status: "PROCESSING", progress: "Runway 작업 ID 대기 중...", taskId, nextPollInMs: runwayIdWaitDelay, attempt: attempt + 1 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (attempt >= SERVER_POLL_MAX_ATTEMPTS) {
    await markVideoJobFailed(scanId, internalJobId, "서버 폴링이 최대 횟수에 도달했습니다. 좀비 작업으로 분류됩니다.");
    return new Response(
      JSON.stringify({ mode: "server-poll", status: "FAILED", error: "서버 폴링 한도 초과", taskId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Poll Runway once — use the validated runway_task_id from the DB, not the raw taskId
  const status = await pollRunwayTask(resolvedJob.runwayTaskId, runwayKey);

  if (status.status === "SUCCESS" && status.videoUrl) {
    // Check if the webhook already completed this job — skip redundant work
    const existing = await findJobByRunwayTaskId(scanId, taskId);
    if (existing?.status === "SUCCESS" && existing.videoUrl) {
      return new Response(
        JSON.stringify({ mode: "server-poll", status: "SUCCESS", videoUrl: existing.videoUrl, taskId, persisted: true, alreadyCompleted: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const originalUrl = status.videoUrl;
    const finalUrl = await persistVideoInBackground(originalUrl, scanId, internalJobId);
    await sendVideoCompletePush(scanId);
    // Auto-submit HD upgrade if the job was marked as HD and no HD task exists yet.
    // This runs in the background so the server-poll response is not delayed.
    safeWaitUntil(autoSubmitHdIfNeeded(scanId, internalJobId));
    return new Response(
      JSON.stringify({
        mode: "server-poll",
        status: "SUCCESS",
        videoUrl: finalUrl,
        taskId,
        persisted: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (status.status === "FAILED") {
    if (supabaseUrl && serviceRoleKey) {
      await markVideoJobFailed(scanId, internalJobId, status.error ?? "Runway 생성 실패");
    }
    return new Response(
      JSON.stringify({ mode: "server-poll", status: "FAILED", error: status.error, taskId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Still PROCESSING — update the step field so the frontend's
  // Realtime subscription can map it to the correct UI progress step.
  const runwayStep = RUNWAY_STATUS_TO_STEP[status.status] ?? "rendering";
  await updateVideoJobStep(scanId, internalJobId, runwayStep);

  // === SINGLE-SOURCE POLLING ARCHITECTURE ===
  // Once the job reaches "rendering" (85%+), STOP the server-poll self-
  // reinvocation chain. The client's DB-scan polling loop takes over as
  // the sole completion detector. This eliminates the ping-pong where
  // both server and client race to update the same DB row, causing
  // bridge saturation and the 97% stall.
  //
  // The server still does ONE final poll per invocation (the
  // pollRunwayTask call above) so the webhook or a one-shot server-poll
  // can still catch completion — but it no longer chains indefinitely.
  // The zombie guard (ZOMBIE_JOB_TIMEOUT_MS) remains as the safety net.
  const isRendering = runwayStep === "rendering";

  if (isRendering) {
    // Continue server-poll at reduced frequency (every 15s) instead of
    // halting completely. The client's DB poll is the primary completion
    // detector, but the server-poll acts as a critical backup — especially
    // on native where Realtime events can be dropped during the foreground
    // flush window. Without this backup, a broken webhook + dropped Realtime
    // event leaves the job stuck at 97% indefinitely.
    const RENDER_POLL_DELAY_MS = 5_000;
    const RENDER_POLL_ABORT_MS = RENDER_POLL_DELAY_MS + SERVER_POLL_SELF_INVOKE_TIMEOUT_MS;
    console.log(`[generate-video] server-poll: job ${taskId} reached rendering — continuing at reduced frequency (${RENDER_POLL_DELAY_MS}ms)`);

    const selfUrl = `${supabaseUrl}/functions/v1/generate-video`;
    safeWaitUntil(new Promise<void>((resolve) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => { controller.abort(); resolve(); }, RENDER_POLL_ABORT_MS);
      setTimeout(() => {
        fetch(selfUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
          body: JSON.stringify({
            mode: "server-poll",
            taskId,
            scanId,
            variationSeed: attempt,
          }),
          signal: controller.signal,
        }).then(() => { clearTimeout(timeoutId); resolve(); }).catch(() => { clearTimeout(timeoutId); resolve(); });
      }, RENDER_POLL_DELAY_MS);
    }));

    return new Response(
      JSON.stringify({
        mode: "server-poll",
        status: "PROCESSING",
        progress: status.progress ?? "",
        step: runwayStep,
        taskId,
        serverPollHalted: false,
        message: "서버 폴링 지속 (저주기) — 렌더링 단계",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Pre-rendering phases (submitting, queued, throttled): continue the
  // self-reinvocation chain to push the job through to rendering.
  // Drafts render at 480p/12fps — use a shorter base delay to detect
  // completion faster.
  const draftBase = body.isDraft === true || body.draft === true;
  const pollBaseDelay = draftBase ? DRAFT_POLL_INITIAL_DELAY_MS : SERVER_POLL_INITIAL_DELAY_MS;
  const pollMaxDelay = draftBase ? Math.min(SERVER_POLL_MAX_DELAY_MS, 3000) : SERVER_POLL_MAX_DELAY_MS;
  const baseDelay = Math.min(pollBaseDelay * Math.pow(1.5, attempt), pollMaxDelay);
  const jitter = Math.random() * JITTER_MAX_MS;
  const nextDelay = Math.round(baseDelay + jitter);
  const nextAttempt = attempt + 1;

  const selfInvokeWithRetry = (attemptNum: number, retryNum: number, resolveOuter?: () => void) => {
    if (retryNum >= 3) {
      console.error(`[generate-video] server-poll self-invoke exhausted retries for task ${taskId} — zombie guard will catch it`);
      resolveOuter?.();
      return;
    }
    const selfUrl = `${supabaseUrl}/functions/v1/generate-video`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => { controller.abort(); resolveOuter?.(); }, SERVER_POLL_SELF_INVOKE_TIMEOUT_MS);
    fetch(selfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        mode: "server-poll",
        taskId,
        scanId,
        variationSeed: attemptNum,
        isDraft: draftBase,
      }),
      signal: controller.signal,
    }).then(() => {
      clearTimeout(timeoutId);
      resolveOuter?.();
    }).catch(() => {
      clearTimeout(timeoutId);
      const retryDelay = 5000 * Math.pow(2, retryNum);
      console.log(`[generate-video] server-poll self-invoke retry ${retryNum + 1}/3 in ${retryDelay}ms for task ${taskId}`);
      setTimeout(() => selfInvokeWithRetry(attemptNum, retryNum + 1, resolveOuter), retryDelay);
    });
  };
  safeWaitUntil(new Promise<void>((resolve) => setTimeout(() => selfInvokeWithRetry(nextAttempt, 0, resolve), nextDelay)));

  return new Response(
    JSON.stringify({
      mode: "server-poll",
      status: "PROCESSING",
      progress: status.progress ?? "",
      taskId,
      nextPollInMs: nextDelay,
      attempt: nextAttempt,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function handleWebhook(body: GenerateVideoRequest): Promise<Response> {
  const taskId = body.taskId;
  const scanId = body.scanId;

  console.log("[generate-video] Webhook received:", JSON.stringify({
    taskId,
    scanId,
    status: body.status,
  }));

  if (!scanId) {
    return new Response(
      JSON.stringify({ error: "webhook 처리에 scanId가 필요합니다." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // If taskId is missing, try to find the job by scanId. The webhook URL
  // includes scanId, and Runway sends its task ID in the body. We look up
  // the latest non-terminal job for this scan and use its runway_task_id.
  if (!taskId) {
    const fallbackJob = await findLatestJobByScanId(scanId);
    if (fallbackJob?.runwayTaskId) {
      body.taskId = fallbackJob.runwayTaskId;
    } else if (fallbackJob?.internalJobId) {
      body.taskId = fallbackJob.internalJobId;
    }
  }

  const status = body.status ?? "";

  if (status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED") {
    let videoUrl: string | undefined;
    if (Array.isArray(body.output)) {
      videoUrl = body.output[0];
    } else if (typeof body.output === "string") {
      videoUrl = body.output;
    } else if (body.output && typeof body.output === "object" && body.output.url) {
      videoUrl = body.output.url;
    }

    if (!videoUrl) {
      console.error("[generate-video] Webhook: no videoUrl in output");
      return new Response(
        JSON.stringify({ error: "webhook: 비디오 URL이 없습니다." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check if server-poll already completed this job — look up by runway_task_id
    const existing = await findJobByRunwayTaskId(scanId, taskId);
    const fallbackJob = existing ?? await findLatestJobByScanId(scanId);
    if (fallbackJob?.status === "SUCCESS" && fallbackJob.videoUrl) {
      console.log("[generate-video] Webhook: job already completed by server-poll, skipping");
      return new Response(
        JSON.stringify({ mode: "webhook", status: "SUCCESS", scanId, persisted: true, alreadyCompleted: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const internalJobId = fallbackJob?.internalJobId ?? taskId;

    const finalUrl = await persistVideoInBackground(videoUrl, scanId, internalJobId);
    await sendVideoCompletePush(scanId);
    // Auto-submit HD upgrade if needed — server-side, no client required.
    safeWaitUntil(autoSubmitHdIfNeeded(scanId, internalJobId));

    console.log("[generate-video] Webhook: video persisted for scan", scanId);
    return new Response(
      JSON.stringify({ mode: "webhook", status: "SUCCESS", scanId, persisted: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (status === "FAILED" || status === "CANCELED") {
    const errMsg = body.failure ?? body.error ?? "Runway 생성 실패";
    if (supabaseUrl && serviceRoleKey) {
      const jobInfo = await findJobByRunwayTaskId(scanId, taskId);
      const fallbackJob = jobInfo ?? await findLatestJobByScanId(scanId);
      const internalJobId = fallbackJob?.internalJobId ?? taskId;
      await markVideoJobFailed(scanId, internalJobId, errMsg);
    }
    return new Response(
      JSON.stringify({ mode: "webhook", status: "FAILED", error: errMsg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ mode: "webhook", status }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function checkVideoJobStatus(scanId: string, taskId: string): Promise<{ status: string; step?: string; error?: string; videoUrl?: string; runwayTaskId?: string } | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&task_id=eq.${encodeURIComponent(taskId)}&select=status,step,error_message,video_url,created_at,runway_task_id`,
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
      const rows = await resp.json() as Array<{ status: string; error_message: string | null; video_url: string | null; created_at: string; runway_task_id: string | null }>;
      if (rows.length > 0) {
        const row = rows[0];
        const isZombie = (row.status === 'PENDING' || row.status === 'PROCESSING' || row.status === 'RUNNING' || row.status === 'THROTTLED')
          && Date.now() - new Date(row.created_at).getTime() > ZOMBIE_JOB_TIMEOUT_MS;
        if (isZombie) {
          await markVideoJobFailed(scanId, taskId, '영상 생성이 4분 이상 진행 중 상태로 멈춰 있어 좀비 작업으로 분류되었습니다. 다시 시도해주세요.');
          return { status: 'FAILED', error: '영상 생성 작업이 시간 초과로 실패했습니다. 다시 시도해주세요.' };
        }
        return {
          status: row.status,
          step: (row as { step?: string }).step ?? undefined,
          error: row.error_message ?? undefined,
          videoUrl: row.video_url ?? undefined,
          runwayTaskId: row.runway_task_id ?? undefined,
        };
      }
    }
  } catch (err) {
    console.error('[generate-video] checkVideoJobStatus error:', err);
  }
  return null;
}

async function checkWebhookResult(scanId: string): Promise<string | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/scans?select=video_url,muxed_video_url&id=eq.${encodeURIComponent(scanId)}`,
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
      const rows = await resp.json() as Array<{ video_url: string | null; muxed_video_url: string | null }>;
      const finalUrl = rows[0]?.video_url ?? rows[0]?.muxed_video_url;
      if (finalUrl) {
        return finalUrl;
      }
    }
  } catch (err) {
    console.error('[generate-video] checkWebhookResult error:', err);
  }
  return null;
}

async function saveVideoJob(scanId: string, taskId: string, isDraft: boolean, isHd: boolean, idempotencyKey?: string, runwayPrompt?: string, aspectRatio?: string, durationSec?: number, fps?: number): Promise<boolean> {
  if (!supabaseUrl || !serviceRoleKey) return false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const row: Record<string, unknown> = {
      scan_id: scanId,
      task_id: taskId,
      status: "PENDING",
      step: "planning",
      progress: 0.25,
      is_draft: isDraft,
      is_hd: isHd,
    };
    if (idempotencyKey) row.idempotency_key = idempotencyKey;
    if (runwayPrompt) row.runway_prompt = runwayPrompt;
    if (aspectRatio) row.aspect_ratio = aspectRatio;
    if (typeof durationSec === 'number') row.duration_sec = durationSec;
    if (typeof fps === 'number') row.fps = fps;
    const resp = await fetch(`${supabaseUrl}/rest/v1/video_jobs`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error('[generate-video] saveVideoJob INSERT failed:', resp.status, errBody.slice(0, 500));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[generate-video] saveVideoJob error:', err);
    return false;
  }
}

async function updateRunwayTaskId(scanId: string, internalJobId: string, runwayTaskId: string): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&task_id=eq.${encodeURIComponent(internalJobId)}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ runway_task_id: runwayTaskId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err) {
    console.error('[generate-video] updateRunwayTaskId error:', err);
  }
}

async function findJobByIdempotencyKey(idempotencyKey: string): Promise<{ taskId: string; status: string } | null> {
  if (!idempotencyKey?.trim()) return null;
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/video_jobs?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=task_id,status&limit=1`,
      {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
    if (!resp.ok) return null;
    const rows = await resp.json() as Array<{ task_id: string; status: string }>;
    if (rows.length === 0) return null;
    return { taskId: rows[0].task_id, status: rows[0].status };
  } catch (err) {
    console.error('[generate-video] findJobByIdempotencyKey error:', err);
    return null;
  }
}

async function findLatestJobByScanId(scanId: string): Promise<{ status: string; error?: string; videoUrl?: string; internalJobId?: string; runwayTaskId?: string; step?: string } | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&select=status,error_message,video_url,task_id,runway_task_id,step,created_at&order=created_at.desc&limit=1`,
      {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
    if (!resp.ok) return null;
    const rows = await resp.json() as Array<{ status: string; error_message: string | null; video_url: string | null; task_id: string; runway_task_id: string | null; step?: string }>;
    const row = rows[0];
    if (!row) return null;
    return {
      status: row.status,
      error: row.error_message ?? undefined,
      videoUrl: row.video_url ?? undefined,
      internalJobId: row.task_id,
      runwayTaskId: row.runway_task_id ?? undefined,
      step: (row as { step?: string }).step ?? undefined,
    };
  } catch (err) {
    console.error('[generate-video] findLatestJobByScanId error:', err);
    return null;
  }
}

async function findJobByRunwayTaskId(scanId: string, runwayTaskId: string): Promise<{ status: string; error?: string; videoUrl?: string; internalJobId?: string } | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&runway_task_id=eq.${encodeURIComponent(runwayTaskId)}&select=status,error_message,video_url,task_id,runway_task_id,created_at`,
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
      const rows = await resp.json() as Array<{ status: string; error_message: string | null; video_url: string | null; task_id: string; runway_task_id: string | null; created_at: string }>;
      if (rows.length > 0) {
        const row = rows[0];
        const isZombie = (row.status === 'PENDING' || row.status === 'PROCESSING' || row.status === 'RUNNING' || row.status === 'THROTTLED')
          && Date.now() - new Date(row.created_at).getTime() > ZOMBIE_JOB_TIMEOUT_MS;
        if (isZombie) {
          await markVideoJobFailed(scanId, row.task_id, '영상 생성이 4분 이상 진행 중 상태로 멈춰 있어 좀비 작업으로 분류되었습니다. 다시 시도해주세요.');
          return { status: 'FAILED', error: '영상 생성 작업이 시간 초과로 실패했습니다. 다시 시도해주세요.' };
        }
        return {
          status: row.status,
          error: row.error_message ?? undefined,
          videoUrl: row.video_url ?? undefined,
          internalJobId: row.task_id,
          runwayTaskId: row.runway_task_id ?? undefined,
        };
      }
    }
  } catch (err) {
    console.error('[generate-video] findJobByRunwayTaskId error:', err);
  }
  return null;
}

async function persistVideoInBackground(originalUrl: string, scanId: string, taskId: string): Promise<string> {
  if (!supabaseUrl || !serviceRoleKey) return originalUrl;
  try {
    // Write the original Runway URL to scans + mark the job SUCCESS
    // atomically. The video_jobs PATCH uses status=not.in.(SUCCESS,FAILED)
    // so it transitions the job from PROCESSING → SUCCESS in one shot —
    // the client's DB poll detects completion immediately. Previously the
    // job was left in PROCESSING with a separate markVideoJobComplete call
    // later, creating a 93→100% gap where the client sat at 95% waiting.
    await Promise.all([
      updateScanWithVideo(scanId, originalUrl),
      (async () => {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 5000);
        try {
          await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&task_id=eq.${encodeURIComponent(taskId)}&status=not.in.(SUCCESS,FAILED)`, {
            method: "PATCH",
            headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ status: "SUCCESS", step: "completed", video_url: originalUrl, progress: 1.0, completed_at: new Date().toISOString() }),
            signal: c.signal,
          });
        } finally { clearTimeout(t); }
      })(),
    ]);

    // Background: upload to storage and replace the URL. If this fails,
    // the original Runway URL remains playable — the user sees no delay.
    safeWaitUntil((async () => {
      // Atomically claim the upload slot: transition step to "uploading"
      // only if the job is in non-terminal state. If another caller
      // (webhook or server-poll) already claimed it, skip to avoid
      // redundant download/upload bandwidth.
      const claimController = new AbortController();
      const claimTimeout = setTimeout(() => claimController.abort(), 5000);
      let claimed = false;
      try {
        const claimResp = await fetch(
          `${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&task_id=eq.${encodeURIComponent(taskId)}&status=eq.SUCCESS&step=neq.uploading`,
          {
            method: "PATCH",
            headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify({ step: "uploading" }),
            signal: claimController.signal,
          },
        );
        clearTimeout(claimTimeout);
        if (claimResp.ok) {
          const rows = await claimResp.json() as Array<unknown>;
          claimed = rows.length > 0;
        }
      } catch {
        clearTimeout(claimTimeout);
      }
      if (!claimed) {
        console.log(`[generate-video] persistVideoInBackground: upload already claimed by another caller for ${scanId}`);
        return;
      }

      // Attempt upload with one retry. Runway URLs expire after ~24h,
      // so a single retry significantly improves persistence success rate.
      let persistedUrl: string | null = null;
      for (let uploadAttempt = 0; uploadAttempt <= 1; uploadAttempt++) {
        persistedUrl = await uploadToStorage(originalUrl, scanId);
        if (persistedUrl && persistedUrl !== originalUrl) break;
        if (uploadAttempt === 0) {
          console.log(`[generate-video] Storage upload failed, retrying in 5s for ${scanId}`);
          await delay(5000);
        }
      }
      if (!persistedUrl || persistedUrl === originalUrl) {
        console.warn(`[generate-video] Storage upload failed after retry for ${scanId} — original Runway URL remains`);
        return;
      }
      await updateScanWithVideo(scanId, persistedUrl);
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 10000);
      try {
        await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&task_id=eq.${encodeURIComponent(taskId)}&status=eq.SUCCESS`, {
          method: "PATCH",
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ video_url: persistedUrl, step: "completed" }),
          signal: c.signal,
        });
      } finally { clearTimeout(t); }
    })());

    return originalUrl;
  } catch (err) {
    console.error('[generate-video] persistVideoInBackground error:', err);
    return originalUrl;
  }
}

async function markVideoJobFailed(scanId: string, taskId: string, errMsg: string): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    // Atomic transition: only PATCH if the job is NOT already in a terminal state.
    // Prevents a late failure from overwriting a successful completion.
    const resp = await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&task_id=eq.${encodeURIComponent(taskId)}&status=not.in.(SUCCESS,FAILED)&select=is_draft,is_hd`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status: "FAILED", step: "failed", error_message: errMsg.slice(0, 500) }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    // If the PATCH affected a row, refund credits server-side.
    // The client may have navigated away (Fire & Forget) and won't be
    // present to issue the refund.
    if (resp.ok) {
      const rows = await resp.json() as Array<{ is_draft: boolean; is_hd: boolean }>;
      if (rows.length > 0) {
        const row = rows[0];
        const amount = row.is_hd ? 10 : (row.is_draft ? 3 : 10);
        const feature = row.is_hd ? 'video_hd' : (row.is_draft ? 'video_draft' : 'video_hd');
        await refundCreditsServer(amount, feature);
      }
    }
  } catch (err) {
    console.error('[generate-video] markVideoJobFailed error:', err);
  }
}

async function refundCreditsServer(amount: number, feature: string): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    await fetch(`${supabaseUrl}/rest/v1/rpc/add_credits`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_amount: amount,
        p_type: 'refund',
        p_description: `서버 자동 환불 — ${feature} 생성 실패`,
        p_package_id: null,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    console.log(`[generate-video] Server-side credit refund: ${amount} credits for ${feature}`);
  } catch (err) {
    console.error('[generate-video] refundCreditsServer error:', err);
  }
}

async function autoSubmitHdIfNeeded(scanId: string, internalJobId: string): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    // Fetch the job row to check if HD is needed and not yet started.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&task_id=eq.${encodeURIComponent(internalJobId)}&select=is_hd,hd_task_id,runway_prompt,aspect_ratio,duration_sec,fps,is_draft`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }, signal: controller.signal },
    );
    clearTimeout(timeoutId);
    if (!resp.ok) return;
    const rows = await resp.json() as Array<{ is_hd: boolean; hd_task_id: string | null; runway_prompt: string | null; aspect_ratio: string | null; duration_sec: number | null; fps: number | null; is_draft: boolean }>;
    if (rows.length === 0) return;
    const job = rows[0];
    // Only auto-submit HD if: the job was marked as HD, the draft actually
    // completed (is_draft = true means this was the draft pass), and no HD
    // task has been started yet.
    if (!job.is_hd || job.hd_task_id || !job.runway_prompt) return;

    console.log(`[generate-video] Auto-submitting HD upgrade for scan ${scanId}`);
    const runwayKey = await resolveRunwayKey();
    if (!runwayKey) {
      console.error('[generate-video] No Runway key for HD auto-submit');
      return;
    }

    const hdAspect = job.aspect_ratio ?? '9:16';
    const hdDuration = job.duration_sec ?? 5;
    const hdFps = job.fps ?? 30;
    const hdResolution = '1080p';

    let promptImage: string | null = await fetchScanImageUrl(scanId);

    const webhookSecret = Deno.env.get("RUNWAY_WEBHOOK_SECRET") ?? "";
    const webhookBase = `${supabaseUrl}/functions/v1/generate-video?mode=webhook`;
    const webhookParams = webhookSecret ? `&secret=${encodeURIComponent(webhookSecret)}` : ``;
    const webhookUrl = `${webhookBase}&scanId=${encodeURIComponent(scanId)}${webhookParams}`;

    const hdTaskId = await submitWithRetry(
      () => submitRunwayTask(job.runway_prompt!, runwayKey, hdAspect, hdDuration, false, webhookUrl, scanId, promptImage, true, hdResolution, hdFps),
      MAX_RETRIES,
    );

    // Store the HD task ID on the job row
    const updateController = new AbortController();
    const updateTimeout = setTimeout(() => updateController.abort(), 5000);
    await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&task_id=eq.${encodeURIComponent(internalJobId)}`, {
      method: "PATCH",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ hd_task_id: hdTaskId, hd_status: 'PENDING' }),
      signal: updateController.signal,
    });
    clearTimeout(updateTimeout);

    console.log(`[generate-video] HD task ${hdTaskId} submitted for scan ${scanId}`);

    // Start polling for HD completion in the background. The edge runtime
    // enforces a wall-clock budget per invocation, so cap the polling loop
    // at EDGE_WALL_CLOCK_BUDGET_MS — if the deadline is reached, self-invoke
    // a fresh server-poll to continue the chain in a new invocation.
    safeWaitUntil((async () => {
      const runwayKey2 = await resolveRunwayKey();
      if (!runwayKey2) return;
      const deadline = Date.now() + EDGE_WALL_CLOCK_BUDGET_MS;
      for (let attempt = 0; attempt < SERVER_POLL_MAX_ATTEMPTS; attempt++) {
        if (Date.now() >= deadline) {
          // Self-invoke a fresh server-poll to continue HD polling in a new
          // edge invocation before this one hits the wall-clock limit.
          const selfUrl = `${supabaseUrl}/functions/v1/generate-video`;
          const c = new AbortController();
          const t = setTimeout(() => c.abort(), SERVER_POLL_SELF_INVOKE_TIMEOUT_MS);
          fetch(selfUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
            body: JSON.stringify({ mode: "server-poll", taskId: hdTaskId, scanId }),
            signal: c.signal,
          }).then(() => clearTimeout(t)).catch(() => clearTimeout(t));
          return;
        }
        await delay(Math.min(SERVER_POLL_INITIAL_DELAY_MS * Math.pow(1.5, attempt), SERVER_POLL_MAX_DELAY_MS) + Math.random() * JITTER_MAX_MS);
        const status = await pollRunwayTask(hdTaskId, runwayKey2);
        if (status.status === 'SUCCESS' && status.videoUrl) {
          // Persist HD result
          const hdUrl = await persistVideoInBackground(status.videoUrl, scanId, internalJobId);
          // Update the hd_status and hd_video_url columns
          const c = new AbortController();
          const t = setTimeout(() => c.abort(), 5000);
          await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&task_id=eq.${encodeURIComponent(internalJobId)}`, {
            method: "PATCH",
            headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ hd_status: 'SUCCESS', hd_video_url: hdUrl, hd_completed_at: new Date().toISOString() }),
            signal: c.signal,
          });
          clearTimeout(t);
          await sendVideoCompletePush(scanId);
          console.log(`[generate-video] HD completed for scan ${scanId}`);
          return;
        }
        if (status.status === 'FAILED') {
          const c = new AbortController();
          const t = setTimeout(() => c.abort(), 5000);
          await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&task_id=eq.${encodeURIComponent(internalJobId)}`, {
            method: "PATCH",
            headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ hd_status: 'FAILED', error_message: status.error ?? 'HD 업그레이드 실패' }),
            signal: c.signal,
          });
          clearTimeout(t);
          console.error(`[generate-video] HD failed for scan ${scanId}: ${status.error}`);
          return;
        }
      }
      // Exhausted attempts — mark HD as failed
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 5000);
      await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&task_id=eq.${encodeURIComponent(internalJobId)}`, {
        method: "PATCH",
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ hd_status: 'FAILED', error_message: 'HD 업그레이드 서버 폴링 한도 초과' }),
        signal: c.signal,
      });
      clearTimeout(t);
    })());
  } catch (err) {
    console.error('[generate-video] autoSubmitHdIfNeeded error:', err);
  }
}

const RUNWAY_STATUS_TO_STEP: Record<string, string> = {
  PENDING: "submitting",
  PROCESSING: "rendering",
  RUNNING: "rendering",
  THROTTLED: "rendering",
  QUEUED: "submitting",
};

async function updateVideoJobStep(scanId: string, taskId: string, step: string): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  const progress = STEP_TO_PROGRESS_NUM[step] ?? null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const body: Record<string, unknown> = { step };
    if (progress !== null) body.progress = progress;
    await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${encodeURIComponent(scanId)}&task_id=eq.${encodeURIComponent(taskId)}&status=not.in.(SUCCESS,FAILED)`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err) {
    console.error('[generate-video] updateVideoJobStep error:', err);
  }
}

const STEP_TO_PROGRESS_NUM: Record<string, number> = {
  idle: 0.05,
  analyzing: 0.05,
  hooking: 0.15,
  planning: 0.25,
  submitting: 0.35,
  rendering: 0.85,
  encoding: 0.90,
  uploading: 0.93,
  muxing: 0.97,
  completed: 1.0,
  failed: 0,
  pending: 0.35,
  processing: 0.85,
  running: 0.85,
  throttled: 0.45,
  queued: 0.38,
};

async function fetchScanImageUrl(scanId: string): Promise<string | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/scans?select=edited_image_url,image_url&id=eq.${encodeURIComponent(scanId)}`,
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
      const rows = await resp.json() as Array<{ edited_image_url: string | null; image_url: string | null }>;
      if (rows.length > 0) {
        return rows[0].edited_image_url ?? rows[0].image_url ?? null;
      }
    }
  } catch (err) {
    console.error('[generate-video] fetchScanImageUrl error:', err);
  }
  return null;
}

async function submitRunwayTask(
  prompt: string,
  apiKey: string,
  aspectRatio: string,
  durationSec: number,
  isDraft: boolean,
  webhookUrl?: string,
  scanId?: string,
  promptImage?: string | null,
  isHd?: boolean,
  resolution?: string,
  fps?: number,
  modelImage?: string | null,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RUNWAY_SUBMIT_TIMEOUT_MS);

  try {
    const clampedDuration = Math.min(Math.max(Math.round(durationSec), 2), 30);
    const ratioMapNonHd: Record<string, string> = {
      "9:16": "720:1280",
      "16:9": "1280:720",
      "1:1": "960:960",
      "4:3": "1104:832",
      "3:4": "832:1104",
      "21:9": "1584:672",
    };
    const ratioMap: Record<string, string> = isHd && clampedDuration <= 10
      ? {
          "9:16": "1080:1920",
          "16:9": "1920:1080",
          "1:1": "1440:1440",
          "4:3": "1440:1080",
          "3:4": "1080:1440",
          "21:9": "2376:1008",
        }
      : ratioMapNonHd;

    const hasImage = typeof promptImage === "string" && promptImage.length > 0;
    const endpoint = hasImage ? "image_to_video" : "text_to_video";
    // Gen-4.5 supports 2-10s. For longer durations (>10s), use seedance2_5
    // which supports 4-30s at 480p/720p.
    const isSeedance = clampedDuration > 10;
    const model = isSeedance ? "seedance2_5" : "gen4.5";
    // seedance2_5 only supports up to 720p — force non-HD ratios and
    // clamp resolution even when HD was requested.
    const ratioValue = (isSeedance ? ratioMapNonHd : ratioMap)[aspectRatio] ?? "720:1280";
    const safePrompt = safeSlice(prompt.trim(), 1000);

    const payload: Record<string, unknown> = {
      model,
      promptText: safePrompt,
      duration: clampedDuration,
      ratio: ratioValue,
    };
    // Drafts: force 480p and cap fps at 12 regardless of seedance clamping.
    // This roughly halves the inference step count on Runway's side.
    if (isDraft) {
      payload.resolution = "480p";
      payload.fps = 12;
    } else if (resolution) {
      payload.resolution = isSeedance ? "720p" : resolution;
      if (fps != null) payload.fps = isSeedance ? Math.min(fps, 24) : fps;
    }
    if (hasImage && promptImage) {
      // For virtual fitting, the model image is the animation subject —
      // use it as the primary prompt image. Product context is already
      // embedded in the prompt text via buildAutoPrompt.
      payload.promptImage = modelImage || promptImage;
    }
    if (webhookUrl) {
      payload.callbackUrl = webhookUrl;
    }

    console.log("[generate-video] Runway request:", endpoint, "model:", payload.model, "hasImage:", hasImage, "hasModelImage:", !!modelImage, "promptLen:", prompt.length, "hasWebhook:", !!webhookUrl);

    const resp = await fetch(`https://api.dev.runwayml.com/v1/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": "2024-11-06",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const respStatus = resp.status;
    const respText = await resp.text();

  

    if (!resp.ok) {
      console.error("[generate-video] Runway error:", respStatus, respText.slice(0, 800));
      const errDetail = parseRunwayError(respText);
      if (respStatus === 401) {
        throw new Error(`Runway API 키가 유효하지 않거나 비활성화되었습니다. 설정에서 활성화된 Runway API 키를 다시 등록해주세요. (HTTP 401): ${errDetail}`);
      }
      if (respStatus === 400) {
        throw new Error(`Runway 요청 형식 오류 (HTTP 400): ${errDetail}`);
      }
      if (respStatus === 404) {
        throw new Error(`Runway API 엔드포인트를 찾을 수 없습니다 (HTTP 404). API 주소나 모델명이 잘못되었을 수 있습니다: ${errDetail}`);
      }
      if (respStatus === 429) {
        throw new Error(`Runway API 요청 한도를 초과했습니다 (HTTP 429). 잠시 후 다시 시도해주세요: ${errDetail}`);
      }
      throw new Error(`Runway 생성 요청 실패 (HTTP ${respStatus}): ${errDetail}`);
    }

    const result = JSON.parse(respText) as { taskId?: string; id?: string; status?: string };
    const taskId = result.taskId ?? result.id;
    console.log("[generate-video] Runway task created:", taskId, "status:", result.status);
    if (!taskId) throw new Error("Runway 작업 ID를 받지 못했습니다.");
    return taskId;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Runway 생성 요청 시간이 초과되었습니다 (45초). 네트워크 상태를 확인하고 다시 시도해주세요.");
    }
    throw err;
  }
}

async function pollRunwayTask(
  taskId: string,
  apiKey: string,
): Promise<{ status: string; videoUrl?: string; error?: string; progress?: string }> {
  let lastErr: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RUNWAY_POLL_TIMEOUT_MS);

    try {
      const resp = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Runway-Version": "2024-11-06",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        const errDetail = parseRunwayError(errText);

        // 404 from the tasks endpoint usually means the task was just created
        // but hasn't propagated to the Runway API's read store yet. Retry with
        // backoff instead of failing immediately — the task ID is valid, it
        // just needs a few seconds to become visible.
        if (resp.status === 404 && attempt < MAX_RETRIES) {
          lastErr = `Runway 폴링 실패 (HTTP 404): ${errDetail}`;
          const backoffDelay = RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt);
          console.log(`[generate-video] Poll retry ${attempt + 1}/${MAX_RETRIES} after ${backoffDelay}ms (HTTP 404, task not yet visible)`);
          await delay(backoffDelay);
          continue;
        }

        // 5xx errors are transient — retry with backoff
        if (resp.status >= 500 && resp.status < 600 && attempt < MAX_RETRIES) {
          lastErr = `Runway 폴링 실패 (HTTP ${resp.status}): ${errDetail}`;
          const backoffDelay = RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt);
          console.log(`[generate-video] Poll retry ${attempt + 1}/${MAX_RETRIES} after ${backoffDelay}ms (HTTP ${resp.status})`);
          await delay(backoffDelay);
          continue;
        }

        // 4xx errors (except 429) are non-retryable — fail immediately
        if (resp.status === 429 && attempt < MAX_RETRIES) {
          lastErr = `Runway API 요청 한도 초과 (HTTP 429): ${errDetail}`;
          const backoffDelay = RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt);
          console.log(`[generate-video] Poll retry ${attempt + 1}/${MAX_RETRIES} after ${backoffDelay}ms (HTTP 429)`);
          await delay(backoffDelay);
          continue;
        }

        if (resp.status === 404) {
          return { status: "PROCESSING", progress: `Runway 작업이 아직 조회되지 않습니다: ${taskId}` };
        }

        return { status: "FAILED", error: `Runway 폴링 실패 (HTTP ${resp.status}): ${errDetail}` };
      }

      const respText = await resp.text();
      const trimmed = respText.trim();
      if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<HTML")) {
        // HTML response is transient (server maintenance) — retry
        if (attempt < MAX_RETRIES) {
          lastErr = "Runway API 서버가 HTML 페이지를 반환했습니다.";
          const backoffDelay = RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt);
          console.log(`[generate-video] Poll retry ${attempt + 1}/${MAX_RETRIES} after ${backoffDelay}ms (HTML response)`);
          await delay(backoffDelay);
          continue;
        }
        return { status: "FAILED", error: "Runway API 서버가 HTML 페이지를 반환했습니다. API 엔드포인트 경로가 잘못되었거나 서버가 일시적으로 사용 불가능합니다." };
      }

      let result: Record<string, unknown>;
      try {
        result = JSON.parse(trimmed);
      } catch {
        // Invalid JSON is transient — retry
        if (attempt < MAX_RETRIES) {
          lastErr = `Runway 폴링 실패: 유효하지 않은 응답 형식 (HTTP ${resp.status})`;
          const backoffDelay = RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt);
          console.log(`[generate-video] Poll retry ${attempt + 1}/${MAX_RETRIES} after ${backoffDelay}ms (invalid JSON)`);
          await delay(backoffDelay);
          continue;
        }
        return { status: "FAILED", error: `Runway 폴링 실패: 유효하지 않은 응답 형식 (HTTP ${resp.status})` };
      }
      const status = (result.status as string) ?? "PROCESSING";
      const progress = result.progress != null ? String(result.progress) : "";

      if (status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED") {
        const output = result.output;
        const videoUrl = typeof output === "string"
          ? output
          : Array.isArray(output) ? output[0] : output?.url ?? result.artifacts?.[0]?.url ?? result.url;
        if (!videoUrl) return { status: "FAILED", error: "Runway 비디오 URL이 없습니다." };
        return { status: "SUCCESS", videoUrl, progress };
      }

      if (status === "FAILED" || status === "CANCELED") {
        const errMsg = result.failure ?? result.error ?? "Runway 생성 실패";
        return { status: "FAILED", error: errMsg };
      }

      return { status, progress };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        // Timeout — treat as transient, retry with backoff
        if (attempt < MAX_RETRIES) {
          lastErr = "Runway 폴링 시간 초과";
          const backoffDelay = RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt);
          console.log(`[generate-video] Poll retry ${attempt + 1}/${MAX_RETRIES} after ${backoffDelay}ms (timeout)`);
          await delay(backoffDelay);
          continue;
        }
        return { status: "PROCESSING", progress: "polling timeout, will retry on next poll cycle" };
      }
      // Network error — retry with backoff
      if (attempt < MAX_RETRIES) {
        lastErr = err instanceof Error ? err.message : "Runway 폴링 네트워크 오류";
        const backoffDelay = RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.log(`[generate-video] Poll retry ${attempt + 1}/${MAX_RETRIES} after ${backoffDelay}ms (network error: ${lastErr})`);
        await delay(backoffDelay);
        continue;
      }
      console.error("[generate-video] Poll error after all retries:", err);
      return { status: "FAILED", error: lastErr ?? "Runway 폴링 오류" };
    }
  }

  // All retries exhausted — return PROCESSING so server-poll continues to next cycle
  console.error("[generate-video] Poll: all retries exhausted, returning PROCESSING:", lastErr);
  return { status: "PROCESSING", progress: lastErr ?? "transient error, will retry on next poll cycle" };
}

// === Shared helpers ===

function buildAutoPrompt(
  productName: string | undefined,
  vision: ProductVisionData | null,
  captionText: string | undefined,
  isCleanVideoMode: boolean,
  durationSec: number,
  enableOrbit360?: boolean,
  orbitSpeed?: number,
  enableFabricPhysics?: boolean,
  memeFormat?: string,
  memeText?: string,
  selectedMode?: 'auto_3d' | 'universal_synthesis' | 'manual',
  enableVirtualFitting?: boolean,
): string {
  const parts: string[] = [];

  const name = sanitizeVideoProductName(productName) || sanitizeVideoProductName(vision?.productName) || VIDEO_FALLBACK_PRODUCT_NAME;

  const speedLabel = orbitSpeed != null
    ? orbitSpeed >= 2.0 ? 'fast' : orbitSpeed <= 0.5 ? 'slow' : 'smooth'
    : 'smooth';

  const safeCopy = vision ? sanitizeCopyLayers(vision.suggestedCopyLayers) : VIDEO_FALLBACK_COPY_LAYERS;

  if (isCleanVideoMode) {
    const isVirtualFittingMode = selectedMode === 'universal_synthesis' && enableVirtualFitting;
    if (isVirtualFittingMode) {
      parts.push(`Top-tier luxury fashion commercial for ${name}, ultra-premium 3D virtual fitting showcase, cinematic quality rivaling high-end brand films`);
      parts.push("volumetric body mapping and 3D draping simulation, skeletal mesh alignment for natural garment fit, body-aware cloth wrapping with anatomically correct tension distribution, realistic garment-to-body contact zones with pressure-based deformation");
    } else {
      parts.push(`Top-tier luxury commercial for ${name}, ultra-premium 3D product showcase, cinematic quality rivaling high-end brand films`);
    }
    if (enableOrbit360) {
      if (isVirtualFittingMode) {
        parts.push(`${speedLabel} 360-degree orbit rotation around model and garment, continuous circular camera path revealing front-side-back silhouette, parallax depth shift across orbit arc capturing fabric drape from all angles`);
      } else {
        parts.push(`${speedLabel} 360-degree orbit rotation around product core, continuous circular camera path maintaining focal lock on product centroid, parallax depth shift across orbit arc`);
      }
    } else {
      parts.push("smooth gimbal dolly + gentle macro push-in");
    }
    if (enableFabricPhysics) {
      parts.push("real-time fabric physics simulation, gravity-aware drape and fold formation, momentum inertia causing delayed fabric follow on rotation, self-collision detection between overlapping fabric layers, boundary collision preventing clipping artifacts between garment and body mesh");
    }
    const jewelryTag = buildJewelryMacroTag(vision?.materialGuess ?? "", vision?.productCategory ?? "");
    if (jewelryTag) {
      parts.push(jewelryTag);
    }
    parts.push(buildOpeningHookSequenceTag(true, vision));
    parts.push("professional 3-point studio lighting with softboxes, rim light for edge definition, macro detail of surface texture, shallow depth of field, color-graded filmic look, no text overlays, no captions, no marketing elements, pure luxury product cinematography");
    return parts.join(". ");
  }

  parts.push(`Raw smartphone-style unboxing review for ${name}, shot on phone, handheld shaky cam, natural lighting`);

  if (vision) {
    parts.push(`copy layers — hook: "${safeCopy.primary}", benefit: "${safeCopy.secondary}", CTA: "${safeCopy.tertiary}"`);
  }

  if (captionText && captionText.trim()) {
    parts.push(`caption context: "${safeSlice(captionText, 100)}"`);
  }

  parts.push(buildOpeningHookSequenceTag(false, vision));
  if (memeFormat && memeText) {
    const sanitizedMemeText = sanitizeVideoText(memeText).replace(/"/g, '\"');
    parts.push(`meme_overlay: format=${memeFormat}, text="${safeSlice(sanitizedMemeText, 80)}", burn-in meme caption with B-grade energy, ironic Korean colloquial speech`);
  } else if (memeFormat) {
    parts.push(`meme_overlay: format=${memeFormat}, B-grade meme energy, ironic Korean colloquial speech`);
  }
  parts.push(`${durationSec}-second vertical short-form, raw unboxing aesthetic, handheld phone camera, imperfect framing, natural room lighting, no studio setup, loss-aversion hook, before/after problem-solution contrast, social-proof urgency CTA`);

  return parts.join(". ");
}

type CompactPromptParams = {
  userPrompt: string;
  productName?: string;
  aspectRatio: string;
  variationSeed: number;
  bgmMood?: string;
  captionText?: string;
  platform: string;
  hookCategory: string;
  productVision?: ProductVisionData | null;
  isCleanVideoMode: boolean;
  promptStrength?: number;
  negativePrompt?: string;
  bgStyle?: string;
  outfitIntensity?: number;
  zoomSpeed?: number;
  cameraRotation?: number;
  transitionEffect?: string;
  qualityTier: string;
  resolution: string;
  fps: number;
  selectedMode?: 'auto_3d' | 'universal_synthesis' | 'manual';
  enableOrbit360?: boolean;
  orbitSpeed?: number;
  enableCaustics?: boolean;
  enableVirtualFitting?: boolean;
  enableFabricPhysics?: boolean;
  isDraft?: boolean;
  memeFormat?: string;
  memeText?: string;
};

const PLATFORM_STYLE: Record<string, { camera: string; lighting: string; grade: string }> = {
  shorts: { camera: "handheld phone + shaky zoom-in", lighting: "natural room light, no studio", grade: "raw, slight grain, minimal grading" },
  tiktok: { camera: "handheld + jump cuts + quick pans", lighting: "available light only, window light", grade: "unfiltered, phone-camera look, slight warmth" },
  reels: { camera: "handheld selfie-style + slow pan", lighting: "natural golden hour, no setup", grade: "raw filmic, light grain, muted tones" },
  naverclip: { camera: "handheld + casual product close-up", lighting: "natural indoor, no studio", grade: "neutral raw, minimal correction" },
};

const MOOD_GRADE: Record<string, string> = {
  "하이텐션": "urgent handheld, slight shake, raw energy",
  "시네마틱": "natural filmic, light grain, minimal grading",
  "ASMR": "close-up intimate, soft natural light, shallow DOF",
  "감성": "warm natural, gentle handheld, soft window light",
  "로파이": "lofi raw, phone-camera aesthetic, vintage grain",
};

const HOOK_TEXTS: Record<string, string[]> = {
  curiosity: [
    "이거 진짜였음? 장난아닌데",
    "나만 빼고 다 알더라 충격",
    "왜 이제야 알았지 진짜 어이없음",
    "아직도 이거 모르는 사람 있음?",
    "이거 알면 삶이 바뀜 각",
    "나만 몰랐던 거 실화냐?",
    "잠깐 이거 봤어? 장난아닌데 진짜",
    "이거 모르면 평생 손해인 거 맞음",
  ],
  problem: [
    "이거 모르면 호구 되는 거 맞음",
    "이거 때문에 돈 날릴 뻔 진짜",
    "다들 이걸로 고생함 나만 손해봄",
    "이거 안 사면 후회하는 거 맞다",
    "이걸 몰라서 그동안 낭비한 거",
    "솔직히 광고 아님 이거 진심임",
    "알면서 안 사는 사람 특: 내년에도 이 고생 반복",
    "이거 모르면 매달 돈 날리는 거임",
  ],
  transformation: [
    "이랬는데 → 이렇게 됨 충격",
    "사용 전후 비교 진짜 소름",
    "이거 쓰고 다른 거 다 버렸음 각",
    "before after 차이 실화냐?",
    "이거 하나로 종결된 거 맞음",
    "이거 쓰면 뭐 다 필요없음 진짜",
    "택배 뜯자마자 소리 지름 진짜임",
    "이거 쓰고 나서 전에 쓰던 거 다 버림",
  ],
  social_proof: [
    "실시간 품절 캡처 봐 진짜임",
    "다들 이거 사느라 난리 났더라",
    "리뷰 수 폭발 중 확인해봐",
    "이거 사고 난 후기 다 똑같음",
    "옆에서 본 애가 사서 나도 샀음",
    "이거 사신 분들 진짜 다 만족함",
    "나만 몰랐던 치트키 실화냐",
    "재구매율 89% 리뷰 12,847개 별점 4.8 진짜임",
  ],
  fomo: [
    "품절 전에 확인하셈 진짜 급함",
    "선착순 마감 임박인데 놓치면 손해",
    "이거 모르면 손해인데 진짜임",
    "이거 곧 품절될 거 같아서 급하게 올림",
    "나중에 사려다가 못 사는 거 각",
    "이거 지금 아니면 없다 진짜로",
    "고민하는 사이 품절됨 ㅋㅋ 진짜임",
    "이거 지금 안 사면 나중에 2배로 줌",
  ],
  loss_aversion: [
    "이거 안 사면 손해인 거 맞음",
    "안 사면 후회하는 거 진짜 각",
    "이거 놓치면 진짜 큰일남",
    "이거 모르면 돈 계속 날림",
    "이거 없으면 손해 보는 거 맞다",
    "안 사면 손해 보는 거 실화임",
    "이거 안 쓰면 매달 돈 날리는 거임",
    "이거 모르면 평생 돈 버리는 겁니다",
  ],
  raw_honesty: [
    "솔직히 광고 아님 이거 진심",
    "이거 진짜 좋아서 올리는 거임",
    "협찬 아님 내 돈으로 샀음 진짜",
    "이거 쓰고 진심으로 감동함",
    "이거 리뷰 진짜 솔직하게 함",
    "광고 아니라 진짜 추천하는 거",
    "광고 아님 택배 뜯자마자 소리 지름",
    "이거 진짜라서 협찬 아니면 안 올림",
  ],
  trend_exclusion: [
    "나만 몰랐던 거 실화인가",
    "다들 아는데 나만 뒤처진 거 같음",
    "이거 모르면 트렌드 뒤처진 거",
    "요즘 다 이거 쓰던데 나만 몰랐음",
    "이거 안 하면 혼자만 뒤처지는 거",
    "친구들이 다 아는데 나만 몰랐음",
    "나만 빼고 다 쓰고 있네 진짜",
    "이거 모르면 SNS에서 왕따 되는 거",
  ],
};

const BG_STYLE_MAP: Record<string, string> = {
  "스튜디오": "studio backdrop, controlled lighting, seamless background",
  "야외": "outdoor natural environment, golden hour, natural surroundings",
  "빈티지": "vintage retro setting, warm faded tones, nostalgic atmosphere",
  "미니멀": "minimalist clean background, white space, simple setting",
  "카페": "cozy cafe interior, warm ambient lighting, lifestyle setting",
  "도시": "urban city backdrop, street style, modern architecture",
};

const TRANSITION_MAP: Record<string, string> = {
  "컷 전환": "quick cut transitions",
  "크로스페이드": "crossfade dissolves",
  "와이프": "wipe transitions",
  "줌 전환": "zoom-through transitions",
  "플래시": "flash-cut transitions",
  "슬로우 모션": "slow-motion ramps",
};

const MATERIAL_PHYSICS: Array<{ match: RegExp; tag: string }> = [
  { match: /silk|실크|샤틴|satin|chiffon/i, tag: "material_physics=silk twill micro-weave visible, light-dependent fluid sheen, subsurface scattering, draping folds with anisotropic specular highlights" },
  { match: /denim|데님|캔버스|canvas|twill/i, tag: "material_physics=structured denim weave, visible warp-weft threads, rigid fold creases, diffused specular on indigo fibers" },
  { match: /cotton|코튼|면|linen|린넨/i, tag: "material_physics=cotton micro-fiber matte surface, soft diffuse reflection, natural fabric wrinkling, breathability texture" },
  { match: /wool|울|캐시미어|cashmere|니트|knit/i, tag: "material_physics=wool fiber density, micro-fuzz surface, warm diffuse absorption, knitted loop structure visible" },
  { match: /leather|가죽| suede|스웨이드/i, tag: "material_physics=leather grain pore structure, edge burnishing, anisotropic gloss on creases, natural hide texture variation" },
  { match: /metal|금속|steel|스틸|aluminum|알루미늄|titanium|티타늄|gold|골드|silver|실버/i, tag: "material_physics=brushed metal micro-scratches, anisotropic specular reflection, fresnel rim glow, cold metallic sheen with environment reflection" },
  { match: /gold|골드|brass|황동|copper|구리/i, tag: "material_physics=precious metal warm luster, micro-polish marks, environment map reflection, subtle patina edge variation" },
  { match: /gem|보석|diamond|다이아|crystal|크리스탈|jewel|주얼/i, tag: "material_physics=faceted gemstone caustics, dispersion rainbow refraction, dynamic light-splitting on facet edges, shadow dispersion interacting with skin tones" },
  { match: /glass|유리|borosilicate/i, tag: "material_physics=glass refraction index bending, edge chromatic aberration, transparent subsurface, caustic light pooling on surfaces" },
  { match: /plastic|플라스틱|polymer|acrylic|아크릴/i, tag: "material_physics=plastic glossy surface micro-reflection, injection mold parting line, soft specular bloom, pigment depth" },
  { match: /ceramic|세라믹|porcelain|도자기/i, tag: "material_physics=ceramic glaze micro-bubbling, smooth high-gloss reflection, kiln-fired color depth, cool touch diffuse" },
  { match: /wood|나무|원목|oak|walnut|bamboo|대나무/i, tag: "material_physics=wood grain ring pattern, open-pore surface texture, warm tinted oil finish, natural fiber direction visible" },
  { match: /rubber|고무|silicone|실리콘/i, tag: "material_physics=rubber matte surface, micro-parting line, soft diffuse with slight friction sheen, compression deformation hints" },
  { match: /paper|종이|kraft|크라프트|cardboard|종이박스/i, tag: "material_physics=paper fiber matrix visible, edge deckle, matte diffuse, subtle embossing and fold memory" },
  { match: /fabric|패브릭|textile|텍스타일/i, tag: "material_physics=textile micro-weave structure, thread directionality, fabric draping physics, ambient occlusion in fold creases" },
];

function buildMaterialPhysicsTag(materialGuess: string): string {
  const guess = materialGuess.trim();
  if (!guess) return "";
  for (const { match, tag } of MATERIAL_PHYSICS) {
    if (match.test(guess)) return tag;
  }
  return `material_physics=${guess} surface micro-detail, realistic texture rendering under scene lighting`;
}

const FABRIC_KINETICS: Array<{ match: RegExp; tag: string }> = [
  { match: /silk|실크|샤틴|satin|chiffon|치마|skirt|드레스|dress/i, tag: "fabric_physics=silk skirt hem flares with centrifugal force on rotation, fluid fabric ripples follow body momentum with 2-frame delay, gravity-aware drape recovery, organically settling folds" },
  { match: /denim|데님|캔버스|canvas|twill/i, tag: "fabric_physics=rigid denim resists deformation, stiff fold memory, minimal ripple on motion, weighty hem swing with sharp settle, visible crease recovery" },
  { match: /cotton|코튼|면|linen|린넨|셔츠|shirt/i, tag: "fabric_physics=cotton fabric light ripple on movement, soft fold oscillation with quick gravity settle, breathable drape following body contour, natural wrinkling on bending" },
  { match: /wool|울|캐시미어|cashmere|니트|knit|코트|coat/i, tag: "fabric_physics=wool coat heavy swing with momentum lag, structured shoulder drape, gravity-dependent lapel settling, thick fabric folds compress and slowly expand" },
  { match: /leather|가죽|스웨이드|suede|재킷|jacket/i, tag: "fabric_physics=leather jacket rigid flap with inertia, panel edges swing with weighted delay, crease memory on bending, smooth gloss shift as panels move" },
  { match: /jewel|주얼|necklace|목걸이|chain|체인|bracelet|팔찌|earring|귀걸이/i, tag: "accessory_physics=jewelry chain links swing with pendulum physics, natural weight-delay on rotation, gravity pulls pendant to rest position, momentum carries swing past settle point with damping oscillation" },
  { match: /ring|반지|watch|시계|bangle|방망이/i, tag: "accessory_physics=rigid accessory weight shifts with wrist/finger motion, metallic glint sweeps as orientation changes, centrifugal displacement on rapid rotation" },
  { match: /scarf|스카프|shawl|숄|veil|베일/i, tag: "fabric_physics=scarf trails with air resistance, fabric catches wind current, rippling wave propagation along length, gravity-aware settling with floating drift" },
  { match: /fabric|패브릭|textile|텍스타일|의류|clothing|옷/i, tag: "fabric_physics=fabric layers ripple organically with body motion, gravity-aware drape, momentum inertia causes delayed fabric follow, fold creases form and relax naturally" },
];

function buildFabricPhysicsTag(materialGuess: string, category: string): string {
  const combined = `${materialGuess} ${category}`.trim();
  if (!combined) return "";
  for (const { match, tag } of FABRIC_KINETICS) {
    if (match.test(combined)) return tag;
  }
  return "";
}

const COLLISION_GUARDRAILS: Array<{ match: RegExp; tag: string }> = [
  { match: /jewel|주얼|necklace|목걸이|chain|체인|bracelet|팔찌|earring|귀걸이|ring|반지|watch|시계/i, tag: "collision_guard=strict collision detection between jewelry and body mesh + hair strands, necklace chains must not intersect skin surface or clip through hair, earrings maintain separation from neck/ear, bracelets rotate around wrist without penetrating forearm mesh, dynamic boundary repulsion enforces minimum 2mm clearance" },
  { match: /silk|실크|샤틴|satin|chiffon|치마|skirt|드레스|dress|scarf|스카프|shawl|숄|veil|베일/i, tag: "collision_guard=strict collision detection between flowing fabric and body mesh, skirt hem must not intersect legs or ground, dress layers maintain separation without self-penetration, fabric boundary repulsion prevents skin clipping at armholes and neckline, hair strands must not pass through fabric layers" },
  { match: /denim|데님|캔버스|canvas|twill|cotton|코튼|면|linen|린넨|셔츠|shirt|wool|울|니트|knit|코트|coat|leather|가죽|재킷|jacket/i, tag: "collision_guard=strict collision detection between structured garment and body mesh, jacket panels must not intersect torso or arms, collar maintains clearance around neck, sleeves prevent forearm penetration, overlapping fabric layers enforce boundary separation without clipping artifacts" },
  { match: /fabric|패브릭|textile|텍스타일|의류|clothing|옷/i, tag: "collision_guard=strict collision detection between fitted garment and character body mesh, fabric must not intersect skin surface, overlapping layers maintain boundary separation, hair strands must not clip through clothing, dynamic boundary repulsion prevents all penetration artifacts" },
];

function buildCollisionTag(materialGuess: string, category: string): string {
  const combined = `${materialGuess} ${category}`.trim();
  if (!combined) return "";
  for (const { match, tag } of COLLISION_GUARDRAILS) {
    if (match.test(combined)) return tag;
  }
  return "";
}

const SKIN_MUSCLE_RESPONSE: Array<{ match: RegExp; tag: string }> = [
  { match: /belt|벨트|waist|허리|코르셋|corset|가들렛|garter/i, tag: "skin_response=subtle skin compression beneath waist belt, soft tissue displacement visible at belt edges, natural muscle tension shift in abdominal wall under compression, skin surface micro-deformation where belt meets torso, authentic pressure gradient from tight to relaxed zones" },
  { match: /bodice|보디스|tight|타이트|슬림핏|slim| fitted|핏|legging|레깅스|스키니|skinny/i, tag: "skin_response=natural muscle tension visible beneath tight bodice, fabric-to-skin pressure creates subtle contour mapping, skin micro-compression at seam lines, muscle definition shifts organically with body movement under fitted garment, authentic tension release when fabric stretches" },
  { match: /jewel|주얼|necklace|목걸이|chain|체인|bracelet|팔찌|earring|귀걸이|ring|반지|watch|시계/i, tag: "skin_response=subtle skin indentation beneath jewelry weight, wrist compression visible under bracelet pressure, finger skin contour deforms slightly around ring band, earlobe slight displacement under earring weight, authentic skin-to-accessory contact pressure response" },
  { match: /silk|실크|샤틴|satin|chiffon|드레스|dress|셔츠|shirt|blouse|블라우스/i, tag: "skin_response=fabric-to-skin pressure response at contact zones, gentle skin compression where fabric drapes against body, natural skin texture visible through sheer fabric layers, muscle tension shifts subtly under lightweight garment movement, authentic skin surface deformation at fabric edges" },
  { match: /leather|가죽|재킷|jacket|boots|부츠|gloves|장갑/i, tag: "skin_response=firm skin compression under rigid leather, visible pressure contour at leather-to-skin boundary, muscle tension adapts to structured garment shape, skin micro-indentation at seam and zipper lines, authentic firmness response where leather grips body" },
  { match: /fabric|패브릭|textile|텍스타일|의류|clothing|옷/i, tag: "skin_response=authentic fabric-to-skin pressure interaction, subtle skin compression at garment contact zones, muscle tension shifts naturally under fitted apparel, skin surface micro-deformation where garment edges meet body, organic pressure response between clothing and skin" },
];

function buildSkinResponseTag(materialGuess: string, category: string): string {
  const combined = `${materialGuess} ${category}`.trim();
  if (!combined) return "";
  for (const { match, tag } of SKIN_MUSCLE_RESPONSE) {
    if (match.test(combined)) return tag;
  }
  return "";
}

const ENV_LIGHTING_MAP: Record<string, string> = {
  "스튜디오": "env_light=key light 5500K overhead-left 45deg, fill light 5000K right 30deg, rim light 4200K back-top, softbox diffusion wrapping subject evenly, controlled intensity gradient from key to shadow zone, studio color temperature consistency across all surfaces",
  "야외": "env_light=primary sun 3200K low-angle 15deg golden hour, sky fill 6500K ambient dome, warm sunset glow wrapping subject from left-back, long shadow projection on ground, atmospheric scattering on skin, color temperature shift from warm highlight to cool shadow",
  "빈티지": "env_light=primary tungsten 2800K warm front-left 40deg, soft window fill 4500K right, faded warm wash across subject, nostalgic amber glow on skin tones, reduced contrast ratio for retro fading, color temperature intentionally shifted warm",
  "미니멀": "env_light=flat daylight 6000K top-down 80deg, soft ambient bounce 5500K all directions, even wrap-around illumination minimizing shadows, clean white bounce filling creases, high-key lighting ratio, neutral color temperature across entire scene",
  "카페": "env_light=warm pendant 2700K overhead 60deg, window fill 5000K left 20deg, cozy amber ambient bounce on subject, intimate low-key lighting with soft falloff, warm color temperature pooling on skin, multiple small specular highlights from pendant fixtures",
  "도시": "env_light=street lamp 4000K front-left 35deg, neon sign bounce varying 3000K-7000K from surrounding signage, cool sky ambient 7000K top, mixed color temperature reflections on subject, urban light pollution haze, dynamic specular shifts from passing vehicles",
};

function buildEnvLightingTag(bgStyle: string | undefined): string {
  if (!bgStyle) return "";
  return ENV_LIGHTING_MAP[bgStyle] ? ENV_LIGHTING_MAP[bgStyle] : "";
}

const SHADOW_REFLECTION_TABLE: Array<{ match: RegExp; tag: string }> = [
  { match: /metal|금속|steel|스틸|gold|골드|silver|실버|brass|황동|copper|구리|jewel|주얼|necklace|목걸이|chain|체인|bracelet|팔찌|ring|반지|watch|시계/i, tag: "shadow_reflect=contact shadow beneath feet with soft penumbra gradient, environment reflections ray-traced on metallic jewelry surfaces with real-time probe sampling, polished gemstone caustic reflections cast onto adjacent skin, ambient occlusion pooling in garment fold creases and jewelry undercut areas, studio reflector bounce highlights visible on curved metal surfaces, reflection intensity modulated by surface roughness map" },
  { match: /leather|가죽|스웨이드|suede|shoe|신발|boots|부츠|bag|가방/i, tag: "shadow_reflect=contact shadow beneath footwear and bag with ground-plane occlusion, leather surface catches environment reflections with anisotropic gloss, soft ambient occlusion at stitching and panel junctions, subtle floor reflection visible on polished leather toes, reflector bounce highlights sweep across curved leather surfaces with motion" },
  { match: /silk|실크|샤틴|satin|chiffon|드레스|dress|skirt|치마|scarf|스카프/i, tag: "shadow_reflect=soft contact shadow beneath garment hem with diffusion falloff, silk surface reflects environment with fluid sheen rippling, ambient occlusion in fabric fold interiors, subtle floor reflection caught on glossy satin panels, dynamic shadow casting from fabric draping onto skin and ground" },
  { match: /fabric|패브릭|textile|텍스타일|의류|clothing|옷|cotton|코튼|wool|울|knit|니트|denim|데님/i, tag: "shadow_reflect=contact shadow where garment meets floor with gradient penumbra, fabric surface ambient occlusion in fold creases and layer overlaps, soft environment bounce light reflected onto matte fabric, shadow intensity varies with fabric opacity and drape, ground-plane shadow follows body silhouette with garment extension" },
  { match: /gem|보석|diamond|다이아|crystal|크리스탈|glass|유리/i, tag: "shadow_reflect=caustic light pattern cast by gemstone onto skin and floor, transparent gem internal reflection and dispersion visible, contact shadow beneath setting with sharp penumbra, environment reflection ray-traced through facets with chromatic aberration, ambient occlusion under prong settings and bezel edges" },
];

function buildShadowReflectionTag(materialGuess: string, category: string): string {
  const combined = `${materialGuess} ${category}`.trim();
  if (!combined) return "";
  for (const { match, tag } of SHADOW_REFLECTION_TABLE) {
    if (match.test(combined)) return tag;
  }
  return "";
}

const DOF_FOCUS_MAP: Record<string, string> = {
  "스튜디오": "dof_focus=focal plane locked on subject at 2.5m, shallow bokeh f/1.8 with smooth circular highlight rendition, background studio backdrop falls into creamy bokeh blur, foreground product edges remain razor-sharp, depth integration matches studio camera optics, no synthetic cutout edge sharpness mismatch",
  "야외": "dof_focus=focal plane on subject at 4m, medium bokeh f/2.8 with natural lens falloff, background foliage and sky dissolve into organic bokeh circles, golden hour haze softens background to foreground transition, foreground subject sharpness matches outdoor ambient blur gradient, spatial depth seamlessly integrated",
  "빈티지": "dof_focus=focal plane on subject at 3m, vintage lens bokeh f/2.0 with swirly rendition and slight chromatic aberration at bokeh edges, background fades with nostalgic softness, vintage lens character imperfections match across subject and background, depth blur intentionally imperfect for retro authenticity",
  "미니멀": "dof_focus=focal plane on subject at 3m, clean bokeh f/2.8 with minimal highlight distraction, white background dissolves into smooth gradient blur, subject edges crisp against soft minimal backdrop, depth falloff clean and uniform, no bokeh artifacts to break minimalist aesthetic",
  "카페": "dof_focus=focal plane on subject at 2m, intimate bokeh f/2.0 with warm specular highlights from pendant lights, background cafe interior blurs into cozy light orbs, foreground subject sharpness integrates with ambient warm blur, shallow depth enhances intimate atmosphere without cutout separation",
  "도시": "dof_focus=focal plane on subject at 5m, deeper bokeh f/4.0 for urban context retention, background city lights blur into distinct neon bokeh circles, street-level depth maintains environment context while subject stays sharp, depth integration preserves urban atmosphere without synthetic edge mismatch",
};

function buildDofFocusTag(bgStyle: string | undefined, isCleanMode: boolean): string {
  if (!bgStyle) return "";
  const base = DOF_FOCUS_MAP[bgStyle];
  if (!base) return "";
  if (isCleanMode) {
    return base + ", luxury cinema lens shallow DOF enhanced for premium product isolation";
  }
  return base;
}

const JEWELRY_CATEGORY_PATTERN = /jewel|주얼|necklace|목걸이|chain|체인|bracelet|팔찌|earring|귀걸이|ring|반지|watch|시계|gem|보석|diamond|다이아|crystal|크리스탈|pendant|펜던트|bangle|방망이/i;

function buildOpeningHookSequenceTag(isCleanMode: boolean, vision: ProductVisionData | null): string {
  const materialHint = vision?.materialGuess?.trim() ?? "";
  const textureHint = vision?.textureDescription?.trim() ?? "";
  const detailSubject = materialHint || textureHint
    ? `product ${materialHint ? "material: " + materialHint : ""}${materialHint && textureHint ? ", " : ""}${textureHint ? "surface texture: " + textureHint : ""}`
    : "product surface micro-detail and texture";

  if (isCleanMode) {
    return `opening_hook_sequence=0-1s jarring extreme close-up macro lock-on on ${detailSubject}, scroll-stopping ultra-tight framing that demands attention in under 1 second, 0-3s reveals micro-texture and craftsmanship detail with razor-thin focal plane and slow rack-focus pull across material texture, 3s mark triggers instant dynamic whip-pan transition to virtual model full-shot wearing product, full-body framing with product contextually integrated, camera continues smooth orbit after transition, aggressive visual contrast between macro intimacy and full-shot grandeur designed to halt scroll within first second, no lag no fade cut on the beat`;
  }
  return `opening_hook_sequence=0-1s jarring extreme close-up on ${detailSubject}, scroll-stopping handheld phone macro framing showing real texture that arrests attention in under 1 second, slight camera shake for authenticity and urgency, 0-3s reveals product detail with raw energy, 3s mark hard cut to model full-shot wearing or holding product, dynamic jump-cut transition with momentum, raw energy contrast between intimate detail and wide context, scroll-stopping before-after visual shift designed to stop thumb in first second`;
}

function buildJewelryMacroTag(materialGuess: string, category: string): string {
  const combined = `${materialGuess} ${category}`.trim();
  if (!combined || !JEWELRY_CATEGORY_PATTERN.test(combined)) return "";
  return "jewelry_macro=extreme close-up macro zoom lock-on on gemstone facet and setting detail, minimum 3x macro magnification ratio, focal plane locked on prong/bezel setting with razor-sharp micro-detail retention, glossBoost=high precious metal specular boost with environment map reflection intensity at 90%, facetSpecular=maximum facet edge specular highlight with dispersion rainbow refraction on every facet boundary, anisotropic specular sweep on polished metal surfaces during rotation, micro-caustic pooling on adjacent skin surfaces from gemstone light-splitting, sparkle intensity doubled on facet edges catching key light";
}

const BEAUTY_SMOOTHING_TABLE: Array<{ match: RegExp; tag: string }> = [
  { match: /jewel|주얼|necklace|목걸이|chain|체인|bracelet|팔찌|earring|귀걸이|ring|반지|watch|시계|gem|보석|diamond|다이아|crystal|크리스탈/i, tag: "beauty_smooth=balanced skin smoothing on exposed zones face neck and hands, tone-evening filter evens skin redness and blemish softening without plastic look, skin pores and micro-texture preserved for realism, jewelry and gemstone edges remain razor-sharp with full micro-detail retention, smoothing intensity self-limits at jewelry-skin boundary to maximize accessory contrast, no smoothing applied to metal or gem surfaces" },
  { match: /silk|실크|샤틴|satin|chiffon|드레스|dress|skirt|치마|scarf|스카프|blouse|블라우스/i, tag: "beauty_smooth=balanced skin smoothing on exposed face neck decolletage and arms, skin tone-evening for uniform complexion, blemish softening preserves natural skin micro-texture and pore detail, fabric weave and thread micro-detail remain fully sharp, smoothing boundary stops at fabric-skin edge to maximize textile contrast, sheer fabric areas retain skin visibility without double-smoothing artifacts" },
  { match: /leather|가죽|재킷|jacket|boots|부츠|gloves|장갑|bag|가방|shoe|신발/i, tag: "beauty_smooth=balanced skin smoothing on exposed face and hands, tone-evening on visible skin zones, blemish softening retains natural skin texture and edge fidelity, leather grain pores and stitching micro-detail remain fully sharp, smoothing intensity reduces at leather-skin boundary to maximize material contrast, no smoothing on leather or hardware surfaces" },
  { match: /cotton|코튼|면|linen|린넨|셔츠|shirt|wool|울|니트|knit|코트|coat|denim|데님/i, tag: "beauty_smooth=balanced skin smoothing on exposed face neck and hands, skin tone-evening for natural complexion uniformity, blemish softening without losing skin micro-detail, fabric thread weave and texture remain fully sharp, smoothing boundary respects fabric-skin edge to maximize garment contrast, no smoothing applied to fabric surface" },
  { match: /fabric|패브릭|textile|텍스타일|의류|clothing|옷/i, tag: "beauty_smooth=balanced skin smoothing on exposed skin zones, tone-evening filter for uniform complexion, blemish softening preserves natural skin micro-texture and pore detail, fabric and accessory micro-details remain fully sharp, smoothing self-limits at garment-skin boundary to maximize product contrast, no smoothing on fabric or accessory surfaces" },
];

function buildBeautySmoothTag(materialGuess: string, category: string): string {
  const combined = `${materialGuess} ${category}`.trim();
  if (!combined) return "";
  for (const { match, tag } of BEAUTY_SMOOTHING_TABLE) {
    if (match.test(combined)) return tag;
  }
  return "";
}

const SENSORY_HOOK_TABLE: Array<{ match: RegExp; hooks: string[] }> = [
  { match: /diamond|다이아|gem|보석|crystal|크리스탈|jewel|주얼/i, hooks: [
    "이거 안 보면 손해다 0.5캐럿 빛의 차이",
    "이거 진짜임 목선에 닿는 순간 소름",
    "각도 바꿀 때마다 빛이 폭발함 진짜",
    "이거 보고 다른 건 다 안 보임 각",
    "이거 하나로 분위기 종결임",
    "이거 모르면 손해 보석 진짜 이렇게 빛남",
  ]},
  { match: /necklace|목걸이|chain|체인|pendant|펜던트/i, hooks: [
    "목선에 닿는 순간 스크롤 멈춤 진짜",
    "이거 쓰면 분위기 자체가 달라짐",
    "체인이 흘러내리는 거 보면 빠져들음",
    "이거 하나로 오늘 룩 종결임",
    "목걸이 하나 바꿨을 뿐인데 충격",
    "이거 안 사면 후회 각 진짜 예쁨",
  ]},
  { match: /ring|반지|bracelet|팔찌|earring|귀걸이|watch|시계/i, hooks: [
    "손가락에 감기는 빛 보면 멈출 수 없음",
    "이거 쓰는 순간 손이 달라 보임 진짜",
    "손목 위 반지 하나로 존재감 종결",
    "이거 보고 다른 반지 다 안 예뻐 보임",
    "이거 안 끼면 손해인 거 맞음",
    "이거 진짜 예뻐서 진심 추천임",
  ]},
  { match: /silk|실크|새틴|satin|chiffon|드레스|dress|치마|skirt|스카프/i, hooks: [
    "바람에 흔들리는 실크 보면 스크롤 멈춤",
    "이거 입는 순간 다른 옷 다 필요없음",
    "피부에 닿는 감각이 진짜 다름",
    "이거 입고 SNS 올렸더니 난리남",
    "이거 안 사면 후임 진짜 예쁨",
    "이거 입으면 분위기 자체가 바뀜 각",
  ]},
  { match: /leather|가죽|스웨이드|jacket|재킷|boots|부츠|bag|가방|shoe|신발/i, hooks: [
    "가죽 결 보면 손끝이 먼저 반응함",
    "이거 하나로 룩이 확 바뀜 진짜",
    "이거 신는 순간 다른 거 다 안 보임",
    "가죽 질감 진짜 미쳤음 이거 실화냐",
    "이거 안 사면 손해인 거 맞다",
    "이거 사고 다른 가방 다 버렸음",
  ]},
  { match: /gold|골드|silver|실버|brass|황동|copper|구리|metal|금속/i, hooks: [
    "이거 빛나는 거 보면 멈출 수 없음",
    "메탈 빛 하나로 분위기 종결임",
    "이거 진짜 예뻐서 진심 올림",
    "이거 쓰면 다른 거 다 안 보임 각",
    "이거 모르면 손해 빛이 진짜 다름",
    "이거 보고 빠져들면 막을 수 없음",
  ]},
  { match: /cotton|코튼|면|linen|린넨|셔츠|shirt|wool|울|니트|knit|코트|coat|denim|데님/i, hooks: [
    "이거 입는 순간 편안함이 다름 진짜",
    "이거 하나로 데일리 룩 종결임",
    "니트 결이 진짜 예쁨 소름",
    "이거 안 사면 후회 각 진짜",
    "이거 입고 다른 거 다 안 입어도 됨",
    "이거 입어본 사람만 안다 진짜",
  ]},
  { match: /fabric|패브릭|textile|텍스타일|의류|clothing|옷/i, hooks: [
    "이거 입으면 분위기 자체가 바뀜",
    "이거 하나로 룩 종결 진짜 예쁨",
    "이거 안 사면 손해 보는 거 맞음",
    "이거 입어본 사람만 아는 거",
    "이거 입고 SNS 올렸더니 난리남",
    "이거 진짜 예뻐서 진심 추천임",
  ]},
];

function buildSensoryHook(v: ProductVisionData, hookCategory: string, variationSeed: number): string {
  const combined = `${v.materialGuess} ${v.productCategory} ${v.productName}`.trim();
  for (const { match, hooks } of SENSORY_HOOK_TABLE) {
    if (match.test(combined)) {
      return hooks[variationSeed % hooks.length];
    }
  }
  const fallback = HOOK_TEXTS[hookCategory] ?? HOOK_TEXTS.curiosity;
  return fallback[variationSeed % fallback.length];
}

function buildModeRenderingTokens(
  selectedMode?: 'auto_3d' | 'universal_synthesis' | 'manual',
  enableOrbit360?: boolean,
  enableCaustics?: boolean,
  enableVirtualFitting?: boolean,
  enableFabricPhysics?: boolean,
  orbitSpeed?: number,
): string[] {
  const tokens: string[] = [];
  if (selectedMode === 'auto_3d') {
    if (enableOrbit360) {
      const speedLabel = orbitSpeed != null
        ? orbitSpeed >= 2.0 ? 'fast' : orbitSpeed <= 0.5 ? 'slow' : 'smooth'
        : 'smooth';
      tokens.push(`orbit_camera=${speedLabel} 360-degree orbit rotation around product core, continuous circular camera path maintaining focal lock on product centroid, parallax depth shift across orbit arc`);
    }
    if (enableCaustics) {
      tokens.push('ray_traced_caustics=dynamic light dispersion and specular reflections shifting across facets and metallic surfaces during rotation, real-time caustic pooling on adjacent surfaces, dispersion rainbow refraction on crystal and gem facets, anisotropic specular sweep on polished metal during orbit');
    }
    if (enableFabricPhysics) {
      tokens.push('fabric_physics_engine=real-time gravity simulation with momentum inertia, boundary collision checks preventing clipping artifacts between garment layers and human skin, fabric ripple propagation with body motion delay, gravity-aware drape recovery, fold crease formation and relaxation, self-collision detection between overlapping fabric layers');
    }
  } else if (selectedMode === 'universal_synthesis') {
    if (enableVirtualFitting) {
      tokens.push('virtual_fitting=volumetric body mapping and 3D draping simulation, skeletal mesh alignment for natural garment fit, body-aware cloth wrapping with anatomically correct tension distribution, realistic garment-to-body contact zones with pressure-based deformation');
    }
    if (enableFabricPhysics) {
      tokens.push('fabric_physics_engine=real-time gravity simulation with momentum inertia, boundary collision checks preventing clipping artifacts between garment layers and human skin, fabric ripple propagation with body motion delay, gravity-aware drape recovery, fold crease formation and relaxation, self-collision detection between overlapping fabric layers');
    }
    if (enableOrbit360) {
      const speedLabel = orbitSpeed != null
        ? orbitSpeed >= 2.0 ? 'fast' : orbitSpeed <= 0.5 ? 'slow' : 'smooth'
        : 'smooth';
      tokens.push(`orbit_camera=${speedLabel} 360-degree orbit rotation around model and garment, continuous circular camera path revealing front-side-back silhouette, parallax depth shift across orbit arc capturing fabric drape from all angles`);
    }
  }
  return tokens;
}

function buildCompactRunwayPrompt(p: CompactPromptParams): string {
  const name = sanitizeVideoProductName(p.productName) || sanitizeVideoProductName(p.productVision?.productName) || VIDEO_FALLBACK_PRODUCT_NAME;
  const orientation = p.aspectRatio === "9:16" ? "vertical" : p.aspectRatio === "16:9" ? "horizontal" : "square";

  // Prompt strength: 1-10 scale, default 7. Higher = more literal prompt adherence.
  const strength = p.promptStrength ?? 7;
  const strengthTag = strength >= 8 ? "strict prompt adherence, literal interpretation" : strength <= 4 ? "creative interpretation, loose prompt guidance, artistic freedom" : "balanced prompt adherence";
  const userDirective = safeSlice(p.userPrompt.trim().replace(/\s+/g, " "), 600);
  const userDirectiveTag = userDirective
    ? `USER DIRECTIVE — follow this visual instruction: "${userDirective}"`
    : "";

  // Negative prompt: user-specified elements to exclude
  const negTag = p.negativePrompt && p.negativePrompt.trim() ? `neg=[${safeSlice(p.negativePrompt.trim(), 80)}]` : "";

  // Background style
  const bgTag = p.bgStyle && BG_STYLE_MAP[p.bgStyle] ? `bg=${BG_STYLE_MAP[p.bgStyle]}` : "";

  // Outfit/style intensity: 1-5 scale, default 3
  const outfitTag = p.outfitIntensity != null && p.outfitIntensity !== 3
    ? p.outfitIntensity >= 4 ? "strong style transformation, dramatic outfit change" : "subtle style enhancement, minimal outfit change"
    : "";

  // Camera motion controls
  const zoomTag = p.zoomSpeed != null && p.zoomSpeed !== 2
    ? p.zoomSpeed >= 3 ? "fast aggressive zoom-in" : p.zoomSpeed <= 1 ? "slow gentle zoom-in" : ""
    : "";
  const rotTag = p.cameraRotation != null && p.cameraRotation !== 0
    ? `camera rotation ${p.cameraRotation > 0 ? "right" : "left"} ${Math.abs(p.cameraRotation)}deg`
    : "";

  // Transition effect
  const transTag = p.transitionEffect && TRANSITION_MAP[p.transitionEffect] ? `transitions=${TRANSITION_MAP[p.transitionEffect]}` : "";

  const skipPhysics = p.isDraft === true;
  const modeTokens = buildModeRenderingTokens(p.selectedMode, p.enableOrbit360, skipPhysics ? false : p.enableCaustics, p.enableVirtualFitting, skipPhysics ? false : p.enableFabricPhysics, p.orbitSpeed);

  if (p.isCleanVideoMode) {
    const v = p.productVision;
    const tokens: string[] = [
      `luxury showcase ${name} ${orientation}`,
      skipPhysics ? "cam=smooth gimbal dolly + macro push-in" : "cam=smooth gimbal dolly + gentle orbit + macro push-in",
      "light=professional 3-point studio + softbox + rim light",
      "grade=filmic luxury, shallow DOF, color-graded, premium look",
      skipPhysics ? "quality=premium commercial look" : "quality=top 1% commercial, ultra-premium, high-end brand film",
      `prompt_strength=${strength}/10, ${strengthTag}`,
    ];
    if (userDirectiveTag) tokens.push(userDirectiveTag);
    if (v) {
      const feats = v.visualFeatures.slice(0, 2).join(",");
      tokens.push(`product=${v.shapeDescription},${v.materialGuess}${feats ? "," + feats : ""}`);
      if (v.textureDescription) tokens.push(`texture=${v.textureDescription}`);
      if (!skipPhysics) {
        const matTag = buildMaterialPhysicsTag(v.materialGuess);
        if (matTag) tokens.push(matTag);
        const fabTag = buildFabricPhysicsTag(v.materialGuess, v.productCategory);
        if (fabTag) tokens.push(fabTag);
        const colTag = buildCollisionTag(v.materialGuess, v.productCategory);
        if (colTag) tokens.push(colTag);
        const skinTag = buildSkinResponseTag(v.materialGuess, v.productCategory);
        if (skinTag) tokens.push(skinTag);
      }
    }
    if (bgTag) tokens.push(bgTag);
    if (!skipPhysics) {
      const envLightTag = buildEnvLightingTag(p.bgStyle);
      if (envLightTag) tokens.push(envLightTag);
      if (v) {
        const shadowTag = buildShadowReflectionTag(v.materialGuess, v.productCategory);
        if (shadowTag) tokens.push(shadowTag);
      }
      const dofTag = buildDofFocusTag(p.bgStyle, true);
      if (dofTag) tokens.push(dofTag);
      if (v) {
        const beautyTag = buildBeautySmoothTag(v.materialGuess, v.productCategory);
        if (beautyTag) tokens.push(beautyTag);
      }
      if (v) {
        const jewelryMacroTag = buildJewelryMacroTag(v.materialGuess, v.productCategory);
        if (jewelryMacroTag) tokens.push(jewelryMacroTag);
      }
    }
    tokens.push(buildOpeningHookSequenceTag(true, p.productVision ?? null));
    if (outfitTag) tokens.push(outfitTag);
    if (zoomTag) tokens.push(zoomTag);
    if (rotTag) tokens.push(rotTag);
    if (transTag) tokens.push(transTag);
    for (const mt of modeTokens) tokens.push(mt);
    tokens.push("no text, no captions, no hooks, no CTA, pure luxury product cinematography, top-tier quality");
    tokens.push(`tier=${p.qualityTier}, res=${p.resolution}, fps=${p.fps}`);
    if (negTag) tokens.push(negTag);
    return safeSlice(tokens.join(" "), 1000);
  }

  const style = PLATFORM_STYLE[p.platform] ?? PLATFORM_STYLE.shorts;
  const mood = MOOD_GRADE[p.bgmMood ?? ""] ?? MOOD_GRADE["하이텐션"];
  const hooks = HOOK_TEXTS[p.hookCategory] ?? HOOK_TEXTS.curiosity;
  const genericHook = hooks[p.variationSeed % hooks.length];
  const hook = p.productVision
    ? buildSensoryHook(p.productVision, p.hookCategory, p.variationSeed)
    : genericHook;

  const tokens: string[] = [
    `raw smartphone review ${name} ${orientation}`,
    `cam=${style.camera}`,
    `light=${style.lighting}`,
    `grade=${style.grade},${mood}`,
    `hook="${hook}"`,
    `aesthetic=raw,imperfect,handheld,no-studio`,
    `prompt_strength=${strength}/10, ${strengthTag}`,
  ];

  if (userDirectiveTag) tokens.push(userDirectiveTag);

  if (p.productVision) {
    const v = p.productVision;
    const feats = v.visualFeatures.slice(0, 2).join(",");
    tokens.push(`product=${v.shapeDescription},${v.materialGuess}${feats ? "," + feats : ""}`);
    if (!skipPhysics) {
      const matTag = buildMaterialPhysicsTag(v.materialGuess);
      if (matTag) tokens.push(matTag);
      const fabTag = buildFabricPhysicsTag(v.materialGuess, v.productCategory);
      if (fabTag) tokens.push(fabTag);
      const colTag = buildCollisionTag(v.materialGuess, v.productCategory);
      if (colTag) tokens.push(colTag);
      const skinTag = buildSkinResponseTag(v.materialGuess, v.productCategory);
      if (skinTag) tokens.push(skinTag);
    }
  }

  if (p.captionText && p.captionText.trim()) {
    tokens.push(`ctx="${safeSlice(p.captionText, 40)}"`);
  }

  if (bgTag) tokens.push(bgTag);
  if (!skipPhysics) {
    const envLightTag = buildEnvLightingTag(p.bgStyle);
    if (envLightTag) tokens.push(envLightTag);
    if (p.productVision) {
      const shadowTag = buildShadowReflectionTag(p.productVision.materialGuess, p.productVision.productCategory);
      if (shadowTag) tokens.push(shadowTag);
    }
    const dofTag = buildDofFocusTag(p.bgStyle, false);
    if (dofTag) tokens.push(dofTag);
    if (p.productVision) {
      const beautyTag = buildBeautySmoothTag(p.productVision.materialGuess, p.productVision.productCategory);
      if (beautyTag) tokens.push(beautyTag);
    }
  }
  tokens.push(buildOpeningHookSequenceTag(false, p.productVision ?? null));
  if (outfitTag) tokens.push(outfitTag);
  if (zoomTag) tokens.push(zoomTag);
  if (rotTag) tokens.push(rotTag);
  if (transTag) tokens.push(transTag);
  for (const mt of modeTokens) tokens.push(mt);
  if (negTag) tokens.push(negTag);

  if (p.memeFormat && p.memeText) {
    const sanitizedMemeText = sanitizeVideoText(p.memeText).replace(/"/g, '\"');
    tokens.push(`meme_overlay=format:${p.memeFormat}, text:"${safeSlice(sanitizedMemeText, 60)}", burn-in meme caption, B-grade meme energy, ironic colloquial Korean speech`);
  } else if (p.memeFormat) {
    tokens.push(`meme_overlay=format:${p.memeFormat}, B-grade meme energy, ironic colloquial Korean speech`);
  }
  tokens.push("3phase_conversion:phase1(0-2s HARD HOOK — loss_aversion OR raw_honesty OR social_proof, scroll-stopping jarring visual, B-grade meme energy, zero corporate tone, before-after contrast or shocking confession), phase2(2-7s PROBLEM AGITATION — pain point sniping, relatable frustration, fast cuts synced to beat, raw handheld aesthetic), phase3(7-end CTA LOOP — insider tip framing not corporate command, urgency without desperation, first-last frame matched for infinite loop replay)");
  tokens.push("trigger_mandate:at least ONE of [loss_aversion('이거 모르면 돈 버림'), raw_honesty('광고 아님 진짜임'), social_proof('나만 몰랐던 치트키')] must dominate first 2 seconds");
  tokens.push("banned:corporate jargon, '놓치면 후회', '강력 추천', '혁신적인', '최고의', '완벽한', polished studio tone, spec listing, excessive exclamation, mechanical '~하세요' CTA — use native Korean colloquial meme speech only");
  tokens.push(`tier=${p.qualityTier}, res=${p.resolution}, fps=${p.fps}`);

  return safeSlice(tokens.join(" "), 1000);
}

function parseRunwayError(errText: string): string {
  const trimmed = errText.trim();
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<HTML")) {
    return "Runway API 서버가 HTML 페이지를 반환했습니다. API 엔드포인트 경로가 잘못되었거나 서버가 일시적으로 사용 불가능합니다.";
  }
  try {
    const errJson = JSON.parse(trimmed);
    if (errJson?.error) {
      if (typeof errJson.error === "string") return errJson.error.slice(0, 500);
      if (typeof errJson.error === "object") {
        const fields = Object.entries(errJson.error)
          .map(([field, val]) => `${field}: ${typeof val === "string" ? val : JSON.stringify(val)}`)
          .join("; ");
        return fields.slice(0, 500);
      }
    }
    if (errJson?.message) return String(errJson.message).slice(0, 500);
    if (Array.isArray(errJson?.details)) return errJson.details.map((d: unknown) => String(d)).join("; ").slice(0, 500);
  } catch { /* not JSON */ }
  return trimmed.slice(0, 500);
}

async function submitWithRetry(fn: () => Promise<string>, maxRetries: number): Promise<string> {
  const deadline = Date.now() + EDGE_WALL_CLOCK_BUDGET_MS;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (Date.now() >= deadline) {
      throw lastErr ?? new Error("비디오 생성 요청 시간 초과 (엣지 함수 제한)");
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      // Non-retryable errors: 401 (bad key), 400 (bad request), 404 (bad endpoint)
      // — no amount of retrying will fix these, so fail immediately.
      const msg = lastErr.message;
      if (/HTTP 40[14]/.test(msg) || /HTTP 400/.test(msg)) {
        throw lastErr;
      }
      // Exponential backoff: 1.5s, 3s, 6s, 12s — stop if next delay exceeds deadline
      const backoffDelay = RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt);
      if (attempt < maxRetries && Date.now() + backoffDelay < deadline) {
        console.log(`[generate-video] Retry ${attempt + 1}/${maxRetries} after ${backoffDelay}ms:`, lastErr.message);
        await delay(backoffDelay);
      }
    }
  }
  throw lastErr ?? new Error("비디오 생성 요청 실패");
}

const STORAGE_DOWNLOAD_TIMEOUT_MS = 60_000;
const STORAGE_UPLOAD_TIMEOUT_MS = 120_000;

async function uploadToStorage(videoUrl: string, scanId: string): Promise<string | null> {
  try {
    const downloadController = new AbortController();
    const downloadTimeoutId = setTimeout(() => downloadController.abort(), STORAGE_DOWNLOAD_TIMEOUT_MS);
    const resp = await fetch(videoUrl, { signal: downloadController.signal });
    if (!resp.ok || !resp.body) {
      clearTimeout(downloadTimeoutId);
      return null;
    }
    clearTimeout(downloadTimeoutId);

    const fileName = `${scanId}/${Date.now()}_ai_video.mp4`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/videos/${fileName}`;

    const contentLength = resp.headers.get("content-length");
    const uploadHeaders: Record<string, string> = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "video/mp4",
      "x-upsert": "true",
      "Cache-Control": "max-age=360000",
    };
    if (contentLength) {
      uploadHeaders["Content-Length"] = contentLength;
    }

    const uploadController = new AbortController();
    const uploadTimeoutId = setTimeout(() => uploadController.abort(), STORAGE_UPLOAD_TIMEOUT_MS);

    // Pipe the download stream directly into the upload — no in-memory blob.
    // This halves memory usage and avoids the 20s timeout that killed HD uploads.
    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: uploadHeaders,
      body: resp.body,
      signal: uploadController.signal,
      // @ts-expect-error -- duplex is required for streaming bodies in Deno
      duplex: "half",
    });
    clearTimeout(uploadTimeoutId);

    // Drain and discard the upload response body to free the connection.
    try { await uploadResp.text(); } catch { /* non-fatal */ }

    if (!uploadResp.ok) return null;
    return `${supabaseUrl}/storage/v1/object/public/videos/${fileName}`;
  } catch {
    return null;
  }
}

async function updateScanWithVideo(scanId: string, videoUrl: string): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    await fetch(`${supabaseUrl}/rest/v1/scans?id=eq.${encodeURIComponent(scanId)}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ video_url: videoUrl }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {
    // non-fatal
  }
}

async function sendVideoCompletePush(scanId: string): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        title: "영상 생성 완료",
        body: "AI 영상이 완성되었어요. 지금 바로 확인해보세요!",
        url: `/result/${scanId}`,
        data: { scanId, type: "video_complete" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {
    // non-fatal — push is best-effort
  }
}

function safeSlice(s: string, max: number): string {
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  if (cut.charCodeAt(cut.length - 1) >= 0xD800 && cut.charCodeAt(cut.length - 1) <= 0xDBFF) {
    cut = cut.slice(0, -1);
  }
  return cut;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveRunwayKey(): Promise<string | null> {
  // Prefer the server-level key from environment variables. Only fall back
  // to user_settings if no server key is configured, and even then only
  // fetch the most recently updated key (single-tenant app).
  const serverKey = Deno.env.get("RUNWAY_API_KEY") ?? null;
  if (serverKey) return serverKey;

  if (supabaseUrl && serviceRoleKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/user_settings?select=runway_api_key&order=updated_at.desc&limit=1`,
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
        const rows = await resp.json() as Array<{ runway_api_key: string | null }>;
        if (rows.length > 0 && rows[0].runway_api_key) {
          return rows[0].runway_api_key;
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

async function checkRateLimit(identifier: string): Promise<boolean> {
  if (!supabaseUrl || !serviceRoleKey) return true;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/rpc/check_rate_limit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          p_identifier: identifier,
          p_feature: "generate_video",
          p_daily_limit: VIDEO_DAILY_LIMIT,
        }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
    if (!resp.ok) return true;
    const data = await resp.json();
    return data === true;
  } catch {
    return true;
  }
}
