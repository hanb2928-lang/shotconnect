jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('@/lib/supabase', () => ({
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon-key',
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  },
  ensureFreshSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  isOnline: jest.fn(() => true),
}));

jest.mock('@/lib/uploadCircuitBreaker', () => ({
  isUploadCircuitOpen: jest.fn(() => false),
  recordUploadSuccess: jest.fn(),
  recordUploadFailure: jest.fn(),
}));

jest.mock('@/lib/errorLogger', () => ({
  addBreadcrumb: jest.fn(),
}));

import { uploadFilesResumable, type UploadFileItem } from '@/lib/resumableUploadQueue';
import { isOnline } from '@/hooks/useNetworkStatus';

const mockIsOnline = isOnline as jest.MockedFunction<typeof isOnline>;
const mockFetch = jest.fn();
const originalFetch = global.fetch;

function makeFile(id: string, size: number, bucket = 'scans', path = 'test/' + id + '.jpg'): UploadFileItem {
  return {
    id,
    data: new Uint8Array(size),
    bucket,
    path,
    mimeType: 'image/jpeg',
    fileName: id + '.jpg',
  };
}

describe('resumableUploadQueue', () => {
  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
    mockIsOnline.mockReturnValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('splits a file into chunks based on chunkSize', async () => {
    const file = makeFile('f1', 1024);
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('ok') });

    const results = await uploadFilesResumable([file], { chunkSize: 256 });

    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('calls onProgress with correct byte counts', async () => {
    const file = makeFile('f1', 512);
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('ok') });

    const progressCalls: any[] = [];
    await uploadFilesResumable([file], {
      chunkSize: 256,
      onProgress: (p) => progressCalls.push(p),
    });

    // Initial + per-chunk progress + final
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    const lastProgress = progressCalls[progressCalls.length - 1];
    expect(lastProgress.completedFiles).toBe(1);
    expect(lastProgress.overallPercent).toBe(100);
    expect(lastProgress.files[0].percent).toBe(100);
  });

  it('retries a failed chunk and succeeds on retry', async () => {
    const file = makeFile('f1', 256);
    mockFetch
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('ok') });

    const results = await uploadFilesResumable([file], { chunkSize: 256 });

    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('pauses on network drop and resumes when network returns', async () => {
    const file = makeFile('f1', 256);
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        mockIsOnline.mockReturnValue(false);
        return Promise.reject(new Error('network error'));
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('ok') });
    });

    setTimeout(() => mockIsOnline.mockReturnValue(true), 500);

    const results = await uploadFilesResumable([file], { chunkSize: 256 });

    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws when network does not recover within timeout', async () => {
    const file = makeFile('f1', 256);
    mockIsOnline.mockReturnValue(false);
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('ok') });

    await expect(
      uploadFilesResumable([file], { chunkSize: 256 }),
    ).rejects.toThrow(/network|\uB124\uD2B8\uC6CC\uD06C/);
  }, 35000);

  it('respects AbortSignal cancellation', async () => {
    const file = makeFile('f1', 1024);
    const controller = new AbortController();

    mockFetch.mockImplementation(() => {
      controller.abort();
      return Promise.resolve({ ok: true, text: () => Promise.resolve('ok') });
    });

    await expect(
      uploadFilesResumable([file], {
        chunkSize: 256,
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancel|취소/);
  });

  it('handles multiple files sequentially', async () => {
    const files = [makeFile('f1', 256), makeFile('f2', 256), makeFile('f3', 256)];
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('ok') });

    const results = await uploadFilesResumable(files, { chunkSize: 256 });

    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(results[0].fileId).toBe('f1');
    expect(results[2].fileId).toBe('f3');
  });

  it('reports per-file progress during multi-file upload', async () => {
    const files = [makeFile('f1', 512), makeFile('f2', 512)];
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('ok') });

    const progressCalls: any[] = [];
    await uploadFilesResumable(files, {
      chunkSize: 256,
      onProgress: (p) => progressCalls.push(p),
    });

    const midProgress = progressCalls.find(
      (p) => p.completedFiles === 1 && p.totalFiles === 2,
    );
    expect(midProgress).toBeDefined();
    expect(midProgress.overallPercent).toBe(50);
  });

  it('handles empty file list', async () => {
    const results = await uploadFilesResumable([]);
    expect(results).toHaveLength(0);
  });

  it('marks file as failed when all chunk retries exhausted', async () => {
    const file = makeFile('f1', 256);
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('server error') });

    const progressCalls: any[] = [];
    await expect(
      uploadFilesResumable([file], {
        chunkSize: 256,
        onProgress: (p) => progressCalls.push(p),
      }),
    ).rejects.toThrow();

    const failedProgress = progressCalls.find((p) => p.files[0]?.status === 'failed');
    expect(failedProgress).toBeDefined();
  });

  it('sends Content-Range header for chunk positioning', async () => {
    const file = makeFile('f1', 512);
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('ok') });

    await uploadFilesResumable([file], { chunkSize: 256 });

    const firstCall = mockFetch.mock.calls[0];
    const headers = firstCall[1].headers;
    expect(headers['Content-Range']).toBe('bytes 0-255/512');
  });

  it('does not re-upload already completed chunks after a mid-file network drop', async () => {
    const file = makeFile('f1', 1024);
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        mockIsOnline.mockReturnValue(false);
        return Promise.reject(new Error('network error'));
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('ok') });
    });

    setTimeout(() => mockIsOnline.mockReturnValue(true), 300);

    const results = await uploadFilesResumable([file], { chunkSize: 256 });

    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
});
