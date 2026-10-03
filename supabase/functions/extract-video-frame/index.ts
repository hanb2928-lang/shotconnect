import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
    const { videoUrl, maxDimension, quality } = await req.json();
    if (!videoUrl) {
      return new Response(JSON.stringify({ error: "videoUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let videoBytes: Uint8Array;
    try {
      const resp = await fetch(videoUrl, { signal: controller.signal });
      if (!resp.ok) throw new Error(`Failed to download video: ${resp.status}`);
      const buf = await resp.arrayBuffer();
      videoBytes = new Uint8Array(buf);
    } finally {
      clearTimeout(timeoutId);
    }

    const tempVideoPath = `/tmp/input-video-${Date.now()}.mp4`;
    const tempFramePath = `/tmp/frame-${Date.now()}.jpg`;
    await Deno.writeFile(tempVideoPath, videoBytes);
    videoBytes = new Uint8Array(0);

    const dim = maxDimension || 1080;
    const qual = quality || 0.7;

    const ffmpegArgs = [
      "-i", tempVideoPath,
      "-ss", "0.5",
      "-frames:v", "1",
      "-vf", `scale='if(gt(iw,ih),${dim},-2)':'if(gt(iw,ih),-2,${dim})'`,
      "-q:v", String(Math.max(1, Math.round((1 - qual) * 31))),
      "-y",
      tempFramePath,
    ];

    const command = new Deno.Command("ffmpeg", {
      args: ffmpegArgs,
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stderr } = await command.output();

    await Deno.remove(tempVideoPath).catch(() => {});

    if (code !== 0) {
      const stderrText = new TextDecoder().decode(stderr);
      throw new Error(`ffmpeg failed: ${stderrText.slice(0, 500)}`);
    }

    const frameBytes = await Deno.readFile(tempFramePath);
    await Deno.remove(tempFramePath).catch(() => {});

    const frameBase64 = btoa(String.fromCharCode(...frameBytes));

    let frameUrl = "";
    if (supabaseUrl && serviceRoleKey) {
      const fileName = `frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const uploadResp = await fetch(`${supabaseUrl}/storage/v1/object/scans/${fileName}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "image/jpeg",
          "x-upsert": "false",
        },
        body: frameBytes,
      });
      if (uploadResp.ok) {
        frameUrl = `${supabaseUrl}/storage/v1/object/public/scans/${fileName}`;
      }
    }

    return new Response(
      JSON.stringify({ base64: frameBase64, mimeType: "image/jpeg", frameUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Frame extraction failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
