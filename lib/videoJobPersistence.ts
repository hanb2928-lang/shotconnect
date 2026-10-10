import { getItem, removeItem, setItem } from '@/lib/storage';

export const ACTIVE_VIDEO_JOB_KEY = 'active_video_job';

let saveGeneration = 0;
let clearGeneration = 0;

// A persisted job older than this is considered stale and will not be
// restored on app restart. The server-side video generation timeout is
// 10 minutes; 30 minutes gives ample buffer for slow renders, retries,
// and soft-fallback jobs without leaving a ghost job in the UI forever.
const STALE_JOB_MS = 30 * 60 * 1000;

export interface ActiveVideoJob {
  jobId: string;
  scanId: string | null;
  step: string;
  progress: number;
  startedAt: number;
  lastUpdated: number;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Validate that a parsed object has the shape of ActiveVideoJob with
// sensible field types. Prevents crashes from corrupted/partial JSON
// writes (e.g. the app was killed mid-setItem by the OOM killer).
function isValidActiveVideoJob(raw: unknown): raw is ActiveVideoJob {
  if (!isPlainObject(raw)) return false;
  if (typeof raw.jobId !== 'string' || raw.jobId.length === 0) return false;
  if (raw.scanId !== null && typeof raw.scanId !== 'string') return false;
  if (typeof raw.step !== 'string') return false;
  if (typeof raw.progress !== 'number' || !isFinite(raw.progress)) return false;
  if (typeof raw.startedAt !== 'number' || !isFinite(raw.startedAt)) return false;
  if (typeof raw.lastUpdated !== 'number' || !isFinite(raw.lastUpdated)) return false;
  return true;
}

export async function saveActiveVideoJob(jobId: string, step: string, scanId?: string | null): Promise<void> {
  // Don't save if a clear was issued after the caller decided to save
  // (e.g. rapid tap → startGeneration → abort → clearGeneration race).
  if (clearGeneration > saveGeneration) return;
  saveGeneration = clearGeneration;
  const now = Date.now();
  const data: ActiveVideoJob = {
    jobId,
    scanId: scanId ?? null,
    step,
    progress: 0,
    startedAt: now,
    lastUpdated: now,
  };
  await setItem(ACTIVE_VIDEO_JOB_KEY, JSON.stringify(data));
}

export async function updateActiveVideoJobStep(step: string, progress?: number): Promise<void> {
  if (clearGeneration > saveGeneration) return;
  const active = await getActiveVideoJob();
  if (!active) return;
  active.step = step;
  if (progress !== undefined && !isNaN(progress) && isFinite(progress)) {
    active.progress = Math.max(0, Math.min(1, progress));
  }
  active.lastUpdated = Date.now();
  await setItem(ACTIVE_VIDEO_JOB_KEY, JSON.stringify(active));
}

export async function clearActiveVideoJob(): Promise<void> {
  clearGeneration++;
  await setItem(ACTIVE_VIDEO_JOB_KEY, '');
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(ACTIVE_VIDEO_JOB_KEY);
    } catch {
      // ignore
    }
  }
}

// Returns the active job only if it is valid AND not stale. A job is
// stale if lastUpdated is older than STALE_JOB_MS. Stale jobs are
// silently cleared to prevent restoring a ghost generation state that
// would activate timers, wake locks, and UI spinners for a job the
// server has long since abandoned.
export async function getActiveVideoJob(): Promise<ActiveVideoJob | null> {
  const raw = await getItem(ACTIVE_VIDEO_JOB_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupted JSON — clear it so it doesn't cause repeated failures
    await clearActiveVideoJob();
    return null;
  }
  if (!isValidActiveVideoJob(parsed)) {
    await clearActiveVideoJob();
    return null;
  }
  // Staleness check: if the job hasn't been updated in 30 minutes, the
  // server has either completed it (the webhook already wrote the result
  // to scans.video_url) or failed it. Either way, restoring it would
  // trap the UI in a phantom generating state.
  const age = Date.now() - parsed.lastUpdated;
  if (age > STALE_JOB_MS) {
    await clearActiveVideoJob();
    return null;
  }
  return parsed;
}
