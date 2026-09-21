import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface ProductVisionResult {
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
  suggestedCopyLayers: {
    primary: string;
    secondary: string;
    tertiary: string;
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
    const { images, productName, scanId } = body as { images: string[]; productName?: string; scanId?: string };

    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "이미지 배열이 필요합니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = await resolveOpenAIKey();
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API 키가 설정되지 않았습니다." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await analyzeProductVision(images.slice(0, 5), openaiKey, productName);

    // Persist vision result to scan row for caching
    if (scanId) {
      await persistVisionResult(scanId, result);
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Vision 분석 중 오류가 발생했습니다." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function stripJsonFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return t;
}

async function analyzeProductVision(
  images: string[],
  apiKey: string,
  productName?: string,
): Promise<ProductVisionResult> {
  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = images.map((url) => ({
    type: "image_url",
    image_url: { url },
  }));

  const systemPrompt = `You are an expert product vision analyst for AI video ad production.
Analyze the provided ${images.length} product photos (taken from multiple angles) and extract:
1. Product name and category (in Korean if possible)
2. Key visual features (shape, texture, color, finish, design details)
3. Marketing points that would appeal to consumers
4. Texture and material description for 3D rendering reference
5. Color palette (hex codes or descriptive)
6. Shape/form description for orbital camera path planning
7. Per-angle description (what each angle reveals)
8. Orbital focus point — the most visually striking feature to orbit around
9. Parallax depth layers — foreground/midground/background separation for parallax
10. Suggested 3-layer copywriting: primary (hook), secondary (benefit), tertiary (CTA)

Return ONLY a JSON object with this exact shape:
{
  "productName": string,
  "productCategory": string,
  "visualFeatures": string[],
  "marketingPoints": string[],
  "textureDescription": string,
  "colorPalette": string[],
  "shapeDescription": string,
  "materialGuess": string,
  "keyAngles": [{ "angle": string, "description": string }],
  "orbitalFocusPoint": string,
  "parallaxDepthLayers": string[],
  "suggestedCopyLayers": { "primary": string, "secondary": string, "tertiary": string }
}

${productName ? `The user suggests the product name is "${productName}". Verify and refine.` : ""}
Respond in Korean for all text fields except colorPalette and materialGuess.`;

  contentParts.unshift({ type: "text", text: systemPrompt });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: contentParts }],
        max_tokens: 2000,
        temperature: 0.4,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Vision AI 분석 실패: ${resp.status} ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    const rawContent = data.choices?.[0]?.message?.content ?? "";
    const cleaned = stripJsonFence(rawContent);

    let parsed: ProductVisionResult;
    try {
      parsed = JSON.parse(cleaned) as ProductVisionResult;
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]) as ProductVisionResult;
        } catch {
          throw new Error("Vision AI가 유효한 JSON을 반환하지 않았습니다. 잠시 후 다시 시도해주세요.");
        }
      } else {
        throw new Error("Vision AI가 유효한 JSON을 반환하지 않았습니다. 잠시 후 다시 시도해주세요.");
      }
    }

    const rawCopyLayers = parsed.suggestedCopyLayers ?? { primary: "", secondary: "", tertiary: "" };
    return {
      productName: parsed.productName || "지금 가장 핫한 추천 아이템",
      productCategory: parsed.productCategory ?? "",
      visualFeatures: parsed.visualFeatures ?? [],
      marketingPoints: parsed.marketingPoints ?? [],
      textureDescription: parsed.textureDescription ?? "",
      colorPalette: parsed.colorPalette ?? [],
      shapeDescription: parsed.shapeDescription ?? "",
      materialGuess: parsed.materialGuess ?? "",
      keyAngles: parsed.keyAngles ?? [],
      orbitalFocusPoint: parsed.orbitalFocusPoint ?? "",
      parallaxDepthLayers: parsed.parallaxDepthLayers ?? [],
      suggestedCopyLayers: {
        primary: rawCopyLayers.primary || "시선 집중! 지금 바로 확인하세요",
        secondary: rawCopyLayers.secondary || "왜 다들 이걸 찾는지 알겠더라고요",
        tertiary: rawCopyLayers.tertiary || "지금 확인하고 놓치지 마세요",
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function persistVisionResult(scanId: string, vision: ProductVisionResult): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    await fetch(`${supabaseUrl}/rest/v1/scans?id=eq.${scanId}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ product_vision: vision }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {
    // non-fatal — caching is best-effort
  }
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
        if (rows.length > 0 && rows[0].openai_api_key) {
          return rows[0].openai_api_key;
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}
