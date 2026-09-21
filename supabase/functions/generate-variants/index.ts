import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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

type VariantTone = 'informative' | 'humor' | 'emotional';

interface VariantPanel {
  speech: string;
  sfx: string;
  emotion: string;
}

interface Variant {
  tone: VariantTone;
  toneLabel: string;
  hook: string;
  caption: string;
  hashtags: string[];
  panels: VariantPanel[];
  narrationText: string;
  recommendedPlatform: string;
}

interface VariantRequest {
  productName: string;
  productCategory: string;
  priceEstimate: string;
  oneLiner: string;
  productAdvantages: string[];
  hook: string;
  brandPersona?: string | null;
  platform?: string;
  customLinks?: string[];
}

const TONE_CONFIG: Record<VariantTone, { label: string; platform: string; systemGuidance: string }> = {
  informative: {
    label: '정보 전달형',
    platform: 'YouTube',
    systemGuidance: '정확하고 신뢰감 있는 톤. 제품의 기능, 스펙, 장점을 명확하게 전달. 객관적이고 전문적인 느낌.',
  },
  humor: {
    label: '유머/밈 기반',
    platform: 'TikTok',
    systemGuidance: '유쾌하고 과장된 밈 스타일. 요즘 유행하는 밈, 유행어를 활용. 짧고 임팩트 있는 반말체. 웃음을 유발하는 과장된 표현.',
  },
  emotional: {
    label: '감성/리뷰형',
    platform: 'Instagram',
    systemGuidance: '따뜻하고 감성적인 1인칭 리뷰 톤. 실제 사용 경험을 솔직하게 담은 느낌. 공감과 감동을 이끌어내는 표현.',
  },
};

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
    const body: VariantRequest = await req.json();

    if (!body.productName) {
      return new Response(
        JSON.stringify({ error: "Product name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = await resolveOpenAIKey();

    let variants: Variant[];

    if (openaiKey) {
      try {
        variants = await generateVariantsWithOpenAI(body, openaiKey);
      } catch {
        variants = generateLocalVariants(body);
      }
    } else {
      variants = generateLocalVariants(body);
    }

    return new Response(
      JSON.stringify({ variants }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Variant generation failed" }),
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

async function generateVariantsWithOpenAI(data: VariantRequest, apiKey: string): Promise<Variant[]> {
  const tones: VariantTone[] = ['informative', 'humor', 'emotional'];

  const conversionPrompt = buildConversionPrompt(data.platform || "shortform", "variant", data.customLinks);

  const systemPrompt =
    "너는 한국 숏폼 마케팅 전문가야. 같은 상품에 대해 3가지 다른 톤앤매너의 숏폼 스크립트를 동시에 만들어.\n" +
    "각 변형은 서로 완전히 다른 분위기와 대사를 가져야 해. 중복 문구 금지.\n" +
    conversionPrompt + "\n" +
    "각 변형마다 다음을 포함해:\n" +
    "- hook: 15자 이내의 후킹 문구 (각 변형마다 다른 스타일)\n" +
    "- caption: SNS 업로드용 캡션 (50자 이내)\n" +
    "- hashtags: 5개 해시태그 (해당 톤에 맞는 것)\n" +
    "- panels: 3컷 만화 대사 (각 컷마다 speech, sfx, emotion)\n" +
    "- narrationText: 만화 전체를 설명하는 내레이션 한 줄\n" +
    "- recommendedPlatform: 이 톤에 가장 적합한 플랫폼\n" +
    "결과는 JSON만 반환: { \"variants\": [{ \"tone\": \"informative\", \"toneLabel\": \"정보 전달형\", \"hook\": \"...\", \"caption\": \"...\", \"hashtags\": [\"...\", ...], \"panels\": [{\"speech\":\"...\",\"sfx\":\"...\",\"emotion\":\"...\"},...], \"narrationText\": \"...\", \"recommendedPlatform\": \"YouTube\" }, ...] }\n" +
    "sfx는 만화식 의성어(KWAANG!, 촤악!, 샤방~, 따봉!)를 사용해.\n" +
    "emotion은 한 단어로 (예: 고민, 놀람, 행복, 확신, 설렘, 도전, 수다, 감동).";

  const toneGuidance = tones.map(t => {
    const cfg = TONE_CONFIG[t];
    return `[${t} - ${cfg.label}]\n톤: ${cfg.systemGuidance}\n추천 플랫폼: ${cfg.platform}`;
  }).join('\n\n');

  const userPrompt =
    `제품명: ${data.productName}\n` +
    `카테고리: ${data.productCategory}\n` +
    (data.priceEstimate ? `가격: ${data.priceEstimate}\n` : "") +
    `한 줄 소개: ${data.oneLiner || ""}\n` +
    `장점: ${(data.productAdvantages || []).join(', ')}\n` +
    `기존 후킹: ${data.hook || ""}\n` +
    (data.brandPersona?.trim() ? `브랜드 톤앤매너: ${data.brandPersona.trim()}\n` : "") +
    `\n${toneGuidance}\n` +
    `\n3가지 변형 스크립트를 만들어줘.`;

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
      max_tokens: 2500,
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

  let parsed: { variants?: unknown[] };
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    return generateLocalVariants(data);
  }

  const rawVariants = Array.isArray(parsed.variants) ? parsed.variants : [];
  if (rawVariants.length < 3) {
    return generateLocalVariants(data);
  }

  return rawVariants.slice(0, 3).map((raw: any, i: number): Variant => {
    const tone = tones[i] || tones[0];
    const cfg = TONE_CONFIG[tone];
    const rawPanels = Array.isArray(raw.panels) ? raw.panels.slice(0, 3) : [];
    const panels: VariantPanel[] = (rawPanels.length > 0 ? rawPanels : [{ speech: '', sfx: 'KWAANG!', emotion: '행복' }]).map((p: any) => ({
      speech: String(p.speech || "").slice(0, 100),
      sfx: String(p.sfx || "KWAANG!").slice(0, 20),
      emotion: String(p.emotion || "행복").slice(0, 20),
    }));
    return {
      tone,
      toneLabel: String(raw.toneLabel || cfg.label).slice(0, 20),
      hook: String(raw.hook || '').slice(0, 50),
      caption: String(raw.caption || '').slice(0, 100),
      hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.slice(0, 5).map((h: any) => String(h).slice(0, 30)) : [],
      panels,
      narrationText: String(raw.narrationText || panels.map(p => p.speech).join('. ')).slice(0, 200),
      recommendedPlatform: String(raw.recommendedPlatform || cfg.platform).slice(0, 20),
    };
  });
}

function generateLocalVariants(data: VariantRequest): Variant[] {
  const name = data.productName || "이 제품";
  const nameShort = name.length > 8 ? name.slice(0, 8) + "…" : name;
  const advantages = data.productAdvantages?.length ? data.productAdvantages : ["가성비"];
  const topAdv = advantages[0] || "가성비";
  const secondAdv = advantages[1] || topAdv;

  return [
    {
      tone: 'informative',
      toneLabel: '정보 전달형',
      hook: `${nameShort} ${topAdv}으로 이거 하나면 끝`,
      caption: `${nameShort} 핵심 장점만 정리해드려요`,
      hashtags: ['#제품리뷰', '#가성비템', '#추천템', `#${data.productCategory || '쇼핑'}`, '#스마트쇼핑'],
      panels: [
        { speech: `${nameShort} 찾고 있었어?`, sfx: '?!', emotion: '고민' },
        { speech: `${topAdv}이라서 차원이 다름`, sfx: '촤악!', emotion: '놀람' },
        { speech: `이게 바로 스마트한 선택`, sfx: 'KWAANG!', emotion: '확신' },
      ],
      narrationText: `${nameShort}의 핵심 장점 ${topAdv}을 한눈에 확인하세요.`,
      recommendedPlatform: 'YouTube',
    },
    {
      tone: 'humor',
      toneLabel: '유머/밈 기반',
      hook: `이거 모르면 손해 ㅆㅇㅈ?`,
      caption: `${nameShort} 쓰고 나서 인생 바뀜 ㅋㅋㅋ`,
      hashtags: ['#핵인싸템', '#갓생템', '# 찐단', '#인생템', '#꿀템'],
      panels: [
        { speech: `나 ${nameShort} 없이 어떻게 살았지`, sfx: '띠용?', emotion: '놀람' },
        { speech: `${topAdv}이면 그냥 사야지 ㅋ`, sfx: '샤방~', emotion: '행복' },
        { speech: `이거 모르면 간첩`, sfx: 'KWAANG!', emotion: '확신' },
      ],
      narrationText: `${nameShort} 없이 살았던 내 과거에게 바친다.`,
      recommendedPlatform: 'TikTok',
    },
    {
      tone: 'emotional',
      toneLabel: '감성/리뷰형',
      hook: `${nameShort} 만나고 일상이 달라졌어요`,
      caption: `솔직한 사용 후기, 이 제품 정말 추천해요`,
      hashtags: ['#솔직리뷰', '#일상변화', '#감성템', `#${data.productCategory || '추천'}`, '#럭킥템'],
      panels: [
        { speech: `${nameShort} 쓰기 전엔 몰랐어요`, sfx: '으음…', emotion: '고민' },
        { speech: `${secondAdv}이 정말 좋더라고요`, sfx: '샤방~', emotion: '설렘' },
        { speech: `지금은 완전 놓칠 수 없어요`, sfx: '따봉!', emotion: '감동' },
      ],
      narrationText: `${nameShort}로 달라진 일상, 솔직한 마음을 담았어요.`,
      recommendedPlatform: 'Instagram',
    },
  ];
}
