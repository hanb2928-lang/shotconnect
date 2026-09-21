// Mock storage module
jest.mock('@/lib/storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

// Mock supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
}));

const { saveActiveVideoJob, clearActiveVideoJob, getActiveVideoJob, ACTIVE_VIDEO_JOB_KEY } = require('@/lib/videoJobPersistence');
const { getItem, setItem } = require('@/lib/storage');

describe('videoJobPersistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves active video job with jobId, step, and timestamp', async () => {
    await saveActiveVideoJob('job-123', 'rendering');
    expect(setItem).toHaveBeenCalledWith(ACTIVE_VIDEO_JOB_KEY, expect.any(String));
    const savedData = JSON.parse((setItem.mock.calls[0] as [string, string])[1]);
    expect(savedData.jobId).toBe('job-123');
    expect(savedData.step).toBe('rendering');
    expect(typeof savedData.startedAt).toBe('number');
  });

  it('clears active video job by setting empty string', async () => {
    await clearActiveVideoJob();
    expect(setItem).toHaveBeenCalledWith(ACTIVE_VIDEO_JOB_KEY, '');
  });

  it('returns parsed job when storage has valid data', async () => {
    (getItem as jest.Mock).mockResolvedValue(JSON.stringify({
      jobId: 'job-456',
      step: 'uploading',
      startedAt: 1234567890,
    }));
    const result = await getActiveVideoJob();
    expect(result).toEqual({
      jobId: 'job-456',
      step: 'uploading',
      startedAt: 1234567890,
    });
  });

  it('returns null when storage is empty', async () => {
    (getItem as jest.Mock).mockResolvedValue(null);
    const result = await getActiveVideoJob();
    expect(result).toBeNull();
  });

  it('returns null when stored data is invalid JSON', async () => {
    (getItem as jest.Mock).mockResolvedValue('not-json');
    const result = await getActiveVideoJob();
    expect(result).toBeNull();
  });
});
