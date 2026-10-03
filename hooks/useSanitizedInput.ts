/**
 * Real-time input sanitization hook for IME typing.
 *
 * Mobile IME events (especially Korean composition and emoji picker)
 * can momentarily produce strings with dangling surrogate halves or
 * stray control characters. If these reach React state, they can cause
 * rendering glitches or cascade into downstream sanitization errors.
 *
 * This hook provides a lightweight onChange sanitizer that strips
 * problematic characters at the point of entry — before they enter
 * state. It uses a fast regex pre-filter rather than the full
 * sanitizeEncodedText scan, making it safe to run on every keystroke.
 *
 * The full sanitizeEncodedText pass should still be applied when the
 * text is consumed (blur, submit, or export) for complete safety.
 */

import { useState, useCallback, useRef, type ChangeEvent } from 'react';
import { sanitizeEncodedText } from '@/lib/textSanitizer';

// Fast regex: strips C0 control chars (except tab/newline/CR), DEL,
// C1 control chars (0x7F–0x9F), BOM (U+FEFF), and orphaned surrogate
// halves (D800–DFFF not part of a valid pair).
//
// This is intentionally simpler than sanitizeEncodedText — it runs
// on every keystroke so it must be O(n) with no allocations beyond
// the replaced string. The full surrogate-pair repair logic is
// deferred to the consume-time pass.
//
// Matching strategy:
// - [^\t\n\r\x20-\x7E\u00A0-\uFFFD\uD800-\uDFFF]  → keep printable + surrogates, drop everything else weird
// - Then separately check for orphaned surrogates via the callback

const CONTROL_CHARS =
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFEFF]/g;

// Orphaned high surrogate: D800-DBFF not followed by DC00-DFFF
const ORPHAN_HIGH_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g;

// Orphaned low surrogate: DC00-DFFF not preceded by D800-DBFF
const ORPHAN_LOW_SURROGATE = /(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Lightweight per-keystroke sanitization.
 * Strips control characters and replaces orphaned surrogates with
 * the Unicode replacement character (U+FFFD).
 *
 * This is NOT a substitute for sanitizeEncodedText at consume time —
 * it only catches the most common IME artifacts quickly.
 */
export function sanitizeInputLight(text: string): string {
  if (!text) return text;

  let result = text;

  // Fast path: skip regex if no problematic characters are present.
  // Check for control chars, surrogates, and BOM in one pass.
  let needsSanitizing = false;
  for (let i = 0; i < result.length; i++) {
    const code = result.charCodeAt(i);
    if (
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0xfeff ||
      (code >= 0xd800 && code <= 0xdfff)
    ) {
      needsSanitizing = true;
      break;
    }
  }

  if (!needsSanitizing) return result;

  result = result.replace(CONTROL_CHARS, '');
  result = result.replace(ORPHAN_HIGH_SURROGATE, '\uFFFD');
  result = result.replace(ORPHAN_LOW_SURROGATE, '\uFFFD');

  return result;
}

export interface UseSanitizedInputOptions {
  maxLength?: number;
  sanitizeOnBlur?: boolean;
}

export interface UseSanitizedInputResult {
  value: string;
  setValue: (text: string) => void;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  reset: () => void;
}

/**
 * Hook that provides a sanitized TextInput value and handlers.
 *
 * - onChange: runs the lightweight sanitizer (fast regex)
 * - onBlur: runs the full sanitizeEncodedText pass for complete safety
 * - maxLength: optional character limit applied at input time
 *
 * Usage:
 *   const input = useSanitizedInput('');
 *   <TextInput
 *     value={input.value}
 *     onChangeText={input.onChangeText}
 *     onBlur={input.onBlur}
 *   />
 */
export function useSanitizedInput(
  initialValue: string = '',
  options: UseSanitizedInputOptions = {},
): UseSanitizedInputResult {
  const { maxLength, sanitizeOnBlur = true } = options;
  const [value, setValueState] = useState(initialValue);
  const initialValueRef = useRef(initialValue);

  const setValue = useCallback(
    (text: string) => {
      const sanitized = sanitizeInputLight(text);
      const limited = maxLength ? sanitized.slice(0, maxLength) : sanitized;
      setValueState(limited);
    },
    [maxLength],
  );

  const onChangeText = useCallback(
    (text: string) => {
      setValue(text);
    },
    [setValue],
  );

  const onBlur = useCallback(() => {
    if (!sanitizeOnBlur) return;
    setValueState((prev) => {
      const fullySanitized = sanitizeEncodedText(prev);
      return maxLength ? fullySanitized.slice(0, maxLength) : fullySanitized;
    });
  }, [sanitizeOnBlur, maxLength]);

  const reset = useCallback(() => {
    setValueState(initialValueRef.current);
  }, []);

  return { value, setValue, onChangeText, onBlur, reset };
}
