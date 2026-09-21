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

interface PersonaRequest {
  productName: string;
  productCategory: string;
  priceEstimate: string;
  oneLiner: string;
  productAdvantages: string[];
  hook: string;
}

interface PersonaReaction {
  persona: string;
  avatar: string;
  ageGroup: string;
  interestScore: number;
  commentCount: number;
  cartAddRate: number;
  predictedComments: string[];
  reactionSummary: string;
  recommendedAngle: string;
}

interface SimulationResult {
  bestPersona: string;
  overallScore: number;
  personas: PersonaReaction[];
  strategy: string;
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
    const body: PersonaRequest = await req.json();

    if (!body.productName) {
      return new Response(
        JSON.stringify({ error: "Product name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = await resolveOpenAIKey();

    let result: SimulationResult;

    if (openaiKey) {
      try {
        result = await simulateWithOpenAI(body, openaiKey);
      } catch {
        result = simulateLocal(body);
      }
    } else {
      result = simulateLocal(body);
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Simulation failed" }),
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

async function simulateWithOpenAI(
  data: PersonaRequest,
  apiKey: string,
): Promise<SimulationResult> {
  const systemPrompt =
    "너는 소상공인을 위한 AI 마케팅 시뮬레이터야. 상품 정보를 받으면 틱톡/릴스 알고리즘과 소비자 집단을 시뮬레이션해서, 어떤 페르소나에게 노출했을 때 반응이 폭발적인지 예측해.\n" +
    "4가지 페르소나를 생성하고 각각에 대해 분석해:\n" +
    "1. 20대 자취생 (가성비 중시, 트렌드 민감)\n" +
    "2. 30대 직장인 (실용성 중시, 시간 절약)\n" +
    "3. 40대 주부 (가족 지출, 리뷰 중시)\n" +
    "4. 2030 Z세대 크리에이터 (개성, 유행 선도)\n" +
    "각 페르소나별로:\n" +
    "- interestScore (0~100): 이 페르소나가 이 상품에 얼마나 관심을 가질지\n" +
    "- commentCount: 예상 댓글 수 (10~500)\n" +
    "- cartAddRate (0~100): 장바구니 담기 확률\n" +
    "- predictedComments: 이 페르소나가 실제로 달 법한 댓글 2개 (10-30자, 자연스러운 말투)\n" +
    "- reactionSummary: 이 페르소나의 반응 요약 (30-60자)\n" +
    "- recommendedAngle: 이 페르소나를 공략할 숏폼 각도 (20-40자)\n" +
    "결과는 JSON만 반환:\n" +
    "{ \"bestPersona\": \"가장 반응이 좋은 페르소나 이름\", \"overallScore\": number(0-100), \"strategy\": \"전체 마케팅 전략 한 줄(40-80자)\", \"personas\": [{ \"persona\": \"이름\", \"avatar\": \"이모지 1개\", \"ageGroup\": \"연령대\", \"interestScore\": number, \"commentCount\": number, \"cartAddRate\": number, \"predictedComments\": [\"댓글1\", \"댓글2\"], \"reactionSummary\": \"요약\", \"recommendedAngle\": \"공략 각도\" }] }\n" +
    "한국어로 자연스럽게 작성하고, 실제 소비자가 쓸 법한 말투를 사용해.";

  const userPrompt =
    `제품명: ${data.productName}\n` +
    `카테고리: ${data.productCategory}\n` +
    (data.priceEstimate ? `가격: ${data.priceEstimate}\n` : "") +
    `한 줄 소개: ${data.oneLiner || ""}\n` +
    `장점: ${(data.productAdvantages || []).join(", ") || "없음"}\n` +
    `현재 후킹 문구: ${data.hook || "없음"}`;

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
      max_tokens: 2000,
      temperature: 0.85,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content from OpenAI");

  let parsed: any;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    return simulateLocal(data);
  }
  return normalizeSimulation(parsed);
}

function clampNum(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function normalizeSimulation(raw: Record<string, unknown>): SimulationResult {
  const personas: PersonaReaction[] = Array.isArray(raw.personas)
    ? (raw.personas as Record<string, unknown>[]).slice(0, 4).map((p) => ({
        persona: String(p.persona || "").slice(0, 30),
        avatar: String(p.avatar || "👤").slice(0, 4),
        ageGroup: String(p.ageGroup || "").slice(0, 15),
        interestScore: clampNum(p.interestScore, 50, 0, 100),
        commentCount: clampNum(p.commentCount, 50, 0, 999),
        cartAddRate: clampNum(p.cartAddRate, 30, 0, 100),
        predictedComments: Array.isArray(p.predictedComments)
          ? (p.predictedComments as unknown[]).slice(0, 2).map((c) => String(c).slice(0, 50))
          : [],
        reactionSummary: String(p.reactionSummary || "").slice(0, 100),
        recommendedAngle: String(p.recommendedAngle || "").slice(0, 60),
      }))
    : [];

  return {
    bestPersona: String(raw.bestPersona || "").slice(0, 30),
    overallScore: clampNum(raw.overallScore, 50, 0, 100),
    strategy: String(raw.strategy || "").slice(0, 120),
    personas,
  };
}

const PERSONA_TEMPLATES = [
  {
    persona: "20대 자취생",
    avatar: "🧑‍💻",
    ageGroup: "20-29",
    interestWeight: { beauty: 0.8, food: 1.2, electronics: 0.6, fashion: 1.0, default: 0.7 },
    commentStyle: ["오 이거 꿀이네", "가성비 미쳤다", "당장 주문함", "이게 얼마라고?"],
    angle: "가성비 + 자취방 꿀템 각도로 어필",
  },
  {
    persona: "30대 직장인",
    avatar: "💼",
    ageGroup: "30-39",
    interestWeight: { beauty: 0.7, food: 0.9, electronics: 1.1, fashion: 0.8, default: 0.9 },
    commentStyle: ["퇴근하고 써봐야지", "이거면 시간 아껴지네", "회사에서 물어봤음", "실용성 인정"],
    angle: "시간 절약 + 실용성 강조로 어필",
  },
  {
    persona: "40대 주부",
    avatar: "👩‍👧",
    ageGroup: "40-49",
    interestWeight: { beauty: 0.6, food: 1.1, electronics: 0.5, fashion: 0.5, default: 0.8 },
    commentStyle: ["아이들이 좋아하겠네", "이거 사면 집이 편해짐", "리뷰 더 보고 싶어요", "가족이 쓰기 좋겠다"],
    angle: "가족 실용성 + 안전성 각도로 어필",
  },
  {
    persona: "2030 크리에이터",
    avatar: "🎨",
    ageGroup: "20-33",
    interestWeight: { beauty: 1.0, food: 0.8, electronics: 0.9, fashion: 1.2, default: 1.0 },
    commentStyle: ["이거로 숏폼 찍으면 대박", "내 피드에 올려야 함", "심미성 쩔었다", "트렌드 인정"],
    angle: "트렌드 + 시각적 임팩트 각도로 어필",
  },
];

function simulateLocal(data: PersonaRequest): SimulationResult {
  const category = (data.productCategory || "").toLowerCase();
  const advantages = data.productAdvantages?.length ? data.productAdvantages : ["가성비"];
  const hasPriceAppeal = advantages.some((a) =>
    /가성|저렴|할인|혜택|저가/i.test(a),
  );
  const hasPracticalAppeal = advantages.some((a) =>
    /실용|편리|시간|효율|쉽|간편/i.test(a),
  );
  const hasVisualAppeal = advantages.some((a) =>
    /예쁘|디자인|감성|트렌드|스타일|심미/i.test(a),
  );

  const personas: PersonaReaction[] = PERSONA_TEMPLATES.map((template) => {
    const weightKey = category in template.interestWeight ? category : "default";
    const baseWeight = template.interestWeight[weightKey as keyof typeof template.interestWeight] ?? 0.7;

    let interestScore = Math.round(baseWeight * 60);
    if (hasPriceAppeal && template.persona.includes("자취생")) interestScore += 15;
    if (hasPracticalAppeal && template.persona.includes("직장인")) interestScore += 15;
    if (hasPracticalAppeal && template.persona.includes("주부")) interestScore += 12;
    if (hasVisualAppeal && template.persona.includes("크리에이터")) interestScore += 15;
    interestScore = Math.min(interestScore, 95);

    const commentCount = Math.round(interestScore * (2 + Math.random() * 1.5));
    const cartAddRate = Math.round(interestScore * 0.7 + Math.random() * 10);
    const comments = template.commentStyle.slice(0, 2);

    return {
      persona: template.persona,
      avatar: template.avatar,
      ageGroup: template.ageGroup,
      interestScore,
      commentCount,
      cartAddRate: Math.min(cartAddRate, 95),
      predictedComments: comments,
      reactionSummary: generateReactionSummary(template.persona, interestScore, advantages),
      recommendedAngle: template.angle,
    };
  });

  const best = personas.reduce((max, p) => (p.interestScore > max.interestScore ? p : max));
  const overallScore = Math.round(
    personas.reduce((sum, p) => sum + p.interestScore, 0) / personas.length,
  );

  const strategy = generateStrategy(best.persona, advantages, category);

  return {
    bestPersona: best.persona,
    overallScore,
    strategy,
    personas,
  };
}

function generateReactionSummary(persona: string, score: number, advantages: string[]): string {
  if (score >= 80) {
    return `${persona}은 이 상품에 강한 관심을 보이며 댓글창이 폭발할 가능성이 높습니다.`;
  } else if (score >= 60) {
    return `${persona}은 ${advantages[0] || "가성비"}에 공감하며 자연스러운 반응이 예상됩니다.`;
  } else if (score >= 40) {
    return `${persona}은 관심이 낮은 편이며 다른 각도의 어필이 필요합니다.`;
  }
  return `${persona}은 이 상품 카테고리에 무관심하여 타겟 변경을 권장합니다.`;
}

function generateStrategy(bestPersona: string, advantages: string[], category: string): string {
  const topAdvantage = advantages[0] || "가성비";
  return `${bestPersona}을 타겟으로 ${topAdvantage}을 강조하는 숏폼을 제작하면 댓글창 반응과 장바구니 전환이 가장 높습니다. 다른 페르소나도 보조 타겟으로 활용하세요.`;
}
