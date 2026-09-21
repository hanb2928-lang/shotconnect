/**
 * Top 1% Viral Short-Form Formula Engine
 *
 * Codifies the algorithm-optimized 4-phase structure that drives
 * maximum retention and loop replays:
 *
 * Phase 1 (0-2s):  Pattern Interrupt — scroll-stopping visual hook
 * Phase 2 (2-7s):  Problem & Agitation — empathy + trust building
 * Phase 3 (7-12s): Social Proof & Core Benefit — compressed value
 * Phase 4 (12-15s): CTA & Loop Structure — action + infinite replay
 *
 * Each phase carries concrete visual, audio, and text directives
 * that the existing pipeline (beat sync, TTS, multi-angle cuts)
 * can consume directly.
 */

export type FormulaPhaseId = 'pattern_interrupt' | 'problem_agitation' | 'social_proof_benefit' | 'cta_loop';

export interface FormulaPhase {
  id: FormulaPhaseId;
  label: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  strategy: string;
  visual: string;
  audio: string;
  textOverlay: string;
  narrationTone: string;
  cutStrategy: string;
  bgmIntensity: number;
  retentionGoal: string;
}

export interface LoopStructure {
  enabled: boolean;
  firstFrameHint: string;
  lastFrameHint: string;
  transitionDescription: string;
}

export interface FormulaChecklistItem {
  id: string;
  label: string;
  description: string;
  category: 'caption' | 'beat_sync' | 'tts' | 'loop' | 'retention';
  checked: boolean;
}

export interface ViralFormula {
  phases: FormulaPhase[];
  totalDurationSec: number;
  loop: LoopStructure;
  checklist: FormulaChecklistItem[];
  retentionFormula: string;
  algorithmTargets: string[];
  summary: string;
}

const PHASE_DEFS: Omit<FormulaPhase, 'startSec' | 'endSec' | 'durationSec'>[] = [
  {
    id: 'pattern_interrupt',
    label: 'Pattern Interrupt (시선 강탈 훅)',
    strategy:
      '스크롤을 내리다 멈추게 만드는 유일한 구간. 인사나 브랜드 로고 등장 순간 알고리즘 지옥으로 추락.',
    visual:
      '제품이 가장 극적으로 변하는 순간(비포/애프터 쾌감) 또는 의외의 디테일 클로즈업 줌인으로 시작. 화면 전환 없이 단일 프레임으로 시선 고정.',
    audio:
      '고텐션 나레이션 + 자막 동시 타격. 손실 회피 또는 호기심 유발 훅문구를 강하게 전달. BGM 에너지 0.9로 최대치.',
    textOverlay: '"이거 모르면 평생 돈 버리는 겁니다" / "후기 4만 개 품절 대란템 직접 써봤습니다"',
    narrationTone: '고텐션, 빠르고 높은 톤, 강한 강세. 호흡 공백 없이 즉각적으로 꽂아 넣음.',
    cutStrategy: '컷 전환 없음. 단일 프레임으로 2초간 시선을 잡아매어 이탈률 0% 목표.',
    bgmIntensity: 0.9,
    retentionGoal: '초반 2초 이탈률 0% — 시청자가 스크롤을 멈추게 만드는 결정적 구간',
  },
  {
    id: 'problem_agitation',
    label: 'Problem & Agitation (문제 제기)',
    strategy:
      '훅에 걸려든 시청자의 이탈률을 0으로 만드는 구간. 템포를 살짝 낮추며 신뢰감 형성.',
    visual:
      '5각도 컷 전환(정면-좌측-우측-후면-상부)이 음악 비트에 맞춰 빠르게 전환되며 제품의 입체감을 각인시킴.',
    audio:
      '"매번 실패하던 분들, 딱 3초만 집중하세요" — 템포를 살짝 낮춰 신뢰감을 주는 저음/전문가 톤으로 전환. BGM 에너지 0.65로 조절.',
    textOverlay: '"매번 실패하던 분들, 딱 3초만 집중하세요"',
    narrationTone: '저음, 차분하고 전문적인 톤. 템포 감속(ritardando)으로 신뢰감 형성.',
    cutStrategy: '5각도 컷을 BGM 드럼 킥 타이밍에 정확히 일치시켜 시각적 타격감 극대화. 1.5~2초 간격 전환.',
    bgmIntensity: 0.65,
    retentionGoal: '2~7초 시청 지속 시간 확보 — 이탈률 0%로 유지',
  },
  {
    id: 'social_proof_benefit',
    label: 'Social Proof & Core Benefit (압축된 베네핏)',
    strategy:
      '장황한 스펙 나열을 버리고 "이 제품이 내 삶을 어떻게 바꾸는가"를 직관적으로 보여줌.',
    visual:
      '실제 사용 중인 장면 또는 가상 피팅/착용 컷을 통해 손에 잡힐 듯한 리얼리티 제공. 디테일 클로즈업 틸트 리빌.',
    audio:
      'AI 자동 볼륨 덕킹(Ducking)이 적용된 BGM 위로, 인간 성우와 구별할 수 없는 호흡과 뉘앙스가 담긴 나레이션이 핵심 장점을 속사포처럼 꽂아 넣음. BGM 에너지 0.55.',
    textOverlay: '핵심 장점 3가지를 자막으로 압축 전달 — 스펙이 아닌 "삶의 변화"를 표현',
    narrationTone: '감성 + 설득력. 따뜻하지나 빠르고 정확한 발음. 호흡 공백 0.2~0.3초로 여운 생성.',
    cutStrategy: '2초 간격 컷 전환. 디테일 클로즈업 틸트 리빌로 시각적 변화 피크 생성.',
    bgmIntensity: 0.55,
    retentionGoal: '7~12초 핵심 가치 전달 — 시청자의 구매 의향 형성',
  },
  {
    id: 'cta_loop',
    label: 'CTA & Loop Structure (행동 유도 + 무한 반복)',
    strategy:
      "알고리즘 평가의 핵심 지표인 '재시청(Loop)'과 '저장/공유'를 유발. 영상 끝과 시작을 자연스럽게 연결.",
    visual:
      '영상의 마지막 프레임과 첫 번째 프레임의 구도를 자연스럽게 연결하여, 끝났는지 모르게 영상이 무한 반복(Loop)되도록 설계.',
    audio:
      '"구매처는 프로필 링크에 남겨둘게요. 품절되기 전에 확인하세요!" — 명확한 행동 지침과 함께 여운을 주는 비트 드랍으로 마무리. BGM 에너지 0.75로 마지막 텐션 상승.',
    textOverlay: '"구매처는 프로필 링크에 남겨둘게요. 품절되기 전에 확인하세요!"',
    narrationTone: '강하고 명확한 CTA 톤. 마지막 3초 시청자 행동 직접 유도. 텐션 상승으로 끝맺음.',
    cutStrategy: '카메라 고정. CTA 자막 번인. 마지막 프레임 → 첫 프레임 자연스러운 루프 연결.',
    bgmIntensity: 0.75,
    retentionGoal: "12~15초 재시청(Loop) + 저장/공유 유발 — 알고리즘 평가 핵심 지표 달성",
  },
];

const LOOP_STRUCTURE: LoopStructure = {
  enabled: true,
  firstFrameHint: '제품 클로즈업 줌인 상태 — 시선 강탈 시작 프레임',
  lastFrameHint: '동일한 클로즈업 줌인 상태로 복귀 — 첫 프레임과 동일 구도',
  transitionDescription:
    '마지막 프레임의 구도를 첫 번째 프레임과 동일하게 맞추어, 영상이 끝났는지 모르게 무한 반복(Loop)되도록 설계. 알고리즘의 재시청 지표를 극대화.',
};

const CHECKLIST_ITEMS: Omit<FormulaChecklistItem, 'checked'>[] = [
  {
    id: 'caption_first',
    label: '무음 시청 대응 (Caption First)',
    description: '사운드를 끄고 봐도 훅문구와 핵심 자막만으로 스토리 이해가 100% 되도록 자막 디자인 배치',
    category: 'caption',
  },
  {
    id: 'beat_sync_cuts',
    label: '비트 싱크 컷 전환',
    description: '5각도 컷이 넘어가는 시점을 BGM의 드럼 킥 타이밍에 정확히 일치시켜 시각적 타격감 극대화',
    category: 'beat_sync',
  },
  {
    id: 'emotion_tts',
    label: '감정선이 살아있는 TTS',
    description: '기계적인 일자 톤을 버리고, 구간별로 텐션과 호흡 공백(Pause)이 조율된 프리미엄 음성 배치',
    category: 'tts',
  },
  {
    id: 'loop_structure',
    label: '무한 반복(Loop) 구조',
    description: '마지막 프레임과 첫 프레임의 구도를 연결하여 재시청률 극대화',
    category: 'loop',
  },
  {
    id: 'retention_curve',
    label: '시청 지속 시간(Retention) 곡선',
    description: '높은 시청 지속 시간과 무한 반복(Looping)을 동시에 달성하는 4단계 페이스 조절',
    category: 'retention',
  },
];

const ALGORITHM_TARGETS = [
  '높은 시청 지속 시간 (Retention) — 초반 2초 이탈률 0% 목표',
  '무한 반복 (Looping) — 마지막→첫 프레임 자연스러운 연결로 재시청률 극대화',
  '저장/공유 유발 — CTA 구간에서 명확한 행동 지침으로 인터랙션 유도',
  '자막-나레이션-BGM 삼중 동기화 — 0.1초 오차 내 동기화로 알고리즘 선호도 상승',
];

export function buildViralFormula(totalDurationSec: number = 15): ViralFormula {
  const phaseDurations = [
    { start: 0, end: Math.min(2, totalDurationSec) },
    { start: 2, end: Math.min(7, totalDurationSec) },
    { start: 7, end: Math.min(12, totalDurationSec) },
    { start: 12, end: totalDurationSec },
  ];

  const phases: FormulaPhase[] = PHASE_DEFS.map((def, i) => {
    const { start, end } = phaseDurations[i];
    return {
      ...def,
      startSec: start,
      endSec: end,
      durationSec: Math.round((end - start) * 10) / 10,
    };
  });

  const checklist: FormulaChecklistItem[] = CHECKLIST_ITEMS.map((item) => ({
    ...item,
    checked: true,
  }));

  const summary = phases
    .map((p) => `[${p.startSec}~${p.endSec}s] ${p.label}: ${p.retentionGoal}`)
    .join('\n');

  const retentionFormula =
    '높은 시청 지속 시간(Retention) + 무한 반복(Looping) 동시 달성 — 초반 2초 시선 강탈 → 5초 공감 형성 → 5초 베네핏 압축 → 3초 CTA + 루프';

  return {
    phases,
    totalDurationSec,
    loop: LOOP_STRUCTURE,
    checklist,
    retentionFormula,
    algorithmTargets: ALGORITHM_TARGETS,
    summary,
  };
}

export function getFormulaPhaseAtTime(formula: ViralFormula, timeSec: number): FormulaPhase | null {
  return formula.phases.find((p) => timeSec >= p.startSec && timeSec < p.endSec) ?? null;
}

export function getFormulaChecklistByCategory(
  formula: ViralFormula,
  category: FormulaChecklistItem['category'],
): FormulaChecklistItem[] {
  return formula.checklist.filter((item) => item.category === category);
}

export function formatFormulaTimeline(formula: ViralFormula): string {
  return formula.phases
    .map((p) => {
      const bar = '█'.repeat(Math.max(1, Math.round(p.durationSec * 3)));
      return `${p.startSec.toString().padStart(2)}s─${bar}─${p.endSec}s ${p.label}`;
    })
    .join('\n');
}

export interface PhaseToSegmentMapping {
  formulaPhase: FormulaPhase;
  storyPhase: string;
  beatSyncHint: string;
  ttsHint: string;
}

export function mapFormulaToExistingPipeline(
  formula: ViralFormula,
): PhaseToSegmentMapping[] {
  const storyMap: Record<FormulaPhaseId, string> = {
    pattern_interrupt: 'gaze_hook',
    problem_agitation: 'need_discovery',
    social_proof_benefit: 'transformation',
    cta_loop: 'cta_call',
  };

  const beatMap: Record<FormulaPhaseId, string> = {
    pattern_interrupt: '컷 전환 없음 — 첫 비트에서 나레이션 피크',
    problem_agitation: '5각도 컷을 다운비트에 스냅 — 1.5~2초 간격',
    social_proof_benefit: '2초 간격 컷 전환 — 비트 동기화 틸트 리빌',
    cta_loop: '카메라 고정 — 마지막 비트 드랍에 CTA 자막 번인',
  };

  const ttsMap: Record<FormulaPhaseId, string> = {
    pattern_interrupt: '고텐션, 빠른 속도(1.15x), 높은 피치(1.08), 호흡 공백 없음',
    problem_agitation: '저음 전문가 톤, 속도 감속(0.95x), 차분한 피치(0.98), 문장 간 0.25초 휴지',
    social_proof_benefit: '감성+설득, 중간 속도(1.0x), 따뜻한 피치(1.0), 호흡 0.2~0.3초',
    cta_loop: '강한 CTA, 속도 상승(1.1x), 명확한 피치(1.03), 텐션 피크',
  };

  return formula.phases.map((phase) => ({
    formulaPhase: phase,
    storyPhase: storyMap[phase.id],
    beatSyncHint: beatMap[phase.id],
    ttsHint: ttsMap[phase.id],
  }));
}

export function getFormulaPhaseLabel(id: FormulaPhaseId): string {
  const phase = PHASE_DEFS.find((p) => p.id === id);
  return phase?.label ?? id;
}
