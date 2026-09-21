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

interface ReviewRequest {
  productName: string;
  productCategory: string;
  priceEstimate: string;
  oneLiner: string;
  hook: string;
  productAdvantages: string[];
  brandPersona?: string | null;
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
    const body: ReviewRequest = await req.json();

    if (!body.productName) {
      return new Response(
        JSON.stringify({ error: "Product name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = await resolveOpenAIKey();

    let review: { text: string; rating: number };
    let isFallback = false;

    if (openaiKey) {
      try {
        review = await generateWithOpenAI(body, openaiKey);
      } catch {
        review = generateContextualReview(body);
        isFallback = true;
      }
    } else {
      review = generateContextualReview(body);
      isFallback = true;
    }

    return new Response(
      JSON.stringify({ ...review, isFallback }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Review generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

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

async function generateWithOpenAI(
  data: ReviewRequest,
  apiKey: string,
): Promise<{ text: string; rating: number }> {
  const systemPrompt =
    "You are a Korean product review writer. Write a natural, authentic-sounding user review in Korean for the given product. " +
    "The review should feel like a real customer wrote it after using the product — conversational, honest, with specific details. " +
    "Return JSON with 'text' (the review, 80-200 characters in Korean) and 'rating' (integer 4 or 5). " +
    "Do NOT use hashtags, emojis, or marketing speak. Write as if posting on a shopping mall review section. " +
    (data.brandPersona && data.brandPersona.trim()
      ? `\nThe following brand tone & manner must be reflected in the review's voice and style:\n${data.brandPersona.trim()}\n`
      : "") +
    "Return ONLY valid JSON.";

  const userPrompt =
    `Product: ${data.productName}\n` +
    `Category: ${data.productCategory}\n` +
    `Price: ${data.priceEstimate || "unknown"}\n` +
    `One-liner: ${data.oneLiner || ""}\n` +
    `Product advantages: ${(data.productAdvantages || []).join(', ')}\n\n` +
    "Write a realistic Korean customer review for this product.";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
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
        { role: "user", content: userPrompt },
      ],
      max_tokens: 500,
      response_format: { type: "json_object" },
    }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content returned from OpenAI");

  let parsed: any;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    throw new Error('JSON parse failed');
  }
  const rating = Math.min(Math.max(Math.round(Number(parsed.rating) || 5), 1), 5);
  return {
    text: String(parsed.text || "").slice(0, 300),
    rating,
  };
}

function generateContextualReview(data: ReviewRequest): { text: string; rating: number } {
  const name = data.productName || "이 제품";
  const category = data.productCategory || "";
  const oneLiner = data.oneLiner || "";
  const advantages = data.productAdvantages?.length ? data.productAdvantages : [];
  const price = data.priceEstimate || "";

  const templates: Record<string, string[]> = {
    sneakers: [
      `${name} 처음 신어봤는데 생각보다 가벼워서 하루 종일 신어도 발이 안 아파요. 사이즈도 딱 맞고 색감이 사진이랑 똑같아서 만족합니다.`,
      `데일리로 신으려고 샀는데 진짜 잘 샀어요. 바닥 쿠션감도 좋고 어떤 옷에든 다 잘 어울려요. 동생도 같은 거 사달라고 하네요.`,
      `배송 빠르고 제품은 더 빠르게 좋았어요. ${oneLiner ? `${oneLiner} ` : ""}처음 신어보는 감인데 발이 편해서 좋아요. 사이즈 참고하시라고 덧붙여요.`,
      `${name} 신고 다니면 사람들이 자꾸 어디서 샀냐고 물어봐요. 디자인이 예쁘고 편해서 매일 신게 되네요. ${price ? `${price}이라 가성비도 좋아요.` : ""}`,
    ],
    clothing: [
      `${name} 입어봤는데 핏이 진짜 좋아요. 원단도 생각보다 튼튼하고 바느질이 깔끔해요. 이 가격에 이 퀄리티면 더 할 나위 없습니다.`,
      `사이즈 고민하다가 M 시켰는데 딱이에요. 세탁 후에도 안 변형되고 색도 안 빠져요. 또 사고 싶은 제품입니다.`,
      `${oneLiner ? `${oneLiner} ` : ""}기대하고 샀는데 실물이 더 좋아요. ${advantages.length ? `${advantages.join(', ')} 장점이 느껴져요. ` : ""}자주 입게 될 것 같아요.`,
      `${name} 핏이 마음에 들어서 다른 컬러도 주문했어요. ${price ? `가격대(${price})도 무난하고 ` : ""}원단이 편해서 좋습니다.`,
    ],
    lighting: [
      `${name} 방에 하나 올려뒀는데 분위기가 완전 바뀌었어요. 조도도 적당하고 야간에 무드 만들기 최고입니다. 조립도 쉬워서 혼자 했어요.`,
      `이 가격에 이 디자인이면 대만족이에요. 불빛이 너무 따뜻해서 집 들어오자마자 힐링됩니다. 자취방 인테리어 필수템 인정.`,
      `${oneLiner ? `${oneLiner} ` : ""}조명 하나로 공간 느낌이 달라져요. ${advantages.length ? `${advantages.join(', ')}가 인상적이에요. ` : ""}배송도 빠르고 설치도 간단해요.`,
      `${name} 켜두고 있으면 기분이 좋아져요. ${price ? `가격도 ${price}라 부담 없고 ` : ""}디자인이 깔끔해서 어디든 잘 어울려요.`,
    ],
    electronics: [
      `${name} 한 달째 쓰고 있는데 아주 만족이에요. ${oneLiner ? `${oneLiner} ` : ""}성능 좋고 조작 간단해서 ${advantages.length ? `${advantages.join(', ')}가 좋아요.` : "누구나 쉽게 써요."}`,
      `이 가격에 이 스펙이면 가성비 끝판왕이에요. ${price ? `${price}이라 예산 내에서 딱이고 ` : ""}매일 쓰는 데 전혀 불편 없어요.`,
      `${name} 디자인도 예쁘고 기능도 충분해요. 배송 빠르고 포장도 꼼꼼했어요. 구매 잘했습니다.`,
    ],
    beauty: [
      `${name} 사용한 지 2주 됐는데 피부가 달라졌어요. ${oneLiner ? `${oneLiner} ` : ""}자극도 없고 발림성도 좋아서 아침저녁으로 쓰고 있어요.`,
      `${advantages.length ? `${advantages.join(', ')} 장점이 느껴져요. ` : ""}${name} 쓰고 나서 다른 제품이 필요 없어졌어요. ${price ? `가격도 ${price}라 부담 없고 ` : ""}재구매 의사 있습니다.`,
    ],
  };

  const fallback = [
    `${name} 사용해봤는데 기대 이상이에요. ${oneLiner ? `${oneLiner} ` : ""}성능도 좋고 ${price ? `가격대(${price})도 ` : ""}합리적이에요. 추천합니다.`,
    `${name} 구매후기 남겨요. ${advantages.length ? `${advantages.join(', ')} 장점이 체감돼요. ` : ""}실사용해보니 만족스러워요. 재구매 의사 있습니다.`,
    `${oneLiner ? `${oneLiner} ` : ""}${name} 쓰고 나서 일상이 좀 더 편해졌어요. ${price ? `가격(${price}) 대비 퀄리티가 좋아서 ` : ""}만족스럽습니다.`,
    `${name} 배송 빠르고 제품도 좋아요. ${advantages.length ? `${advantages.join(', ')}가 인상적이에요. ` : ""}후회 안 하실 겁니다.`,
    `${name} 한 달간 써본 결과, ${oneLiner ? `${oneLiner} ` : ""}맞는 말이에요. ${price ? `${price}이라 예산 내에서 딱이에요.` : ""}잘 샀습니다.`,
  ];

  const pool = templates[category] || fallback;
  let text = pool[Math.floor(Math.random() * pool.length)].slice(0, 300);
  if (data.brandPersona && data.brandPersona.trim()) {
    const persona = data.brandPersona.trim();
    if (persona.includes("반말") || persona.includes("편하게")) {
      text = text
        .replace(/요\./g, '어.')
        .replace(/요\!/g, '어!')
        .replace(/요\n/g, '어\n')
        .replace(/요$/g, '어')
        .replace(/습니다\./g, '다.')
        .replace(/습니다\!/g, '다!')
        .replace(/습니다\n/g, '다\n')
        .replace(/습니다$/g, '다')
        .replace(/네요\./g, '네.')
        .replace(/네요\!/g, '네!');
    }
  }
  return { text, rating: 5 };
}
