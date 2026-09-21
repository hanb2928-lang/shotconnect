const SEED1 = 0xdeadbeef;
const SEED2 = 0x41c6ce57;

export function contentHash(input: string, sampleStep = 2048): string {
  let h1 = SEED1;
  let h2 = SEED2;
  const len = input.length;
  const step = Math.max(1, Math.floor(len / sampleStep));
  for (let i = 0; i < len; i += step) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function hashImage(base64: string): string {
  return contentHash(base64, 4096);
}

/**
 * Produces a deterministic hash for a multi-angle image set combined
 * with a content tone. The same set of images + tone always yields the
 * same hash, enabling cache hits when a user re-captures the same
 * product from the same angles with the same tone.
 *
 * Each image is hashed independently then the sorted per-image hashes
 * are joined with the tone and hashed again, so image ordering doesn't
 * affect the result.
 */
export function hashMultiAngle(
  images: string[],
  contentTone?: string,
): string {
  const perImage = images
    .map((img) => hashImage(img))
    .sort()
    .join(',');
  return contentHash(`${perImage}|tone:${contentTone ?? 'default'}`, 2048);
}

export function hashObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const val = obj[key];
    if (val === undefined || val === null) continue;
    parts.push(`${key}:${typeof val === 'object' ? JSON.stringify(val) : String(val)}`);
  }
  return contentHash(parts.join('|'), 2048);
}
