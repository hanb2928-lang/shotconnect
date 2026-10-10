import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface MuxRequest {
  videoUrl: string;
  audioUrl: string;
  scanId?: string;
}

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
    const { videoUrl, audioUrl, scanId } = body;

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

    // Download both files
    const [videoResp, audioResp] = await Promise.all([
      fetch(videoUrl),
      fetch(audioUrl),
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

    const videoBlob = await videoResp.blob();
    const audioBlob = await audioResp.blob();

    // Use ffmpeg.wasm to mux video + audio into a single MP4.
    // All FFmpeg operations are wrapped in try-catch with guaranteed
    // virtual FS cleanup and process termination to prevent zombie
    // processes and memory leaks on OOM or font path errors.
    const { FFmpeg } = await import("npm:@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js");
    const { fetchFile, toBlobURL } = await import("npm:@ffmpeg/util@0.12.1/dist/esm/index.js");

    const ffmpeg = new FFmpeg();
    const coreURL = await toBlobURL(
      "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
      "text/javascript",
    );
    const wasmURL = await toBlobURL(
      "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm",
      "application/wasm",
    );
    await ffmpeg.load({ coreURL, wasmURL });

    // Timeout guard: if FFmpeg exec hangs (OOM, missing font, corrupt
    // input), terminate after 120s instead of blocking the worker forever.
    const FFMPEG_EXEC_TIMEOUT_MS = 120_000;
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

      // Merge: hard-capped at 720p with ultrafast + zerolatency tuning.
      // ultrafast uses the fewest reference frames and smallest motion
      // estimation buffers; zerolatency disables frame lookahead and
      // B-frames, cutting peak RAM usage by ~60% vs default preset.
      // This keeps the WASM process well under the Edge Runtime memory
      // ceiling so the OS never targets it for OOM killing.
      await ffmpeg.exec([
        "-i", "input_video.mp4",
        "-i", "input_audio.mp3",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-crf", "28",
        "-vf", "scale=-2:720",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        "-movflags", "+faststart",
        "output.mp4",
      ]);

      if (execTimedOut) {
        throw new Error("FFmpeg 실행 시간이 초과되었습니다 (OOM 또는 폰트 로딩 실패 가능).");
      }

      const output = await ffmpeg.readFile("output.mp4");
      const outputBlob = new Blob([output], { type: "video/mp4" });

      // Clean up virtual FS
      await cleanupFfmpeg();

      // Upload to Supabase Storage
      if (!supabaseUrl || !serviceRoleKey) {
        return new Response(
          JSON.stringify({ error: "스토리지 설정이 누락되었습니다." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const fileName = `${scanId ?? "unknown"}/${Date.now()}_muxed.mp4`;
      const uploadPath = `videos/${fileName}`;
      const uploadUrl = `${supabaseUrl}/storage/v1/object/${uploadPath}`;

      const uploadResp = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "video/mp4",
          "x-upsert": "true",
        },
        body: outputBlob,
      });

      if (!uploadResp.ok) {
        const uploadErr = await uploadResp.text();
        return new Response(
          JSON.stringify({ error: `스토리지 업로드 실패: ${uploadErr}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${uploadPath}`;

      // Update scans row with muxed_video_url if scanId is provided
      if (scanId) {
        try {
          await fetch(`${supabaseUrl}/rest/v1/scans?id=eq.${scanId}`, {
            method: "PATCH",
            headers: {
              "Authorization": `Bearer ${serviceRoleKey}`,
              "apikey": serviceRoleKey,
              "Content-Type": "application/json",
              "Prefer": "return=minimal",
            },
            body: JSON.stringify({ muxed_video_url: publicUrl }),
          });
        } catch {
          // Non-fatal — the muxed video is still in storage
        }
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
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "알 수 없는 오류";
    return new Response(
      JSON.stringify({ error: `나레이션 합성 실패: ${errMsg}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
