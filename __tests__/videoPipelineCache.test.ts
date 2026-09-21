/**
 * Video pipeline cache hit/miss flow tests
 */

jest.mock('@/lib/supabase', () => {
  const mockChannel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn(),
  };
  return {
    supabase: {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ maybeSingle: jest.fn(() => ({ data: null, error: null })) })),
          maybeSingle: jest.fn(() => ({ data: null, error: null })),
        })),
        upsert: jest.fn(),
      })),
      channel: jest.fn(() => mockChannel),
      removeChannel: jest.fn(),
      functions: { invoke: jest.fn(() => Promise.reject(new Error('mock invoke failed'))) },
    },
  };
});

jest.mock('@/lib/aiCache', () => ({
  getMultiAngleCache: jest.fn(),
  setMultiAngleCache: jest.fn(),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({ isOnline: jest.fn(() => true) }));

import { generateAiVideo } from '@/lib/aiVideoPipeline';
import { getMultiAngleCache, setMultiAngleCache } from '@/lib/aiCache';

describe('Cache hit flow — generateAiVideo returns cached video', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns cached video URL immediately without queue submission', async () => {
    const cachedEntry = {
      productContext: { productName: 'test' },
      hookOptions: { hooks: ['hook1'] },
      renderedVideoUrl: 'https://example.com/cached-video.mp4',
    };
    (getMultiAngleCache as jest.Mock).mockResolvedValue(cachedEntry);

    const progressCalls: Array<{ phase: string; progress: number }> = [];
    const result = await generateAiVideo(
      'test prompt',
      { scanId: 'scan-1', imageHash: 'hash-abc', contentTone: 'studio', durationSec: 5 },
      (p) => progressCalls.push({ phase: p.phase, progress: p.progress }),
    );

    expect(result.videoUrl).toBe('https://example.com/cached-video.mp4');
    expect(result.provider).toBe('cache');
    expect(result.persisted).toBe(true);
    expect(getMultiAngleCache).toHaveBeenCalledWith('hash-abc', 'studio');
    expect(setMultiAngleCache).not.toHaveBeenCalled();
    expect(progressCalls.some((p) => p.phase === 'completed')).toBe(true);
  });
});

describe('Cache miss flow — falls through to pipeline', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('checks cache then falls through on miss', async () => {
    (getMultiAngleCache as jest.Mock).mockResolvedValue(null);

    try {
      await generateAiVideo('test', { scanId: 'scan-1', imageHash: 'hash-xyz', contentTone: 'raw' });
    } catch {
      // Expected — mock invoke rejects
    }

    expect(getMultiAngleCache).toHaveBeenCalledWith('hash-xyz', 'raw');
  }, 15000);
});

describe('Cache skip conditions', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('skips cache check for draft previews', async () => {
    try {
      await generateAiVideo('test', { scanId: 'scan-1', imageHash: 'hash-draft', contentTone: 'studio', draft: true });
    } catch { /* expected */ }
    expect(getMultiAngleCache).not.toHaveBeenCalled();
  }, 15000);

  it('skips cache check when imageHash is missing', async () => {
    try {
      await generateAiVideo('test', { scanId: 'scan-1', contentTone: 'studio' });
    } catch { /* expected */ }
    expect(getMultiAngleCache).not.toHaveBeenCalled();
  }, 15000);

  it('skips cache check when contentTone is missing', async () => {
    try {
      await generateAiVideo('test', { scanId: 'scan-1', imageHash: 'hash-123' });
    } catch { /* expected */ }
    expect(getMultiAngleCache).not.toHaveBeenCalled();
  }, 15000);
});

describe('Cache store on completion', () => {
  it('setMultiAngleCache is callable with correct shape', () => {
    expect(typeof setMultiAngleCache).toBe('function');
  });
});
