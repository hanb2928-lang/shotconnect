import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { buildConversionPrompt, normalizePlatform } from "../_shared/conversion-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface GenerateImageRequest {
  prompt: string;
  output_type?: "image" | "video";
  mode?: "image" | "video";
  size?: "1024x1024" | "1792x1024" | "1024x1792";
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
  n?: number;
  customPrompt?: string;
  productName?: string;
  productCategory?: string;
  industry?: IndustryKey;
  seed?: number;
  referenceImage?: string;
  platform?: string;
  customLinks?: string[];
}

type IndustryKey =
  | "bakery"
  | "cafe"
  | "restaurant"
  | "fashion"
  | "beauty"
  | "grocery"
  | "electronics"
  | "home"
  | "fitness"
  | "general";

interface IndustryPreset {
  label: string;
  environment: string;
  lighting: string;
  mood: string;
  cameraAngle: string;
  styleKeywords: string;
  negativeHints: string;
}

const INDUSTRY_PRESETS: Record<IndustryKey, IndustryPreset> = {
  bakery: {
    label: "베이커리",
    environment: "rustic wood-tone bakery interior with warm display shelves and artisanal bread racks",
    lighting: "warm natural window light with soft golden-hour glow",
    mood: "cozy, handcrafted, freshly-baked warmth",
    cameraAngle: "45-degree overhead close-up with shallow depth of field",
    styleKeywords: "texture-rich crust detail, flour dust particles, artisanal food photography",
    negativeHints: "melted shapes, deformed bread, unnatural gloss, plastic-looking texture",
  },
  cafe: {
    label: "카페",
    environment: "modern minimalist cafe with concrete walls, wooden tables, and ambient plants",
    lighting: "soft diffused daylight with warm interior accent lighting",
    mood: "calm, inviting, lifestyle comfort",
    cameraAngle: "eye-level product focus with blurred cafe background",
    styleKeywords: "steaming cups, latte art detail, cozy atmosphere, premium coffee culture",
    negativeHints: "deformed cups, liquid spills, unnatural steam, warped furniture",
  },
  restaurant: {
    label: "요식업",
    environment: "elegant restaurant setting with clean tableware and ambient decor",
    lighting: "dramatic side lighting highlighting food texture and steam",
    mood: "appetizing, premium, mouth-watering",
    cameraAngle: "top-down or 45-degree food photography angle with garnish detail",
    styleKeywords: "glistening fresh ingredients, plating precision, steam rising, professional food styling",
    negativeHints: "unappetizing colors, deformed food, melted plates, unnatural garnish",
  },
  fashion: {
    label: "의류/패션",
    environment: "clean studio backdrop or trendy urban street setting",
    lighting: "professional fashion photography lighting with key and fill lights",
    mood: "stylish, editorial, confident",
    cameraAngle: "full-body or three-quarter fashion editorial angle",
    styleKeywords: "fabric texture detail, accurate garment fit, trend-conscious color palette",
    negativeHints: "deformed body proportions, extra limbs, distorted face, merged clothing, warped fabric patterns",
  },
  beauty: {
    label: "뷰티/화장품",
    environment: "clean cosmetic studio with soft pastel background and reflective surfaces",
    lighting: "beauty-light setup with even, flattering illumination and catchlights",
    mood: "luxurious, clean, aspirational",
    cameraAngle: "close-up product macro with soft bokeh background",
    styleKeywords: "product label legibility, glossy finish, premium cosmetic packaging detail",
    negativeHints: "deformed bottle shapes, illegible text, warped labels, unnatural skin",
  },
  grocery: {
    label: "식료품/마트",
    environment: "fresh produce market or organized grocery shelf display",
    lighting: "bright, even supermarket lighting with vibrant color rendering",
    mood: "fresh, abundant, value-oriented",
    cameraAngle: "shelf-level or top-down product display angle",
    styleKeywords: "crisp fresh produce, organized packaging, price-tag legibility, vibrant natural colors",
    negativeHints: "wilted produce, bruised items, deformed packaging, faded colors",
  },
  electronics: {
    label: "전자기기",
    environment: "sleek modern tech studio with dark reflective surface and subtle blue accent lighting",
    lighting: "controlled studio lighting with edge highlights on product contours",
    mood: "cutting-edge, premium, high-tech",
    cameraAngle: "three-quarter product hero shot with reflection",
    styleKeywords: "precise port details, screen content legibility, metallic finish, clean industrial design",
    negativeHints: "warped screen, deformed ports, melted casing, distorted proportions, fake-looking interface",
  },
  home: {
    label: "홈/리빙",
    environment: "cozy styled living space with natural textures and decorative accents",
    lighting: "warm ambient room lighting with soft window light",
    mood: "comfortable, aspirational, organized",
    cameraAngle: "wide interior shot with product as focal point",
    styleKeywords: "fabric texture, wood grain detail, realistic home decor scale",
    negativeHints: "deformed furniture, impossible geometry, warped perspective, floating objects",
  },
  fitness: {
    label: "피트니스/스포츠",
    environment: "modern gym or athletic outdoor setting with dynamic energy",
    lighting: "dramatic athletic lighting with strong directional highlights",
    mood: "energetic, powerful, motivational",
    cameraAngle: "dynamic low-angle or motion-blur action shot",
    styleKeywords: "muscle definition, athletic form, equipment detail, sweat glistening, performance fabric texture",
    negativeHints: "deformed limbs, impossible body proportions, warped equipment, unnatural poses",
  },
  general: {
    label: "일반",
    environment: "clean professional studio setting",
    lighting: "balanced studio lighting with soft shadows",
    mood: "polished, commercial, trustworthy",
    cameraAngle: "product-focused composition with clean background",
    styleKeywords: "professional commercial photography, accurate color rendering, sharp detail",
    negativeHints: "distorted product shape, warped text, deformed labels, color shift",
  },
};

const NEGATIVE_PROMPT_BASE =
  "Avoid: distorted fingers, extra fingers, missing fingers, deformed hands, warped shapes, melted forms, " +
  "morphed proportions, hallucinated text, illegible labels, stretched product, color-shifted branding, " +
  "excessive noise, blurry details, unnatural facial expressions, extra limbs, merged objects, plastic-looking textures.";

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
    const body: GenerateImageRequest = await req.json();

    if (!body.prompt || body.prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "프롬프트를 입력해주세요." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = await resolveOpenAIKey();

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "AI 이미지 생성을 위한 API 키가 설정되지 않았습니다. 설정에서 OpenAI API 키를 등록해주세요." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawSize = body.size ?? "1024x1024";
    const sizeMap: Record<string, string> = {
      "1024x1024": "1024x1024",
      "1024x1792": "1024x1536",
      "1792x1024": "1536x1024",
    };
    const size = sizeMap[rawSize] ?? "1024x1024";
    const quality = body.quality ?? "standard";
    const n = Math.min(body.n ?? 1, 4);
    const industry = body.industry ?? "general";
    const preset = INDUSTRY_PRESETS[industry] ?? INDUSTRY_PRESETS.general;

    // Step 1: LLM prompt expansion (convert user keyword to structured professional prompt)
    const expandedPrompt = await expandPromptWithLLM(body.prompt, body.customPrompt, body.productName, body.productCategory, preset, openaiKey, body.platform, body.customLinks);

    // Step 2: Build structured prompt with industry preset injection
    const structuredPrompt = buildStructuredPrompt(expandedPrompt, preset, size, body.seed);

    // Step 3: Combine with negative prompt for final generation
    const finalPrompt = `${structuredPrompt}\n\nNegative constraints — ${NEGATIVE_PROMPT_BASE} ${preset.negativeHints}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    const qualityMapped = quality === "hd" ? "high" : "medium";

    let response: Response | null = null;
    let lastErrorDetail = "";
    const MAX_IMAGE_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_IMAGE_RETRIES; attempt++) {
      try {
        if (body.referenceImage) {
          const formData = new FormData();
          const refBlob = base64ToBlob(body.referenceImage);
          formData.append("image", refBlob, "reference.jpeg");
          formData.append("model", "gpt-image-1");
          formData.append("prompt", finalPrompt);
          formData.append("size", size);
          formData.append("quality", qualityMapped);
          formData.append("output_format", "png");
          formData.append("n", "1");
          response = await fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: { Authorization: `Bearer ${openaiKey}` },
            body: formData,
            signal: controller.signal,
          });
        } else {
          const imageBody: Record<string, unknown> = {
            model: "gpt-image-1",
            prompt: finalPrompt,
            n: 1,
            size,
            quality: qualityMapped,
            output_format: "png",
          };
          response = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify(imageBody),
            signal: controller.signal,
          });
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        return new Response(
          JSON.stringify({ error: "이미지 생성 요청 시간이 초과되었습니다." }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (response.ok) break;

      const errText = await response.text();
      try {
        const errJson = JSON.parse(errText);
        lastErrorDetail = errJson?.error?.message
          ? `OpenAI ${response.status}: ${errJson.error.message}`
          : `이미지 생성 실패: ${response.status}`;
      } catch {
        lastErrorDetail = errText && errText.length < 500
          ? `이미지 생성 실패: ${response.status} — ${errText}`
          : `이미지 생성 실패: ${response.status}`;
      }

      if (response.status === 429 && attempt < MAX_IMAGE_RETRIES) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "20", 10);
        const waitMs = (isNaN(retryAfter) ? 20 : Math.min(retryAfter, 30)) * 1000;
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      break;
    }
    clearTimeout(timeoutId);

    if (!response || !response.ok) {
      return new Response(
        JSON.stringify({ error: lastErrorDetail || "이미지 생성 실패" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await response.json();
    const imageBase64 = result.data?.[0]?.b64_json;

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "이미지를 생성하지 못했습니다." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        image: imageBase64,
        mimeType: "image/png",
        revisedPrompt: result.data?.[0]?.revised_prompt ?? body.prompt,
        expandedPrompt: expandedPrompt !== body.prompt ? expandedPrompt : undefined,
        industry: preset.label,
        seed: body.seed ?? undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "이미지 생성 중 오류가 발생했습니다." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function expandPromptWithLLM(
  userPrompt: string,
  customPrompt?: string,
  productName?: string,
  productCategory?: string,
  preset?: IndustryPreset,
  openaiKey?: string,
  platform?: string,
  customLinks?: string[],
): Promise<string> {
  if (!openaiKey) return userPrompt;

  const conversionPrompt = buildConversionPrompt(platform || "shortform", "image", customLinks);

  const systemInstruction =
    "You are a professional AI image prompt engineer specializing in conversion-optimized affiliate marketing content. " +
    "Convert the user's short Korean marketing keyword or phrase into a detailed, professional image generation prompt in English. " +
    "Follow this structure: [Subject] + [Environment] + [Lighting & Mood] + [Camera Angle] + [Quality]. " +
    "Keep the product name and key marketing point intact. Add visual detail that matches the industry context. " +
    "The image must be designed to stop scrolling and drive purchase conversions, not just look pretty.\n" +
    conversionPrompt +
    "\nOutput ONLY the expanded prompt, nothing else. Keep it under 200 words.";

  const context = [
    `User input: ${userPrompt}`,
    customPrompt?.trim() ? `Marketing focus: ${customPrompt.trim()}` : "",
    productName ? `Product: ${productName}` : "",
    productCategory ? `Category: ${productCategory}` : "",
    preset ? `Industry context: ${preset.label} — environment: ${preset.environment}, lighting: ${preset.lighting}` : "",
  ].filter(Boolean).join("\n");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: context },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      const expanded = data.choices?.[0]?.message?.content?.trim();
      if (expanded && expanded.length > 10) return expanded;
    }
  } catch {
    // LLM expansion is optional — fall back to raw prompt
  }

  return userPrompt;
}

function buildStructuredPrompt(
  expandedPrompt: string,
  preset: IndustryPreset,
  size: string,
  seed?: number,
): string {
  const isVertical = size === "1024x1792";
  const formatNote = isVertical
    ? "9:16 vertical format optimized for short-form video (Reels, Shorts, TikTok)"
    : size === "1792x1024"
    ? "16:9 horizontal format"
    : "1:1 square format";

  const seedNote = seed !== undefined ? ` Maintain visual consistency with seed reference ${seed}.` : "";

  const isComicArt = /comic|webtoon|illustration|cartoon|manga|panel|toon|sketch|art/i.test(expandedPrompt);

  if (isComicArt) {
    return (
      `[Subject] ${expandedPrompt}\n` +
      `[Environment] ${preset.environment}\n` +
      `[Lighting & Mood] ${preset.lighting}, ${preset.mood}\n` +
      `[Camera Angle] ${preset.cameraAngle}\n` +
      `[Format] ${formatNote}. High quality digital illustration, clean linework, vibrant colors, ` +
      `expressive characters, detailed comic panel art style. Maintain consistent character design across panels.${seedNote}`
    );
  }

  return (
    `[Subject] ${expandedPrompt}\n` +
    `[Environment] ${preset.environment}\n` +
    `[Lighting & Mood] ${preset.lighting}, ${preset.mood}\n` +
    `[Camera Angle] ${preset.cameraAngle}\n` +
    `[Style Detail] ${preset.styleKeywords}\n` +
    `[Format] ${formatNote}. High quality, professional commercial photography style, clean composition, ` +
    `vibrant colors, sharp focus, detailed texture.\n` +
    `CRITICAL: Do NOT distort, warp, stretch, or morph the product's original shape, proportions, colors, ` +
    `patterns, or text. Preserve the product exactly as it appears — maintain exact shape, color accuracy, ` +
    `pattern integrity, and all labels/logos/text without alteration or hallucination.${seedNote}`
  );
}

async function resolveOpenAIKey(): Promise<string | null> {
  const serverKey = Deno.env.get("OPENAI_API_KEY");
  if (serverKey) return serverKey;

  if (supabaseUrl && serviceRoleKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/user_settings?select=openai_api_key&order=updated_at.desc&limit=1`,
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

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: "image/jpeg" });
}
