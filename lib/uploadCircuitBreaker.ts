import { isOnline } from '@/hooks/useNetworkStatus';

const MAX_CONSECUTIVE_FAILURES = 3;
const COOLDOWN_MS = 5_000;

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

export function isUploadCircuitOpen(): boolean {
  if (Date.now() < circuitOpenUntil) return true;
  if (!isOnline()) return true;
  return false;
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

export async function waitForUploadCircuit(signal?: AbortSignal): Promise<boolean> {
  while (isUploadCircuitOpen()) {
    if (signal?.aborted) return false;
    if (!isOnline()) {
      const deadline = Date.now() + 30_000;
      while (!isOnline() && Date.now() < deadline) {
        if (signal?.aborted) return false;
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!isOnline()) return false;
    } else {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return true;
}
