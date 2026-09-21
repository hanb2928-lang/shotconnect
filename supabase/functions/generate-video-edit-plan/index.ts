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

interface CutSegment {
  startSec: number;
  endSec: number;
  label: string;
  purpose: string;
}

interface CopyVariant {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  disclosure: string;
}

interface EditPlan {
  duration: 15 | 30;
  totalSegments: number;
  segments: CutSegment[];
  hookTiming: { firstHookSec: number; reason: string };
  psychology: {
    principle: string;
    application: string;
    triggerPoint: string;
  };
  antiAlgorithm: {
    copyVariation: string;
    pacingStrategy: string;
    visualChangeStrategy: string;
    audioChangeStrategy: string;
  };
  copyVariants: CopyVariant[];
  musicMood: string;
  motionPreset: string;
  reason: string;
}

async function resolveOpenAIKey(): Promise<string | null> {
  const envKey = Deno.env.get("OPENAI_API_KEY");
  if (envKey) return envKey;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
      // ignore
    }
  }
  return null;
}

const PSYCHOLOGY_LABELS: Record<string, { principle: string; application: string; triggerPoint: string }> = {
  loss_aversion: {
    principle: "손실 회피 (Loss Aversion)",
    application: "'놓치면 후회할 마지막 기회' 뉘앙스로 긴장감 부여",
    triggerPoint: "CTA 직전 3초",
  },
  curiosity_gap: {
    principle: "호기심 갭 (Curiosity Gap)",
    application: "정답을 바로 주지 않고 궁금증을 유발하여 끝까지 시청하도록 유도",
    triggerPoint: "첫 1~3초 후킹 + 중간 1회",
  },
  fomo: {
    principle: "FOMO (Fear Of Missing Out)",
    application: "'다들 이미 쓰고 있다'는 사회적 압박으로 즉각 행동 촉발",
    triggerPoint: "소셜 증명 구간 + CTA",
  },
  social_proof: {
    principle: "소셜 증명 (Social Proof)",
    application: "리뷰, 평점, 구매자 수를 조기 노출하여 신뢰를 선제적으로 구축",
    triggerPoint: "제품 소개 직후 또는 동시 배치",
  },
};

function fallbackPlan(
  duration: 15 | 30,
  productName: string,
  platform: string,
  psychologyPreset: string,
): EditPlan {
  const ctaSegment: CutSegment = {
    startSec: duration - 2,
    endSec: duration,
    label: "제휴 CTA + 공정위 문구",
    purpose: "제휴 쇼핑몰 매칭 링크 노출 + 공정위 의무 문구 삽입 (마지막 2초 고정)",
  };
  const segments: CutSegment[] = duration === 15
    ? [
        { startSec: 0, endSec: 3, label: "후킹", purpose: "강렬한 첫 프레임으로 시선 강탈" },
        { startSec: 3, endSec: 8, label: "제품 소개", purpose: "핵심 장점 1~2개를 빠르게 전달" },
        { startSec: 8, endSec: 13, label: "사용 장면", purpose: "실사용으로 신뢰감 형성" },
        ctaSegment,
      ]
    : [
        { startSec: 0, endSec: 3, label: "후킹", purpose: "호기심 자극 질문 또는 충격 장면" },
        { startSec: 3, endSec: 10, label: "제품 소개", purpose: "핵심 기능과 차별점 상세 전달" },
        { startSec: 10, endSec: 18, label: "사용 시연", purpose: "before/after 또는 사용 과정 시연" },
        { startSec: 18, endSec: 25, label: "소셜 증명", purpose: "리뷰, 평점, 구매자 수로 신뢰 강화" },
        ctaSegment,
      ];

  return {
    duration,
    totalSegments: segments.length,
    segments,
    hookTiming: { firstHookSec: 0, reason: "첫 1~3초 내에 시선을 사로잡아야 시청 유지율이 급격히 높아집니다." },
    psychology: PSYCHOLOGY_LABELS[psychologyPreset] || PSYCHOLOGY_LABELS.loss_aversion,
    antiAlgorithm: {
      copyVariation: "동일 의미, 다른 표현으로 재구성 — 문장 구조/어순/감성 단어 교체",
      pacingStrategy: "3~5초마다 화면 전환 또는 줌 효과로 시각적 리프레시",
      visualChangeStrategy: "색보정, 미러링, 자르기 순서 변경으로 원본과 차별화",
      audioChangeStrategy: "BGM 교체, 음량 변화, 효과음 추가로 오디오 지문 회피",
    },
    copyVariants: [
      {
        hook: `이거 모르면 손해! ${productName} 써보고 놀란 사람들`,
        body: `${productName}으로 달라진 일상, 직접 확인해보세요.`,
        cta: "지금 바로 링크에서 확인 →",
        hashtags: ["#제품리뷰", "#" + platform, "#추천", "#베스트"],
        disclosure: "이 포스팅은 제휴마케팅이 포함된 광고입니다.",
      },
      {
        hook: `${productName} 진짜일까? 직접 써봤습니다`,
        body: `예상과 다른 결과. ${productName}의 핵심 장점을 30초 안에 정리했어요.`,
        cta: "더 자세한 정보는 링크 클릭 ↓",
        hashtags: ["#리얼리뷰", "#꿀템", "#쇼핑", "#가성비"],
        disclosure: "본 콘텐츠는 제휴�케팅 광고를 포함하고 있습니다.",
      },
    ],
    musicMood: "upbeat",
    motionPreset: "zoom-in",
    reason: `${duration}초는 시청 유지율이 가장 높아 알고리즘 노출에 유리한 최적 길이입니다.`,
  };
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
    const { productName, productCategory, videoDuration, platform, accentColor, hook, oneLiner, psychologyPreset, customLinks } = body as {
      productName?: string;
      productCategory?: string;
      videoDuration?: number;
      platform?: string;
      accentColor?: string;
      hook?: string;
      oneLiner?: string;
      psychologyPreset?: string;
      customLinks?: string[];
    };

    const duration: 15 | 30 = videoDuration === 30 ? 30 : 15;
    const pName = String(productName || "제품");
    const pCat = String(productCategory || "product");
    const pPlatform = String(platform || "shortform");
    const pHook = String(hook || "");
    const pOneLiner = String(oneLiner || "");
    const psychPreset = String(psychologyPreset || "auto");

    const openaiKey = await resolveOpenAIKey();

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ plan: fallbackPlan(duration, pName, pPlatform, psychPreset) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const conversionPrompt = buildConversionPrompt(pPlatform, "video", customLinks);

    const systemPrompt =
      "You are a short-form video editing director and copywriter specializing in affiliate marketing content.\n" +
      "Given a product and a downloaded stock video, create a precise EDIT PLAN for a " + duration + "-second clip.\n\n" +
      conversionPrompt + "\n" +
      "Key principles:\n" +
      "1. HOOK: The first 1-3 seconds MUST grab attention. Suggest the exact timing and what to show.\n" +
      "2. PSYCHOLOGY: Apply the following persuasion principle: " +
      (psychPreset === "auto"
        ? "choose the most effective one for this product (loss aversion, social proof, scarcity, curiosity gap, or FOMO)"
        : PSYCHOLOGY_LABELS[psychPreset]?.principle || "loss aversion") +
      ". Explain how to trigger it in the video.\n" +
      "3. ANTI-ALGORITHM: The downloaded video will be re-edited to avoid duplicate-content detection. Specify:\n" +
      "   - Copy variation: how to paraphrase the existing copy so it passes text similarity checks\n" +
      "   - Pacing: visual rhythm changes (cuts, zooms) every 3-5 seconds\n" +
      "   - Visual changes: color grading, mirroring, reordering clips, crop changes\n" +
      "   - Audio changes: BGM swap, volume shifts, sound effects\n" +
      "4. COPY VARIANTS: Generate 2 distinct copy variants (Korean). Each with hook, body, CTA, hashtags, and disclosure text.\n" +
      "   - The two variants must use DIFFERENT sentence structures and emotional angles (not just word swaps).\n" +
      "   - Disclosure must be present (Korean FTC-style: '제휴마케팅 포함 광고' or similar).\n" +
      "5. SEGMENTS: Break the " + duration + " seconds into 4-6 cut segments with start/end times and purpose.\n" +
      "   IMPORTANT: The LAST 2 SECONDS (" + (duration - 2) + "~" + duration + "초) MUST be reserved for the affiliate CTA + FTC disclosure segment.\n" +
      "   This segment shows the affiliate shopping mall link and the mandatory Korean FTC disclosure text (e.g. '이 포스팅은 제휴마케팅이 포함된 광고입니다').\n" +
      "   Do NOT use the last 2 seconds for any other content. All other segments must fit within 0~" + (duration - 2) + "초.\n" +
      "6. MUSIC & MOTION: Recommend a music mood and camera motion preset.\n\n" +
      "Return ONLY valid JSON with this exact shape:\n" +
      "{\n" +
      '  "duration": ' + duration + ",\n" +
      '  "totalSegments": number,\n' +
      '  "segments": [{ "startSec": number, "endSec": number, "label": string, "purpose": string }],\n' +
      '  "hookTiming": { "firstHookSec": number, "reason": string },\n' +
      '  "psychology": { "principle": string, "application": string, "triggerPoint": string },\n' +
      '  "antiAlgorithm": { "copyVariation": string, "pacingStrategy": string, "visualChangeStrategy": string, "audioChangeStrategy": string },\n' +
      '  "copyVariants": [{ "hook": string, "body": string, "cta": string, "hashtags": [string], "disclosure": string }],\n' +
      '  "musicMood": string,\n' +
      '  "motionPreset": string,\n' +
      '  "reason": string\n' +
      "}\n\n" +
      "All text fields must be in Korean. Return ONLY JSON, no markdown.";

    const userText = [
      `상품명: ${pName}`,
      `카테고리: ${pCat}`,
      `목표 영상 길이: ${duration}초`,
      `타겟 플랫폼: ${pPlatform}`,
      pHook ? `기존 후킹: ${pHook}` : "",
      pOneLiner ? `원라이너: ${pOneLiner}` : "",
      psychPreset !== "auto" ? `심리 전략: ${PSYCHOLOGY_LABELS[psychPreset]?.principle || psychPreset}` : "",
    ].filter(Boolean).join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText },
          ],
          max_tokens: 1200,
          temperature: 0.7,
          response_format: { type: "json_object" },
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("No content from OpenAI");

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(stripJsonFence(content));
      } catch {
        return new Response(
          JSON.stringify({ plan: fallbackPlan(duration, pName, pPlatform, psychPreset) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const plan = normalizePlan(parsed, duration, pName, pPlatform, psychPreset);
      return new Response(
        JSON.stringify({ plan }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "편집 계획 생성에 실패했습니다." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function normalizePlan(
  raw: Record<string, unknown>,
  duration: 15 | 30,
  productName: string,
  platform: string,
  psychologyPreset: string,
): EditPlan {
  const rawSegments: CutSegment[] = Array.isArray(raw.segments)
    ? (raw.segments as Array<Record<string, unknown>>).map((s, i) => ({
        startSec: Number(s.startSec) || i * 3,
        endSec: Number(s.endSec) || (i + 1) * 3,
        label: String(s.label || `구간 ${i + 1}`),
        purpose: String(s.purpose || ""),
      }))
    : fallbackPlan(duration, productName, platform, psychologyPreset).segments;

  // Ensure the last 2 seconds are always the affiliate CTA + disclosure segment
  const ctaSegment: CutSegment = {
    startSec: duration - 2,
    endSec: duration,
    label: "제휴 CTA + 공정위 문구",
    purpose: "제휴 쇼핑몰 매칭 링크 노출 + 공정위 의무 문구 삽입 (마지막 2초 고정)",
  };
  const segments: CutSegment[] = (() => {
    if (rawSegments.length === 0) return [ctaSegment];
    const last = rawSegments[rawSegments.length - 1];
    if (last.endSec >= duration && last.label.includes("CTA")) {
      // AI already reserved the ending, replace with our mandatory segment
      return [...rawSegments.slice(0, -1), ctaSegment];
    }
    if (last.endSec > duration - 2) {
      // Last segment overlaps our reserved 2s, trim it
      const trimmed = [...rawSegments];
      trimmed[trimmed.length - 1] = { ...last, endSec: duration - 2 };
      return [...trimmed, ctaSegment];
    }
    // Append our mandatory segment
    return [...rawSegments, ctaSegment];
  })();

  const hookTiming = {
    firstHookSec: Number((raw.hookTiming as Record<string, unknown>)?.firstHookSec) || 0,
    reason: String((raw.hookTiming as Record<string, unknown>)?.reason) || "첫 1~3초에 후킹을 배치합니다.",
  };

  const psychRaw = (raw.psychology as Record<string, unknown>) || {};
  const psychology = {
    principle: String(psychRaw.principle || "손실 회피"),
    application: String(psychRaw.application || ""),
    triggerPoint: String(psychRaw.triggerPoint || "CTA 직전"),
  };

  const antiRaw = (raw.antiAlgorithm as Record<string, unknown>) || {};
  const antiAlgorithm = {
    copyVariation: String(antiRaw.copyVariation || "문장 구조와 감성 단어를 교체하여 재구성"),
    pacingStrategy: String(antiRaw.pacingStrategy || "3~5초마다 화면 전환"),
    visualChangeStrategy: String(antiRaw.visualChangeStrategy || "색보정, 미러링, 순서 변경"),
    audioChangeStrategy: String(antiRaw.audioChangeStrategy || "BGM 교체, 효과음 추가"),
  };

  const copyVariants: CopyVariant[] = Array.isArray(raw.copyVariants)
    ? (raw.copyVariants as Array<Record<string, unknown>>).slice(0, 2).map((c) => ({
        hook: String(c.hook || ""),
        body: String(c.body || ""),
        cta: String(c.cta || ""),
        hashtags: Array.isArray(c.hashtags) ? (c.hashtags as string[]).map(String) : [],
        disclosure: String(c.disclosure || "이 포스팅은 제휴마케팅이 포함된 광고입니다."),
      }))
    : fallbackPlan(duration, productName, platform, psychologyPreset).copyVariants;

  return {
    duration,
    totalSegments: segments.length,
    segments,
    hookTiming,
    psychology,
    antiAlgorithm,
    copyVariants,
    musicMood: String(raw.musicMood || "upbeat"),
    motionPreset: String(raw.motionPreset || "zoom-in"),
    reason: String(raw.reason || `${duration}초는 알고리즘 최적화 구간입니다.`),
  };
}
