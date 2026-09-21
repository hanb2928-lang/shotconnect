import { fetchVideoEditPlan, type EditPlan } from '@/lib/videoEditPlan';

jest.mock('@/lib/apiClient', () => ({
  safeFetch: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
}));

jest.mock('@/lib/aiCache', () => ({
  aiCachedCall: jest.fn(),
}));

jest.mock('@/lib/offlineCache', () => ({
  getCached: jest.fn(() => Promise.resolve(null)),
  setCached: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/contentHash', () => ({
  hashObject: jest.fn(() => 'abc123'),
}));

import { aiCachedCall } from '@/lib/aiCache';

const mockAiCachedCall = aiCachedCall as jest.MockedFunction<typeof aiCachedCall>;

describe('videoEditPlan caching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wraps fetchVideoEditPlan with aiCachedCall', async () => {
    const fakePlan: EditPlan = {
      duration: 15,
      totalSegments: 4,
      segments: [],
      hookTiming: { firstHookSec: 0, reason: 'test' },
      psychology: { principle: 'test', application: 'test', triggerPoint: 'test' },
      antiAlgorithm: { copyVariation: '', pacingStrategy: '', visualChangeStrategy: '', audioChangeStrategy: '' },
      copyVariants: [],
      musicMood: 'hightension',
      motionPreset: 'fast',
      reason: 'test',
    };
    mockAiCachedCall.mockResolvedValue({ data: fakePlan, cached: false });

    const result = await fetchVideoEditPlan({
      productName: 'Test Product',
      videoDuration: 15,
    });

    expect(mockAiCachedCall).toHaveBeenCalledTimes(1);
    expect(mockAiCachedCall).toHaveBeenCalledWith(
      'video-edit-plan',
      expect.objectContaining({ task: 'video-edit-plan', videoDuration: 15 }),
      expect.any(Function),
      'gpt-4o',
    );
    expect(result).toEqual(fakePlan);
  });

  it('returns cached result without calling fetcher', async () => {
    const cachedPlan: EditPlan = {
      duration: 30,
      totalSegments: 6,
      segments: [],
      hookTiming: { firstHookSec: 1, reason: 'cached' },
      psychology: { principle: 'fomo', application: 'test', triggerPoint: 'test' },
      antiAlgorithm: { copyVariation: '', pacingStrategy: '', visualChangeStrategy: '', audioChangeStrategy: '' },
      copyVariants: [],
      musicMood: 'cinematic',
      motionPreset: 'slow',
      reason: 'cached result',
    };
    mockAiCachedCall.mockResolvedValue({ data: cachedPlan, cached: true });

    const result = await fetchVideoEditPlan({
      productName: 'Same Product',
      videoDuration: 30,
    });

    expect(result).toEqual(cachedPlan);
    expect(result.reason).toBe('cached result');
  });
});
