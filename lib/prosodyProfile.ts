/**
 * Prosody Profile System
 *
 * Captures a speaker's vocal characteristics as a structured vector.
 * Instead of ML-based voice cloning (which requires GPU clusters),
 * this system uses OpenAI TTS `instructions` parameter to encode
 * prosody features: speech rate, stress pattern, intonation contour,
 * micro-pause distribution, and breath frequency.
 *
 * Each prosody preset maps 1:1 to a premium voice actor profile
 * defined in ttsVoices.ts (F1~F6, M1~M6).
 */

export interface ProsodyVector {
  baseSpeed: number;
  speedVariation: number;
  stressIntensity: number;
  intonationRange: number;
  microPauseFrequency: number;
  microPauseDurationSec: number;
  breathMarkerFrequency: number;
  warmth: number;
  clarity: number;
}

export interface ProsodyProfile {
  id: string;
  label: string;
  vector: ProsodyVector;
  baseInstructions: string;
}

const PROSODY_PRESETS: Record<string, ProsodyProfile> = {
  // ── 여성 (F1~F6) ────────────────────────────────────────────────────
  trendy_beauty: {
    id: 'trendy_beauty',
    label: '트렌디 뷰티',
    vector: {
      baseSpeed: 1.12,
      speedVariation: 0.14,
      stressIntensity: 0.65,
      intonationRange: 0.7,
      microPauseFrequency: 0.2,
      microPauseDurationSec: 0.12,
      breathMarkerFrequency: 0.12,
      warmth: 0.5,
      clarity: 0.8,
    },
    baseInstructions: 'Speak with bright, chic energy. Vary pace dynamically — faster for exciting visual reveals, slower for key benefits. Add natural emphasis on product names and aesthetic details.',
  },
  professional_female: {
    id: 'professional_female',
    label: '신뢰의 프로',
    vector: {
      baseSpeed: 0.95,
      speedVariation: 0.06,
      stressIntensity: 0.4,
      intonationRange: 0.3,
      microPauseFrequency: 0.4,
      microPauseDurationSec: 0.2,
      breathMarkerFrequency: 0.18,
      warmth: 0.55,
      clarity: 0.9,
    },
    baseInstructions: 'Speak in a calm, measured, professional tone. Pause deliberately between key points. Let each sentence land with credibility. Convey expertise and evidence-based reasoning.',
  },
  emotional_female: {
    id: 'emotional_female',
    label: '감성 에세이',
    vector: {
      baseSpeed: 0.88,
      speedVariation: 0.08,
      stressIntensity: 0.35,
      intonationRange: 0.4,
      microPauseFrequency: 0.5,
      microPauseDurationSec: 0.3,
      breathMarkerFrequency: 0.28,
      warmth: 0.9,
      clarity: 0.75,
    },
    baseInstructions: 'Speak with warm, lingering emotional depth. Use slow, meaningful pacing with generous pauses. Let your voice convey genuine feeling — as if telling a personal story. Add subtle breathiness for intimacy.',
  },
  high_energy_tips: {
    id: 'high_energy_tips',
    label: '하이텐션 꿀팁',
    vector: {
      baseSpeed: 1.22,
      speedVariation: 0.16,
      stressIntensity: 0.8,
      intonationRange: 0.75,
      microPauseFrequency: 0.15,
      microPauseDurationSec: 0.08,
      breathMarkerFrequency: 0.08,
      warmth: 0.4,
      clarity: 0.75,
    },
    baseInstructions: 'Speak in a rapid-fire, bouncy, high-energy tone. Deliver information at speed while keeping every word clear. Add excitement and punchy emphasis on deals, discounts, and key tips.',
  },
  chic_smart: {
    id: 'chic_smart',
    label: '지적인 커리어우먼',
    vector: {
      baseSpeed: 1.0,
      speedVariation: 0.07,
      stressIntensity: 0.55,
      intonationRange: 0.35,
      microPauseFrequency: 0.3,
      microPauseDurationSec: 0.15,
      breathMarkerFrequency: 0.15,
      warmth: 0.45,
      clarity: 0.95,
    },
    baseInstructions: 'Speak with crisp, confident articulation. Enunciate every syllable precisely. Convey authority and sophistication. Sound like a polished professional who knows what she is talking about.',
  },
  friendly_casual_female: {
    id: 'friendly_casual_female',
    label: '친근한 동네언니',
    vector: {
      baseSpeed: 1.05,
      speedVariation: 0.1,
      stressIntensity: 0.45,
      intonationRange: 0.5,
      microPauseFrequency: 0.35,
      microPauseDurationSec: 0.18,
      breathMarkerFrequency: 0.22,
      warmth: 0.8,
      clarity: 0.7,
    },
    baseInstructions: 'Speak casually and warmly, like chatting with a friend. Use natural conversational pacing with relaxed breathing. Sound genuine, relatable, and honest — like a real person giving honest advice.',
  },

  // ── 남성 (M1~M6) ────────────────────────────────────────────────────
  authoritative_male: {
    id: 'authoritative_male',
    label: '신뢰감 있는 전문가',
    vector: {
      baseSpeed: 0.92,
      speedVariation: 0.05,
      stressIntensity: 0.5,
      intonationRange: 0.25,
      microPauseFrequency: 0.4,
      microPauseDurationSec: 0.25,
      breathMarkerFrequency: 0.18,
      warmth: 0.4,
      clarity: 0.9,
    },
    baseInstructions: 'Speak in a deep, weighted, authoritative tone. Convey gravitas and expertise. Each sentence should land with weight and credibility. Pause meaningfully between key analytical points.',
  },
  trendy_hype: {
    id: 'trendy_hype',
    label: '트렌디 숏폼 호스트',
    vector: {
      baseSpeed: 1.18,
      speedVariation: 0.15,
      stressIntensity: 0.78,
      intonationRange: 0.72,
      microPauseFrequency: 0.18,
      microPauseDurationSec: 0.1,
      breathMarkerFrequency: 0.1,
      warmth: 0.35,
      clarity: 0.7,
    },
    baseInstructions: 'Speak with high-energy, hip, catchy delivery. Use punchy emphasis and dramatic pauses for hooks. Make every line stick in the ear. Sound like you belong on the For You Page.',
  },
  calm_documentarian: {
    id: 'calm_documentarian',
    label: '차분한 내레이터',
    vector: {
      baseSpeed: 0.85,
      speedVariation: 0.04,
      stressIntensity: 0.3,
      intonationRange: 0.2,
      microPauseFrequency: 0.5,
      microPauseDurationSec: 0.35,
      breathMarkerFrequency: 0.25,
      warmth: 0.6,
      clarity: 0.85,
    },
    baseInstructions: 'Speak in a deep, calm, documentary-narrator tone with long stable breaths. Pace is slow and deliberate. Convey premium quality and brand philosophy through measured, resonant delivery.',
  },
  analytical_tech: {
    id: 'analytical_tech',
    label: '팩트체크 리뷰어',
    vector: {
      baseSpeed: 1.0,
      speedVariation: 0.06,
      stressIntensity: 0.5,
      intonationRange: 0.3,
      microPauseFrequency: 0.35,
      microPauseDurationSec: 0.18,
      breathMarkerFrequency: 0.15,
      warmth: 0.3,
      clarity: 0.95,
    },
    baseInstructions: 'Speak in a clean, precise, analytical tone. Cut the fluff — deliver specs and features with surgical clarity. Use measured pacing on numbers and comparisons. Sound objective and data-driven.',
  },
  witty_casual: {
    id: 'witty_casual',
    label: '유쾌한 스마트보이',
    vector: {
      baseSpeed: 1.1,
      speedVariation: 0.12,
      stressIntensity: 0.7,
      intonationRange: 0.68,
      microPauseFrequency: 0.3,
      microPauseDurationSec: 0.15,
      breathMarkerFrequency: 0.18,
      warmth: 0.55,
      clarity: 0.75,
    },
    baseInstructions: 'Speak in a witty, playful, casually humorous tone. Use dramatic comedic pauses before punchlines. Sound like you are genuinely having fun talking about this product.',
  },
  energetic_leader: {
    id: 'energetic_leader',
    label: '다부진 리더',
    vector: {
      baseSpeed: 1.08,
      speedVariation: 0.1,
      stressIntensity: 0.75,
      intonationRange: 0.5,
      microPauseFrequency: 0.25,
      microPauseDurationSec: 0.12,
      breathMarkerFrequency: 0.12,
      warmth: 0.45,
      clarity: 0.85,
    },
    baseInstructions: 'Speak in a strong, motivational, confident tone like a fitness coach. Use powerful delivery with strong conviction. Inspire action and convey that this product will change your life.',
  },

  // ── Legacy presets (kept for backward compatibility) ─────────────────
  energetic_reviewer: {
    id: 'energetic_reviewer',
    label: '에너제틱 리뷰어',
    vector: {
      baseSpeed: 1.1,
      speedVariation: 0.12,
      stressIntensity: 0.7,
      intonationRange: 0.6,
      microPauseFrequency: 0.3,
      microPauseDurationSec: 0.15,
      breathMarkerFrequency: 0.15,
      warmth: 0.5,
      clarity: 0.8,
    },
    baseInstructions: 'Speak with high energy and enthusiasm. Vary your pace dynamically — faster for exciting features, slower for key benefits. Add natural emphasis on product names and price points.',
  },
  trustworthy_narrator: {
    id: 'trustworthy_narrator',
    label: '신뢰감 내레이터',
    vector: {
      baseSpeed: 0.92,
      speedVariation: 0.06,
      stressIntensity: 0.4,
      intonationRange: 0.3,
      microPauseFrequency: 0.45,
      microPauseDurationSec: 0.25,
      breathMarkerFrequency: 0.2,
      warmth: 0.7,
      clarity: 0.9,
    },
    baseInstructions: 'Speak in a calm, measured, trustworthy tone. Pause deliberately between key points. Let each sentence land before moving to the next. Convey sincerity and expertise.',
  },
  viral_comedian: {
    id: 'viral_comedian',
    label: '바이럴 코미디',
    vector: {
      baseSpeed: 1.18,
      speedVariation: 0.18,
      stressIntensity: 0.85,
      intonationRange: 0.8,
      microPauseFrequency: 0.25,
      microPauseDurationSec: 0.1,
      breathMarkerFrequency: 0.1,
      warmth: 0.3,
      clarity: 0.6,
    },
    baseInstructions: 'Speak with exaggerated, over-the-top energy. Use dramatic emphasis and sudden pace changes. Make it feel like a viral short-form comedy — punchy, fun, and attention-grabbing.',
  },
  intimate_whisper: {
    id: 'intimate_whisper',
    label: '친밀한 속삭임',
    vector: {
      baseSpeed: 0.95,
      speedVariation: 0.08,
      stressIntensity: 0.3,
      intonationRange: 0.25,
      microPauseFrequency: 0.5,
      microPauseDurationSec: 0.3,
      breathMarkerFrequency: 0.3,
      warmth: 0.9,
      clarity: 0.7,
    },
    baseInstructions: 'Speak softly and intimately, as if sharing a secret with a close friend. Use warm, breathy tones. Pause frequently to create anticipation and closeness.',
  },
};

export function getProsodyProfile(id: string): ProsodyProfile {
  return PROSODY_PRESETS[id] ?? PROSODY_PRESETS.trendy_beauty;
}

export function getAllProsodyProfiles(): ProsodyProfile[] {
  return Object.values(PROSODY_PRESETS);
}

export function getPremiumProsodyProfiles(): ProsodyProfile[] {
  const premiumIds = [
    'trendy_beauty', 'professional_female', 'emotional_female',
    'high_energy_tips', 'chic_smart', 'friendly_casual_female',
    'authoritative_male', 'trendy_hype', 'calm_documentarian',
    'analytical_tech', 'witty_casual', 'energetic_leader',
  ];
  return premiumIds.map((id) => PROSODY_PRESETS[id]).filter(Boolean);
}

export function mapVoiceKeyToProsody(voiceKey: string): ProsodyProfile {
  const voiceToProsodyMap: Record<string, string> = {
    'f1_trendy_beauty': 'trendy_beauty',
    'f2_professional': 'professional_female',
    'f3_emotional': 'emotional_female',
    'f4_high_energy': 'high_energy_tips',
    'f5_chic_smart': 'chic_smart',
    'f6_friendly_casual': 'friendly_casual_female',
    'm1_authoritative': 'authoritative_male',
    'm2_trendy_hype': 'trendy_hype',
    'm3_calm_documentarian': 'calm_documentarian',
    'm4_analytical_tech': 'analytical_tech',
    'm5_witty_casual': 'witty_casual',
    'm6_energetic_leader': 'energetic_leader',
  };

  const prosodyId = voiceToProsodyMap[voiceKey];
  if (prosodyId) return PROSODY_PRESETS[prosodyId];

  if (voiceKey.startsWith('viral')) return PROSODY_PRESETS.viral_comedian;
  if (voiceKey.startsWith('narration')) return PROSODY_PRESETS.trustworthy_narrator;
  if (voiceKey.includes('whisper') || voiceKey.includes('intimate')) return PROSODY_PRESETS.intimate_whisper;

  return PROSODY_PRESETS.trendy_beauty;
}

export function applySpeedJitter(baseSpeed: number, variation: number): number {
  const jitter = (Math.random() - 0.5) * 2 * variation;
  return Math.min(Math.max(baseSpeed + jitter, 0.5), 2.0);
}

export function buildProsodyInstructions(
  profile: ProsodyProfile,
  contextModifiers?: {
    increaseWarmth?: boolean;
    increaseClarity?: boolean;
    increaseEnergy?: boolean;
  },
): string {
  const v = profile.vector;
  const parts: string[] = [profile.baseInstructions];

  if (contextModifiers?.increaseWarmth || v.warmth >= 0.8) {
    parts.push('Add extra warmth and breathiness to your voice.');
  }
  if (contextModifiers?.increaseClarity || v.clarity >= 0.85) {
    parts.push('Enunciate each word with crisp clarity.');
  }
  if (contextModifiers?.increaseEnergy || (v.stressIntensity >= 0.7 && v.baseSpeed >= 1.1)) {
    parts.push('Inject bursts of energy on key phrases.');
  }
  if (v.microPauseFrequency >= 0.4) {
    parts.push('Insert natural micro-pauses between clauses to mimic thoughtful speech.');
  }

  return parts.join(' ');
}

export function getProsodyAdjustedSpeed(
  profile: ProsodyProfile,
  phaseSpeed: number,
): number {
  const blended = profile.vector.baseSpeed * 0.3 + phaseSpeed * 0.7;
  return applySpeedJitter(blended, profile.vector.speedVariation);
}

export function insertBreathMarkers(text: string, frequency: number): string {
  if (frequency <= 0) return text;
  const sentences = text.split(/(?<=[.!?。！？])\s+/);
  const result: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    result.push(sentences[i]);
    if (i < sentences.length - 1 && Math.random() < frequency) {
      result.push('... ');
    }
  }
  return result.join(' ');
}

export function insertMicroPauses(text: string, frequency: number, durationSec: number): string {
  if (frequency <= 0) return text;
  const clauses = text.split(/,\s*/);
  if (clauses.length <= 1) return text;
  const marker = ` <silence:${Math.round(durationSec * 1000)}ms> `;
  const result: string[] = [];
  for (let i = 0; i < clauses.length; i++) {
    result.push(clauses[i]);
    if (i < clauses.length - 1) {
      if (Math.random() < frequency) {
        result.push(marker);
      } else {
        result.push(', ');
      }
    }
  }
  return result.join('');
}
