import { type ProsodyProfile, getProsodyAdjustedSpeed, buildProsodyInstructions, insertBreathMarkers, insertMicroPauses } from '@/lib/prosodyProfile';

export type EmotionPhase = 'attention' | 'interest' | 'desire' | 'conviction' | 'action';

export interface EmotionSegment {
  phase: EmotionPhase;
  startSec: number;
  endSec: number;
  speed: number;
  pitch: number;
  pauseSec: number;
  styleExaggeration: number;
  description: string;
  instructions: string;
}

export interface EmotionCurve {
  segments: EmotionSegment[];
  totalDurationSec: number;
  voiceCloningReady: boolean;
  prosodyProfileId: string;
}

export const EMOTION_PHASES: Record<EmotionPhase, Omit<EmotionSegment, 'startSec' | 'endSec' | 'instructions'>> = {
  attention: {
    phase: 'attention',
    speed: 1.15,
    pitch: 1.08,
    pauseSec: 0,
    styleExaggeration: 0.1,
    description: '어텐션 — 후킹 멘트, 호기심 자극을 위한 빠르고 높은 톤',
  },
  interest: {
    phase: 'interest',
    speed: 1.0,
    pitch: 1.02,
    pauseSec: 0.15,
    styleExaggeration: 0.05,
    description: '관심 — 문제 제기, 약간 느려지며 공감 형성',
  },
  desire: {
    phase: 'desire',
    speed: 0.95,
    pitch: 0.98,
    pauseSec: 0.25,
    styleExaggeration: 0.1,
    description: '욕구 — 제품 이점 어필, 진지하고 따뜻한 톤으로 신뢰 구축',
  },
  conviction: {
    phase: 'conviction',
    speed: 1.05,
    pitch: 1.0,
    pauseSec: 0.1,
    styleExaggeration: 0.15,
    description: '확신 — 사회적 증거, 또렷하고 설득력 있는 톤',
  },
  action: {
    phase: 'action',
    speed: 1.1,
    pitch: 1.03,
    pauseSec: 0,
    styleExaggeration: 0.2,
    description: '액션 — CTA, 강하고 명확한 마무리로 구매 유도',
  },
};

const PHASE_GUIDES: Record<EmotionPhase, string> = {
  attention: 'Start with a punchy, attention-grabbing hook. Speak slightly faster with a rising, curious pitch. Make the listener stop scrolling.',
  interest: 'Slow down slightly to explain the problem. Add a brief pause before key insights. Sound genuinely interested and empathetic.',
  desire: 'Shift to a warm, intimate tone to convey the product\'s benefits. Let your voice convey desire and aspiration. Pause meaningfully before revealing the key benefit.',
  conviction: 'Speak with clear, confident conviction. Cite evidence or social proof naturally. Increase style exaggeration to sound persuasive without being pushy.',
  action: 'End with a strong, clear call-to-action. Speak with urgency and conviction. Make the listener feel compelled to act now.',
};

export const PHASE_RATIOS: Record<EmotionPhase, number> = {
  attention: 0.15,
  interest: 0.25,
  desire: 0.3,
  conviction: 0.2,
  action: 0.1,
};

export function generateEmotionCurve(
  totalDurationSec: number,
  prosodyProfile?: ProsodyProfile,
): EmotionCurve {
  const phases: EmotionPhase[] = ['attention', 'interest', 'desire', 'conviction', 'action'];
  let acc = 0;
  const segments: EmotionSegment[] = phases.map((phase) => {
    const ratio = PHASE_RATIOS[phase];
    const start = acc;
    const end = Math.min(acc + totalDurationSec * ratio, totalDurationSec);
    acc = end;
    const base = EMOTION_PHASES[phase];
    const speed = prosodyProfile
      ? getProsodyAdjustedSpeed(prosodyProfile, base.speed)
      : base.speed;
    const instructions = prosodyProfile
      ? buildProsodyInstructions(prosodyProfile, {
          increaseEnergy: phase === 'attention' || phase === 'action',
          increaseWarmth: phase === 'desire',
          increaseClarity: phase === 'conviction',
        })
      : PHASE_GUIDES[phase];
    return {
      ...base,
      speed,
      instructions: `${PHASE_GUIDES[phase]}\n${instructions}`,
      startSec: start,
      endSec: end,
    };
  });

  return {
    segments,
    totalDurationSec,
    voiceCloningReady: !!prosodyProfile,
    prosodyProfileId: prosodyProfile?.id ?? 'default',
  };
}

export function getEmotionParamsAtTime(curve: EmotionCurve, timeSec: number): EmotionSegment | null {
  return curve.segments.find((s) => timeSec >= s.startSec && timeSec < s.endSec) ?? null;
}

export function buildTtsInstructionsForPhase(
  phase: EmotionPhase,
  baseInstructions?: string,
): string {
  const parts = [PHASE_GUIDES[phase]];
  if (baseInstructions) {
    parts.push(baseInstructions);
  }
  return parts.join('\n');
}

export interface TtsSegmentRequest {
  text: string;
  voice: string;
  speed: number;
  instructions: string;
  startSec: number;
  endSec: number;
}

export function splitTextForEmotionCurve(
  fullText: string,
  curve: EmotionCurve,
  voice: string,
  baseInstructions?: string,
  prosodyProfile?: ProsodyProfile,
): TtsSegmentRequest[] {
  const sentences = fullText.split(/(?<=[.!?。！？])\s+/).filter((s) => s.trim());
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1;

  // Adjust phase boundaries based on speed: faster phases consume text quicker,
  // so they need fewer characters per unit time.
  const speedAdjustedRatios = curve.segments.map((seg) => {
    const duration = seg.endSec - seg.startSec;
    const adjustedDuration = duration / seg.speed;
    return adjustedDuration;
  });
  const totalAdjusted = speedAdjustedRatios.reduce((sum, r) => sum + r, 0) || 1;

  return curve.segments.map((segment, idx) => {
    const adjustedRatio = speedAdjustedRatios[idx] / totalAdjusted;
    const startRatio = idx === 0 ? 0 :
      speedAdjustedRatios.slice(0, idx).reduce((s, r) => s + r, 0) / totalAdjusted;
    const endRatio = startRatio + adjustedRatio;
    const startChar = Math.floor(startRatio * totalChars);
    const endChar = Math.floor(endRatio * totalChars);

    const segmentSentences: string[] = [];
    let charCount = 0;
    for (const sentence of sentences) {
      if (charCount >= startChar && charCount < endChar) {
        segmentSentences.push(sentence);
      }
      charCount += sentence.length;
    }

    let segmentText = segmentSentences.join(' ') || fullText.slice(startChar, endChar);

    if (prosodyProfile) {
      segmentText = insertMicroPauses(segmentText, prosodyProfile.vector.microPauseFrequency, prosodyProfile.vector.microPauseDurationSec);
      segmentText = insertBreathMarkers(segmentText, prosodyProfile.vector.breathMarkerFrequency);
    }

    const instructions = baseInstructions
      ? `${segment.instructions}\n${baseInstructions}`
      : segment.instructions;

    return {
      text: segmentText,
      voice,
      speed: segment.speed,
      instructions,
      startSec: segment.startSec,
      endSec: segment.endSec,
    };
  });
}

export function enableVoiceCloning(curve: EmotionCurve): EmotionCurve {
  return { ...curve, voiceCloningReady: true };
}

export function getPhaseLabel(phase: EmotionPhase): string {
  const labels: Record<EmotionPhase, string> = {
    attention: '어텐션',
    interest: '관심',
    desire: '욕구',
    conviction: '확신',
    action: '액션',
  };
  return labels[phase];
}

export function getPhaseEmoji(phase: EmotionPhase): string {
  const emojis: Record<EmotionPhase, string> = {
    attention: '👀',
    interest: '🤔',
    desire: '✨',
    conviction: '💪',
    action: '🔥',
  };
  return emojis[phase];
}
