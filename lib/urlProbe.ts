const AUDIO_PROBE_MAX_RETRIES = 3;
const AUDIO_PROBE_BASE_DELAY_MS = 1000;

/**
 * Verify that a URL is actually reachable via HTTP before attempting
 * to use it in a media element. Returns true if the server responds
 * with a 2xx or 3xx status. Retries with backoff because TTS files
 * may still be uploading to storage when the URL is first set.
 */
export async function probeUrlAccessible(
  url: string,
  maxRetries: number = AUDIO_PROBE_MAX_RETRIES,
): Promise<boolean> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (resp.ok || (resp.status >= 300 && resp.status < 400)) {
        return true;
      }
    } catch {
      // Network error or abort — will retry
    }
    if (attempt < maxRetries) {
      const delay = AUDIO_PROBE_BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return false;
}
