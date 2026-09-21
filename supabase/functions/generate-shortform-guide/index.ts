import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { buildPsychoSystemPrompt } from "../_shared/psycho-engine.ts";
import { buildConversionPrompt } from "../_shared/conversion-engine.ts";

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

interface GuideTip {
  title: string;
  description: string;
}

interface GuideHook {
  text: string;
  angle: string;
}

interface ShortFormGuide {
  tips: GuideTip[];
  hooks: GuideHook[];
  concept: string;
}

interface GuideRequest {
  productName: string;
  productCategory: string;
  priceEstimate: string;
  oneLiner: string;
  productAdvantages: string[];
  platform?: string;
  customLinks?: string[];
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
    const body: GuideRequest = await req.json();

    if (!body.productName) {
      return new Response(
        JSON.stringify({ error: "Product name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = await resolveOpenAIKey();

    let guide: ShortFormGuide;

    if (openaiKey) {
      try {
        guide = await generateWithOpenAI(body, openaiKey);
      } catch {
        guide = generateLocalGuide(body);
      }
    } else {
      guide = generateLocalGuide(body);
    }

    return new Response(
      JSON.stringify(guide),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Guide generation failed" }),
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
  data: GuideRequest,
  apiKey: string,
): Promise<ShortFormGuide> {
  const guideChannelSpecific =
    "## 숏폼 가이드 전용 지시사항\n" +
    "너는 숏폼 콘텐츠 제작 전문가야. 상품 정보를 받으면 그 상품에 맞는 숏폼 제작 가이드를 만들어.\n" +
    "완벽한 스튜디오 퀄리티는 과감히 버려. 스마트폰으로 대충 찍은 듯한 날것의 비주얼이 핵심이야.\n" +
    "후킹 문구는 손실 회피, 공포 자극, FOMO를 활용하라. \"이거 모르면 돈 날린다\", \"이거 모르면 호구 된다\" 식으로.\n" +
    "팁은 실제 숏폼 크리에이터가 쓸 법한 거칠고 진짜 같은 조언으로. 기업형 조언, 스튜디오 연출 금지.\n" +
    "결과는 JSON만 반환: { \"concept\": \"이 상품에 어울리는 날것 숏폼 콘셉트 한 줄\", \"tips\": [{ \"title\": \"팁 제목(10자 이내)\", \"description\": \"구체적인 제작 팁(30-60자)\" }], \"hooks\": [{ \"text\": \"후킹 문구(10-25자)\", \"angle\": \"이 문구가 왜 효과적인지 한 줄 설명\" }] }\n" +
    "tips는 3개, hooks는 3개를 만들어. 각각 서로 다른 각도(예: 손실 회피, FOMO 자극, 귀찮음 해결, 찐 후기형 등)로.\n" +
    "한국어로 자연스럽게 작성하고, 친구에게 카톡으로 팩폭을 던지듯 거칠고 직관적인 구어체를 사용해.";

  const conversionPrompt = buildConversionPrompt(data.platform || "shortform", "video", data.customLinks);

  const systemPrompt = buildPsychoSystemPrompt(
    "너는 숏폼 콘텐츠 제작 전문가야.",
    guideChannelSpecific + conversionPrompt,
  );

  const userPrompt =
    `제품명: ${data.productName}\n` +
    `카테고리: ${data.productCategory}\n` +
    (data.priceEstimate ? `가격: ${data.priceEstimate}\n` : "") +
    `한 줄 소개: ${data.oneLiner || ""}\n` +
    `장점: ${(data.productAdvantages || []).join(", ")}`;

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
      max_tokens: 1200,
      temperature: 0.8,
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

  let parsed: any;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    return generateLocalGuide(data);
  }
  return normalizeGuide(parsed);
}

function normalizeGuide(raw: Record<string, unknown>): ShortFormGuide {
  const tips: GuideTip[] = Array.isArray(raw.tips)
    ? (raw.tips as Record<string, unknown>[]).slice(0, 3).map((t) => ({
        title: String(t.title || "").slice(0, 20),
        description: String(t.description || "").slice(0, 100),
      }))
    : [];

  const hooks: GuideHook[] = Array.isArray(raw.hooks)
    ? (raw.hooks as Record<string, unknown>[]).slice(0, 3).map((h) => ({
        text: String(h.text || "").slice(0, 40),
        angle: String(h.angle || "").slice(0, 80),
      }))
    : [];

  return {
    concept: String(raw.concept || "").slice(0, 80),
    tips,
    hooks,
  };
}

function generateLocalGuide(data: GuideRequest): ShortFormGuide {
  const name = data.productName || "이 제품";
  const nameShort = name.length > 10 ? name.slice(0, 10) + "…" : name;
  const advantages = data.productAdvantages?.length ? data.productAdvantages : ["가성비"];
  const price = data.priceEstimate || "";
  const category = (data.productCategory || "").toLowerCase();

  const conceptByCategory: Record<string, string> = {
    sneakers: "스마트폰으로 대충 찍은 신발 언박싱, 거친 텍스처 클로즈업 숏폼",
    clothing: "착용 전후 비교로 코디 완성도를 보여주는 날것 스타일링 숏폼",
    lighting: "조명 켜기 전후로 분위기 변화를 극대화하는 비포애프터 숏폼",
    electronics: "기능을 실사용 장면으로 보여주는 날것 리뷰형 숏폼",
    beauty: "사용 전후 피부 변화를 클로즈업하는 뷰티 숏폼",
    food: "먹는 순간의 반응을 담는 먹방형 숏폼",
    furniture: "배치 전후 공간 변화를 보여주는 인테리어 숏폼",
  };

  const tipsByCategory: Record<string, GuideTip[]> = {
    sneakers: [
      { title: "언박싱", description: "박스 열 때 손 떨림까지 그대로, 스마트폰으로 대충 찍어라" },
      { title: "착용샷", description: "실제 신었을 때의 핏을 셀카 모드로 거칠게 담아라" },
      { title: "사운드", description: "바닥에 닿는 소리, 박스 여는 소리 ASMR로 살려라" },
    ],
    clothing: [
      { title: "전후비교", description: "코디 전 평범한 착장과 후를 분할화면으로 비교해라" },
      { title: "소재클로즈", description: "원단 질감을 손으로 만지며 스마트폰 클로즈업으로" },
      { title: "회전샷", description: "착용 후 360도 천천히 돌아 핏을 전체적으로 보여라" },
    ],
    lighting: [
      { title: "비포애프터", description: "조명 OFF 상태와 ON 상태를 1초 컷으로 전환해라" },
      { title: "어분위기", description: "조명 켜진 공간 전체를 어두운 배경에서 촬영해라" },
      { title: "디테일", description: "조명 스위치나 디자인 디테일을 2초간 보여라" },
    ],
  };

  const defaultTips: GuideTip[] = [
    { title: "오프닝", description: "첫 1초에 가장 시선 끄는 장면을 대충 찍은 듯이 배치해라" },
    { title: "클로즈업", description: "제품 핵심 특징을 2-3초 스마트폰 클로즈업으로 보여라" },
    { title: "사용장면", description: "실제 사용하는 장면을 자연스럽게 3초간 담아라" },
  ];

  const tips = tipsByCategory[category] || defaultTips;

  const hookPool: GuideHook[] = [
    { text: `이거 모르면 호구 되는 ${nameShort}`, angle: "손실 회피 — 정보 부재에 대한 공포 자극" },
    { text: price ? `${price}라서 바로 담은 ${nameShort}` : `다들 이거 사느라 난리남`, angle: "가격 어필 — 비용 대비 가치 강조" },
    { text: `${advantages[0]} 인정? ${nameShort} 실화인가`, angle: "감정 자극 — 공감과 반응 유도" },
    { text: `${nameShort} 쓰고 다른 거 다 버렸음`, angle: "사용 후기형 — 경험담으로 신뢰 구축" },
    { text: `나만 빼고 다 아는 ${nameShort}`, angle: "FOMO 자극 — 소외 공포로 시선 강제" },
  ];

  const hooks = hookPool.slice(0, 3);

  return {
    concept: conceptByCategory[category] || `${nameShort}의 핵심 장점을 15초 날것으로 담는 숏폼`,
    tips,
    hooks,
  };
}
