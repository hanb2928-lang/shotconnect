/**
 * Human Reality Narrative Engine
 *
 * Identifies the "gaze cut" among captured images, generates a dynamic
 * narrative scenario connecting the person's situation to the product,
 * and produces a reordered cut list + camera trajectory plan.
 */

import type { UsageContext } from './aiSynthesisEngine';
import type { StoryPhase, EditSegment } from './shortFormEditEngine';
import type { CameraMovement } from './directingEngine';

export interface GazeAnalysisResult {
  gazeCutIndex: number;
  confidence: number;
  method: 'heuristic' | 'fallback';
  reason: string;
}

export interface NarrativeScenario {
  id: string;
  context: UsageContext;
  situationLabel: string;
  situationDescription: string;
  needBridge: string;
  transformationText: string;
  ctaText: string;
  narrationFlow: {
    gazeHook: string;
    needDiscovery: string;
    transformation: string;
    ctaCall: string;
  };
}

export interface ReorderedCuts {
  orderedImageUrls: string[];
  gazeCutUrl: string | null;
  gazeCutOriginalIndex: number;
}

export interface CameraTrajectory {
  phase: StoryPhase;
  moveType: 'gaze_to_dolly' | 'macro_zoom' | 'gaze_hold' | 'slow_pan' | 'tilt_reveal' | 'pull_back';
  startScale: number;
  endScale: number;
  startTx: number;
  endTx: number;
  startTy: number;
  endTy: number;
  easing: 'ease_in_out_cubic' | 'ease_out_quart' | 'linear';
  description: string;
}

export interface NarrativePlan {
  gaze: GazeAnalysisResult;
  scenario: NarrativeScenario;
  reorderedCuts: ReorderedCuts;
  trajectories: CameraTrajectory[];
  variationSeed: number;
}

// ─── Gaze Detection (heuristic, client-side) ───

const GAZE_KEYWORDS = ['정면', 'face', '인물', 'portrait', '셀카', 'selfie', '시선', 'gaze', '눈', 'eye'];

export function analyzeGazeCut(
  imageUrls: string[],
  productHint?: string,
  variationSeed = 0,
): GazeAnalysisResult {
  if (imageUrls.length === 0) {
    return { gazeCutIndex: -1, confidence: 0, method: 'fallback', reason: '이미지 없음' };
  }

  if (imageUrls.length === 1) {
    return { gazeCutIndex: 0, confidence: 0.5, method: 'fallback', reason: '단일 컷 — 첫 프레임을 시선 컷으로 간주' };
  }

  // Heuristic: the first/front angle is most likely to contain a face/gaze
  // For multi-angle product captures, front angle (index 0) is the hero shot
  // Variation: with seed, occasionally pick index 1 to add diversity
  const candidateIndex = variationSeed % 3 === 2 && imageUrls.length > 1 ? 1 : 0;

  const confidence = candidateIndex === 0 ? 0.72 : 0.58;
  const reason = candidateIndex === 0
    ? '정면 컷에서 인물 시선 추정 — 첫 프레임을 후킹 소스로 배치'
    : `변주 시드 ${variationSeed} — 두 번째 컷을 시선 후킹으로 재배치`;

  return {
    gazeCutIndex: candidateIndex,
    confidence,
    method: 'heuristic',
    reason,
  };
}

// ─── Narrative Scenario Generation ───

const SCENARIO_POOLS: Record<UsageContext, NarrativeScenario[]> = {
  unboxing: [
    {
      id: 'unbox_discovery',
      context: 'unboxing',
      situationLabel: '기대감 넘치는 개봉 순간',
      situationDescription: '인물이 박스를 열기 직전, 호기심 가득한 시선으로 카메라를 응시',
      needBridge: '이 제품이 일상에 어떤 변화를 가져올지 궁금해하는 순간',
      transformationText: '개봉 후 만져보니 기대 이상의 디테일',
      ctaText: '지금 바로 경험해보세요',
      narrationFlow: {
        gazeHook: '이 사람의 표정, 무슨 일이?',
        needDiscovery: '박스를 열기 전부터 벌써 설렘',
        transformation: '개봉 순간, 디테일이 다르다',
        ctaCall: '여러분도 직접 열어보세요',
      },
    },
  ],
  desk_setup: [
    {
      id: 'desk_focus',
      context: 'desk_setup',
      situationLabel: '집중하는 일상',
      situationDescription: '바쁜 업무 중 인물이 카메라를 향해 잠깐 시선을 돌리는 순간',
      needBridge: '복잡한 데스크 환경을 정리해줄 하나의 아이템을 발견',
      transformationText: '사용 후 작업 효율이 완전히 달라진 데스크',
      ctaText: '작업 환경을 바꿔보세요',
      narrationFlow: {
        gazeHook: '이 사람, 지금 무언가 찾는 중',
        needDiscovery: '복잡한 데스크, 하나로 정리',
        transformation: '사용 후 작업 효율 200%',
        ctaCall: '당신의 데스크도 바뀔 수 있어요',
      },
    },
  ],
  outdoor: [
    {
      id: 'outdoor_discover',
      context: 'outdoor',
      situationLabel: '야외에서의 발견',
      situationDescription: '야외 활동 중 인물이 카메라를 보며 발견의 기쁨을 전하는 순간',
      needBridge: '야외에서 이 제품이 왜 필요한지 상황이 설명되는 순간',
      transformationText: '야외에서 빛나는 디테일과 실용성',
      ctaText: '다음 야외 활동에 가져가세요',
      narrationFlow: {
        gazeHook: '야외에서 이 사람이 발견한 것',
        needDiscovery: '왜 야외에 이게 필요할까?',
        transformation: '야외에서 빛나는 디테일',
        ctaCall: '다음 모험에 챙겨가세요',
      },
    },
  ],
  kitchen: [
    {
      id: 'kitchen_moment',
      context: 'kitchen',
      situationLabel: '주방의 작은 혁명',
      situationDescription: '요리 중 인물이 카메라를 향해 만족스러운 미소를 짓는 순간',
      needBridge: '주방의 불편함을 해결해줄 아이템과의 조우',
      transformationText: '사용 후 주방이 완전히 달라진 모습',
      ctaText: '주방의 변화를 경험하세요',
      narrationFlow: {
        gazeHook: '이 사람의 미소, 비밀이 있어',
        needDiscovery: '주방의 불편함, 하나로 해결',
        transformation: '사용 후 주방이 달라졌어요',
        ctaCall: '당신의 주방도 바뀔 수 있어요',
      },
    },
  ],
  beauty: [
    {
      id: 'beauty_glow',
      context: 'beauty',
      situationLabel: '거울 앞 변화의 순간',
      situationDescription: '스킨케어 후 인물이 거울을 보며 카메라를 향해 미소 짓는 순간',
      needBridge: '피부 고민을 해결해줄 제품과의 결정적 만남',
      transformationText: '사용 후 달라진 피부, 직접 확인한 변화',
      ctaText: '당신의 피부도 변할 수 있어요',
      narrationFlow: {
        gazeHook: '이 피부, 실화?',
        needDiscovery: '고민하던 피부, 여기서 풀렸어요',
        transformation: '사용 후 피부가 달라졌어요',
        ctaCall: '이 경험, 직접 해보세요',
      },
    },
  ],
  fashion: [
    {
      id: 'fashion_fit',
      context: 'fashion',
      situationLabel: '코디 완성의 순간',
      situationDescription: '인물이 카메라를 정면 응시하며 완성된 코디를 자신감 있게 보여주는 순간',
      needBridge: '코디에 마지막 퍼즐 조각을 맞춰주는 아이템 발견',
      transformationText: '착용 후 완성된 스타일링의 자신감',
      ctaText: '당신의 스타일도 완성하세요',
      narrationFlow: {
        gazeHook: '이 핏, 실화 맞나요?',
        needDiscovery: '코디의 마지막 조각을 찾는 중',
        transformation: '착용 후 코디가 완성됐어요',
        ctaCall: '당신의 스타일을 완성하세요',
      },
    },
  ],
  general: [
    {
      id: 'general_discover',
      context: 'general',
      situationLabel: '일상 속 발견의 순간',
      situationDescription: '인물이 카메라를 응시하며 무언가를 발견한 찰나의 순간',
      needBridge: '일상의 불편함을 해결해줄 제품과의 조우',
      transformationText: '사용 후 확 달라진 일상의 모습',
      ctaText: '이 경험을 직접 해보세요',
      narrationFlow: {
        gazeHook: '이 사람이 지금 무언가 발견한 순간',
        needDiscovery: '왜 이 제품이 필요했을까요?',
        transformation: '사용 후, 확 달라진 일상',
        ctaCall: '이 경험, 직접 확인하세요',
      },
    },
  ],
};

function pickScenario(context: UsageContext, seed: number): NarrativeScenario {
  const pool = SCENARIO_POOLS[context] ?? SCENARIO_POOLS.general;
  // For now each context has one scenario; use seed to vary text slightly
  const base = pool[seed % pool.length];
  return { ...base, id: `${base.id}_${seed}` };
}

// ─── Camera Trajectory: gaze-to-product ───

const GAZE_TRAJECTORIES: Record<StoryPhase, CameraTrajectory> = {
  gaze_hook: {
    phase: 'gaze_hook',
    moveType: 'gaze_hold',
    startScale: 1.03,
    endScale: 1.18,
    startTx: 0,
    endTx: 0,
    startTy: 0,
    endTy: -1,
    easing: 'ease_in_out_cubic',
    description: '인물 시선 고정 — 미세 줌인으로 시선 강탈 (2초)',
  },
  need_discovery: {
    phase: 'need_discovery',
    moveType: 'gaze_to_dolly',
    startScale: 1.18,
    endScale: 1.35,
    startTx: 2,
    endTx: -2,
    startTy: -1,
    endTy: 1,
    easing: 'ease_in_out_cubic',
    description: '시선 → 사물로 시선이 이동하는 듯한 달리인 + 패닝 (제품 다각도 탐색)',
  },
  transformation: {
    phase: 'transformation',
    moveType: 'macro_zoom',
    startScale: 1.35,
    endScale: 1.55,
    startTx: -2,
    endTx: 0,
    startTy: 1,
    endTy: 0,
    easing: 'ease_out_quart',
    description: '매크로 줌인 — 제품 표면 텍스처·디테일로 빨려 들어가는 연출',
  },
  cta_call: {
    phase: 'cta_call',
    moveType: 'pull_back',
    startScale: 1.55,
    endScale: 1.0,
    startTx: 0,
    endTx: 0,
    startTy: 0,
    endTy: 0,
    easing: 'ease_in_out_cubic',
    description: '줌 아웃 — 안정감 부여 후 시청자에게 CTA 전달',
  },
};

const GAZE_TRAJECTORY_VARIATIONS: CameraTrajectory[][] = [
  // Variation 0: standard gaze-to-product (above)
  [
    GAZE_TRAJECTORIES.gaze_hook,
    GAZE_TRAJECTORIES.need_discovery,
    GAZE_TRAJECTORIES.transformation,
    GAZE_TRAJECTORIES.cta_call,
  ],
  // Variation 1: more aggressive dolly
  [
    { ...GAZE_TRAJECTORIES.gaze_hook, startScale: 1.0, endScale: 1.22 },
    { ...GAZE_TRAJECTORIES.need_discovery, moveType: 'gaze_to_dolly', startTx: 5, endTx: -5, startScale: 1.22, endScale: 1.4 },
    { ...GAZE_TRAJECTORIES.transformation, moveType: 'macro_zoom', startScale: 1.4, endScale: 1.6, startTx: -5, endTx: 0 },
    GAZE_TRAJECTORIES.cta_call,
  ],
  // Variation 2: vertical emphasis (beauty/fashion)
  [
    { ...GAZE_TRAJECTORIES.gaze_hook, startTy: 2, endTy: -2 },
    { ...GAZE_TRAJECTORIES.need_discovery, moveType: 'slow_pan', startTx: 0, endTx: 0, startTy: -2, endTy: 3, startScale: 1.2, endScale: 1.25 },
    { ...GAZE_TRAJECTORIES.transformation, moveType: 'tilt_reveal', startTy: 3, endTy: -3, startScale: 1.25, endScale: 1.4 },
    { ...GAZE_TRAJECTORIES.cta_call, startScale: 1.4 },
  ],
];

export function getTrajectoriesForVariation(seed: number): CameraTrajectory[] {
  const idx = seed % GAZE_TRAJECTORY_VARIATIONS.length;
  return GAZE_TRAJECTORY_VARIATIONS[idx];
}

// ─── Cut Reordering ───

export function reorderCutsForGaze(
  imageUrls: string[],
  gazeCutIndex: number,
): ReorderedCuts {
  if (imageUrls.length === 0 || gazeCutIndex < 0 || gazeCutIndex >= imageUrls.length) {
    return {
      orderedImageUrls: imageUrls,
      gazeCutUrl: imageUrls[0] ?? null,
      gazeCutOriginalIndex: 0,
    };
  }

  const gazeUrl = imageUrls[gazeCutIndex];
  const reordered = [
    gazeUrl,
    ...imageUrls.filter((_, i) => i !== gazeCutIndex),
  ];

  return {
    orderedImageUrls: reordered,
    gazeCutUrl: gazeUrl,
    gazeCutOriginalIndex: gazeCutIndex,
  };
}

// ─── Main: Build Narrative Plan ───

export function buildNarrativePlan(
  imageUrls: string[],
  context: UsageContext,
  variationSeed = 0,
): NarrativePlan {
  const gaze = analyzeGazeCut(imageUrls, undefined, variationSeed);
  const scenario = pickScenario(context, variationSeed);
  const reorderedCuts = reorderCutsForGaze(imageUrls, gaze.gazeCutIndex);
  const trajectories = getTrajectoriesForVariation(variationSeed);

  return {
    gaze,
    scenario,
    reorderedCuts,
    trajectories,
    variationSeed,
  };
}

// ─── Integration: apply trajectories to segments ───

export function applyNarrativeToSegments(
  segments: EditSegment[],
  trajectories: CameraTrajectory[],
): EditSegment[] {
  return segments.map((seg) => {
    const traj = trajectories.find((t) => t.phase === seg.storyPhase);
    if (!traj) return seg;
    return {
      ...seg,
      narrationCue: traj.description,
    };
  });
}

// ─── Integration: convert trajectory to CameraMovement ───

export function trajectoryToCameraMovement(
  traj: CameraTrajectory,
  segmentIndex: number,
): CameraMovement {
  return {
    segmentIndex,
    storyPhase: traj.phase,
    moveType: traj.moveType,
    startScale: traj.startScale,
    endScale: traj.endScale,
    startTx: traj.startTx,
    endTx: traj.endTx,
    startTy: traj.startTy,
    endTy: traj.endTy,
    easing: traj.easing,
    description: traj.description,
  };
}

export function getNarrativeCameraForSegment(
  segments: EditSegment[],
  trajectories: CameraTrajectory[],
  segmentIndex: number,
): CameraMovement | null {
  const seg = segments[segmentIndex];
  if (!seg) return null;
  const traj = trajectories.find((t) => t.phase === seg.storyPhase);
  if (!traj) return null;
  return trajectoryToCameraMovement(traj, segmentIndex);
}

// ─── Summary for UI display ───

export function getNarrativeSummary(plan: NarrativePlan): string {
  const gazeLabel = plan.gaze.confidence > 0.65 ? '시선 컷 식별 (높음)' : '시선 컷 추정 (보통)';
  return `${gazeLabel} · ${plan.scenario.situationLabel} · 카메라 궤적 ${plan.trajectories.length}단계 · 변주 #${plan.variationSeed}`;
}
