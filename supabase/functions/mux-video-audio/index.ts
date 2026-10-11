import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Overall wall-clock budget for the entire mux operation: download +
// FFmpeg exec + upload. The Edge Runtime kills the isolate around 300s,
// so we abort at 270s to return a proper error before the hard kill.
const MUX_WALL_CLOCK_BUDGET_MS = 270_000;

// Cache FFmpeg core URLs + module imports at module scope so they are
// resolved once per isolate instead of re-downloaded on every request.
// toBlobURL fetches the WASM core from unpkg on each call — without
// caching, this alone adds 3-8s of sequential network I/O per invocation.
let cachedCoreUrl: string | null = null;
let cachedWasmUrl: string | null = null;
let ffmpegModule: typeof import("npm:@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js") | null = null;
let ffmpegUtil: typeof import("npm:@ffmpeg/util@0.12.1/dist/esm/index.js") | null = null;

async function getFfmpegCore() {
  if (!ffmpegModule || !ffmpegUtil) {
    [ffmpegModule, ffmpegUtil] = await Promise.all([
      import("npm:@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js"),
      import("npm:@ffmpeg/util@0.12.1/dist/esm/index.js"),
    ]);
  }
  if (!cachedCoreUrl || !cachedWasmUrl) {
    [cachedCoreUrl, cachedWasmUrl] = await Promise.all([
      ffmpegUtil.toBlobURL(
        "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
        "text/javascript",
      ),
      ffmpegUtil.toBlobURL(
        "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm",
        "application/wasm",
      ),
    ]);
  }
  return { ffmpegModule, ffmpegUtil, coreURL: cachedCoreUrl, wasmURL: cachedWasmUrl };
}

// Fetch with timeout — prevents network I/O from hanging indefinitely
// during the download or upload phase.
async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { timeoutMs: _, ...rest } = init;
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

interface MuxRequest {
  videoUrl: string;
  audioUrl: string;
  scanId?: string;
  targetDurationSec?: number;
  audioOffsetSec?: number;
  audioDurationSec?: number;
}

// In-flight deduplication: maps scanId → ongoing mux Promise so that
// concurrent requests for the same scan (Realtime re-trigger + polling
// retry) share a single FFmpeg run instead of spawning duplicates.
const inflightMux = new Map<string, Promise<Response>>();

// Global concurrency cap: each FFmpeg WASM instance allocates ~150–250 MB
// of heap. The Edge Runtime has a hard memory ceiling per isolate, so
// unbounded concurrent encodes will trigger OOM kills. This semaphore
// ensures at most MAX_CONCURRENT_MUX jobs run simultaneously; the rest
// queue and wait their turn.
const MAX_CONCURRENT_MUX = 2;
let activeMuxCount = 0;
const muxWaitQueue: Array<() => void> = [];

const acquireMuxSlot = async (): Promise<void> => {
  if (activeMuxCount < MAX_CONCURRENT_MUX) {
    activeMuxCount++;
    return;
  }
  await new Promise<void>((resolve) => {
    muxWaitQueue.push(() => {
      activeMuxCount++;
      resolve();
    });
  });
};

const releaseMuxSlot = () => {
  activeMuxCount--;
  if (muxWaitQueue.length > 0) {
    const next = muxWaitQueue.shift()!;
    next();
  }
};

// Reject inputs larger than this to prevent memory exhaustion from
// oversized video/audio files. 80 MB per file is generous for a
// 15–60 s clip at 720p ultrafast.
const MAX_INPUT_BYTES = 80 * 1024 * 1024;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json() as MuxRequest;
    const { videoUrl, audioUrl, scanId, targetDurationSec, audioOffsetSec, audioDurationSec } = body;

    if (!videoUrl || !audioUrl) {
      return new Response(
        JSON.stringify({ error: "videoUrl과 audioUrl이 필요합니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Idempotency guard: if the scans row already has a muxed_video_url,
    // return it immediately instead of re-downloading and re-encoding.
    // This prevents duplicate ffmpeg processes and zombie workers when
    // the client retries due to a network blip or Realtime re-trigger.
    if (scanId && supabaseUrl && serviceRoleKey) {
      try {
        const checkResp = await fetch(
          `${supabaseUrl}/rest/v1/scans?id=eq.${scanId}&select=muxed_video_url`,
          {
            headers: {
              "Authorization": `Bearer ${serviceRoleKey}`,
              "apikey": serviceRoleKey,
            },
          },
        );
        if (checkResp.ok) {
          const rows = await checkResp.json() as Array<{ muxed_video_url?: string | null }>;
          if (rows.length > 0 && rows[0].muxed_video_url) {
            return new Response(
              JSON.stringify({ success: true, muxedUrl: rows[0].muxed_video_url, cached: true }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      } catch {
        // Non-fatal — proceed with full mux if the check fails
      }
    }

    // In-flight deduplication: if another request for the same scanId
    // is already running FFmpeg, wait for its result instead of starting
    // a second concurrent encode. The promise is removed on settle.
    if (scanId) {
      const existing = inflightMux.get(scanId);
      if (existing) return await existing;
    }

    const muxWork = async (): Promise<Response> => {
    const muxStartTime = Date.now();
    // Acquire a concurrency slot before downloading/encoding to prevent
    // unbounded FFmpeg WASM instances from exhausting Edge Runtime memory.
    await acquireMuxSlot();

    try {
    // Download both files
    const [videoResp, audioResp] = await Promise.all([
      fetchWithTimeout(videoUrl, { timeoutMs: 60_000 }),
      fetchWithTimeout(audioUrl, { timeoutMs: 60_000 }),
    ]);

    if (!videoResp.ok) {
      return new Response(
        JSON.stringify({ error: "비디오 파일을 다운로드할 수 없습니다." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!audioResp.ok) {
      return new Response(
        JSON.stringify({ error: "오디오 파일을 다운로드할 수 없습니다." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Materialize both blobs in parallel — sequential awaiting was a
    // hidden bottleneck that added the full audio read time on top of
    // the video read time instead of overlapping them.
    const [videoBlob, audioBlob] = await Promise.all([
      videoResp.blob(),
      audioResp.blob(),
    ]);

    // Size guard: reject inputs that would blow the memory budget.
    if (videoBlob.size > MAX_INPUT_BYTES || audioBlob.size > MAX_INPUT_BYTES) {
      return new Response(
        JSON.stringify({ error: `입력 파일이 너무 큽니다 (최대 ${MAX_INPUT_BYTES / 1024 / 1024}MB).` }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Use ffmpeg.wasm to mux video + audio into a single MP4.
    // All FFmpeg operations are wrapped in try-catch with guaranteed
    // virtual FS cleanup and process termination to prevent zombie
    // processes and memory leaks on OOM or font path errors.
    const { ffmpegModule: ffMod, ffmpegUtil: ffUtil, coreURL, wasmURL } = await getFfmpegCore();
    const { FFmpeg } = ffMod;
    const { fetchFile } = ffUtil;

    const ffmpeg = new FFmpeg();
    await ffmpeg.load({ coreURL, wasmURL });

    // Timeout guard: if FFmpeg exec hangs (OOM, missing font, corrupt
    // input), terminate after 180s instead of blocking the worker forever.
    // Raised from 120s — audio resampling + muxing can take longer when
    // the source sample rate differs from 48kHz, and 120s was cutting it
    // close enough to cause spurious timeouts on longer clips.
    const FFMPEG_EXEC_TIMEOUT_MS = 180_000;
    let execTimedOut = false;
    const execTimeout = setTimeout(() => {
      execTimedOut = true;
      try { ffmpeg.terminate(); } catch { /* already terminated */ }
    }, FFMPEG_EXEC_TIMEOUT_MS);

    const cleanupFfmpeg = async () => {
      clearTimeout(execTimeout);
      for (const f of ["input_video.mp4", "input_audio.mp3", "output.mp4"]) {
        try { await ffmpeg.deleteFile(f); } catch { /* already removed */ }
      }
    };

    try {
      await ffmpeg.writeFile("input_video.mp4", await fetchFile(videoBlob));
      await ffmpeg.writeFile("input_audio.mp3", await fetchFile(audioBlob));

      // Build ffmpeg args. When targetDurationSec is provided, use -t to
      // enforce the output duration and pad audio with silence so the video
      // isn't cut short. Without a target, fall back to -shortest.
      const ffmpegArgs: string[] = [
        "-i", "input_video.mp4",
        "-i", "input_audio.mp3",
      ];
      if (targetDurationSec && targetDurationSec > 0) {
        // Pad audio with silence to match the target duration, then cap
        // the output at exactly targetDurationSec.
        // If audioOffsetSec is provided, delay the audio start with leading
        // silence so narration aligns with the correct segment on the
        // master timeline.
        const offset = audioOffsetSec && audioOffsetSec > 0 ? audioOffsetSec : 0;
        // Build audio filter chain: optionally delay audio start (adelay),
        // optionally stretch/shrink to fit the narration window (atempo),
        // then pad with silence to match the full target duration (apad).
        const filterParts: string[] = [];
        // atempo must run BEFORE adelay so the offset silence is not
        // time-stretched along with the audio. Order: atempo → adelay → apad.
        if (audioDurationSec && audioDurationSec > 0) {
          const narrationWindow = targetDurationSec - offset;
          if (narrationWindow > 0) {
            // atempo accepts 0.5x–2.0x per filter; chain if outside that range
            let tempo = audioDurationSec / narrationWindow;
            const tempoFilters: string[] = [];
            while (tempo > 2.0) {
              tempoFilters.push("atempo=2.0");
              tempo /= 2.0;
            }
            while (tempo < 0.5) {
              tempoFilters.push("atempo=0.5");
              tempo /= 0.5;
            }
            if (tempo > 0.85 && tempo < 1.15) {
              // Within 15% — no adjustment needed
            } else {
              tempoFilters.push(`atempo=${tempo.toFixed(4)}`);
            }
            if (tempoFilters.length > 0) {
              filterParts.push(...tempoFilters);
            }
          }
        }
        if (offset > 0) {
          filterParts.push(`adelay=${Math.round(offset * 1000)}|${Math.round(offset * 1000)}`);
        }
        filterParts.push(`apad=whole_dur=${targetDurationSec}`);
        const audioFilter = filterParts.join(",");
        ffmpegArgs.push(
          "-af", audioFilter,
          "-t", String(targetDurationSec),
        );
      } else {
        ffmpegArgs.push("-shortest");
      }
      // Determine whether audio filters are needed. When no filters
      // are required (no duration padding, no offset, no tempo adjust),
      // we can use -c:a copy for pure passthrough — zero audio re-encoding.
      // This reduces mux time from 30-120s to 1-3s for the common case.
      const needsAudioFilter = !!(targetDurationSec && targetDurationSec > 0);
      // Base output args: video is always stream-copied. Audio is copied
      // when no filters are needed; re-encoded to AAC 48kHz only when
      // filters (atempo/adelay/apad) must be applied.
      const baseOutputArgs: string[] = [
        "-movflags", "+faststart",
      ];
      if (needsAudioFilter) {
        baseOutputArgs.push("-c:a", "aac", "-b:a", "128k", "-ar", "48000");
      } else {
        baseOutputArgs.push("-c:a", "copy");
      }

      // Fast path: -c:v copy skips video re-encoding entirely. Runway
      // already outputs at the correct resolution, so transcoding is
      // wasteful and was the #1 cause of the 95-97% timeout trap.
      //
      // -fps_mode cfr -r 30 normalizes Runway's variable frame rate (VFR)
      // output to constant frame rate (CFR) at 30fps WITHOUT re-encoding.
      // FFmpeg drops or duplicates frames in the bitstream to enforce
      // even timing. Without this, VFR timestamps cause FFmpeg to stall
      // during PTS calculation when muxing with audio.
      // -fps_mode is the modern alias for -vsync; both are included for
      // compatibility across FFmpeg versions in ffmpeg.wasm builds.
      const copyArgs = [...ffmpegArgs,
        "-fps_mode", "cfr",
        "-vsync", "cfr",
        "-r", "30",
        "-c:v", "copy",
        ...baseOutputArgs,
        "output.mp4",
      ];

      // Fallback: if -c:v copy fails (VFR too irregular, codec mismatch,
      // or FFmpeg stalls on PTS), re-encode with the lightest possible
      // libx264 settings. This is slower but handles edge cases where
      // stream copy can't produce a valid muxed output.
      const reencodeArgs = [...ffmpegArgs,
        "-fps_mode", "cfr",
        "-vsync", "cfr",
        "-r", "30",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-crf", "28",
        "-vf", "scale=-2:720",
        "-c:a", needsAudioFilter ? "aac" : "copy",
        ...(needsAudioFilter ? ["-b:a", "128k", "-ar", "48000"] : []),
        "-movflags", "+faststart",
        "output.mp4",
      ];

      try {
        await ffmpeg.exec(copyArgs);
      } catch (copyErr) {
        // Stream copy failed — likely VFR PTS irregularity. Retry with
        // re-encode. Reset the timeout flag for the second attempt.
        execTimedOut = false;
        clearTimeout(execTimeout);
        const execTimeout2 = setTimeout(() => {
          execTimedOut = true;
          try { ffmpeg.terminate(); } catch { /* already terminated */ }
        }, FFMPEG_EXEC_TIMEOUT_MS);
        try {
          await ffmpeg.exec(reencodeArgs);
        } finally {
          clearTimeout(execTimeout2);
        }
      }

      if (execTimedOut) {
        throw new Error("FFmpeg 실행 시간이 초과되었습니다 (VFR 정규화 또는 인코딩 실패 가능).");
      }

      const output = await ffmpeg.readFile("output.mp4");
      const outputBlob = new Blob([output], { type: "video/mp4" });

      // Wall-clock budget check: if download + FFmpeg already consumed
      // most of the 270s budget, return an error now instead of starting
      // the upload and getting killed mid-transfer by the Edge Runtime.
      const elapsedMs = Date.now() - muxStartTime;
      if (elapsedMs > MUX_WALL_CLOCK_BUDGET_MS - 30_000) {
        await cleanupFfmpeg();
        try { ffmpeg.terminate(); } catch { /* already terminated */ }
        return new Response(
          JSON.stringify({ error: `합성 시간이 초과되었습니다 (${Math.round(elapsedMs / 1000)}초). 다시 시도해주세요.` }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Start virtual FS cleanup concurrently with upload — no need to
      // await cleanup before starting the network transfer.
      const cleanupPromise = cleanupFfmpeg();

      // Upload to Supabase Storage
      if (!supabaseUrl || !serviceRoleKey) {
        await cleanupPromise;
        return new Response(
          JSON.stringify({ error: "스토리지 설정이 누락되었습니다." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const fileName = `${scanId ?? "unknown"}/${Date.now()}_muxed.mp4`;
      const uploadPath = `videos/${fileName}`;
      const uploadUrl = `${supabaseUrl}/storage/v1/object/${uploadPath}`;

      const uploadResp = await fetchWithTimeout(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "video/mp4",
          "x-upsert": "true",
        },
        body: outputBlob,
        timeoutMs: 90_000,
      });

      await cleanupPromise;

      if (!uploadResp.ok) {
        const uploadErr = await uploadResp.text();
        return new Response(
          JSON.stringify({ error: `스토리지 업로드 실패: ${uploadErr}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${uploadPath}`;

      // Fire-and-forget the DB update — it's non-fatal and was blocking
      // the response by 200-500ms on every call. The client already has
      // the muxedUrl in the response body and will set it locally.
      if (scanId) {
        fetchWithTimeout(`${supabaseUrl}/rest/v1/scans?id=eq.${scanId}`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({ muxed_video_url: publicUrl }),
          timeoutMs: 10_000,
        }).catch(() => { /* non-fatal */ });
      }

      return new Response(
        JSON.stringify({ success: true, muxedUrl: publicUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (ffmpegErr) {
      // FFmpeg exec failure (OOM, font path missing, corrupt input):
      // guarantee virtual FS cleanup and process termination to prevent
      // zombie processes and memory leaks.
      await cleanupFfmpeg();
      try { ffmpeg.terminate(); } catch { /* already terminated */ }
      throw ffmpegErr;
    }
    } finally {
      releaseMuxSlot();
    }
    }; // end muxWork

    if (scanId) {
      const promise = muxWork().finally(() => inflightMux.delete(scanId));
      inflightMux.set(scanId, promise);
      return await promise;
    }
    return await muxWork();

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "알 수 없는 오류";
    return new Response(
      JSON.stringify({ error: `나레이션 합성 실패: ${errMsg}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
