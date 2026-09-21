import { getItem, setItem } from '@/lib/storage';

export const ACTIVE_VIDEO_JOB_KEY = 'active_video_job';

export interface ActiveVideoJob {
  jobId: string;
  step: string;
  startedAt: number;
}

export async function saveActiveVideoJob(jobId: string, step: string): Promise<void> {
  const data: ActiveVideoJob = {
    jobId,
    step,
    startedAt: Date.now(),
  };
  await setItem(ACTIVE_VIDEO_JOB_KEY, JSON.stringify(data));
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
