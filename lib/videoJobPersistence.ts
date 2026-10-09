import { getItem, removeItem, setItem } from '@/lib/storage';

export const ACTIVE_VIDEO_JOB_KEY = 'active_video_job';

export interface ActiveVideoJob {
  jobId: string;
  scanId: string | null;
  step: string;
  progress: number;
  startedAt: number;
  lastUpdated: number;
}

export async function saveActiveVideoJob(jobId: string, step: string, scanId?: string | null): Promise<void> {
  const data: ActiveVideoJob = {
    jobId,
    scanId: scanId ?? null,
    step,
    progress: 0,
    startedAt: Date.now(),
    lastUpdated: Date.now(),
  };
  await setItem(ACTIVE_VIDEO_JOB_KEY, JSON.stringify(data));
}

export async function updateActiveVideoJobStep(step: string, progress?: number): Promise<void> {
  const active = await getActiveVideoJob();
  if (!active) return;
  active.step = step;
  if (progress !== undefined && !isNaN(progress)) {
    active.progress = progress;
  }
  active.lastUpdated = Date.now();
  await setItem(ACTIVE_VIDEO_JOB_KEY, JSON.stringify(active));
}

export async function clearActiveVideoJob(): Promise<void> {
  await setItem(ACTIVE_VIDEO_JOB_KEY, '');
  // Also try to explicitly remove if storage supports it
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(ACTIVE_VIDEO_JOB_KEY);
    } catch {
      // ignore
    }
  }
}

export async function getActiveVideoJob(): Promise<ActiveVideoJob | null> {
  const raw = await getItem(ACTIVE_VIDEO_JOB_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveVideoJob;
  } catch {
    return null;
  }
}
