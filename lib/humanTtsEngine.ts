/**
 * Human-Level TTS Engine
 *
 * Produces TTS parameters that make AI narration indistinguishable from
 * a professional human voice actor. Three pillars:
 *
 * 1. Context-Aware Emotion — maps Vision AI mood metadata to dynamic
 *    style parameters with smooth cross-fade transitions to prevent
 *    tonal collapse between phases.
 *
 * 2. Precision Pausing — inserts millisecond-accurate silence intervals
 *    at punctuation marks and hook transitions, with accelerando /
 *    ritardando tempo curves that mimic natural human breathing.
 *
 * 3. High-Fidelity Audio Spec — locks output to 44.1kHz / 24-bit and
 *    defines compressor + exciter post-processing chain for vocal
 *    warmth and presence.
 */

import type { EmotionPhase } from './ttsEmotionCurve';
import type { ProsodyProfile } from './prosodyProfile';

export type VisionMood =
  | 'urgent'
  | 'trendy'
  | 'emotional'
  | 'trustworthy'
  | 'playful'
  | 'luxurious'
  | 'casual';

export interface MoodStyleParams {
  basePitch: number;
  pitchRange: number;
  warmth: number;
  breathiness: number;
  energyLevel: number;
  styleInstructions: string;
}

export const MOOD_STYLE_MAP: Record<VisionMood, MoodStyleParams> = {
  urgent: {
    basePitch: 1.12,
    pitchRange: 0.7,
    warmth: 0.35,
    breathiness: 0.2,
    energyLevel: 0.9,
    styleInstructions:
      'Speak with urgency and excitement. Use a slightly elevated pitch with sharp, punchy delivery. ' +
      'Emphasize key selling points with rising intonation. Keep the pace brisk but every word must be clear.',
  },
  trendy: {
    basePitch: 1.05,
    pitchRange: 0.6,
    warmth: 0.45,
    breathiness: 0.3,
    energyLevel: 0.75,
    styleInstructions:
      'Speak in a trendy, contemporary tone like a popular TikTok creator. ' +
      'Use natural upward inflections at sentence ends. Be energetic but relaxed, not overly polished.',
  },
  emotional: {
    basePitch: 0.96,
    pitchRange: 0.45,
    warmth: 0.85,
    breathiness: 0.55,
    energyLevel: 0.4,
    styleInstructions:
      'Speak with genuine warmth and emotional depth. Lower your pitch slightly. ' +
      'Let your voice convey real feeling — as if sharing a personal story with a close friend. ' +
      'Add subtle breathiness for intimacy.',
  },
  trustworthy: {
    basePitch: 0.98,
    pitchRange: 0.35,
    warmth: 0.7,
    breathiness: 0.3,
    energyLevel: 0.5,
    styleInstructions:
      'Speak in a calm, measured, authoritative tone. Lower pitch with minimal variation. ' +
      'Convey expertise and sincerity. Each sentence should land with weight and credibility.',
  },
  playful: {
    basePitch: 1.08,
    pitchRange: 0.8,
    warmth: 0.55,
    breathiness: 0.35,
    energyLevel: 0.85,
    styleInstructions:
      'Speak with playful, fun energy. Use exaggerated intonation swings and dramatic pauses for comedic effect. ' +
      'Sound like you are genuinely enjoying talking about this product.',
  },
  luxurious: {
    basePitch: 0.94,
    pitchRange: 0.3,
    warmth: 0.65,
    breathiness: 0.4,
    energyLevel: 0.35,
    styleInstructions:
      'Speak in a refined, sophisticated tone with slow, deliberate pacing. ' +
      'Lower pitch with controlled resonance. Convey exclusivity and premium quality. ' +
      'Every word should feel carefully chosen and elegant.',
  },
  casual: {
    basePitch: 1.0,
    pitchRange: 0.5,
    warmth: 0.6,
    breathiness: 0.35,
    energyLevel: 0.55,
    styleInstructions:
      'Speak casually and naturally, like talking to a friend. Relaxed pace with natural intonation. ' +
      'No announcer voice — just genuine, everyday conversational tone.',
  },
};

export function moodLabelToVisionMood(moodLabel: string): VisionMood {
  const map: Record<string, VisionMood> = {
    '긴박감': 'urgent',
    '트렌디': 'trendy',
    '감성': 'emotional',
    '신뢰': 'trustworthy',
    '재미': 'playful',
    '럭셔리': 'luxurious',
    '일상': 'casual',
    '하이텐션': 'urgent',
    '시네마틱': 'emotional',
    '로파이': 'casual',
    'ASMR': 'emotional',
  };
  return map[moodLabel] ?? 'trendy';
}

export interface PauseSpec {
  punctuation: string;
  durationMs: number;
  type: 'breath' | 'comma' | 'sentence' | 'dramatic' | 'hook-transition';
}

export const PUNCTUATION_PAUSES: PauseSpec[] = [
  { punctuation: ',', durationMs: 180, type: 'comma' },
  { punctuation: '、', durationMs: 180, type: 'comma' },
  { punctuation: '.', durationMs: 350, type: 'sentence' },
  { punctuation: '。', durationMs: 350, type: 'sentence' },
  { punctuation: '!', durationMs: 300, type: 'sentence' },
  { punctuation: '！', durationMs: 300, type: 'sentence' },
  { punctuation: '?', durationMs: 320, type: 'sentence' },
  { punctuation: '？', durationMs: 320, type: 'sentence' },
  { punctuation: '...', durationMs: 500, type: 'dramatic' },
  { punctuation: '…', durationMs: 500, type: 'dramatic' },
  { punctuation: '—', durationMs: 400, type: 'dramatic' },
];

export const HOOK_TRANSITION_PAUSE_MS = 450;
export const BREATH_PAUSE_MS = 220;

export interface TempoPoint {
  timeSec: number;
  speedMultiplier: number;
}

export interface TempoCurve {
  points: TempoPoint[];
  description: string;
}

export function generateTempoCurve(
  totalDurationSec: number,
  phases: { phase: EmotionPhase; startSec: number; endSec: number; speed: number }[],
): TempoCurve {
  const points: TempoPoint[] = [];
  const CROSSFADE_SEC = 0.4;

  for (let i = 0; i < phases.length; i++) {
    const seg = phases[i];
    const nextSeg = phases[i + 1];

    points.push({
      timeSec: seg.startSec,
      speedMultiplier: seg.speed,
    });

    if (nextSeg) {
      const transitionStart = seg.endSec - CROSSFADE_SEC;
      const transitionMid = seg.endSec;
      const transitionEnd = seg.endSec + CROSSFADE_SEC;

      points.push({ timeSec: Math.max(transitionStart, seg.startSec + 0.1), speedMultiplier: seg.speed });
      points.push({ timeSec: transitionMid, speedMultiplier: (seg.speed + nextSeg.speed) / 2 });
      points.push({
        timeSec: Math.min(transitionEnd, nextSeg.endSec - 0.1),
        speedMultiplier: nextSeg.speed,
      });
    }
  }

  if (points.length === 0 || points[0].timeSec > 0) {
    points.unshift({ timeSec: 0, speedMultiplier: phases[0]?.speed ?? 1.0 });
  }
  if (points[points.length - 1].timeSec < totalDurationSec) {
    points.push({ timeSec: totalDurationSec, speedMultiplier: phases[phases.length - 1]?.speed ?? 1.0 });
  }

  return {
    points,
    description: `Accelerando/ritardando curve with ${points.length} control points across ${phases.length} emotion phases. Cross-fade: ${CROSSFADE_SEC}s per transition.`,
  };
}

export function getTempoAtTime(curve: TempoCurve, timeSec: number): number {
  const pts = curve.points;
  if (pts.length === 0) return 1.0;
  if (timeSec <= pts[0].timeSec) return pts[0].speedMultiplier;
  if (timeSec >= pts[pts.length - 1].timeSec) return pts[pts.length - 1].speedMultiplier;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    if (timeSec >= p0.timeSec && timeSec <= p1.timeSec) {
      const t = (timeSec - p0.timeSec) / Math.max(p1.timeSec - p0.timeSec, 0.001);
      const eased = t * t * (3 - 2 * t);
      return p0.speedMultiplier + (p1.speedMultiplier - p0.speedMultiplier) * eased;
    }
  }
  return 1.0;
}

export interface SilenceInterval {
  position: number;
  durationMs: number;
  type: PauseSpec['type'];
}

export function generateSilenceIntervals(text: string): SilenceInterval[] {
  const intervals: SilenceInterval[] = [];

  for (const spec of PUNCTUATION_PAUSES) {
    let searchIdx = 0;
    while (true) {
      const found = text.indexOf(spec.punctuation, searchIdx);
      if (found === -1) break;
      intervals.push({
        position: found,
        durationMs: spec.durationMs,
        type: spec.type,
      });
      searchIdx = found + spec.punctuation.length;
    }
  }

  const sentences = text.split(/[.!?。！？]/);
  let charPos = 0;
  for (let i = 0; i < sentences.length - 1; i++) {
    charPos += sentences[i].length + 1;
    intervals.push({
      position: charPos,
      durationMs: i === 0 ? HOOK_TRANSITION_PAUSE_MS : BREATH_PAUSE_MS,
      type: i === 0 ? 'hook-transition' : 'breath',
    });
  }

  intervals.sort((a, b) => a.position - b.position);
  return intervals;
}

export function insertSilenceMarkers(text: string, intervals: SilenceInterval[]): string {
  if (intervals.length === 0) return text;

  const sorted = [...intervals].sort((a, b) => b.position - a.position);
  let result = text;
  for (const interval of sorted) {
    const marker = ` <silence:${interval.durationMs}ms> `;
    result = result.slice(0, interval.position + 1) + marker + result.slice(interval.position + 1);
  }
  return result;
}

export function calculateTotalSilenceMs(intervals: SilenceInterval[]): number {
  return intervals.reduce((sum, i) => sum + i.durationMs, 0);
}

export interface AudioPostProcessingSpec {
  sampleRateHz: number;
  bitDepth: number;
  compressor: {
    thresholdDb: number;
    ratio: number;
    attackMs: number;
    releaseMs: number;
    makeupGainDb: number;
  };
  exciter: {
    frequencyHz: number;
    driveDb: number;
    mix: number;
  };
  highpassFilterHz: number;
  deEsser: {
    frequencyHz: number;
    thresholdDb: number;
    reductionDb: number;
  };
}

export const HIFI_AUDIO_SPEC: AudioPostProcessingSpec = {
  sampleRateHz: 44100,
  bitDepth: 24,
  compressor: {
    thresholdDb: -18,
    ratio: 3,
    attackMs: 8,
    releaseMs: 120,
    makeupGainDb: 3,
  },
  exciter: {
    frequencyHz: 3500,
    driveDb: 4,
    mix: 0.25,
  },
  highpassFilterHz: 80,
  deEsser: {
    frequencyHz: 6500,
    thresholdDb: -25,
    reductionDb: 6,
  },
};

export interface HumanTtsProfile {
  mood: VisionMood;
  styleParams: MoodStyleParams;
  tempoCurve: TempoCurve;
  silenceIntervals: SilenceInterval[];
  totalSilenceMs: number;
  audioSpec: AudioPostProcessingSpec;
  processedText: string;
  instructions: string;
  fidelityLabel: string;
}

export function buildHumanTtsProfile(
  text: string,
  moodLabel: string,
  phases: { phase: EmotionPhase; startSec: number; endSec: number; speed: number }[],
  totalDurationSec: number,
  prosodyProfile?: ProsodyProfile,
): HumanTtsProfile {
  const mood = moodLabelToVisionMood(moodLabel);
  const styleParams = MOOD_STYLE_MAP[mood];
  const tempoCurve = generateTempoCurve(totalDurationSec, phases);
  const silenceIntervals = generateSilenceIntervals(text);
  const totalSilenceMs = calculateTotalSilenceMs(silenceIntervals);
  const processedText = insertSilenceMarkers(text, silenceIntervals);

  const prosodyBase = prosodyProfile?.baseInstructions ?? '';
  const warmthHint = styleParams.warmth >= 0.7
    ? 'Add a warm, intimate breathiness to your voice, especially on emotional phrases.'
    : '';
  const energyHint = styleParams.energyLevel >= 0.8
    ? 'Inject bursts of dynamic energy — vary your volume between soft and loud for dramatic effect.'
    : '';
  const breathHint = styleParams.breathiness >= 0.4
    ? 'Include audible natural breath sounds between sentences to convey authenticity.'
    : '';

  const instructions = [
    styleParams.styleInstructions,
    prosodyBase,
    warmthHint,
    energyHint,
    breathHint,
    'Never speak in a flat, monotone robot voice. Your intonation must rise and fall naturally like a real person having a conversation.',
    'Pronounce every syllable clearly. Avoid slurring or rushing through words.',
    'At each <silence:Xms> marker, pause for exactly X milliseconds. These are natural breathing points — treat them as moments where a human speaker would inhale.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    mood,
    styleParams,
    tempoCurve,
    silenceIntervals,
    totalSilenceMs,
    audioSpec: HIFI_AUDIO_SPEC,
    processedText,
    instructions,
    fidelityLabel: `${HIFI_AUDIO_SPEC.sampleRateHz / 1000}kHz / ${HIFI_AUDIO_SPEC.bitDepth}-bit Hi-Fi`,
  };
}

export function getMoodLabel(mood: VisionMood): string {
  const labels: Record<VisionMood, string> = {
    urgent: '긴박감',
    trendy: '트렌디',
    emotional: '감성',
    trustworthy: '신뢰',
    playful: '재미',
    luxurious: '럭셔리',
    casual: '일상',
  };
  return labels[mood];
}

export function getMoodDescription(mood: VisionMood): string {
  const descs: Record<VisionMood, string> = {
    urgent: '빠르고 긴박한 톤 — 할인, 한정, 품절 등 긴급성 강조',
    trendy: '트렌디하고 자연스러운 톤 — 틱톡/릴스 크리에이터 스타일',
    emotional: '따뜻하고 감성적인 톤 — 스토리텔링, 감정 자극',
    trustworthy: '차분하고 신뢰감 있는 톤 — 전문가 리뷰, 정보 전달',
    playful: '장난스럽고 재미있는 톤 — 바이럴 코미디, B급',
    luxurious: '고급스럽고 우아한 톤 — 프리미엄 브랜드, 럭셔리',
    casual: '편안하고 일상적인 톤 — 친구에게 추천하는 느낌',
  };
  return descs[mood];
}

export interface HumanTtsRequest {
  text: string;
  voice: string;
  speed: number;
  instructions: string;
  processedText: string;
  sampleRateHz: number;
  bitDepth: number;
  silenceMarkers: { position: number; durationMs: number; type: string }[];
  tempoCurvePoints: { timeSec: number; speedMultiplier: number }[];
}

export function buildHumanTtsRequest(
  profile: HumanTtsProfile,
  voice: string,
  baseSpeed: number,
): HumanTtsRequest {
  return {
    text: profile.processedText,
    voice,
    speed: baseSpeed,
    instructions: profile.instructions,
    processedText: profile.processedText,
    sampleRateHz: profile.audioSpec.sampleRateHz,
    bitDepth: profile.audioSpec.bitDepth,
    silenceMarkers: profile.silenceIntervals.map((i) => ({
      position: i.position,
      durationMs: i.durationMs,
      type: i.type,
    })),
    tempoCurvePoints: profile.tempoCurve.points,
  };
}

export function getHumanTtsSummary(profile: HumanTtsProfile): string {
  const pauseCount = profile.silenceIntervals.length;
  const breathCount = profile.silenceIntervals.filter((i) => i.type === 'breath').length;
  const dramaticCount = profile.silenceIntervals.filter((i) => i.type === 'dramatic').length;
  const hookCount = profile.silenceIntervals.filter((i) => i.type === 'hook-transition').length;
  const tempoPoints = profile.tempoCurve.points.length;

  return [
    `무드: ${getMoodLabel(profile.mood)} | ${getMoodDescription(profile.mood)}`,
    `오디오 스펙: ${profile.fidelityLabel} | 컴프레서 + 이스너 + 디이서`,
    `휴지 구간: ${pauseCount}개 (호흡 ${breathCount}, 드라마틱 ${dramaticCount}, 훅 전환 ${hookCount}) — 총 ${profile.totalSilenceMs}ms`,
    `템포 커브: ${tempoPoints}개 제어점 (가속/감속 자동 적용)`,
  ].join('\n');
}
