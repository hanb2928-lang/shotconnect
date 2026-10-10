/**
 * TTS Timestamp Snapper
 *
 * Two problems this module solves:
 *
 * 1. Text normalization — AI-generated or user-supplied narration text
 *    can contain empty syllables, consecutive punctuation, stray
 *    whitespace, or special characters that cause TTS engines to
 *    produce silence or skip content, throwing off audio-video sync.
 *
 * 2. Sync drift correction — after TTS segments are split across
 *    emotion phases, the estimated audio duration (based on character
 *    count and speech rate) may drift from the allocated timeline
 *    slot. When drift exceeds 50ms, the timestamp snapper adjusts
 *    segment boundaries to keep audio and video aligned.
 */

import { sanitizeEncodedText } from './textSanitizer';

/** Minimum syllable count for a segment to be viable for TTS. */
export const MIN_SYLLABLES = 2;

/** Maximum allowed sync drift in milliseconds before correction kicks in. */
export const SYNC_DRIFT_THRESHOLD_MS = 50;

/** Average Korean syllables per second at speed=1.0. */
const BASE_SYLLABLES_PER_SEC = 7.5;

/**
 * Normalize text for TTS consumption:
 *   - Strip orphaned surrogates and control characters
 *   - Collapse consecutive whitespace into single spaces
 *   - Merge empty syllables (consecutive punctuation with no text between)
 *   - Strip emoji and decorative symbols that TTS can't vocalize
 *   - Trim leading/trailing whitespace
 *   - Ensure sentences end with punctuation for clean splitting
 */
export function normalizeTtsText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = sanitizeEncodedText(raw);

  // Remove emoji and decorative symbols (U+1F000–U+1FAFF range + common symbols)
  text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '');

  // Collapse all whitespace runs to single space (do this before punctuation
  // merging so spaces between punctuation marks are normalized first)
  text = text.replace(/\s+/g, ' ');

  // Collapse consecutive identical punctuation (e.g. "!!!" → "!")
  text = text.replace(/([.!?。！？])\1+/g, '$1');

  // Merge empty syllables: punctuation with single space between them.
  // Run repeatedly to handle chains like ". ! ?" → ".!?"
  let prev: string;
  do {
    prev = text;
    text = text.replace(/([.!?。！？]) ([.!?。！？])/g, '$1$2');
  } while (text !== prev);

  // Remove space before punctuation at word boundaries (e.g. "좋아요 ." → "좋아요.")
  text = text.replace(/\s+([.!?。！？])/g, '$1');

  // Remove zero-width characters that TTS engines may interpret as content
  text = text.replace(/[\u200B-\u200F\uFEFF]/g, '');

  return text.trim();
}

/**
 * Estimate the number of syllables in a Korean/mixed text string.
 *
 * Korean: each Hangul character ≈ 1 syllable.
 * English: roughly 1 syllable per 3 characters (vowel-group heuristic).
 * Numbers: 1 syllable per digit group.
 */
export function estimateSyllables(text: string): number {
  if (!text) return 0;

  // Count Hangul syllables (가-힣, each = 1 syllable)
  const hangulMatches = text.match(/[\uAC00-\uD7AF]/g);
  const hangulSyllables = hangulMatches ? hangulMatches.length : 0;

  // Count English syllables via vowel-group heuristic
  const englishText = text.replace(/[\uAC00-\uD7AF]/g, ' ');
  const vowelGroups = englishText.match(/[aeiouAEIOU]+/g);
  const englishSyllables = vowelGroups ? vowelGroups.length : 0;

  // Count CJK characters (each ≈ 1 syllable)
  const cjkMatches = text.match(/[\u4E00-\u9FFF\u3040-\u30FF]/g);
  const cjkSyllables = cjkMatches ? cjkMatches.length : 0;

  // Numbers: ~1 syllable per 2 digits
  const numberMatches = text.match(/\d+/g);
  const numberSyllables = numberMatches
    ? numberMatches.reduce((sum, n) => sum + Math.ceil(n.length / 2), 0)
    : 0;

  return hangulSyllables + englishSyllables + cjkSyllables + numberSyllables;
}

/**
 * Estimate audio duration in milliseconds for a given text and speed.
 *
 * @param text - The text to be spoken
 * @param speed - TTS speed multiplier (1.0 = normal, 1.15 = 15% faster)
 * @returns Estimated duration in milliseconds
 */
export function estimateAudioDurationMs(text: string, speed: number): number {
  const syllables = estimateSyllables(text);
  if (syllables === 0) return 0;

  const syllablesPerSec = BASE_SYLLABLES_PER_SEC * (speed || 1);
  const durationSec = syllables / syllablesPerSec;
  return Math.round(durationSec * 1000);
}

export interface SnapResult {
  /** Adjusted start time in milliseconds */
  startMs: number;
  /** Adjusted end time in milliseconds */
  endMs: number;
  /** Original allocated duration in ms */
  allocatedMs: number;
  /** Estimated audio duration in ms */
  estimatedMs: number;
  /** Drift in ms (estimated - allocated). Positive = audio is longer. */
  driftMs: number;
  /** Whether correction was applied */
  corrected: boolean;
}

/**
 * Snap a segment's timestamps to match estimated audio duration.
 *
 * If the estimated audio duration drifts from the allocated timeline slot
 * by more than SYNC_DRIFT_THRESHOLD_MS, adjust the end time to match the
 * estimated duration. This prevents audio from bleeding into the next
 * segment's slot or leaving silence gaps.
 *
 * @param startMs - Original segment start in ms
 * @param endMs - Original segment end in ms
 * @param text - Text content for this segment
 * @param speed - TTS speed multiplier
 * @returns SnapResult with corrected timestamps and drift info
 */
export function snapSegmentTimestamp(
  startMs: number,
  endMs: number,
  text: string,
  speed: number,
): SnapResult {
  const allocatedMs = endMs - startMs;
  const estimatedMs = estimateAudioDurationMs(text, speed);
  const driftMs = estimatedMs - allocatedMs;
  const corrected = Math.abs(driftMs) > SYNC_DRIFT_THRESHOLD_MS;

  if (!corrected) {
    return { startMs, endMs, allocatedMs, estimatedMs, driftMs, corrected: false };
  }

  // Adjust end time to match estimated audio duration.
  // Clamp to prevent segments shorter than 100ms or extending past
  // a reasonable bound (2x allocated).
  const minEndMs = startMs + 100;
  const maxEndMs = startMs + Math.max(allocatedMs * 2, allocatedMs + 1000);
  const adjustedEndMs = Math.min(Math.max(startMs + estimatedMs, minEndMs), maxEndMs);

  return {
    startMs,
    endMs: adjustedEndMs,
    allocatedMs,
    estimatedMs,
    driftMs,
    corrected: true,
  };
}

export interface SegmentSnapResult {
  segments: Array<{
    text: string;
    startSec: number;
    endSec: number;
    speed: number;
    driftMs: number;
    corrected: boolean;
  }>;
  /** Total drift across all segments in ms */
  totalDriftMs: number;
  /** Number of segments that were corrected */
  correctedCount: number;
}

/**
 * Batch-snap timestamps for multiple TTS segments.
 *
 * Each segment is independently snapped, and consecutive segments
 * are kept contiguous (each start = previous end) to avoid gaps.
 */
export function snapSegmentBatch(
  segments: Array<{
    text: string;
    startSec: number;
    endSec: number;
    speed: number;
  }>,
): SegmentSnapResult {
  if (segments.length === 0) {
    return { segments: [], totalDriftMs: 0, correctedCount: 0 };
  }

  const snapped: SegmentSnapResult['segments'] = [];
  let totalDriftMs = 0;
  let correctedCount = 0;
  let cursorMs = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const originalStartMs = Math.round(seg.startSec * 1000);
    const originalEndMs = Math.round(seg.endSec * 1000);

    // Use the cursor (previous segment's snapped end) as the start
    const startMs = i === 0 ? originalStartMs : cursorMs;

    const snap = snapSegmentTimestamp(startMs, originalEndMs, seg.text, seg.speed);

    snapped.push({
      text: seg.text,
      startSec: snap.startMs / 1000,
      endSec: snap.endMs / 1000,
      speed: seg.speed,
      driftMs: snap.driftMs,
      corrected: snap.corrected,
    });

    totalDriftMs += Math.abs(snap.driftMs);
    if (snap.corrected) correctedCount++;
    cursorMs = snap.endMs;
  }

  return { segments: snapped, totalDriftMs, correctedCount };
}
