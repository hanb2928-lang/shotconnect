/**
 * Human-like Creativity Engine
 *
 * Anti-shadowban system that mimics human creative irregularity:
 * 1. Dynamic Visual Variation — randomize zoom speed, text position, pixel noise
 * 2. Humanized Voice Tone — vary TTS speed/pitch, inject filler words
 * 3. Dynamic Caption Mutation — synonym spinning, structure variation
 * 4. Human Action Pacing — upload cooldown tracking + safety score
 */

// ─── 1. Dynamic Visual Variation ───────────────────────────────────────────

export interface VisualRandomizationParams {
  zoomSpeed: number;
  zoomDirection: 'in' | 'out';
  textYOffset: number;
  textXOffset: number;
  fontVariant: number;
  transitionDuration: number;
  hueShift: number;
  saturationShift: number;
  brightnessShift: number;
  noiseSeed: number;
}

const FONT_VARIANTS = 3;
const MAX_ZOOM_SPEED = 1.2;
const MIN_ZOOM_SPEED = 1.0;
const PIXEL_NOISE_RANGE = 0.5; // 0.5% max shift

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateVisualParams(): VisualRandomizationParams {
  return {
    zoomSpeed: randRange(MIN_ZOOM_SPEED, MAX_ZOOM_SPEED),
    zoomDirection: Math.random() > 0.5 ? 'in' : 'out',
    textYOffset: randInt(11) - 5, // ±5px
    textXOffset: randInt(11) - 5,
    fontVariant: randInt(FONT_VARIANTS),
    transitionDuration: randRange(300, 600),
    hueShift: randRange(-PIXEL_NOISE_RANGE, PIXEL_NOISE_RANGE),
    saturationShift: randRange(-PIXEL_NOISE_RANGE, PIXEL_NOISE_RANGE),
    brightnessShift: randRange(-PIXEL_NOISE_RANGE, PIXEL_NOISE_RANGE),
    noiseSeed: Math.random() * 10000,
  };
}

export function applyPixelNoiseToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: VisualRandomizationParams,
): void {
  if (Math.abs(params.hueShift) < 0.01) return;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const shift = params.hueShift / 100;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, data[i] + shift * 2));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + params.saturationShift));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + params.brightnessShift));
  }
  ctx.putImageData(imageData, 0, 0);
}

// ─── 2. Humanized Voice Tone ───────────────────────────────────────────────

export interface TtsVariationParams {
  speed: number;
  speedJitter: number;
  fillerWord: string | null;
  pauseMarker: string | null;
  bgmOffsetMs: number;
}

const FILLER_WORDS = ['진짜', '음', '완전', '어, 근데', '아, 이거'];
const FILLER_PROBABILITY = 0.15;

const PAUSE_MARKERS = ['...', '—', '…'];
const PAUSE_PROBABILITY = 0.2;

export function generateTtsVariation(baseSpeed: number): TtsVariationParams {
  const speedJitter = randRange(-0.08, 0.08);
  const adjustedSpeed = Math.max(0.5, Math.min(2.0, baseSpeed + speedJitter));

  return {
    speed: adjustedSpeed,
    speedJitter,
    fillerWord: Math.random() < FILLER_PROBABILITY ? pick(FILLER_WORDS) : null,
    pauseMarker: Math.random() < PAUSE_PROBABILITY ? pick(PAUSE_MARKERS) : null,
    bgmOffsetMs: Math.round(randRange(200, 500)),
  };
}

export function injectFillerWords(text: string, params: TtsVariationParams): string {
  if (!params.fillerWord && !params.pauseMarker) return text;

  let result = text;
  if (params.fillerWord) {
    // Insert filler at the beginning of the second sentence if possible
    const sentences = result.split('. ');
    if (sentences.length > 1) {
      sentences[1] = `${params.fillerWord}, ${sentences[1]}`;
      result = sentences.join('. ');
    } else {
      result = `${params.fillerWord}, ${result}`;
    }
  }

  if (params.pauseMarker) {
    // Insert a pause before the last sentence
    const sentences = result.split('. ');
    if (sentences.length > 1) {
      sentences[sentences.length - 1] = `${params.pauseMarker} ${sentences[sentences.length - 1]}`;
      result = sentences.join('. ');
    }
  }

  return result;
}

// ─── 3. Dynamic Caption Mutation ───────────────────────────────────────────

const SYNONYM_MAP: Record<string, string[]> = {
  '추천': ['추천', '강추', '따봉', '찐템'],
  '좋아요': ['좋아요', '개꿀', '핵꿀', '미쳤다'],
  '사야': ['사야', '구매해야', '장바구니에 넣어야', '결제해야'],
  '진짜': ['진짜', '찐으로', '솔직히', '근본적으로'],
  '대박': ['대박', '미쳤다', '재밌다', '핵심공유'],
  '할인': ['할인', '가성비', '착한 가격', '가격 완전'],
  '꿀템': ['꿀템', '인생템', '찐템', '숨은 명템'],
  '완전': ['완전', '진심으로', '제대로', '찐으로'],
};

const HOOK_PREFIXES = [
  '이거 알아요?',
  '아무도 안 알려주는',
  '솔직히 말하면',
  '이거 모르면 손해',
  '진짜 후기니까 믿으세요',
  '친구가 추천해줘서',
  '유튜브에서 보고 산 건데',
  '이거 왜 이제 알았지?',
];

const HOOK_SUFFIXES = [
  '#꿀템',
  '#내돈내산',
  '소름 돋는 가성비',
  '이 가격 실화?',
  '한번 쓰면 못 빠져나감',
  '재구매 100%',
  '이거 없으면 손해',
];

export interface CaptionVariation {
  hook: string;
  caption: string;
  hashtags: string[];
  variationSeed: number;
}

export function spinCaption(
  originalHook: string,
  originalCaption: string,
  originalHashtags: string[],
): CaptionVariation {
  const seed = Math.random();

  // Spin hook: 50% chance to add a random prefix or suffix
  let hook = originalHook;
  if (seed > 0.5) {
    hook = `${pick(HOOK_PREFIXES)} ${hook}`;
  } else if (seed > 0.3) {
    hook = `${hook} — ${pick(HOOK_SUFFIXES)}`;
  } else {
    hook = `${pick(HOOK_PREFIXES)} ${hook} ${pick(HOOK_SUFFIXES)}`;
  }

  // Spin caption: synonym replacement
  let caption = originalCaption;
  for (const [word, synonyms] of Object.entries(SYNONYM_MAP)) {
    const regex = new RegExp(word, 'g');
    const replacement = pick(synonyms);
    caption = caption.replace(regex, replacement);
  }

  // Vary sentence structure: 30% chance to split first sentence
  if (seed > 0.7 && caption.includes('. ')) {
    const parts = caption.split('. ');
    if (parts.length > 2) {
      // Move the second sentence to the front
      const second = parts.splice(1, 1)[0];
      caption = `${second}. ${parts.join('. ')}`;
    }
  }

  return {
    hook,
    caption,
    hashtags: originalHashtags,
    variationSeed: seed,
  };
}

export function generateCaptionVariations(
  hook: string,
  caption: string,
  hashtags: string[],
  count: number,
): CaptionVariation[] {
  const variations: CaptionVariation[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count * 2 && variations.length < count; i++) {
    const v = spinCaption(hook, caption, hashtags);
    const key = v.hook + v.caption.slice(0, 30);
    if (!seen.has(key)) {
      seen.add(key);
      variations.push(v);
    }
  }

  // Fill remaining slots if not enough unique variations
  while (variations.length < count) {
    variations.push(spinCaption(hook, caption, hashtags));
  }

  return variations;
}

// ─── Hashtag Mutation ──────────────────────────────────────────────────────

export function mutateHashtags(
  essentialTags: string[],
  poolTags: string[],
  targetCount: number,
): string[] {
  const result: string[] = [];
  const used = new Set<string>();

  // Always include essential tags first
  for (const tag of essentialTags) {
    if (result.length >= targetCount) break;
    const lower = tag.toLowerCase();
    if (!used.has(lower)) {
      result.push(tag);
      used.add(lower);
    }
  }

  // Shuffle pool tags and pick random ones
  const shuffled = [...poolTags].sort(() => Math.random() - 0.5);
  for (const tag of shuffled) {
    if (result.length >= targetCount) break;
    const lower = tag.toLowerCase();
    if (!used.has(lower)) {
      result.push(tag);
      used.add(lower);
    }
  }

  // Randomize order of non-essential tags (keep essentials at front)
  if (result.length > essentialTags.length) {
    const essential = result.slice(0, essentialTags.length);
    const rest = result.slice(essentialTags.length);
    // Shuffle the rest
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [...essential, ...rest];
  }

  return result;
}

// ─── 4. Human Action Pacing ────────────────────────────────────────────────

export interface UploadRecord {
  platform: string;
  timestamp: number;
}

export interface SafetyAssessment {
  level: 'safe' | 'caution' | 'danger';
  score: number;
  minutesSinceLastUpload: number | null;
  recommendedWaitMinutes: number;
  message: string;
}

const COOLDOWN_MINUTES = 90; // 1.5 hours
const DANGER_THRESHOLD_MINUTES = 30;
const CAUTION_THRESHOLD_MINUTES = 60;

export function assessUploadSafety(
  platform: string,
  records: UploadRecord[],
): SafetyAssessment {
  const platformRecords = records
    .filter((r) => r.platform === platform)
    .sort((a, b) => b.timestamp - a.timestamp);

  const lastUpload = platformRecords[0];
  const now = Date.now();

  if (!lastUpload) {
    return {
      level: 'safe',
      score: 100,
      minutesSinceLastUpload: null,
      recommendedWaitMinutes: 0,
      message: '첫 업로드입니다. 안전하게 발행할 수 있어요.',
    };
  }

  const minutesSince = Math.floor((now - lastUpload.timestamp) / 60000);

  if (minutesSince < DANGER_THRESHOLD_MINUTES) {
    return {
      level: 'danger',
      score: Math.round((minutesSince / DANGER_THRESHOLD_MINUTES) * 30),
      minutesSinceLastUpload: minutesSince,
      recommendedWaitMinutes: COOLDOWN_MINUTES - minutesSince,
      message: `위험! 마지막 업로드부터 ${minutesSince}분 지났어요. ${COOLDOWN_MINUTES - minutesSince}분 후에 발행하세요.`,
    };
  }

  if (minutesSince < CAUTION_THRESHOLD_MINUTES) {
    return {
      level: 'caution',
      score: Math.round(30 + ((minutesSince - DANGER_THRESHOLD_MINUTES) / (CAUTION_THRESHOLD_MINUTES - DANGER_THRESHOLD_MINUTES)) * 50),
      minutesSinceLastUpload: minutesSince,
      recommendedWaitMinutes: COOLDOWN_MINUTES - minutesSince,
      message: `주의! ${minutesSince}분 전에 업로드했어요. ${COOLDOWN_MINUTES - minutesSince}분 더 기다리는 것을 추천해요.`,
    };
  }

  if (minutesSince < COOLDOWN_MINUTES) {
    return {
      level: 'caution',
      score: Math.round(80 + ((minutesSince - CAUTION_THRESHOLD_MINUTES) / (COOLDOWN_MINUTES - CAUTION_THRESHOLD_MINUTES)) * 20),
      minutesSinceLastUpload: minutesSince,
      recommendedWaitMinutes: COOLDOWN_MINUTES - minutesSince,
      message: `거의 안전! ${minutesSince}분 경과. ${COOLDOWN_MINUTES - minutesSince}분 후 완벽히 안전해져요.`,
    };
  }

  return {
    level: 'safe',
    score: 100,
    minutesSinceLastUpload: minutesSince,
    recommendedWaitMinutes: 0,
    message: '안전! 충분한 시간이 경과했어요. 발행해도 좋아요.',
  };
}

export function recordUpload(
  platform: string,
  records: UploadRecord[],
): UploadRecord[] {
  const newRecord: UploadRecord = { platform, timestamp: Date.now() };
  // Keep only last 20 records to avoid unlimited growth
  return [...records, newRecord].slice(-20);
}

// ─── Combined Safety Score ─────────────────────────────────────────────────

export interface OverallSafetyScore {
  visualRandomization: number;
  captionVariation: number;
  voiceVariation: number;
  uploadPacing: number;
  overall: number;
  recommendations: string[];
}

export function calculateOverallSafety(
  visualParamsUsed: boolean,
  captionSpun: boolean,
  voiceVaried: boolean,
  uploadAssessment: SafetyAssessment,
): OverallSafetyScore {
  const visualScore = visualParamsUsed ? 100 : 30;
  const captionScore = captionSpun ? 100 : 40;
  const voiceScore = voiceVaried ? 100 : 50;
  const pacingScore = uploadAssessment.score;

  const overall = Math.round(
    visualScore * 0.25 + captionScore * 0.3 + voiceScore * 0.2 + pacingScore * 0.25,
  );

  const recommendations: string[] = [];
  if (!visualParamsUsed) recommendations.push('영상 생성 시 시각적 무작위화를 적용하세요');
  if (!captionSpun) recommendations.push('캡션 스핀으로 문구를 다변화하세요');
  if (!voiceVaried) recommendations.push('TTS 억양 가변화를 적용하세요');
  if (uploadAssessment.level !== 'safe') recommendations.push(uploadAssessment.message);

  return {
    visualRandomization: visualScore,
    captionVariation: captionScore,
    voiceVariation: voiceScore,
    uploadPacing: pacingScore,
    overall,
    recommendations,
  };
}
