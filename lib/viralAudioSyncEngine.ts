import { DurationPreset, getTierForDuration, DURATION_PRESETS } from './durationPresets';
import { EmotionCurve, EmotionPhase, generateEmotionCurve, PHASE_RATIOS } from './ttsEmotionCurve';
import { ProsodyProfile, buildProsodyInstructions, getProsodyAdjustedSpeed } from './prosodyProfile';
import { MicroSyncTimeline, generateSyncTimeline } from './microSyncRenderer';

export type PlatformKey = 'shorts' | 'tiktok' | 'reels' | 'naverclip';
export type ContentPurpose = 'monetization' | 'adConversion';

export interface ViralAudioSyncProfile {
  totalDurationSec: number;
  durationPreset: DurationPreset | undefined;
  tier: 'viral' | 'standard' | 'detailed';
  emotionCurve: EmotionCurve;
  syncTimeline: MicroSyncTimeline;
  prosodyInstructions: string;
  voGuidelines: string;
  timeBoxingPlan: TimeBoxSegment[];
  viralBenchmark: ViralBenchmark;
  audioSyncStrategy: string;
}

export interface TimeBoxSegment {
  phase: EmotionPhase;
  startSec: number;
  endSec: number;
  durationSec: number;
  targetSyllableRate: number;
  captionVisibleSec: number;
  description: string;
}

export interface ViralBenchmark {
  platform: PlatformKey;
  top1HookPattern: string;
  optimalBgmIntensity: number;
  optimalCaptionDensity: number;
  microPauseFrequency: number;
  breathMarkerStrategy: string;
  retentionFormula: string;
}

const PLATFORM_BENCHMARKS: Record<PlatformKey, Omit<ViralBenchmark, 'platform'>> = {
  shorts: {
    top1HookPattern: '첫 2초 강렬한 보이스 후킹 → 3초 시각 전환 → 검색 키워드 자막 폭격',
    optimalBgmIntensity: 0.65,
    optimalCaptionDensity: 0.8,
    microPauseFrequency: 0.15,
    breathMarkerStrategy: '문장 경계마다 0.3초 마이크로 호흡, 후킹 직전 0.5초 팝 실런스',
    retentionFormula: '2초 후킹 + 1.8초 간격 컷 전환 + 마지막 3초 CTA 고정',
  },
  tiktok: {
    top1HookPattern: '0.5초 도파민 트리거 → 트렌드 사운드 드롭 → 1.5초 간격 무한 루프',
    optimalBgmIntensity: 0.8,
    optimalCaptionDensity: 0.9,
    microPauseFrequency: 0.1,
    breathMarkerStrategy: '빠른 호흡, 감탄사 직전 0.2초 마이크로 포즈, 끝에 0.4초 여운',
    retentionFormula: '0.5초 후킹 + 1.5초 간격 컷 전환 + FYP 진입 최적화',
  },
  reels: {
    top1HookPattern: '감성 스토리 오프닝 → 2초 시각 몰입 → 미적 자막 오버레이',
    optimalBgmIntensity: 0.55,
    optimalCaptionDensity: 0.6,
    microPauseFrequency: 0.25,
    breathMarkerStrategy: '여유로운 호흡, 감정 전환점마다 0.6초 휴식, 나레이션 끝 1초 여운',
    retentionFormula: '2.5초 스토리 후킹 + 2초 간격 컷 전환 + 댓글 유도 마무리',
  },
  naverclip: {
    top1HookPattern: '정보 밀도 후킹 → 신뢰형 VO → 쇼핑 검색 키워드 자막',
    optimalBgmIntensity: 0.2,
    optimalCaptionDensity: 0.85,
    microPauseFrequency: 0.3,
    breathMarkerStrategy: '차분한 호흡, 핵심 키워드 직전 0.4초 포즈, 문장 끝 0.5초 정지',
    retentionFormula: '3초 정보 후킹 + 2.5초 간격 컷 전환 + 쇼핑 CTA 직행',
  },
};

const HUMAN_PROSODY_DIRECTIVES = [
  '기계적인 단조 억양을 절대 사용하지 마. 문장의 기승전결에 맞춰 억양을 자연스럽게 올렸다 내려라.',
  '후킹 포인트에서는 강세를 1.3배 높이고, 설득 구간에서는 속도를 15% 늦춰라.',
  '호흡 멈춤(Pause)은 인간의 실제 대화 호흡을 모방해: 문장 사이 0.3~0.5초, 감탄사 직전 0.2초.',
  '감탄사("와", "진짜", "대박")는 실제 사람처럼 텐포를 올리며 발음하고 뒤에 0.15초 마이크로 포즈를 둬.',
  '강조어는 첫 음절에 1.2배 악센트를 주고 나머지는 평탄하게 이어가라.',
  '문장 끝맺음은 자연스럽게 숨을 내쉬며 톤을 낮춰, 기계적 종결이 아닌 인간의 호흡 종결을 사용해.',
];

const TOP1_VIRAL_DIRECTIVES = [
  '초반 2초 이탈률을 0으로 만드는 강렬한 보이스 후킹을 도입부 첫 문장에 배치해.',
  '시청 지속 시간을 끝까지 붙들어 매는 오디오 밸런스: BGM은 나레이션을 방해하지 않는 -6dB 이하로 믹싱해.',
  '상위 1% 채널들의 공통 패턴: 오디오-자막-BGM이 0.1초 오차 내로 동기화되어야 시청 지속률이 폭발한다.',
  '컷 전환 타이밍과 나레이션 강세 피크가 정확히 일치하도록 타이밍을 맞춰라.',
  '마지막 3초는 CTA 보이스와 자막이 동시에 고정되어 시청자 행동을 유도해야 한다.',
];

function buildVoGuidelines(
  platform: PlatformKey,
  purpose: ContentPurpose,
  prosodyProfile: ProsodyProfile,
): string {
  const directives = HUMAN_PROSODY_DIRECTIVES.join('\n');
  const prosodyBase = buildProsodyInstructions(prosodyProfile);
  const purposeDirective = purpose === 'monetization'
    ? '수익화 모드: 도파민 유도형 BGM과 나레이션이 상호작용하며 시청 지속률을 극대화. 자막-나레이션-BGM 삼중 동기화.'
    : '광고/구매 전환 모드: BGM 최소화, 차분하고 설득력 있는 전문 VO. 핵심 키워드 자막과 VO가 1:1로 매핑되어 구매 전환을 유도.';

  return `## 인간 감성 지능형 VO 합성 가이드라인

너는 기계적 TTS가 아니라, 실제 상위 1% 크리에이터의 호흡·억양·감정선을 완벽히 모방하는 인간 감성 지능형 음성 합성 엔진이다.

### 핵심 인간화 지침 (반드시 준수)
${directives}

### 프로소디 프로파일 적용
${prosodyBase}

### 목적별 오디오 전략
${purposeDirective}

### 상위 1% 바이럴 벤치마크 지침
${TOP1_VIRAL_DIRECTIVES.join('\n')}
`;
}

function buildTimeBoxingPlan(
  curve: EmotionCurve,
  totalDurationSec: number,
): TimeBoxSegment[] {
  return curve.segments.map((seg) => {
    const phaseDuration = seg.endSec - seg.startSec;
    const baseRate = 7.5;
    const adjustedRate = baseRate * seg.speed;

    const captionVisibleRatio = PHASE_RATIOS[seg.phase] ?? 0.2;
    const captionVisibleSec = phaseDuration * Math.min(captionVisibleRatio * 3, 0.9);

    return {
      phase: seg.phase,
      startSec: seg.startSec,
      endSec: seg.endSec,
      durationSec: Math.round(phaseDuration * 10) / 10,
      targetSyllableRate: Math.round(adjustedRate * 10) / 10,
      captionVisibleSec: Math.round(captionVisibleSec * 10) / 10,
      description: seg.description,
    };
  });
}

function buildAudioSyncStrategy(
  platform: PlatformKey,
  benchmark: ViralBenchmark,
  plan: TimeBoxSegment[],
  totalDurationSec: number,
): string {
  const segmentSummary = plan
    .map((s) => `  - ${s.phase}: ${s.startSec.toFixed(1)}s~${s.endSec.toFixed(1)}s (${s.durationSec}s) | 음절 속도 ${s.targetSyllableRate}/초 | 자막 노출 ${s.captionVisibleSec}s`)
    .join('\n');

  return `## 오디오-영상 완벽 동기화 전략 (Time-Boxing)

### 영상 길이: ${totalDurationSec}초
### 플랫폼: ${platform}
### 상위 1% 패턴: ${benchmark.top1HookPattern}

### 타임박스 세그먼트별 마이크로 핏팅
${segmentSummary}

### 동기화 규칙
- 나레이션 전체 음절 속도를 위 타임박스에 맞춰 자동 분배. 1초도 어긋나지 않게.
- 자막 시각적 노출 타이밍은 해당 세그먼트의 captionVisibleSec 내에서만 표시.
- 컷 전환 타이밍과 나레이션 강세 피크가 0.1초 오차 내로 일치해야 함.
- BGM 인텐시티: ${benchmark.optimalBgmIntensity} (나레이션을 방해하지 않는 수준)
- 마이크로 포즈 빈도: ${benchmark.microPauseFrequency}
- 호흡 마커: ${benchmark.breathMarkerStrategy}
- 리텐션 공식: ${benchmark.retentionFormula}
`;
}

export function buildViralAudioSyncProfile(
  platform: PlatformKey,
  purpose: ContentPurpose,
  totalDurationMs: number,
  prosodyProfile: ProsodyProfile,
  scriptText: string,
): ViralAudioSyncProfile {
  const totalDurationSec = Math.round(totalDurationMs / 1000);
  const tier = getTierForDuration(totalDurationMs);
  const durationPreset = DURATION_PRESETS.find((p) => p.value === totalDurationMs);
  const emotionCurve = generateEmotionCurve(totalDurationSec, prosodyProfile);
  const syncTimeline = generateSyncTimeline(scriptText, totalDurationSec);
  const timeBoxingPlan = buildTimeBoxingPlan(emotionCurve, totalDurationSec);
  const voGuidelines = buildVoGuidelines(platform, purpose, prosodyProfile);
  const benchmarkBase = PLATFORM_BENCHMARKS[platform];
  const viralBenchmark: ViralBenchmark = { platform, ...benchmarkBase };
  const audioSyncStrategy = buildAudioSyncStrategy(platform, viralBenchmark, timeBoxingPlan, totalDurationSec);
  const prosodyInstructions = buildProsodyInstructions(prosodyProfile);

  return {
    totalDurationSec,
    durationPreset,
    tier,
    emotionCurve,
    syncTimeline,
    prosodyInstructions,
    voGuidelines,
    timeBoxingPlan,
    viralBenchmark,
    audioSyncStrategy,
  };
}

export function buildRegenerationPayload(
  profile: ViralAudioSyncProfile,
  customPrompt: string,
): string {
  return [
    profile.voGuidelines,
    profile.audioSyncStrategy,
    customPrompt ? `\n### 사용자 추가 프롬프트\n${customPrompt}` : '',
  ].filter(Boolean).join('\n\n---\n\n');
}

export function getViralBenchmarkForPlatform(platform: PlatformKey): ViralBenchmark {
  return { platform, ...PLATFORM_BENCHMARKS[platform] };
}

export function formatTimeBoxSummary(plan: TimeBoxSegment[]): string {
  return plan
    .map((s) => `${s.phase}: ${s.startSec.toFixed(1)}-${s.endSec.toFixed(1)}s`)
    .join(' | ');
}

export function getSyncAccuracyLabel(profile: ViralAudioSyncProfile): string {
  const markers = profile.syncTimeline.markers.length;
  const layers = profile.syncTimeline.tempoLayers.length;
  const total = markers + layers;
  if (total >= 20) return '마스터피스급 동기화';
  if (total >= 12) return '프리미엄 동기화';
  if (total >= 6) return '표준 동기화';
  return '기본 동기화';
}
