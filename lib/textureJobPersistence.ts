import { getItem, removeItem, setItem } from '@/lib/storage';

export const ACTIVE_TEXTURE_JOB_KEY = 'active_texture_job';

let saveGeneration = 0;
let clearGeneration = 0;

const STALE_JOB_MS = 30 * 60 * 1000;

export interface ActiveTextureJob {
  jobId: string;
  mode: string;
  progress: number;
  startedAt: number;
  lastUpdated: number;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidActiveTextureJob(raw: unknown): raw is ActiveTextureJob {
  if (!isPlainObject(raw)) return false;
  if (typeof raw.jobId !== 'string' || raw.jobId.length === 0) return false;
  if (typeof raw.mode !== 'string') return false;
  if (typeof raw.progress !== 'number' || !isFinite(raw.progress)) return false;
  if (typeof raw.startedAt !== 'number' || !isFinite(raw.startedAt)) return false;
  if (typeof raw.lastUpdated !== 'number' || !isFinite(raw.lastUpdated)) return false;
  return true;
}

export async function saveActiveTextureJob(
  jobId: string,
  mode: string,
): Promise<void> {
  if (clearGeneration > saveGeneration) return;
  saveGeneration = clearGeneration;
  const now = Date.now();
  const data: ActiveTextureJob = {
    jobId,
    mode,
    progress: 0,
    startedAt: now,
    lastUpdated: now,
  };
  await setItem(ACTIVE_TEXTURE_JOB_KEY, JSON.stringify(data));
}

export async function updateActiveTextureJobProgress(progress: number): Promise<void> {
  if (clearGeneration > saveGeneration) return;
  const active = await getActiveTextureJob();
  if (!active) return;
  active.progress = Math.max(0, Math.min(1, progress));
  active.lastUpdated = Date.now();
  await setItem(ACTIVE_TEXTURE_JOB_KEY, JSON.stringify(active));
}

export async function clearActiveTextureJob(): Promise<void> {
  clearGeneration++;
  await setItem(ACTIVE_TEXTURE_JOB_KEY, '');
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(ACTIVE_TEXTURE_JOB_KEY);
    } catch {
      // ignore
    }
  }
}

export async function getActiveTextureJob(): Promise<ActiveTextureJob | null> {
  const raw = await getItem(ACTIVE_TEXTURE_JOB_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await clearActiveTextureJob();
    return null;
  }
  if (!isValidActiveTextureJob(parsed)) {
    await clearActiveTextureJob();
    return null;
  }
  const age = Date.now() - parsed.lastUpdated;
  if (age > STALE_JOB_MS) {
    await clearActiveTextureJob();
    return null;
  }
  return parsed;
}
