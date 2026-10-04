import { isOnline } from '@/hooks/useNetworkStatus';

const MAX_CONSECUTIVE_FAILURES = 4;
const COOLDOWN_MS = 5_000;

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

/**
 * The circuit is "open" (blocking uploads) only when we have accumulated
 * enough consecutive failures to justify a cooldown. Network status is
 * checked separately by callers — isUploadCircuitOpen does NOT block on
 * 'unknown' status, because the network probe may not have completed yet
 * on a fresh launch and we must not block the first upload.
 */
export function isUploadCircuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

export function recordUploadSuccess(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

export function recordUploadFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    circuitOpenUntil = Date.now() + COOLDOWN_MS;
  }
}

export function resetUploadCircuit(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

/**
 * Wait until the circuit closes. Returns false if aborted or if the network
 * is definitively offline after waiting. Does NOT block on 'unknown' status.
 */
export async function waitForUploadCircuit(signal?: AbortSignal): Promise<boolean> {
  while (Date.now() < circuitOpenUntil) {
    if (signal?.aborted) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!isOnline()) {
    const deadline = Date.now() + 10_000;
    while (!isOnline() && Date.now() < deadline) {
      if (signal?.aborted) return false;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return isOnline();
  }
  return true;
}
