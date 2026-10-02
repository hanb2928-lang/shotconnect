/**
 * Text encoding guard for AI-generated content.
 *
 * AI models occasionally produce strings with malformed Unicode —
 * orphaned surrogate halves, truncated 4-byte emoji (surrogate pairs
 * split mid-character), or stray BOM / control characters. When these
 * strings are stored in the database or rendered to canvas/WebView,
 * they cause mojibake, crashes, or silent data corruption.
 *
 * This module provides a single `sanitizeEncodedText` function that
 * should be applied to every AI-generated text field before it reaches
 * the database or the rendering pipeline.
 */

/**
 * Remove orphaned surrogate halves and fix truncated surrogate pairs.
 *
 * - Paired surrogates (complete 4-byte emoji) are preserved.
 * - Lone high surrogates (D800–DBFF without a following low surrogate)
 *   are replaced with the Unicode replacement character.
 * - Lone low surrogates (DC00–DFFF without a preceding high surrogate)
 *   are replaced with the Unicode replacement character.
 * - Stray BOM (U+FEFF) and most C0 control characters are removed.
 * - Zero-width joiners (U+200D) used in emoji sequences are preserved.
 */
export function sanitizeEncodedText(text: string): string {
  if (!text || typeof text !== 'string') return text;

  // Fast path: if every code unit is a valid BMP or properly paired
  // surrogate, skip the slow scan.
  if (!hasSurrogateOrControlIssues(text)) return text;

  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    // High surrogate (D800–DBFF): must be followed by a low surrogate
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        // Valid surrogate pair — keep both units
        result += text[i] + text[i + 1];
        i++; // skip the low surrogate
      } else {
        // Orphaned high surrogate — replace
        result += '\uFFFD';
      }
      continue;
    }

    // Low surrogate (DC00–DFFF): must be preceded by a high surrogate.
    // If we reach here, the preceding high surrogate was already
    // consumed (or didn't exist), so this is orphaned.
    if (code >= 0xdc00 && code <= 0xdfff) {
      result += '\uFFFD';
      continue;
    }

    // Remove BOM and problematic control characters except
    // tab (0x09), newline (0x0A), carriage return (0x0D),
    // and zero-width joiner (0x200D, used in emoji sequences).
    if (code === 0xfeff) continue;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    if (code >= 0x7f && code <= 0x9f) continue;

    result += text[i];
  }

  return result;
}

/**
 * Quick check whether a string contains surrogate or control issues.
 * Returns false for clean strings so the slow scan can be skipped.
 */
function hasSurrogateOrControlIssues(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) return true;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      const prev = i > 0 ? text.charCodeAt(i - 1) : 0;
      if (prev < 0xd800 || prev > 0xdbff) return true;
    }

    if (code === 0xfeff) return true;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return true;
    if (code >= 0x7f && code <= 0x9f) return true;
  }
  return false;
}

/**
 * Sanitize all string values in a plain object (one level deep).
 * Useful for sanitizing an entire AI response before it reaches the DB.
 */
export function sanitizeTextFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
): T {
  const result = { ...obj };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'string') {
      result[field] = sanitizeEncodedText(value) as T[keyof T];
    }
  }
  return result;
}

/**
 * Sanitize all string values in a plain object recursively.
 * Walks arrays and nested objects, sanitizing every string leaf.
 */
export function sanitizeTextDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeEncodedText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeTextDeep) as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      result[key] = sanitizeTextDeep((value as Record<string, unknown>)[key]);
    }
    return result as T;
  }
  return value;
}
