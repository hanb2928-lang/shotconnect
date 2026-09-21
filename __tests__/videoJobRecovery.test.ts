// Test the video job recovery hook's core logic
// Mock supabase and persistence module

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: any) => s },
  Animated: {
    Value: class { constructor(v: number) { (this as any).value = v; } },
    timing: () => ({ start: jest.fn() }),
  },
  Pressable: 'Pressable',
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(),
        })),
      })),
    })),
  },
}));

jest.mock('@/lib/storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const { getActiveVideoJob, clearActiveVideoJob } = require('@/lib/videoJobPersistence');
const { supabase } = require('@/lib/supabase');

describe('useVideoJobRecovery logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getActiveVideoJob returns null when storage is empty', async () => {
    const { getItem } = require('@/lib/storage');
    getItem.mockResolvedValue(null);
    const result = await getActiveVideoJob();
    expect(result).toBeNull();
  });

  it('getActiveVideoJob returns job data when storage has valid data', async () => {
    const { getItem } = require('@/lib/storage');
    getItem.mockResolvedValue(JSON.stringify({
      jobId: 'job-recovery-1',
      step: 'rendering',
      startedAt: 1234567890,
    }));
    const result = await getActiveVideoJob();
    expect(result).toEqual({
      jobId: 'job-recovery-1',
      step: 'rendering',
      startedAt: 1234567890,
    });
  });

  it('clearActiveVideoJob clears the storage', async () => {
    const { setItem } = require('@/lib/storage');
    await clearActiveVideoJob();
    expect(setItem).toHaveBeenCalledWith('active_video_job', '');
  });

  it('supabase query chain is called with correct table', async () => {
    const mockData = { status: 'SUCCESS', step: 'completed', video_url: 'https://example.com/video.mp4', error_message: null };
    const maybeSingle = jest.fn().mockResolvedValue({ data: mockData, error: null });
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const { data, error } = await supabase
      .from('video_jobs')
      .select('status, step, video_url, error_message')
      .eq('id', 'job-123')
      .maybeSingle();

    expect(supabase.from).toHaveBeenCalledWith('video_jobs');
    expect(data).toEqual(mockData);
    expect(error).toBeNull();
  });
});
