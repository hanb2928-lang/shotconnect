import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
  mode?: "submit" | "poll" | "webhook" | "runway-submit";
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
  selectedMode?: 'auto_3d' | 'universal_synthesis' | 'manual';
  enableOrbit360?: boolean;
  enableCaustics?: boolean;
  enableVirtualFitting?: boolean;
  enableFabricPhysics?: boolean;
  // webhook fields (sent by Runway callback)
  status?: string;
  output?: string[] | { url?: string } | string;
  failure?: string;
  error?: string;
}

const MAX_RETRIES = 3; // Max retry attempts for transient API errors (4 total attempts)
const RETRY_INITIAL_DELAY_MS = 1500; // Base delay for first retry, doubled each attempt
const RUNWAY_SUBMIT_TIMEOUT_MS = 20000;
const RUNWAY_POLL_TIMEOUT_MS = 10000;
const EDGE_WALL_CLOCK_BUDGET_MS = 120000;
const ZOMBIE_JOB_TIMEOUT_MS = 600000; // 10 minutes — jobs exceeding this in PENDING/PROCESSING are auto-failed
const SERVER_POLL_MAX_ATTEMPTS = 60; // ~10 min of polling with jitter, covers 2-4 min Runway renders + HD upscale + retries
const SERVER_POLL_INITIAL_DELAY_MS = 4000;
const SERVER_POLL_MAX_DELAY_MS = 15000;
const SERVER_POLL_SELF_INVOKE_TIMEOUT_MS = 15000; // AbortController timeout for self-reinvocation fetch
const JITTER_MAX_MS = 2000; // Random jitter added to each backoff delay to desynchronize concurrent polls
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
        } catch {
          // Runway may send form-encoded or empty body
        }
      }
      return await handleWebhook(body);
    }

    body = await req.json();
    const mode = body.mode ?? "submit";

    // Validate required fields per mode
    const validModes = ["submit", "poll", "server-poll", "webhook", "runway-submit"];
    if (!validModes.includes(mode)) {
      return new Response(
        JSON.stringify({ error: `지원하지 않는 모드입니다: ${mode}`, step: "validation", provider: "unknown" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "submit") {
      // At least one of prompt, scanId, productName, or productVision must be present
      const hasAnyContext = body.prompt || body.scanId || body.productName || body.productVision;
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

    // runway-submit mode needs the Runway key to call the API
    if (mode === "runway-submit") {
      const runwayKey = await resolveRunwayKey();
      if (!runwayKey) {
        return new Response(
          JSON.stringify({ error: "Runway API 키가 설정되지 않았습니다.", step: "key_resolution", provider: "none" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return await handleRunwaySubmit(body, runwayKey);
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
  console.log("[generate-video] Submit payload:", JSON.stringify({
    promptLength: body.prompt?.length ?? 0,
    durationSec: body.durationSec,
    aspectRatio: body.aspectRatio,
    productName: body.productName,
    scanId: body.scanId,
    variationSeed: body.variationSeed,
    hasProductVision: !!body.productVision,
    selectedMode: body.selectedMode ?? 'none',
    enableOrbit360: body.enableOrbit360 === true,
    orbitSpeed: typeof body.orbitSpeed === 'number' && body.orbitSpeed > 0 ? body.orbitSpeed : undefined,
    enableCaustics: body.enableCaustics === true,
    enableVirtualFitting: body.enableVirtualFitting === true,
    enableFabricPhysics: body.enableFabricPhysics === true,
    injectedModeTokens: modeTokens,
  }));

  const isDraft = body.draft === true;
  const requestedDuration = Math.min(Math.max(Math.round(body.durationSec ?? 5), 2), 10);
  const durationSec = isDraft ? Math.min(requestedDuration, 3) : requestedDuration;

  const sanitizedProductName = sanitizeVideoProductName(body.productName);
  const sanitizedCaptionText = sanitizeVideoText(body.captionText);

  let effectivePrompt = body.prompt ?? "";
  if (effectivePrompt.trim().length === 0) {
    effectivePrompt = buildAutoPrompt(sanitizedProductName, body.productVision, sanitizedCaptionText, body.isCleanVideoMode === true, requestedDuration, body.enableOrbit360 === true, typeof body.orbitSpeed === 'number' ? body.orbitSpeed : undefined, body.enableFabricPhysics === true);
  }
  const aspectRatio = body.aspectRatio ?? "9:16";
  const variationSeed = body.variationSeed ?? 0;

  const hdUpscale = body.hdUpscale === true;
  const qualityTier = hdUpscale ? 'pro' : (body.qualityTier ?? 'standard');
  const resolution = body.resolution ?? (hdUpscale ? '1080p' : '720p');
  const fps = body.fps ?? (hdUpscale ? 30 : 24);

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
  });
  console.log("[generate-video] Final runway prompt length:", runwayPrompt.length, "| mode tokens injected:", modeTokens.length, "| prompt preview:", runwayPrompt.slice(0, 200));

  // Generate internal job ID immediately — no waiting for Runway API
  const internalJobId = crypto.randomUUID();

  // Save PENDING row to DB immediately
  if (body.scanId) {
    await saveVideoJob(body.scanId, internalJobId, isDraft, hdUpscale);
  }

  // Fire-and-forget: self-invoke runway-submit mode to call Runway API asynchronously
  if (supabaseUrl && serviceRoleKey) {
    const selfUrl = `${supabaseUrl}/functions/v1/generate-video`;
    fetch(selfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        mode: "runway-submit",
        taskId: internalJobId,
        scanId: body.scanId,
        runwayPrompt,
        durationSec,
        aspectRatio,
        isDraft,
        hdUpscale,
        resolution,
        fps,
      }),
    }).catch((err) => {
      console.error("[generate-video] Failed to self-invoke runway-submit:", err);
      // Mark job as FAILED if we can't even start the Runway submission
      if (body.scanId) {
        markVideoJobFailed(body.scanId, internalJobId, "Runway API 호출 시작에 실패했습니다.");
      }
    });
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
    }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Async Runway API submission — called via self-invoke from handleSubmit.
 * Calls the Runway API, stores the real runway_task_id, then kicks off server-poll.
 */
async function handleRunwaySubmit(body: GenerateVideoRequest, runwayKey: string): Promise<Response> {
  const internalJobId = body.taskId;
  const scanId = body.scanId;

  if (!internalJobId || !scanId) {
    return new Response(
      JSON.stringify({ error: "runway-submit 모드에서는 taskId와 scanId가 필요합니다." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const runwayPrompt = body.prompt ?? body.runwayPrompt ?? "";
  if (!runwayPrompt) {
    await markVideoJobFailed(scanId, internalJobId, "Runway 프롬프트가 비어 있습니다.");
    return new Response(
      JSON.stringify({ error: "runwayPrompt가 필요합니다." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const aspectRatio = body.aspectRatio ?? "9:16";
  const durationSec = Math.min(Math.max(Math.round(body.durationSec ?? 5), 2), 10);
  const isDraft = body.draft === true;
  const hdUpscale = body.hdUpscale === true;
  const resolution = body.resolution ?? (hdUpscale ? "1080p" : "720p");
  const fps = body.fps ?? (hdUpscale ? 30 : 24);

  try {
    const webhookUrl = `${supabaseUrl}/functions/v1/generate-video`;

    let promptImage: string | null = null;
    promptImage = await fetchScanImageUrl(scanId);
    console.log("[generate-video] runway-submit: Fetched scan image:", promptImage ? "found" : "not found");

    const runwayTaskId = await submitWithRetry(
      () => submitRunwayTask(runwayPrompt, runwayKey, aspectRatio, durationSec, isDraft, webhookUrl, scanId, promptImage, hdUpscale, resolution, fps),
      MAX_RETRIES,
    );

    // Store the real Runway task ID in the video_jobs row
    await updateRunwayTaskId(scanId, internalJobId, runwayTaskId);
    console.log(`[generate-video] runway-submit: Runway task ${runwayTaskId} saved for job ${internalJobId}`);

    // Kick off server-poll using the Runway task ID
    if (supabaseUrl && serviceRoleKey) {
      setTimeout(() => {
        const selfUrl = `${supabaseUrl}/functions/v1/generate-video`;
        fetch(selfUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
          body: JSON.stringify({
            mode: "server-poll",
            taskId: runwayTaskId,
            scanId,
            variationSeed: 0,
          }),
        }).catch(() => {
          // Non-fatal — zombie-job guard will catch it if this fails.
        });
      }, SERVER_POLL_INITIAL_DELAY_MS);
    }

    return new Response(
      JSON.stringify({ mode: "runway-submit", status: "SUBMITTED", runwayTaskId, internalJobId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[generate-video] runway-submit error:", err);
    const errMsg = err instanceof Error ? err.message : "Runway API 호출에 실패했습니다.";
    await markVideoJobFailed(scanId, internalJobId, errMsg);
    return new Response(
      JSON.stringify({ error: errMsg, step: "runway-submit", provider: "runway" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
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
    const cached = await checkWebhookResult(body.scanId);
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

    const jobStatus = await checkVideoJobStatus(body.scanId, taskId);
    if (jobStatus?.status === "FAILED") {
      return new Response(
        JSON.stringify({
          mode: "poll",
          status: "FAILED",
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
          videoUrl: jobStatus.videoUrl,
          taskId,
          provider: "runway",
          persisted: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve runway_task_id — the client may poll with the internal job ID
    // before the async Runway submission has completed. If runway_task_id is
    // not yet set, the job is still being submitted to Runway.
    const runwayTaskId = jobStatus?.runwayTaskId ?? taskId;
    const pollStatus = await pollRunwayTask(runwayTaskId, runwayKey);

    if (pollStatus.status === "SUCCESS" && pollStatus.videoUrl) {
      let persistedUrl: string | null = null;
      if (supabaseUrl && serviceRoleKey) {
        persistedUrl = await uploadToStorage(pollStatus.videoUrl, body.scanId);
        if (persistedUrl) {
          await updateScanWithVideo(body.scanId, persistedUrl);
        }
        await markVideoJobComplete(body.scanId, taskId, persistedUrl ?? pollStatus.videoUrl);
      }
      const finalUrl = persistedUrl ?? pollStatus.videoUrl;
      return new Response(
        JSON.stringify({
          mode: "poll",
          status: "SUCCESS",
          videoUrl: finalUrl,
          originalVideoUrl: pollStatus.videoUrl !== finalUrl ? pollStatus.videoUrl : undefined,
          taskId,
          provider: "runway",
          persisted: !!persistedUrl,
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
          error: pollStatus.error ?? "Runway 비디오 생성에 실패했습니다.",
          taskId,
          provider: "runway",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        mode: "poll",
        status: pollStatus.status,
        progress: pollStatus.progress ?? "",
        taskId,
        provider: "runway",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const status = await pollRunwayTask(taskId, runwayKey);

  if (status.status === "SUCCESS" && status.videoUrl) {
    let persistedUrl: string | null = null;
    if (body.scanId && supabaseUrl && serviceRoleKey) {
      persistedUrl = await uploadToStorage(status.videoUrl, body.scanId);
      if (persistedUrl) {
        await updateScanWithVideo(body.scanId, persistedUrl);
      }
    }
    const finalUrl = persistedUrl ?? status.videoUrl;
    return new Response(
      JSON.stringify({
        mode: "poll",
        status: "SUCCESS",
        videoUrl: finalUrl,
        originalVideoUrl: status.videoUrl !== finalUrl ? status.videoUrl : undefined,
        taskId,
        provider: "runway",
        persisted: !!persistedUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (status.status === "FAILED") {
    return new Response(
      JSON.stringify({
        mode: "poll",
        status: "FAILED",
        error: status.error ?? "Runway 비디오 생성에 실패했습니다.",
        taskId,
        provider: "runway",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      mode: "poll",
      status: status.status,
      progress: status.progress ?? "",
      taskId,
      provider: "runway",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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

  // Check if the job was already completed by a webhook
  const cached = await checkWebhookResult(scanId);
  if (cached) {
    return new Response(
      JSON.stringify({ mode: "server-poll", status: "SUCCESS", videoUrl: cached, taskId, persisted: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Check if the job was already marked FAILED or SUCCESS — look up by runway_task_id
  const jobInfo = await findJobByRunwayTaskId(scanId, taskId);
  if (jobInfo?.status === "FAILED") {
    return new Response(
      JSON.stringify({ mode: "server-poll", status: "FAILED", error: jobInfo.error, taskId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (jobInfo?.status === "SUCCESS" && jobInfo.videoUrl) {
    return new Response(
      JSON.stringify({ mode: "server-poll", status: "SUCCESS", videoUrl: jobInfo.videoUrl, taskId, persisted: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const internalJobId = jobInfo?.internalJobId ?? taskId;

  if (attempt >= SERVER_POLL_MAX_ATTEMPTS) {
    await markVideoJobFailed(scanId, internalJobId, "서버 폴링이 최대 횟수에 도달했습니다. 좀비 작업으로 분류됩니다.");
    return new Response(
      JSON.stringify({ mode: "server-poll", status: "FAILED", error: "서버 폴링 한도 초과", taskId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Poll Runway once
  const status = await pollRunwayTask(taskId, runwayKey);

  if (status.status === "SUCCESS" && status.videoUrl) {
    // Check if the webhook already completed this job — skip redundant work
    const existing = await findJobByRunwayTaskId(scanId, taskId);
    if (existing?.status === "SUCCESS" && existing.videoUrl) {
      return new Response(
        JSON.stringify({ mode: "server-poll", status: "SUCCESS", videoUrl: existing.videoUrl, taskId, persisted: true, alreadyCompleted: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let persistedUrl: string | null = null;
    if (supabaseUrl && serviceRoleKey) {
      persistedUrl = await uploadToStorage(status.videoUrl, scanId);
      if (persistedUrl) {
        await updateScanWithVideo(scanId, persistedUrl);
      }
      await markVideoJobComplete(scanId, internalJobId, persistedUrl ?? status.videoUrl);
    }
    await sendVideoCompletePush(scanId);
    return new Response(
      JSON.stringify({
        mode: "server-poll",
        status: "SUCCESS",
        videoUrl: persistedUrl ?? status.videoUrl,
        taskId,
        persisted: !!persistedUrl,
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

  // Schedule the next poll via self-reinvocation
  // Exponential backoff with full jitter to desynchronize concurrent jobs
  const baseDelay = Math.min(SERVER_POLL_INITIAL_DELAY_MS * Math.pow(1.5, attempt), SERVER_POLL_MAX_DELAY_MS);
  const jitter = Math.random() * JITTER_MAX_MS;
  const nextDelay = Math.round(baseDelay + jitter);
  const nextAttempt = attempt + 1;

  // Fire-and-forget self-reinvoke after delay with AbortController guard
  setTimeout(() => {
    const selfUrl = `${supabaseUrl}/functions/v1/generate-video`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SERVER_POLL_SELF_INVOKE_TIMEOUT_MS);
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
        variationSeed: nextAttempt,
      }),
      signal: controller.signal,
    }).then(() => {
      clearTimeout(timeoutId);
    }).catch(() => {
      clearTimeout(timeoutId);
      // If self-reinvoke fails, the zombie-job guard in checkVideoJobStatus
      // will eventually mark it FAILED after ZOMBIE_JOB_TIMEOUT_MS.
    });
  }, nextDelay);

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

  if (!taskId || !scanId) {
    return new Response(
      JSON.stringify({ error: "webhook 처리에 taskId와 scanId가 필요합니다." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
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
    if (existing?.status === "SUCCESS" && existing.videoUrl) {
      console.log("[generate-video] Webhook: job already completed by server-poll, skipping");
      return new Response(
        JSON.stringify({ mode: "webhook", status: "SUCCESS", scanId, persisted: true, alreadyCompleted: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const internalJobId = existing?.internalJobId ?? taskId;

    let persistedUrl: string | null = null;
    if (supabaseUrl && serviceRoleKey) {
      persistedUrl = await uploadToStorage(videoUrl, scanId);
      if (persistedUrl) {
        await updateScanWithVideo(scanId, persistedUrl);
      }
      await markVideoJobComplete(scanId, internalJobId, persistedUrl ?? videoUrl);
    }
    await sendVideoCompletePush(scanId);

    console.log("[generate-video] Webhook: video persisted for scan", scanId);
    return new Response(
      JSON.stringify({ mode: "webhook", status: "SUCCESS", scanId, persisted: !!persistedUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (status === "FAILED" || status === "CANCELED") {
    const errMsg = body.failure ?? body.error ?? "Runway 생성 실패";
    if (supabaseUrl && serviceRoleKey) {
      const jobInfo = await findJobByRunwayTaskId(scanId, taskId);
      const internalJobId = jobInfo?.internalJobId ?? taskId;
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

async function checkVideoJobStatus(scanId: string, taskId: string): Promise<{ status: string; error?: string; videoUrl?: string; runwayTaskId?: string } | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${scanId}&task_id=eq.${taskId}&select=status,error_message,video_url,created_at,runway_task_id`,
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
          await markVideoJobFailed(scanId, taskId, '영상 생성이 6분 이상 진행 중 상태로 멈춰 있어 좀비 작업으로 분류되었습니다. 다시 시도해주세요.');
          return { status: 'FAILED', error: '영상 생성 작업이 시간 초과로 실패했습니다. 다시 시도해주세요.' };
        }
        return {
          status: row.status,
          error: row.error_message ?? undefined,
          videoUrl: row.video_url ?? undefined,
          runwayTaskId: row.runway_task_id ?? undefined,
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function checkWebhookResult(scanId: string): Promise<string | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/scans?select=video_url&id=eq.${scanId}`,
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
      const rows = await resp.json() as Array<{ video_url: string | null }>;
      if (rows.length > 0 && rows[0].video_url) {
        return rows[0].video_url;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function saveVideoJob(scanId: string, taskId: string, isDraft: boolean, isHd: boolean): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    await fetch(`${supabaseUrl}/rest/v1/video_jobs`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        scan_id: scanId,
        task_id: taskId,
        status: "PENDING",
        step: "rendering",
        is_draft: isDraft,
        is_hd: isHd,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {
    // non-fatal
  }
}

async function updateRunwayTaskId(scanId: string, internalJobId: string, runwayTaskId: string): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${scanId}&task_id=eq.${internalJobId}`, {
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
  } catch {
    // non-fatal — server-poll can still find the job via task_id
  }
}

async function findJobByRunwayTaskId(scanId: string, runwayTaskId: string): Promise<{ status: string; error?: string; videoUrl?: string; internalJobId?: string } | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${scanId}&runway_task_id=eq.${runwayTaskId}&select=status,error_message,video_url,task_id,created_at`,
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
      const rows = await resp.json() as Array<{ status: string; error_message: string | null; video_url: string | null; task_id: string; created_at: string }>;
      if (rows.length > 0) {
        const row = rows[0];
        const isZombie = (row.status === 'PENDING' || row.status === 'PROCESSING' || row.status === 'RUNNING' || row.status === 'THROTTLED')
          && Date.now() - new Date(row.created_at).getTime() > ZOMBIE_JOB_TIMEOUT_MS;
        if (isZombie) {
          await markVideoJobFailed(scanId, row.task_id, '영상 생성이 6분 이상 진행 중 상태로 멈춰 있어 좀비 작업으로 분류되었습니다. 다시 시도해주세요.');
          return { status: 'FAILED', error: '영상 생성 작업이 시간 초과로 실패했습니다. 다시 시도해주세요.' };
        }
        return {
          status: row.status,
          error: row.error_message ?? undefined,
          videoUrl: row.video_url ?? undefined,
          internalJobId: row.task_id,
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function markVideoJobComplete(scanId: string, taskId: string, videoUrl: string): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    // Atomic transition: only PATCH if the job is NOT already in a terminal state.
    // This prevents webhook and server-poll from racing to overwrite each other.
    await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${scanId}&task_id=eq.${taskId}&status=not.in.(SUCCESS,FAILED)`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ status: "SUCCESS", step: "completed", video_url: videoUrl, completed_at: new Date().toISOString() }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {
    // non-fatal
  }
}

async function markVideoJobFailed(scanId: string, taskId: string, errMsg: string): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    // Atomic transition: only PATCH if the job is NOT already in a terminal state.
    // Prevents a late failure from overwriting a successful completion.
    await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${scanId}&task_id=eq.${taskId}&status=not.in.(SUCCESS,FAILED)`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ status: "FAILED", step: "failed", error_message: errMsg.slice(0, 500) }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {
    // non-fatal
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
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    await fetch(`${supabaseUrl}/rest/v1/video_jobs?scan_id=eq.${scanId}&task_id=eq.${taskId}&status=not.in.(SUCCESS,FAILED)`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ step }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {
    // non-fatal
  }
}

async function fetchScanImageUrl(scanId: string): Promise<string | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/scans?select=edited_image_url,image_url&id=eq.${scanId}`,
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
  } catch {
    // non-fatal
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
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RUNWAY_SUBMIT_TIMEOUT_MS);

  try {
    const clampedDuration = Math.min(Math.max(Math.round(durationSec), 2), 10);
    const ratioMap: Record<string, string> = isHd
      ? {
          "9:16": "1080:1920",
          "16:9": "1920:1080",
          "1:1": "1440:1440",
          "4:3": "1440:1080",
          "3:4": "1080:1440",
          "21:9": "2376:1008",
        }
      : {
          "9:16": "720:1280",
          "16:9": "1280:720",
          "1:1": "960:960",
          "4:3": "1104:832",
          "3:4": "832:1104",
          "21:9": "1584:672",
        };

    const hasImage = typeof promptImage === "string" && promptImage.length > 0;
    const endpoint = hasImage ? "image_to_video" : "text_to_video";
    const model = "gen4.5";
    const ratioValue = ratioMap[aspectRatio] ?? "720:1280";
    const safePrompt = prompt.trim().slice(0, 1000);

    const payload: Record<string, unknown> = {
      model,
      promptText: safePrompt,
      duration: clampedDuration,
      ratio: ratioValue,
    };
    if (resolution) payload.resolution = resolution;
    if (fps != null) payload.fps = fps;
    if (hasImage && promptImage) {
      payload.promptImage = promptImage;
    }

    console.log("[generate-video] Runway request:", JSON.stringify({
      endpoint: `https://api.dev.runwayml.com/v1/${endpoint}`,
      method: "POST",
      model: payload.model,
      duration: payload.duration,
      ratio: payload.ratio,
      hasPromptImage: hasImage,
      promptLength: prompt.length,
      promptPreview: prompt.slice(0, 120),
      fullBody: JSON.stringify(payload),
    }));

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

    console.log("[generate-video] Runway response:", JSON.stringify({
      status: respStatus,
      bodyPreview: respText.slice(0, 500),
    }));

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
      throw new Error("Runway 생성 요청 시간이 초과되었습니다 (30초).");
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
): string {
  const parts: string[] = [];

  const name = sanitizeVideoProductName(productName) || sanitizeVideoProductName(vision?.productName) || VIDEO_FALLBACK_PRODUCT_NAME;

  const speedLabel = orbitSpeed != null
    ? orbitSpeed >= 2.0 ? 'fast' : orbitSpeed <= 0.5 ? 'slow' : 'smooth'
    : 'smooth';

  const safeCopy = vision ? sanitizeCopyLayers(vision.suggestedCopyLayers) : VIDEO_FALLBACK_COPY_LAYERS;

  if (isCleanVideoMode) {
    parts.push(`Top-tier luxury commercial for ${name}, ultra-premium 3D product showcase, cinematic quality rivaling high-end brand films`);
    if (enableOrbit360) {
      parts.push(`${speedLabel} 360-degree orbit rotation around product core, continuous circular camera path maintaining focal lock on product centroid, parallax depth shift across orbit arc`);
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
    parts.push(`caption context: "${captionText.slice(0, 100)}"`);
  }

  parts.push(buildOpeningHookSequenceTag(false, vision));
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
  curiosity: ["이거 진짜였음?", "나만 빼고 다 알더라", "왜 이제야 알았지 진짜"],
  problem: ["이거 모르면 호구 되는 거", "이거 때문에 돈 날릴 뻔", "다들 이걸로 고생함"],
  transformation: ["이랬는데 → 이렇게 됨", "사용 전후 비교 충격", "이거 쓰고 다른 거 다 버렸음"],
  social_proof: ["실시간 품절 캡처 봄", "다들 이거 사느라 난리", "리뷰 수 폭발 중"],
  fomo: ["품절 전에 확인하셈", "선착순 마감 임박", "이거 모르면 손해인데"],
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
    return `opening_hook_sequence=0-3s extreme close-up macro lock-on on ${detailSubject}, ultra-tight framing revealing micro-texture and craftsmanship detail, shallow DOF with razor-thin focal plane on surface grain, slow rack-focus pull across material texture, 3s mark triggers instant dynamic whip-pan transition to virtual model full-shot wearing product, full-body framing with product contextually integrated, camera continues smooth orbit after transition, scroll-stopping visual contrast between macro intimacy and full-shot grandeur, no lag no fade cut on the beat`;
  }
  return `opening_hook_sequence=0-3s extreme close-up on ${detailSubject}, handheld phone macro framing showing real texture and product detail, slight camera shake for authenticity, 3s mark hard cut to model full-shot wearing or holding product, dynamic jump-cut transition with momentum, raw energy contrast between intimate detail and wide context, scroll-stopping before-after visual shift`;
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
    "영롱한 0.5캐럿의 빛, 당신의 목선을 완성하다",
    "손끝 만져보는 순간, 보석과의 마지막 대화",
    "각도마다 수박게 빛나는 페이싱, 그 순간의 마법",
    "유별된 반사, 보석이 말하는 순간",
  ]},
  { match: /necklace|목걸이|chain|체인|pendant|펜더트/i, hooks: [
    "목덜미에 닿는 가느다란 체인, 걸을 때마다 옅게 울리는 소리",
    "목선을 따라 흐르는 빛, 이걸 보는 순간 멈춰선다",
    "목덜미에 닿는 체인의 무게, 피부 위를 걷는 감각",
    "체인이 부드럽게 흘러내리는 순간, 그 미세한 움직임",
  ]},
  { match: /ring|반지|bracelet|팔찌|earring|귀걸이|watch|시계/i, hooks: [
    "손가락에 감기는 빛, 반지 하나가 만드는 무게감",
    "손목 위에 닿는 순간, 이 반지가 말하는 시간",
    "손목을 감싸는 안정감, 명품의 존재감이 느껴진다",
    "손등 위로 빛이 흐르는 순간, 반지가 만드는 마법",
  ]},
  { match: /silk|실크|새틴|satin|chiffon|드레스|dress|치마|skirt|스카프/i, hooks: [
    "바람에 출렁이는 실크, 빛이 통과하는 순간의 감각",
    "만지면 물처럼 흐르는 새틴, 그 자체의 무게감",
    "피부에 닿는 실크, 하나의 동작이 만드는 드라마",
    "입을 때 허락하는 우아함, 그 바탕의 유혹이 실리다",
  ]},
  { match: /leather|가죽|스웨이드|jacket|재킷|boots|부츠|bag|가방|shoe|신발/i, hooks: [
    "가죽 결이 말하는 순간, 손끝에 닿는 날개의 무게",
    "이 가죽의 질감, 손금이 대신 말해줄 것이다",
    "가방의 무게가 어깨에 닿는 순간, 그 안에 담긴 이야기",
    "부츠가 바닥을 걷는 소리, 그 무게와 논을 들어라",
  ]},
  { match: /gold|골드|silver|실버|brass|황동|copper|구리|metal|금속/i, hooks: [
    "만지면 수박게 빛나는 골드, 그 자체가 말하는 빛",
    "메탈 박막의 반사, 눈이 보고 만드는 완벽함",
    "날개마다 빛이 겹는 메탈, 저가운 마법의 순간",
    "만져보면 더 빛나는 메탈, 그 무게와 묵직의 대화",
  ]},
  { match: /cotton|코튼|면|linen|린넨|셔츠|shirt|wool|울|니트|knit|코트|coat|denim|데님/i, hooks: [
    "입었다 닿지 않는 경첩, 면 소리가 말하는 순간",
    "울 속에 쏟아지는 담요, 명품의 무게가 느껴진다",
    "니트의 결이 만드는 무늬, 그 온기의 정체",
    "데님의 무게, 입은 순간 만든 논이 흘러나온다",
  ]},
  { match: /fabric|패브릭|textile|텍스타일|의류|clothing|옷/i, hooks: [
    "이 옷이 만드는 시간, 텍스처 대신 말해줄 것이다",
    "입었다 닿지 않는 경첩, 그 이음이 말하는 순간",
    "경첩이 만드는 성박, 이 명품의 자기주장",
    "옷과 강을 걷히는 순간, 모도 내인 눈추드를 보라",
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
  const userDirective = p.userPrompt.trim().replace(/\s+/g, " ").slice(0, 600);
  const userDirectiveTag = userDirective
    ? `USER DIRECTIVE — follow this visual instruction: "${userDirective}"`
    : "";

  // Negative prompt: user-specified elements to exclude
  const negTag = p.negativePrompt && p.negativePrompt.trim() ? `neg=[${p.negativePrompt.trim().slice(0, 80)}]` : "";

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

  const modeTokens = buildModeRenderingTokens(p.selectedMode, p.enableOrbit360, p.enableCaustics, p.enableVirtualFitting, p.enableFabricPhysics, p.orbitSpeed);

  if (p.isCleanVideoMode) {
    const v = p.productVision;
    const tokens: string[] = [
      `luxury showcase ${name} ${orientation}`,
      "cam=smooth gimbal dolly + gentle orbit + macro push-in",
      "light=professional 3-point studio + softbox + rim light",
      "grade=filmic luxury, shallow DOF, color-graded, premium look",
      "quality=top 1% commercial, ultra-premium, high-end brand film",
      `prompt_strength=${strength}/10, ${strengthTag}`,
    ];
    if (userDirectiveTag) tokens.push(userDirectiveTag);
    if (v) {
      const feats = v.visualFeatures.slice(0, 2).join(",");
      tokens.push(`product=${v.shapeDescription},${v.materialGuess}${feats ? "," + feats : ""}`);
      if (v.textureDescription) tokens.push(`texture=${v.textureDescription}`);
      const matTag = buildMaterialPhysicsTag(v.materialGuess);
      if (matTag) tokens.push(matTag);
      const fabTag = buildFabricPhysicsTag(v.materialGuess, v.productCategory);
      if (fabTag) tokens.push(fabTag);
      const colTag = buildCollisionTag(v.materialGuess, v.productCategory);
      if (colTag) tokens.push(colTag);
      const skinTag = buildSkinResponseTag(v.materialGuess, v.productCategory);
      if (skinTag) tokens.push(skinTag);
    }
    if (bgTag) tokens.push(bgTag);
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
    tokens.push(buildOpeningHookSequenceTag(true, p.productVision ?? null));
    if (outfitTag) tokens.push(outfitTag);
    if (zoomTag) tokens.push(zoomTag);
    if (rotTag) tokens.push(rotTag);
    if (transTag) tokens.push(transTag);
    for (const mt of modeTokens) tokens.push(mt);
    tokens.push("no text, no captions, no hooks, no CTA, pure luxury product cinematography, top-tier quality");
    tokens.push(`tier=${p.qualityTier}, res=${p.resolution}, fps=${p.fps}`);
    if (negTag) tokens.push(negTag);
    return tokens.join(" ").slice(0, 1000);
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
    const matTag = buildMaterialPhysicsTag(v.materialGuess);
    if (matTag) tokens.push(matTag);
    const fabTag = buildFabricPhysicsTag(v.materialGuess, v.productCategory);
    if (fabTag) tokens.push(fabTag);
    const colTag = buildCollisionTag(v.materialGuess, v.productCategory);
    if (colTag) tokens.push(colTag);
    const skinTag = buildSkinResponseTag(v.materialGuess, v.productCategory);
    if (skinTag) tokens.push(skinTag);
  }

  if (p.captionText && p.captionText.trim()) {
    tokens.push(`ctx="${p.captionText.slice(0, 40)}"`);
  }

  if (bgTag) tokens.push(bgTag);
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
  tokens.push(buildOpeningHookSequenceTag(false, p.productVision ?? null));
  if (outfitTag) tokens.push(outfitTag);
  if (zoomTag) tokens.push(zoomTag);
  if (rotTag) tokens.push(rotTag);
  if (transTag) tokens.push(transTag);
  for (const mt of modeTokens) tokens.push(mt);
  if (negTag) tokens.push(negTag);

  tokens.push("3phase:hook→contrast→cta, raw unboxing vibe, smartphone aesthetic, no polished production");
  tokens.push(`tier=${p.qualityTier}, res=${p.resolution}, fps=${p.fps}`);

  return tokens.join(" ").slice(0, 1000);
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

async function uploadToStorage(videoUrl: string, scanId: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(videoUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!resp.ok) return null;

    const videoBlob = await resp.blob();
    const fileName = `${scanId}/${Date.now()}_ai_video.mp4`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/videos/${fileName}`;

    const uploadController = new AbortController();
    const uploadTimeoutId = setTimeout(() => uploadController.abort(), 20000);
    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "video/mp4",
        "x-upsert": "true",
        "Cache-Control": "max-age=360000",
      },
      body: videoBlob,
      signal: uploadController.signal,
    });
    clearTimeout(uploadTimeoutId);

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
    // Guard: don't overwrite an existing video_url — the first completion wins.
    await fetch(`${supabaseUrl}/rest/v1/scans?id=eq.${scanId}&video_url=is.null`, {
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
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/scans?select=user_id&id=eq.${scanId}`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }, signal: controller.signal },
    );
    clearTimeout(timeoutId);
    if (!resp.ok) return;
    const rows = await resp.json() as Array<{ user_id: string | null }>;
    if (!rows[0]?.user_id) return;
    const userId = rows[0].user_id;

    const pushController = new AbortController();
    const pushTimeoutId = setTimeout(() => pushController.abort(), 10000);
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        userId,
        title: "숏폼 영상 제작 완료!",
        body: "AI 영상이 완성되었습니다. 지금 바로 확인해보세요.",
        url: `/result/${scanId}`,
      }),
      signal: pushController.signal,
    });
    clearTimeout(pushTimeoutId);
  } catch {
    // non-fatal — push is best-effort
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveRunwayKey(): Promise<string | null> {
  const serverKey = Deno.env.get("RUNWAY_API_KEY") ?? null;

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

  return serverKey || null;
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
