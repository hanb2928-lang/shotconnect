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

interface ViralPredictRequest {
  hook: string;
  title: string;
  productName: string;
  productCategory: string;
  hashtags: string[];
  comicStyle?: string;
  panelCount?: number;
  hasTTS?: boolean;
  episodeMode?: boolean;
  trendingKeywords?: string[];
  platform?: string;
  hookCategory?: string;
  cameraMovementCount?: number;
  hasCinematicLighting?: boolean;
  cutIntervalSec?: number;
  promptQualityScore?: number;
}

interface ViralPrediction {
  score: number;
  grade: string;
  factors: { label: string; positive: boolean; detail: string }[];
  suggestions: { type: string; label: string; detail: string }[];
  predictedViews: string;
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
    const body: ViralPredictRequest = await req.json();

    if (!body.hook && !body.title) {
      return new Response(
        JSON.stringify({ error: "Hook or title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = await resolveOpenAIKey();

    let prediction: ViralPrediction;

    if (openaiKey) {
      try {
        prediction = await predictWithOpenAI(body, openaiKey);
      } catch {
        prediction = predictLocal(body);
      }
    } else {
      prediction = predictLocal(body);
    }

    return new Response(
      JSON.stringify(prediction),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Prediction failed" }),
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

async function predictWithOpenAI(data: ViralPredictRequest, apiKey: string): Promise<ViralPrediction> {
  const systemPrompt =
    "너는 숏폼 바이럴 예측 AI야. 틱톡·릴스·쇼츠 알고리즘 트렌드를 분석해서 콘텐츠의 바이럴 확률을 예측해.\n" +
    "상위 1% 바이럴 영상의 성공 요인을 기준으로 평가해.\n" +
    "0~100점 사이의 점수를 매기고, 등급(S/A/B/C/D)을 부여해.\n" +
    "점수 기준 (상위 1% 벤치마크):\n" +
    "- 시각적 몰입도: 시네마틱 구도, 조명 설계, 시선 집중 요소 (25점)\n" +
    "- 후킹 & 유지율: 초반 1~3초 시청자 이탈 방지 구조 (25점)\n" +
    "- 카메라 연출 복잡도: 다양한 카메라 무빙, 마이크로 모션, 렌즈 스펙 (20점)\n" +
    "- 프롬프트 품질: 카메라 워킹, 조명, 색보정 명시도 (15점)\n" +
    "- 후킹 문구의 임팩트: 감정 자극, 호기심 유발 (15점)\n" +
    "- 해시태그 트렌드 적합도\n" +
    "- 트렌드 키워드 포함 여부\n" +
    "- TTS 내레이션 포함 여부 (시청 지속 시간 증가)\n" +
    "결과는 JSON만 반환: {\n" +
    "  \"score\": number,\n" +
    "  \"grade\": string,\n" +
    "  \"factors\": [{ \"label\": string, \"positive\": boolean, \"detail\": string }],\n" +
    "  \"suggestions\": [{ \"type\": string, \"label\": string, \"detail\": string }],\n" +
    "  \"predictedViews\": string\n" +
    "}\n" +
    "factors는 6~8개, suggestions는 2~3개로 작성해.\n" +
    "predictedViews는 '5천~1만', '1만~5만', '5만~10만', '10만 이상' 형식으로 작성해.\n" +
    "반드시 시각적 몰입도, 후킹 구조, 카메라 연출 요소를 분석에 포함해.";

  const userPrompt =
    `후킹 문구: ${data.hook || '없음'}\n` +
    `제품명: ${data.productName || '없음'}\n` +
    `카테고리: ${data.productCategory || '없음'}\n` +
    `해시태그: ${(data.hashtags || []).join(', ') || '없음'}\n` +
    `플랫폼: ${data.platform || 'shorts'}\n` +
    `카메라 무빙 수: ${data.cameraMovementCount ?? '미측정'}\n` +
    `시네마틱 조명: ${data.hasCinematicLighting ? '적용됨' : '미적용'}\n` +
    `컷 간격: ${data.cutIntervalSec ?? '미측정'}초\n` +
    `프롬프트 품질 점수: ${data.promptQualityScore ?? '미측정'}/100\n` +
    `TTS 내레이션: ${data.hasTTS ? '있음' : '없음'}\n` +
    `트렌드 키워드: ${(data.trendingKeywords || []).join(', ') || '없음'}\n`;

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
    parsed = {};
  }

  return {
    score: clampScore(parsed.score),
    grade: String(parsed.grade || 'B'),
    factors: Array.isArray(parsed.factors) ? parsed.factors.filter((f: unknown) => f && typeof f === 'object').slice(0, 8).map((f: Record<string, unknown>) => ({
      label: String(f.label || '').slice(0, 30),
      positive: !!f.positive,
      detail: String(f.detail || '').slice(0, 100),
    })) : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((s: unknown) => s && typeof s === 'object').slice(0, 3).map((s: Record<string, unknown>) => ({
      type: String(s.type || 'tip').slice(0, 20),
      label: String(s.label || '').slice(0, 50),
      detail: String(s.detail || '').slice(0, 150),
    })) : [],
    predictedViews: String(parsed.predictedViews || '1만~5만').slice(0, 30),
  };
}

function clampScore(raw: unknown): number {
  const n = Number(raw);
  if (Number.isNaN(n)) return 50;
  return Math.min(Math.max(n, 0), 100);
}

function predictLocal(data: ViralPredictRequest): ViralPrediction {
  let score = 35;
  const factors: { label: string; positive: boolean; detail: string }[] = [];
  const suggestions: { type: string; label: string; detail: string }[] = [];

  // === Visual Impact (0-25) ===
  const cameraCount = data.cameraMovementCount ?? 0;
  if (cameraCount >= 4) { score += 20; factors.push({ label: '시각적 몰입도', positive: true, detail: '4개 이상의 카메라 무빙으로 시네마틱 연출이 적용되었습니다.' }); }
  else if (cameraCount >= 2) { score += 12; factors.push({ label: '시각적 몰입도', positive: true, detail: '기본 카메라 무빙이 포함되어 있습니다.' }); }
  else { factors.push({ label: '시각적 몰입도', positive: false, detail: '카메라 무빙이 부족합니다. 상위 1% 영상은 평균 4개 이상의 카메라 무빙을 사용합니다.' }); }

  if (data.hasCinematicLighting) { score += 8; factors.push({ label: '조명 설계', positive: true, detail: '시네마틱 조명이 적용되어 피사체 분리와 분위기 연출이 우수합니다.' }); }
  else { factors.push({ label: '조명 설계', positive: false, detail: '전문 조명 설계가 미적용 상태입니다.' }); }

  // === Hook & Retention (0-25) ===
  const hook = data.hook || '';
  const hookCategory = data.hookCategory || 'curiosity';
  const strongHookCategories = ['curiosity', 'fomo', 'transformation'];
  if (hook.length > 5 && strongHookCategories.includes(hookCategory)) { score += 18; factors.push({ label: '후킹 구조', positive: true, detail: '강력한 감정 자극 후킹이 첫 1-3초에 배치되어 이탈률을 최소화합니다.' }); }
  else if (hook.length > 5) { score += 10; factors.push({ label: '후킹 구조', positive: true, detail: '후킹 문구가 포함되어 있습니다.' }); }
  else { factors.push({ label: '후킹 구조', positive: false, detail: '후킹 문구가 짧거나 없습니다. 첫 1-3초 시선 강탈 문구가 필요합니다.' }); }

  const cutInterval = data.cutIntervalSec ?? 0;
  if (cutInterval > 0 && cutInterval <= 2.0) { score += 7; factors.push({ label: '컷 전환 속도', positive: true, detail: `컷 간격 ${cutInterval}초로 상위 1% 평균(1.5-2.0초)에 부합합니다.` }); }
  else if (cutInterval > 0) { factors.push({ label: '컷 전환 속도', positive: false, detail: `컷 간격 ${cutInterval}초는 상위 1% 대비 느립니다. 2초 이하를 권장합니다.` }); }

  // === Prompt Quality (0-15) ===
  const promptScore = data.promptQualityScore ?? 0;
  if (promptScore >= 70) { score += 12; factors.push({ label: '프롬프트 품질', positive: true, detail: `프롬프트 품질 ${promptScore}점으로 상위 1% 수준의 카메라/조명/색보정 명시가 완료되었습니다.` }); }
  else if (promptScore >= 40) { score += 6; factors.push({ label: '프롬프트 품질', positive: true, detail: `프롬프트 품질 ${promptScore}점으로 기본 수준입니다.` }); }
  else { factors.push({ label: '프롬프트 품질', positive: false, detail: '프롬프트에 카메라 워킹, 조명, 색보정 명시가 부족합니다.' }); }

  // === Traditional factors ===
  const hashtags = data.hashtags || [];
  if (hashtags.length >= 3) { score += 5; factors.push({ label: '해시태그', positive: true, detail: `${hashtags.length}개의 해시태그가 포함되어 알고리즘 노출에 유리합니다.` }); }
  else { factors.push({ label: '해시태그', positive: false, detail: '해시태그가 부족합니다. 5~8개를 권장합니다.' }); }

  if (data.trendingKeywords && data.trendingKeywords.length > 0) { score += 5; factors.push({ label: '트렌드 키워드', positive: true, detail: '실시간 트렌드 키워드가 포함되어 알고리즘 선택 확률이 높습니다.' }); }

  if (data.hasTTS) { score += 5; factors.push({ label: 'AI 내레이션', positive: true, detail: '음성 더빙이 포함되어 시청 지속 시간이 증가합니다.' }); }
  else { factors.push({ label: 'AI 내레이션', positive: false, detail: '내레이션이 없으면 무음 영상은 스크롤 이탈이 빠릅니다.' }); }

  // === Suggestions ===
  if (cameraCount < 4) suggestions.push({ type: 'camera', label: '카메라 무빙 강화', detail: '상위 1% 영상은 평균 4개 이상의 카메라 무빙(돌리, 팬, 틸트, 줌)을 사용합니다. 시네마틱 연출을 추가해보세요.' });
  if (!data.hasCinematicLighting) suggestions.push({ type: 'lighting', label: '조명 설계 추가', detail: 'Rembrand트 키라이트 + 림라이트 조합으로 피사체 분리를 강화하면 시각적 몰입도가 30% 이상 향상됩니다.' });
  if (hook.length <= 5) suggestions.push({ type: 'hook', label: '후킹 강화', detail: '첫 1-3초 시선을 사로잡는 감정 자극 문구를 추가하세요. "이거 모르면 손해!" 같은 표현이 효과적입니다.' });
  if (hashtags.length < 5) suggestions.push({ type: 'hashtag', label: '해시태그 추가', detail: '제품 카테고리 관련 트렌딩 해시태그 5~8개를 추가하면 알고리즘 노출이 늘어납니다.' });
  if (!data.hasTTS) suggestions.push({ type: 'tts', label: 'AI 내레이션 켜기', detail: '음성 더빙을 켜면 시청 지속 시간이 평균 30% 증가합니다.' });
  if (promptScore < 70) suggestions.push({ type: 'prompt', label: '프롬프트 보정', detail: '카메라 렌즈 스펙(85mm f/1.8), 조명 설계, 색보정 등 시네마틱 프롬프트를 추가하면 영상 품질이 상위 1% 수준으로 향상됩니다.' });

  score = Math.min(score, 95);
  const grade = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';
  const predictedViews = score >= 85 ? '10만 이상' : score >= 70 ? '5만~10만' : score >= 55 ? '1만~5만' : score >= 40 ? '5천~1만' : '1천~5천';

  return { score, grade, factors, suggestions, predictedViews };
}
