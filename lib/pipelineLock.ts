let pipelineLocked = false;

export function acquirePipelineLock(): boolean {
  if (pipelineLocked) return false;
  pipelineLocked = true;
  return true;
}

export function releasePipelineLock(): void {
  pipelineLocked = false;
}

export function isPipelineLocked(): boolean {
  return pipelineLocked;
}
