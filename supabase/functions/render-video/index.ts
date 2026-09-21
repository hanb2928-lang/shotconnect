import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type RenderQuality = "preview" | "high";

interface ScenePlan {
  type: "image" | "text" | "badge" | "cta" | "hashtag" | "logo" | "baby" | "disclosure";
  text?: string;
  startTime: number;
  endTime: number;
  easing?: "ease-in" | "ease-out" | "ease-in-out" | "linear";
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  color?: string;
  fontSize?: number;
  fontWeight?: string;
}

interface RenderPlanResponse {
  status: "ok";
  quality: RenderQuality;
  resolution: { width: number; height: number };
  fps: number;
  bitrate: number;
  durationSec: number;
  totalFrames: number;
  scenes: ScenePlan[];
  colorGrading: Record<string, number>;
  pacingBpm: number;
  productName: string;
  ctaText: string;
  disclosureText: string;
  affiliateUrl: string;
  audioEnabled: boolean;
  ttsEnabled: boolean;
  transitionsEnabled: boolean;
  motionPreset: string;
  cardStyle: string;
  accentColor: string;
  hook: string;
  title: string;
  hashtags: string[];
  shortUrl: string;
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
    const payload = await req.json() as Record<string, unknown>;
    const quality = (payload.quality as RenderQuality) ?? "high";

    const isPreview = quality === "preview";
    const targetWidth = isPreview ? 540 : 1080;
    const specs = (payload.specs as Record<string, string>) ?? {};
    const ratio = specs.ratio ?? "9:16";
    const isPortrait = ratio.includes("9:16");
    const targetHeight = isPortrait
      ? Math.round(targetWidth * (1920 / 1080))
      : Math.round(targetWidth * (1080 / 1920));

    const totalSec = parseInt(specs.maxDuration ?? "15", 10) || 15;
    const duration = Math.min(totalSec, 60);
    const fps = isPreview ? 24 : 30;
    const bitrate = isPreview ? 2_000_000 : 6_000_000;
    const totalFrames = Math.ceil(duration * fps);

    // Build scene timeline from payload
    const scenes: ScenePlan[] = [];

    const hook = (payload.hook as string) ?? "";
    const title = (payload.title as string) ?? "";
    const hashtags = (payload.hashtags as string[]) ?? [];
    const shortUrl = (payload.shortUrl as string) ?? "";
    const accentColor = (payload.accentColor as string) ?? "#FF6B35";
    const cardStyle = (payload.cardStyle as string) ?? "bold";
    const motionPreset = (payload.motionPreset as string) ?? "zoom-in";
    const productName = (payload.productName as string) ?? "";
    const ctaText = (payload.ctaText as string) ?? "자세히 보기";
    const disclosureText = (payload.disclosureText as string) ?? "이 포스팅은 제휴마케팅이 포함된 광고입니다.";

    // Scene 1: Product image with motion (0% - 100%)
    scenes.push({
      type: "image",
      startTime: 0,
      endTime: duration,
      easing: "ease-in-out",
      position: { x: 0, y: 0 },
      size: { width: targetWidth, height: targetHeight },
    });

    // Scene 2: Badge (3% - 100%)
    scenes.push({
      type: "badge",
      text: cardStyle.toUpperCase(),
      startTime: duration * 0.03,
      endTime: duration * 0.67,
      easing: "ease-out",
      color: accentColor,
    });

    // Scene 3: Hook text (15% - 67%)
    if (hook) {
      scenes.push({
        type: "text",
        text: hook,
        startTime: duration * 0.15,
        endTime: duration * 0.67,
        easing: "ease-out",
        color: "#ffffff",
        fontSize: Math.round(targetHeight * 0.045),
        fontWeight: "700",
      });
    }

    // Scene 4: Title (30% - 67%)
    if (title) {
      scenes.push({
        type: "text",
        text: title,
        startTime: duration * 0.30,
        endTime: duration * 0.67,
        easing: "ease-out",
        color: "rgba(255,255,255,0.9)",
        fontSize: Math.round(targetHeight * 0.035),
        fontWeight: "600",
      });
    }

    // Scene 5: Hashtags (40% - 67%)
    if (hashtags.length > 0) {
      scenes.push({
        type: "hashtag",
        text: hashtags.slice(0, 8).map((h) => `#${h}`).join(" "),
        startTime: duration * 0.40,
        endTime: duration * 0.67,
        easing: "ease-out",
        color: accentColor,
        fontSize: Math.round(targetHeight * 0.028),
        fontWeight: "600",
      });
    }

    // Scene 6: CTA button (45% - 67%)
    if (shortUrl) {
      scenes.push({
        type: "cta",
        text: ctaText,
        startTime: duration * 0.45,
        endTime: duration * 0.67,
        easing: "ease-out",
        color: accentColor,
      });
    }

    // Scene 7: Baby + link sticker (0% - 67%)
    if (shortUrl) {
      scenes.push({
        type: "baby",
        startTime: 0,
        endTime: duration * 0.67,
        easing: "linear",
      });
    }

    // Scene 8: Disclosure (67% - 100%)
    scenes.push({
      type: "disclosure",
      text: disclosureText,
      startTime: duration * 0.67,
      endTime: duration,
      easing: "ease-in",
      color: "rgba(255,255,255,0.85)",
      fontSize: Math.round(targetHeight * 0.022),
      fontWeight: "400",
    });

    const result: RenderPlanResponse = {
      status: "ok",
      quality,
      resolution: { width: targetWidth, height: targetHeight },
      fps,
      bitrate,
      durationSec: duration,
      totalFrames,
      scenes,
      colorGrading: (payload.colorGrading as Record<string, number>) ?? { warm: 10, contrast: 20, saturation: 15, vignette: 30 },
      pacingBpm: (payload.pacingBpm as number) ?? 100,
      productName,
      ctaText,
      disclosureText,
      affiliateUrl: (payload.affiliateUrl as string) ?? "",
      audioEnabled: !isPreview,
      ttsEnabled: !isPreview,
      transitionsEnabled: !isPreview,
      motionPreset,
      cardStyle,
      accentColor,
      hook,
      title,
      hashtags,
      shortUrl,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Render plan failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
