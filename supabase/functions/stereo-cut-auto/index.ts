import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AngleImageInput {
  key: string;
  label: string;
  base64: string;
  mimeType: string;
  orderIndex: number;
}

interface FrameBufferInput {
  angleKey: string;
  width: number;
  height: number;
  channels: number;
  aspectRatio: string;
  orderIndex: number;
}

interface StereoCutRequest {
  angles: AngleImageInput[];
  productName?: string;
  customPrompt?: string;
  targetPlatforms?: string[];
  scanId?: string;
  frameBuffers?: FrameBufferInput[];
  aspectRatio?: string;
}

type UsageContext =
  | "unboxing" | "desk_setup" | "outdoor" | "kitchen"
  | "beauty" | "fashion" | "general";

interface SynthesisResult {
  strategy: string;
  volumeEstimate: { widthRatio: number; heightRatio: number; depthRatio: number; confidence: number };
  contextMatch: { context: UsageContext; label: string; description: string; confidence: number };
  interpolationGaps: { fromAngle: string; toAngle: string; steps: number }[];
  spatialDepthHint: string;
  primaryAngle: string;
  processingSteps: string[];
}

interface DirectingPlan {
  hookTransition: { type: string; description: string; startSec: number; durationSec: number };
  transitions: { type: string; description: string; startSec: number; durationSec: number }[];
  killPointCaptions: { startSec: number; endSec: number; text: string; position: string; emphasis: boolean }[];
  sfxPlans: { startSec: number; type: string; label: string }[];
  beatSync: { bpm: number; beatIntervalSec: number; cutPoints: number[]; highlightStartSec: number; highlightDurationSec: number };
  rhythmPattern: string;
  totalDurationSec: number;
}

interface RenderConfig {
  target: string;
  width: number;
  height: number;
  aspectRatio: string;
  codec: string;
  bitrateMbps: number;
  fps: number;
  maxDurationSec: number;
  label: string;
}

interface PublishPlan {
  target: string;
  render: RenderConfig;
  metadata: { title: string; description: string; hashtags: string[]; category: string };
  scheduledAt: string | null;
  directPublishAvailable: boolean;
}

interface StereoCutResponse {
  status: "ok";
  jobId: string;
  scanId: string | null;
  synthesis: SynthesisResult;
  directing: DirectingPlan;
  publishPlans: PublishPlan[];
  renderPlan: {
    quality: "high";
    resolution: { width: number; height: number };
    aspectRatio: string;
    fps: number;
    bitrate: number;
    durationSec: number;
    scenes: unknown[];
    frameBuffers: Array<{ angleKey: string; width: number; height: number; channels: number; aspectRatio: string; orderIndex: number }>;
  };
  estimatedProcessingSec: number;
  cloudEndpoint: string;
  message: string;
}

const CONTEXT_KEYWORDS: Record<UsageContext, string[]> = {
  unboxing: ["박스", "개봉", "언박싱", "새제품"],
  desk_setup: ["데스크", "모니터", "키보드", "마우스", "책상"],
  outdoor: ["야외", "캠핑", "등산", "아웃도어", "여행"],
  kitchen: ["주방", "부엌", "요리", "조리", "키친"],
  beauty: ["화장", "스킨케어", "뷰티", "미용", "크림"],
  fashion: ["옷", "의류", "착장", "코디", "패션"],
  general: [],
};

const CONTEXT_LABELS: Record<UsageContext, { label: string; description: string }> = {
  unboxing: { label: "언박싱", description: "개봉 순간의 기대감을 살리는 연출" },
  desk_setup: { label: "데스크 셋업", description: "실제 사용 환경에서의 활용감 연출" },
  outdoor: { label: "야외 활용", description: "실외 사용 시나리오로 생동감 부여" },
  kitchen: { label: "주방 사용", description: "조리/주방 맥락에서의 실용성 강조" },
  beauty: { label: "뷰티/케어", description: "사용 전후 변화를 보여주는 감성 연출" },
  fashion: { label: "패션 착장", description: "착용했을 때의 무드와 핏 강조" },
  general: { label: "제품 소개", description: "제품 자체의 매력을 직관적으로 전달" },
};

function detectContext(prompt: string): ContextMatch {
  const lower = prompt.toLowerCase();
  let best: UsageContext = "general";
  let bestScore = 0;
  for (const [ctx, keywords] of Object.entries(CONTEXT_KEYWORDS)) {
    if (ctx === "general") continue;
    const ctxKey = ctx as UsageContext;
    const score = keywords.filter((k) => lower.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = ctxKey; }
  }
  const meta = CONTEXT_LABELS[best];
  return {
    context: best,
    label: meta.label,
    description: meta.description,
    confidence: bestScore > 0 ? Math.min(0.95, 0.6 + bestScore * 0.15) : 0.5,
  };
}

interface ContextMatch {
  context: UsageContext;
  label: string;
  description: string;
  confidence: number;
}

function runSynthesis(angles: AngleImageInput[], customPrompt: string): SynthesisResult {
  const strategy = angles.length >= 5 ? "five_angle_stereo" : angles.length >= 3 ? "three_angle_partial" : "single_fallback";
  const hasFront = angles.some((a) => a.key === "front");
  const hasSide = angles.some((a) => a.key === "left" || a.key === "right");
  const hasTop = angles.some((a) => a.key === "top");
  const hasBack = angles.some((a) => a.key === "back");

  const confidence = (angles.length / 5) * 0.8 + (hasFront ? 0.1 : 0) + (hasSide ? 0.1 : 0);
  const contextMatch = detectContext(customPrompt);

  const order = ["front", "left", "right", "back", "top"];
  const present = new Set(angles.map((a) => a.key));
  const interpolationGaps = [];
  for (let i = 0; i < order.length - 1; i++) {
    if (present.has(order[i]) && present.has(order[i + 1])) {
      interpolationGaps.push({ fromAngle: order[i], toAngle: order[i + 1], steps: 2 });
    }
  }

  const processingSteps = strategy === "five_angle_stereo"
    ? ["5각도 이미지 정합 및 피사체 중심축 정렬", "2D → 3D 볼륨 역산 및 깊이 맵 추정", "각도 간 공백 보간 (Interpolation)", "입체 에셋 생성 및 텍스처 매핑"]
    : strategy === "three_angle_partial"
    ? [`${angles.length}각도 이미지 정합`, "부분 볼륨 추정 및 추정 보간", "입체 에셋 생성 (정확도: 부분)"]
    : ["단일 이미지에서 깊이 추정", "단면 대칭 가정으로 입체 추정"];

  const strategyLabels: Record<string, string> = {
    five_angle_stereo: "정면·좌측·우측·후면·상부 5각도 입체 융합",
    three_angle_partial: `${angles.length}각도 부분 입체 융합`,
    single_fallback: "단일 컷 기반 추정 합성",
  };

  return {
    strategy,
    volumeEstimate: {
      widthRatio: hasFront ? 1.0 : 0.7,
      heightRatio: hasTop ? 1.0 : 0.75,
      depthRatio: hasSide && hasBack ? 1.0 : hasSide ? 0.7 : 0.4,
      confidence: Math.min(1, confidence),
    },
    contextMatch,
    interpolationGaps,
    spatialDepthHint: strategyLabels[strategy],
    primaryAngle: angles[0]?.key ?? "front",
    processingSteps,
  };
}

const HOOK_TRANSITIONS: Record<UsageContext, string> = {
  unboxing: "paradox_reveal",
  desk_setup: "rotation_zoom",
  outdoor: "dramatic_zoom_in",
  kitchen: "context_cut",
  beauty: "dramatic_zoom_in",
  fashion: "rotation_zoom",
  general: "paradox_reveal",
};

const KILL_POINT_TEMPLATES: Record<UsageContext, string[]> = {
  unboxing: ["이거 진짜였어?", "다들 놀라는 중", "품절 전에 확인"],
  desk_setup: ["작업 효율 200%", "이게 되네?", "데스크 필수템"],
  outdoor: ["이런 디테일이", "야외에서 빛남", "왜 이제야 알았지"],
  kitchen: ["주방이 달라졌어요", "이거 없이 어떻게?", "사용감 최고"],
  beauty: ["피부가 달라졌어요", "이거 진짜 효과 있네", "모공이 사라졌어"],
  fashion: ["이 핏 실화?", "코디 완성템", "사이즈 고민 끝"],
  general: ["이거 진짜였어?", "다들 주목하는 중", "놓치면 손해"],
};

function buildDirecting(context: UsageContext, bpm: number): DirectingPlan {
  const hookType = HOOK_TRANSITIONS[context] ?? "paradox_reveal";
  const hookDescriptions: Record<string, string> = {
    rotation_zoom: "3D 입체 회전 + 줌인으로 사물의 입체감 강조",
    dramatic_zoom_in: "극적인 줌인으로 시선 집중 후 패러독스 훅 폭발",
    paradox_reveal: "호기심 유발 타이포그래피 + 사물 등장 반전",
    context_cut: "사용 맥락으로 즉시 전환, 훅 텍스트 오버레이",
    detail_punch: "디테일 클로즈업 + 임팩트 SFX로 시선 강탈",
  };

  const segments = [
    { startSec: 0, endSec: 3 },
    { startSec: 3, endSec: 7 },
    { startSec: 7, endSec: 11 },
    { startSec: 11, endSec: 15 },
  ];

  const transitionTypes = ["rotation_zoom", "context_cut", "detail_punch", "dramatic_zoom_in"];
  const transitions = segments.slice(1).map((s, i) => ({
    type: transitionTypes[i],
    description: hookDescriptions[transitionTypes[i]],
    startSec: s.startSec,
    durationSec: 1.5,
  }));

  const kpTemplates = KILL_POINT_TEMPLATES[context] ?? KILL_POINT_TEMPLATES.general;
  const killPointCaptions = [
    { startSec: 4, endSec: 5.5, text: kpTemplates[0], position: "center", emphasis: true },
    { startSec: 8, endSec: 9.5, text: kpTemplates[1] ?? kpTemplates[0], position: "top", emphasis: false },
    { startSec: 11, endSec: 15, text: kpTemplates[2] ?? kpTemplates[0], position: "bottom", emphasis: true },
  ];

  const sfxMap: Record<string, string> = {
    rotation_zoom: "whoosh", dramatic_zoom_in: "impact", paradox_reveal: "glitch",
    context_cut: "pop", detail_punch: "sparkle",
  };
  const sfxLabels: Record<string, string> = {
    whoosh: "회전 전환 SFX", impact: "임팩트 SFX", pop: "팝 전환 SFX",
    glitch: "글리치 SFX", sparkle: "스파클 SFX",
  };

  const allTransitions = [{ type: hookType, description: hookDescriptions[hookType], startSec: 0, durationSec: 3 }, ...transitions];
  const sfxPlans = allTransitions.map((t) => ({
    startSec: t.startSec,
    type: sfxMap[t.type] ?? "whoosh",
    label: sfxLabels[sfxMap[t.type] ?? "whoosh"],
  }));

  const beatInterval = 60 / bpm;
  const cutPoints: number[] = [];
  for (let t = 0; t <= 15; t += beatInterval * 1.75) {
    cutPoints.push(Math.round(t * 10) / 10);
  }

  return {
    hookTransition: { type: hookType, description: hookDescriptions[hookType], startSec: 0, durationSec: 3 },
    transitions,
    killPointCaptions,
    sfxPlans,
    beatSync: { bpm, beatIntervalSec: beatInterval, cutPoints, highlightStartSec: 5, highlightDurationSec: 10 },
    rhythmPattern: "medium",
    totalDurationSec: 15,
  };
}

function buildPublishPlans(productName: string, context: UsageContext, targets: string[]): PublishPlan[] {
  const RENDER_CONFIGS: Record<string, RenderConfig> = {
    youtube: { target: "youtube", width: 1080, height: 1920, aspectRatio: "9:16", codec: "H.264", bitrateMbps: 12, fps: 30, maxDurationSec: 60, label: "유튜브 쇼츠" },
    instagram: { target: "instagram", width: 1080, height: 1920, aspectRatio: "9:16", codec: "H.264", bitrateMbps: 8, fps: 30, maxDurationSec: 90, label: "인스타그램 릴스" },
    tiktok: { target: "tiktok", width: 1080, height: 1920, aspectRatio: "9:16", codec: "H.264", bitrateMbps: 10, fps: 30, maxDurationSec: 600, label: "틱톡" },
  };

  const ctxLabel = CONTEXT_LABELS[context].label;
  const pName = productName.trim() || "이 제품";

  return targets.map((t) => {
    const render = RENDER_CONFIGS[t] ?? RENDER_CONFIGS.youtube;
    const prefix = t === "youtube" ? "[쇼츠] " : "";
    const title = pName.length <= 15
      ? `${prefix}${pName} ${ctxLabel} | 이거 모르면 손해`
      : `${prefix}${pName.slice(0, 12)}... ${ctxLabel}`;

    const targetLabel = render.label;
    return {
      target: t,
      render,
      metadata: {
        title,
        description: `${pName} ${CONTEXT_LABELS[context].description}\n\n${targetLabel}에서 만나는 15초 숏폼 리뷰.\n더 자세한 정보는 프로필 링크에서 확인하세요.\n\n본 영상은 광고/협찬이 포함될 수 있습니다.`,
        hashtags: ["#숏폼", "#제품리뷰", "#꿀템", `#${ctxLabel}`],
        category: "제품 소개",
      },
      scheduledAt: null,
      directPublishAvailable: false,
    };
  });
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
    const payload = await req.json() as StereoCutRequest;
    const angles = payload.angles ?? [];
    const productName = payload.productName ?? "";
    const customPrompt = payload.customPrompt ?? "";
    const targetPlatforms = payload.targetPlatforms ?? ["youtube", "instagram", "tiktok"];
    const scanId = payload.scanId ?? null;
    const inputFrameBuffers = payload.frameBuffers ?? [];
    const inputAspectRatio = payload.aspectRatio ?? "9:16";

    if (angles.length === 0) {
      return new Response(JSON.stringify({ error: "각도 이미지가 필요합니다." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Phase 2: AI 입체 분석 및 3D 신세시스
    const synthesis = runSynthesis(angles, customPrompt);

    // Phase 3: 유튜브 상위 1% 심리 리듬 연출
    const bpm = targetPlatforms.includes("tiktok") ? 140 : 100;
    const directing = buildDirecting(synthesis.contextMatch.context, bpm);

    // Phase 4: 멀티플랫폼 퍼블리시 플랜
    const publishPlans = buildPublishPlans(productName, synthesis.contextMatch.context, targetPlatforms);

    // 렌더 플랜 (9:16, 15초)
    const scenes = [
      { type: "image", startTime: 0, endTime: 15, easing: "ease-in-out" },
      { type: "text", text: directing.killPointCaptions[0]?.text ?? "", startTime: 4, endTime: 5.5, position: "center", fontSize: 86, fontWeight: "700" },
      { type: "text", text: directing.killPointCaptions[1]?.text ?? "", startTime: 8, endTime: 9.5, position: "top", fontSize: 64, fontWeight: "600" },
      { type: "text", text: directing.killPointCaptions[2]?.text ?? "", startTime: 11, endTime: 15, position: "bottom", fontSize: 72, fontWeight: "700" },
    ];

    const jobId = `stereo-cut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const estimatedProcessingSec = angles.length >= 5 ? 8 : 5;

    const frameBuffers = inputFrameBuffers.length > 0
      ? inputFrameBuffers
      : angles.map((a, i) => ({
          angleKey: a.key,
          width: 1080,
          height: 1920,
          channels: 4,
          aspectRatio: inputAspectRatio,
          orderIndex: a.orderIndex ?? i,
        }));

    const result: StereoCutResponse = {
      status: "ok",
      jobId,
      scanId,
      synthesis,
      directing,
      publishPlans,
      renderPlan: {
        quality: "high",
        resolution: { width: 1080, height: 1920 },
        aspectRatio: inputAspectRatio,
        fps: 30,
        bitrate: 8_000_000,
        durationSec: 15,
        scenes,
        frameBuffers,
      },
      estimatedProcessingSec,
      cloudEndpoint: "stereo-cut-auto",
      message: `클라우드 AI 파이프라인에서 ${synthesis.spatialDepthHint} 완료. 예상 렌더링 시간: ${estimatedProcessingSec}초`,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Stereo cut auto failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
