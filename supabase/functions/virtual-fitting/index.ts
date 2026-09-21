import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VirtualFittingRequest {
  productImage: string;
  modelImage: string;
  bodyType?: string;
  pose?: string;
  mood?: string;
  sceneStyle?: string;
  customPrompt?: string;
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
    const body: VirtualFittingRequest = await req.json();

    if (!body.productImage || !body.modelImage) {
      return new Response(
        JSON.stringify({ error: "제품 사진과 모델 사진이 모두 필요합니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = await resolveOpenAIKey();
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "AI 가상 피팅을 위한 API 키가 설정되지 않았습니다. 설정에서 OpenAI API 키를 등록해주세요." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const prompt = buildFittingPrompt(body.bodyType, body.pose, body.mood, body.sceneStyle, body.customPrompt);

    const productDataUrl = ensureDataUrl(body.productImage, "image/jpeg");
    const modelDataUrl = ensureDataUrl(body.modelImage, "image/jpeg");

    const resultBase64 = await callImageEdit(productDataUrl, modelDataUrl, prompt, openaiKey);

    return new Response(
      JSON.stringify({ image: resultBase64, mimeType: "image/png" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "가상 피팅 생성 중 오류가 발생했습니다." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function buildFittingPrompt(bodyType?: string, pose?: string, mood?: string, sceneStyle?: string, customPrompt?: string): string {
  const bodyDesc: Record<string, string> = {
    slim: "slim body type (size 44-55)",
    standard: "standard body type (size 66-77)",
    plus: "plus-size body type (size 88-99)",
  };
  const poseDesc: Record<string, string> = {
    front: "facing forward, front view",
    side: "side profile view",
    natural: "natural relaxed pose",
  };
  const moodDesc: Record<string, string> = {
    daily_casual: "bright, cheerful everyday outdoor lighting",
    street_hip: "edgy urban street style with dramatic lighting",
    studio_minimal: "clean minimal studio with soft diffused lighting",
    sunset_warm: "warm golden hour sunset glow",
    natural_outdoor: "natural daylight in an outdoor setting",
  };
  const sceneDesc: Record<string, string> = {
    studio_white: "clean white studio background",
    urban_street: "urban street background with city elements",
    cafe_interior: "cozy cafe interior background",
    beach_outdoor: "beach or seaside outdoor background",
    nature_park: "park or garden with greenery",
    retail_shop: "modern retail shop interior",
  };

  const body = bodyDesc[bodyType ?? "standard"] ?? bodyDesc.standard;
  const poseStr = poseDesc[pose ?? "front"] ?? poseDesc.front;
  const moodStr = moodDesc[mood ?? ""] ?? "clean, neutral studio lighting";
  const sceneStr = sceneDesc[sceneStyle ?? ""] ?? "clean, neutral studio background";

  let prompt = `You are given two images. The first image is a clothing/product garment photo. The second image is a model photo.\n\nCreate a realistic virtual fitting result: dress the model in the clothing from the first image. The model should be wearing the garment naturally, with the clothing fitting properly on their body.\n\nCRITICAL — DO NOT DISTORT THE PRODUCT:\n- Preserve the EXACT shape, proportions, and silhouette of the original garment from the product photo\n- Do NOT stretch, warp, skew, bend, or morph the garment's shape in any way\n- Maintain the EXACT original color, pattern, print, texture, and fabric weight of the garment\n- Preserve all logos, labels, buttons, zippers, stitching, and hardware exactly as they appear in the product photo\n- Do NOT invent or hallucinate new patterns, colors, or design elements that are not in the original product\n- The garment's design details (collars, cuffs, hems, pockets) must match the product photo precisely\n- If the product has a specific graphic or text print, reproduce it exactly without alteration\n\nModel requirements:\n- Keep the model's face, skin tone, and hair exactly the same\n- The model has a ${body}\n- The model should be in a ${poseStr} pose\n- The clothing should look realistic, with natural wrinkles, folds, and fabric texture matching the original product\n- Lighting: ${moodStr}\n- Background: ${sceneStr}\n- The result should look like a professional fashion photograph\n- High quality, photorealistic output`;

  if (customPrompt && customPrompt.trim()) {
    prompt += `\n\nAdditional user instructions: ${customPrompt.trim()}`;
  }

  return prompt;
}

async function callImageEdit(
  productDataUrl: string,
  modelDataUrl: string,
  prompt: string,
  apiKey: string,
): Promise<string> {
  const formData = new FormData();

  const productBlob = dataUrlToBlob(productDataUrl);
  const modelBlob = dataUrlToBlob(modelDataUrl);

  formData.append("image[]", modelBlob, "model.jpeg");
  formData.append("image[]", productBlob, "product.jpeg");
  formData.append("model", "gpt-image-1");
  formData.append("prompt", prompt);
  formData.append("size", "1024x1024");
  formData.append("quality", "medium");
  formData.append("output_format", "png");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Image Edit API error: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("가상 피팅 이미지를 생성하지 못했습니다.");

  return b64;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const ext = match[1].toLowerCase() === "png" ? "png" : match[1].toLowerCase() === "webp" ? "webp" : "jpeg";
  const base64Data = match[2];
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: `image/${ext}` });
}

function ensureDataUrl(image: string, mimeType: string): string {
  if (!image) return "";
  const trimmed = image.trim().replace(/\s/g, "");
  if (trimmed.startsWith("data:")) return trimmed;
  return `data:${mimeType};base64,${trimmed}`;
}

async function resolveOpenAIKey(): Promise<string | null> {
  const serverKey = Deno.env.get("OPENAI_API_KEY");
  if (serverKey) return serverKey;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
    } catch (err) {
      console.warn("[virtual-fitting] failed to resolve OpenAI key from DB:", err);
    }
  }
  return null;
}
