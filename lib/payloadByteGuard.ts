/**
 * Payload byte guard for external API transmission.
 *
 * Database storage uses character-count limits (safeTruncate), but external
 * platforms enforce byte-level limits on URL-encoded payloads and JSON
 * bodies. A Korean character takes 3 UTF-8 bytes; an emoji takes 4. A
 * 280-character tweet with Korean text can exceed Twitter's byte budget
 * even though the character count is fine.
 *
 * This module provides UTF-8 byte-safe truncation that never splits a
 * multi-byte character, plus per-platform byte limits for outgoing
 * payloads.
 */

import type { UploadPlatformKey } from '@/lib/platformUpload';

export interface PlatformByteLimit {
  titleMaxBytes: number;
  bodyMaxBytes: number;
  fullTextMaxBytes: number;
  commentMaxBytes: number;
}

/**
 * Per-platform UTF-8 byte limits for outgoing payloads.
 * These are intentionally conservative — they account for URL encoding
 * expansion (Korean characters become 9 bytes when percent-encoded)
 * and JSON serialization overhead.
 */
const PLATFORM_BYTE_LIMITS: Record<UploadPlatformKey, PlatformByteLimit> = {
  instagram: {
    titleMaxBytes: 375,
    bodyMaxBytes: 6600,
    fullTextMaxBytes: 6600,
    commentMaxBytes: 3000,
  },
  blog: {
    titleMaxBytes: 300,
    bodyMaxBytes: 65535,
    fullTextMaxBytes: 65535,
    commentMaxBytes: 3000,
  },
  tiktok: {
    titleMaxBytes: 300,
    bodyMaxBytes: 1200,
    fullTextMaxBytes: 1200,
    commentMaxBytes: 1500,
  },
  youtube: {
    titleMaxBytes: 300,
    bodyMaxBytes: 1500,
    fullTextMaxBytes: 1500,
    commentMaxBytes: 1500,
  },
  twitter: {
    titleMaxBytes: 840,
    bodyMaxBytes: 840,
    fullTextMaxBytes: 840,
    commentMaxBytes: 840,
  },
  pinterest: {
    titleMaxBytes: 300,
    bodyMaxBytes: 1500,
    fullTextMaxBytes: 1500,
    commentMaxBytes: 1500,
  },
  naver_clip: {
    titleMaxBytes: 300,
    bodyMaxBytes: 3000,
    fullTextMaxBytes: 3000,
    commentMaxBytes: 1500,
  },
};

export function getPlatformByteLimit(key: UploadPlatformKey): PlatformByteLimit {
  return PLATFORM_BYTE_LIMITS[key];
}

/**
 * Truncate a string so its UTF-8 byte representation does not exceed
 * maxBytes. Truncation happens at a character boundary — multi-byte
 * characters are never split.
 *
 * Uses TextEncoder when available (web/native), falls back to a
 * manual UTF-8 byte counter for environments without it.
 */
export function truncateToUtf8Bytes(text: string, maxBytes: number): string {
  if (!text) return '';
  if (maxBytes <= 0) return '';

  const bytes = utf8ByteLength(text);
  if (bytes <= maxBytes) return text;

  // Binary search for the longest substring that fits within maxBytes.
  // This is O(log n) encodings rather than O(n) incremental encodings.
  let lo = 0;
  let hi = text.length;
  let best = 0;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const candidateBytes = utf8ByteLength(text.slice(0, mid));
    if (candidateBytes <= maxBytes) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // Ensure we don't end on a high surrogate (orphaned half of a 4-byte emoji).
  let result = text.slice(0, best);
  const lastCode = result.charCodeAt(result.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    result = result.slice(0, result.length - 1);
  }

  return result;
}

/**
 * Count the UTF-8 byte length of a string without allocating a buffer.
 * Falls back to TextEncoder.encode().byteLength when available.
 */
export function utf8ByteLength(text: string): number {
  if (!text) return 0;

  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }

  // Manual UTF-8 byte counter for environments without TextEncoder.
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate — counts as 4 bytes (with its low surrogate partner).
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Apply byte-level truncation to all fields of a built caption
 * before it is serialized for HTTP transmission.
 *
 * This is the final guard — it runs after character-level truncation
 * and sanitization, ensuring the payload fits within the platform's
 * byte budget even after URL encoding expansion.
 */
export interface ByteSafeCaption {
  title: string;
  body: string;
  fullText: string;
  commentText: string;
}

export function applyByteGuard(
  key: UploadPlatformKey,
  caption: {
    title: string;
    body: string;
    fullText: string;
    commentText: string;
  },
): ByteSafeCaption {
  const limits = getPlatformByteLimit(key);
  return {
    title: truncateToUtf8Bytes(caption.title, limits.titleMaxBytes),
    body: truncateToUtf8Bytes(caption.body, limits.bodyMaxBytes),
    fullText: truncateToUtf8Bytes(caption.fullText, limits.fullTextMaxBytes),
    commentText: truncateToUtf8Bytes(caption.commentText, limits.commentMaxBytes),
  };
}

/**
 * Guard an arbitrary string payload field before HTTP transmission.
 * Use for affiliate link descriptions, social post bodies, or any
 * text that will be URL-encoded or JSON-serialized for an external API.
 */
export function guardPayloadBytes(
  text: string,
  maxBytes: number,
): string {
  return truncateToUtf8Bytes(text, maxBytes);
}
