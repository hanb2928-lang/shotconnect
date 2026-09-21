import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function stripJsonFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return t;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface OcrTextItem {
  text: string;
  type: 'brand' | 'model' | 'price' | 'spec' | 'other';
}

interface OcrResult {
  rawTexts: OcrTextItem[];
  brandName: string | null;
  modelName: string | null;
  priceText: string | null;
  searchTerms: string[];
  recommendedSearchQuery: string;
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

    let result: OcrResult;

    if (openaiKey) {
      try {
        result = await extractTextWithOpenAI(imageDataUrl, cleanMime, openaiKey);
      } catch {
        result = emptyResult();
      }
    } else {
      result = emptyResult();
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "OCR extraction failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function emptyResult(): OcrResult {
  return {
    rawTexts: [],
    brandName: null,
    modelName: null,
    priceText: null,
    searchTerms: [],
    recommendedSearchQuery: '',
  };
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

async function extractTextWithOpenAI(
  imageDataUrl: string,
  mimeType: string,
  apiKey: string,
): Promise<OcrResult> {
  const systemPrompt =
    "너는 상품 사진에서 텍스트를 OCR로 추출하는 전문가야. " +
    "사진 속에 보이는 모든 텍스트를 추출하고, 각 텍스트의 종류를 분류해.\n" +
    "텍스트 종류:\n" +
    "- brand: 브랜드명 (예: Nike, Samsung, APPLE, 나이키)\n" +
    "- model: 모델명/제품명 (예: Air Force 1, Galaxy S24, iPhone 15 Pro)\n" +
    "- price: 가격 정보 (예: 99,000원, $49.99, 50% OFF)\n" +
    "- spec: 제품 스펙/설명 (예: 500mAh, 무선 충전, 100% 면)\n" +
    "- other: 기타 텍스트 (URL, 주소, 슬로건 등)\n\n" +
    "추출한 텍스트를 바탕으로 제휴 쇼핑 검색에 사용할 검색어를 제안해.\n" +
    "검색어는 쇼핑 플랫폼(쿠팡, 네이버 쇼핑)에서 검색했을 때 정확한 상품이 나오도록 최적화해야 해.\n\n" +
    "반환할 JSON 형식:\n" +
    '{\n' +
    '  "rawTexts": [{ "text": "추출된 텍스트", "type": "brand|model|price|spec|other" }, ...],\n' +
    '  "brandName": "브랜드명 또는 null",\n' +
    '  "modelName": "모델명 또는 null",\n' +
    '  "priceText": "가격 텍스트 또는 null",\n' +
    '  "searchTerms": ["검색어1", "검색어2", "검색어3"],\n' +
    '  "recommendedSearchQuery": "가장 추천하는 검색어"\n' +
    '}\n\n' +
    "searchTerms는 1-5개까지 제안하고, 브랜드명+모델명 조합이 가장 우선이야.\n" +
    "텍스트가 아예 없으면 빈 배열과 null을 반환해.\n" +
    "JSON만 반환해. 마크다운 금지.";

  const userContent = [
    {
      type: "text",
      text: "이 사진에서 보이는 모든 텍스트를 추출하고, 제휴 쇼핑 검색어를 제안해줘.",
    },
    { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 1500,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content returned from OpenAI");

  let parsed: OcrResult;
  try {
    const raw = JSON.parse(stripJsonFence(content));
    parsed = {
      rawTexts: Array.isArray(raw.rawTexts) ? raw.rawTexts.slice(0, 20).map((r: any) => ({
        text: String(r.text || '').slice(0, 200),
        type: (['brand', 'model', 'price', 'spec', 'other'].includes(r.type) ? r.type : 'other') as OcrTextItem['type'],
      })) : [],
      brandName: raw.brandName ? String(raw.brandName).slice(0, 100) : null,
      modelName: raw.modelName ? String(raw.modelName).slice(0, 100) : null,
      priceText: raw.priceText ? String(raw.priceText).slice(0, 100) : null,
      searchTerms: Array.isArray(raw.searchTerms) ? raw.searchTerms.slice(0, 5).map((s: any) => String(s).slice(0, 100)) : [],
      recommendedSearchQuery: raw.recommendedSearchQuery ? String(raw.recommendedSearchQuery).slice(0, 100) : '',
    };
  } catch {
    return emptyResult();
  }

  return parsed;
}
