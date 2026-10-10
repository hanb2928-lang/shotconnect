// Mock storage module
jest.mock('@/lib/storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
}));

const { saveActiveVideoJob, clearActiveVideoJob, getActiveVideoJob, updateActiveVideoJobStep, ACTIVE_VIDEO_JOB_KEY } = require('@/lib/videoJobPersistence');
const { getItem, setItem } = require('@/lib/storage');

function validJob(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    jobId: 'job-123',
    scanId: null,
    step: 'rendering',
    progress: 0.5,
    startedAt: now,
    lastUpdated: now,
    ...overrides,
  };
}

describe('videoJobPersistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset generation counters so clearActiveVideoJob from one test
    // doesn't block saveActiveVideoJob in the next.
    const mod = require('@/lib/videoJobPersistence');
    // The module stores counters in closure — re-require to get fresh state.
    jest.resetModules();
  });

  it('saves active video job with jobId, step, and timestamp', async () => {
    const { saveActiveVideoJob } = require('@/lib/videoJobPersistence');
    const { setItem } = require('@/lib/storage');
    await saveActiveVideoJob('job-123', 'rendering');
    expect(setItem).toHaveBeenCalledWith(ACTIVE_VIDEO_JOB_KEY, expect.any(String));
    const savedData = JSON.parse((setItem.mock.calls[0] as [string, string])[1]);
    expect(savedData.jobId).toBe('job-123');
    expect(savedData.step).toBe('rendering');
    expect(typeof savedData.startedAt).toBe('number');
    expect(typeof savedData.lastUpdated).toBe('number');
    expect(savedData.progress).toBe(0);
  });

  it('clears active video job by setting empty string', async () => {
    const { clearActiveVideoJob } = require('@/lib/videoJobPersistence');
    const { setItem } = require('@/lib/storage');
    await clearActiveVideoJob();
    expect(setItem).toHaveBeenCalledWith(ACTIVE_VIDEO_JOB_KEY, '');
  });

  it('returns parsed job when storage has valid fresh data', async () => {
    const { getActiveVideoJob } = require('@/lib/videoJobPersistence');
    const { getItem } = require('@/lib/storage');
    const job = validJob({ jobId: 'job-456', step: 'uploading' });
    (getItem as jest.Mock).mockResolvedValue(JSON.stringify(job));
    const result = await getActiveVideoJob();
    expect(result).toEqual(job);
  });

  it('returns null when storage is empty', async () => {
    const { getActiveVideoJob } = require('@/lib/videoJobPersistence');
    const { getItem } = require('@/lib/storage');
    (getItem as jest.Mock).mockResolvedValue(null);
    const result = await getActiveVideoJob();
    expect(result).toBeNull();
  });

  it('returns null and clears when stored data is invalid JSON', async () => {
    const { getActiveVideoJob } = require('@/lib/videoJobPersistence');
    const { getItem, setItem } = require('@/lib/storage');
    (getItem as jest.Mock).mockResolvedValue('not-json');
    const result = await getActiveVideoJob();
    expect(result).toBeNull();
    expect(setItem).toHaveBeenCalledWith(ACTIVE_VIDEO_JOB_KEY, '');
  });

  it('returns null and clears when stored data is missing required fields', async () => {
    const { getActiveVideoJob } = require('@/lib/videoJobPersistence');
    const { getItem, setItem } = require('@/lib/storage');
    (getItem as jest.Mock).mockResolvedValue(JSON.stringify({ jobId: 'x' }));
    const result = await getActiveVideoJob();
    expect(result).toBeNull();
    expect(setItem).toHaveBeenCalledWith(ACTIVE_VIDEO_JOB_KEY, '');
  });

  it('returns null and clears when jobId is empty string', async () => {
    const { getActiveVideoJob } = require('@/lib/videoJobPersistence');
    const { getItem, setItem } = require('@/lib/storage');
    (getItem as jest.Mock).mockResolvedValue(JSON.stringify(validJob({ jobId: '' })));
    const result = await getActiveVideoJob();
    expect(result).toBeNull();
    expect(setItem).toHaveBeenCalledWith(ACTIVE_VIDEO_JOB_KEY, '');
  });

  it('returns null and clears when progress is NaN', async () => {
    const { getActiveVideoJob } = require('@/lib/videoJobPersistence');
    const { getItem, setItem } = require('@/lib/storage');
    (getItem as jest.Mock).mockResolvedValue(JSON.stringify(validJob({ progress: NaN })));
    const result = await getActiveVideoJob();
    expect(result).toBeNull();
    expect(setItem).toHaveBeenCalledWith(ACTIVE_VIDEO_JOB_KEY, '');
  });

  it('returns null and clears when stored object is actually an array', async () => {
    const { getActiveVideoJob } = require('@/lib/videoJobPersistence');
    const { getItem, setItem } = require('@/lib/storage');
    (getItem as jest.Mock).mockResolvedValue(JSON.stringify([1, 2, 3]));
    const result = await getActiveVideoJob();
    expect(result).toBeNull();
    expect(setItem).toHaveBeenCalledWith(ACTIVE_VIDEO_JOB_KEY, '');
  });

  it('returns null and clears when job is stale (lastUpdated > 30 min ago)', async () => {
    const { getActiveVideoJob } = require('@/lib/videoJobPersistence');
    const { getItem, setItem } = require('@/lib/storage');
    const staleTime = Date.now() - 31 * 60 * 1000;
    (getItem as jest.Mock).mockResolvedValue(JSON.stringify(validJob({ lastUpdated: staleTime })));
    const result = await getActiveVideoJob();
    expect(result).toBeNull();
    expect(setItem).toHaveBeenCalledWith(ACTIVE_VIDEO_JOB_KEY, '');
  });

  it('returns job when job is just under staleness threshold', async () => {
    const { getActiveVideoJob } = require('@/lib/videoJobPersistence');
    const { getItem } = require('@/lib/storage');
    const freshTime = Date.now() - 29 * 60 * 1000;
    const job = validJob({ lastUpdated: freshTime });
    (getItem as jest.Mock).mockResolvedValue(JSON.stringify(job));
    const result = await getActiveVideoJob();
    expect(result).toEqual(job);
  });

  it('updateActiveVideoJobStep updates step and progress on an existing job', async () => {
    const { updateActiveVideoJobStep } = require('@/lib/videoJobPersistence');
    const { getItem, setItem } = require('@/lib/storage');
    (getItem as jest.Mock).mockResolvedValue(JSON.stringify(validJob({
      jobId: 'job-789',
      scanId: 'scan-1',
      step: 'hooking',
      progress: 0.15,
      startedAt: 1000,
      lastUpdated: Date.now(),
    })));
    await updateActiveVideoJobStep('rendering', 0.6);
    expect(setItem).toHaveBeenCalledWith(ACTIVE_VIDEO_JOB_KEY, expect.any(String));
    const calls = (setItem.mock.calls as [string, string][]);
    const updateCall = calls.find(([_, val]) => {
      try { const p = JSON.parse(val); return p && p.jobId === 'job-789'; } catch { return false; }
    });
    expect(updateCall).toBeDefined();
    const savedData = JSON.parse(updateCall![1]);
    expect(savedData.step).toBe('rendering');
    expect(savedData.progress).toBe(0.6);
    expect(savedData.jobId).toBe('job-789');
    expect(savedData.lastUpdated).toBeGreaterThan(1000);
  });

  it('updateActiveVideoJobStep clamps progress to [0, 1]', async () => {
    const { updateActiveVideoJobStep } = require('@/lib/videoJobPersistence');
    const { getItem, setItem } = require('@/lib/storage');
    (getItem as jest.Mock).mockResolvedValue(JSON.stringify(validJob()));
    await updateActiveVideoJobStep('rendering', 1.5);
    const savedData = JSON.parse((setItem.mock.calls[0] as [string, string])[1]);
    expect(savedData.progress).toBe(1);
  });

  it('updateActiveVideoJobStep is a no-op when no active job exists', async () => {
    const { updateActiveVideoJobStep } = require('@/lib/videoJobPersistence');
    const { getItem, setItem } = require('@/lib/storage');
    (getItem as jest.Mock).mockResolvedValue(null);
    await updateActiveVideoJobStep('rendering');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('updateActiveVideoJobStep is a no-op when stored data is corrupted', async () => {
    const { updateActiveVideoJobStep } = require('@/lib/videoJobPersistence');
    const { getItem, setItem } = require('@/lib/storage');
    (getItem as jest.Mock).mockResolvedValue('corrupt{json');
    await updateActiveVideoJobStep('rendering');
    // getActiveVideoJob will clear it, so setItem is called once for the clear
    // but NOT called for an update
    const calls = (setItem.mock.calls as [string, string][]);
    const hasUpdate = calls.some(([_, val]) => val !== '' && val !== undefined);
    expect(hasUpdate).toBe(false);
  });
});
