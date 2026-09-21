import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export type BgmCategory = "cinematic" | "hightension" | "asmr" | "emotional" | "lofi";

export interface BgmRecommendation {
  category: BgmCategory;
  templateId: string;
  label: string;
  description: string;
  bpm: number;
  reason: string;
  highlightStartSec: number;
  highlightDurationSec: number;
  energyCurve: number[];
}

interface CategoryMeta {
  templateId: string;
  label: string;
  description: string;
  bpm: number;
  defaultHighlightStart: number;
  defaultHighlightDuration: number;
  energyCurve: number[];
}

const CATEGORY_META: Record<BgmCategory, CategoryMeta> = {
  cinematic: {
    templateId: "cinematic",
    label: "시네마틱",
    description: "웅장하고 드라마틱한 오케스트라 빌드업 — 제품 집중, 네이버 클립에 최적",
    bpm: 90,
    defaultHighlightStart: 5,
    defaultHighlightDuration: 10,
    energyCurve: [0.2, 0.3, 0.45, 0.6, 0.75, 0.9, 1.0, 0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.3],
  },
  hightension: {
    templateId: "hightension",
    label: "하이텐션",
    description: "빠르고 에너제틱한 일렉트로닉 비트 — 틱톡/쇼츠 FYP 진입용",
    bpm: 128,
    defaultHighlightStart: 3,
    defaultHighlightDuration: 10,
    energyCurve: [0.4, 0.6, 0.8, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5],
  },
  asmr: {
    templateId: "asmr",
    label: "ASMR",
    description: "차분하고 미니멀한 앰비언트 — 제품 디테일 어필, 광고 전환용",
    bpm: 60,
    defaultHighlightStart: 2,
    defaultHighlightDuration: 14,
    energyCurve: [0.15, 0.22, 0.3, 0.35, 0.4, 0.45, 0.5, 0.52, 0.5, 0.48, 0.45, 0.4, 0.35, 0.3, 0.25],
  },
  emotional: {
    templateId: "emotional",
    label: "감성",
    description: "따뜻하고 감성적인 피아노/스트링 — 인스타 릴스 스토리텔링용",
    bpm: 75,
    defaultHighlightStart: 5,
    defaultHighlightDuration: 10,
    energyCurve: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5, 0.4, 0.3],
  },
  lofi: {
    templateId: "lofi",
    label: "로파이",
    description: "편안한 로파이 비트 — 카페/일상/힐링 콘텐츠에 최적",
    bpm: 85,
    defaultHighlightStart: 3,
    defaultHighlightDuration: 12,
    energyCurve: [0.15, 0.22, 0.3, 0.35, 0.4, 0.45, 0.5, 0.52, 0.5, 0.48, 0.45, 0.4, 0.35, 0.3, 0.25],
  },
};

function stripJsonFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return t;
}

function ensureDataUrl(dataUrl: string, mimeType: string): string {
  if (dataUrl.startsWith("data:")) return dataUrl;
  return `data:${mimeType};base64,${dataUrl}`;
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

function fallbackRecommendation(): BgmRecommendation {
  const c = CATEGORY_META.hightension;
  return {
    category: "hightension",
    templateId: c.templateId,
    label: c.label,
    description: c.description,
    bpm: c.bpm,
    reason: "이미지 분석 없이 하이텐션 무드를 기본 추천했습니다.",
    highlightStartSec: c.defaultHighlightStart,
    highlightDurationSec: c.defaultHighlightDuration,
    energyCurve: c.energyCurve,
  };
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
    const body = await req.json();
    const { imageDataUrl, mimeType } = body;

    if (!imageDataUrl) {
      return new Response(
        JSON.stringify({ error: "Image data is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cleanMime = mimeType || "image/jpeg";
    const openaiKey = await resolveOpenAIKey();

    if (!openaiKey) {
      return new Response(
        JSON.stringify(fallbackRecommendation()),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sanitizedDataUrl = ensureDataUrl(imageDataUrl, cleanMime);

    const systemPrompt =
      "You are a music supervisor for short-form marketing videos (15 seconds).\n" +
      "Analyze the product/scene in the image and recommend the most fitting BGM track category.\n\n" +
      "Choose exactly ONE category from these options:\n" +
      "- \"cinematic\": Cinematic epic build — orchestral swell, dramatic tension. Best for product-focused content, Naver Clip, premium feel.\n" +
      "- \"hightension\": High-energy electronic beat — fast tempo, catchy rhythm. Best for TikTok/Reels FYP, trending content, fashion, new launches.\n" +
      "- \"asmr\": Soft ambient minimal — calm, quiet, intimate. Best for product detail close-ups, ad conversion focused content.\n" +
      "- \"emotional\": Warm emotional piano/strings — sentimental, storytelling. Best for Instagram Reels, lifestyle, handmade, eco-friendly products.\n" +
      "- \"lofi\": Lofi chill beats — relaxed, cozy, jazzy. Best for cafes, bakeries, daily essentials, healing content.\n\n" +
      "ALSO identify the highlight segment — the most impactful part of the track for a 15-second video:\n" +
      "- highlightStartSec: when the highlight should begin (0-12, integer)\n" +
      "- highlightDurationSec: how long the highlight lasts (3-10, integer)\n" +
      "  The highlight should align with the video's hook moment (typically 3-7 seconds in).\n\n" +
      "Return a JSON object with exactly these fields:\n" +
      "- category: one of \"cinematic\", \"hightension\", \"asmr\", \"emotional\", \"lofi\"\n" +
      "- reason: 1-2 sentence explanation in Korean of why this track fits the image content\n" +
      "- highlightStartSec: integer (0-12)\n" +
      "- highlightDurationSec: integer (3-10)";

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "이 이미지에 가장 어울리는 음악 트랙 카테고리와 핵심 구간을 추천해주세요." },
              { type: "image_url", image_url: { url: sanitizedDataUrl } },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("OpenAI BGM recommendation failed:", resp.status, errText);
      return new Response(
        JSON.stringify(fallbackRecommendation()),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(stripJsonFence(content));

    const validCategories: BgmCategory[] = ["cinematic", "hightension", "asmr", "emotional", "lofi"];
    const category = validCategories.includes(parsed.category) ? parsed.category : "hightension";
    const meta = CATEGORY_META[category];

    const highlightStartSec = Math.max(0, Math.min(12, Math.round(parsed.highlightStartSec ?? meta.defaultHighlightStart)));
    const highlightDurationSec = Math.max(3, Math.min(10, Math.round(parsed.highlightDurationSec ?? meta.defaultHighlightDuration)));
    const reason = typeof parsed.reason === "string" ? parsed.reason : "AI 분석 기반 추천입니다.";

    const recommendation: BgmRecommendation = {
      category,
      templateId: meta.templateId,
      label: meta.label,
      description: meta.description,
      bpm: meta.bpm,
      reason,
      highlightStartSec,
      highlightDurationSec,
      energyCurve: meta.energyCurve,
    };

    return new Response(
      JSON.stringify(recommendation),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("recommend-bgm error:", err);
    return new Response(
      JSON.stringify(fallbackRecommendation()),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
