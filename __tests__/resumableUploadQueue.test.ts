jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon-key',
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
    storage: {
      from: jest.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      })),
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
    mockUpload.mockReset();
    mockGetPublicUrl.mockReset();
    mockIsOnline.mockReturnValue(true);
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/scans/test.jpg' } });
  });

  it('uploads a file in a single request', async () => {
    const file = makeFile('f1', 256);
    mockUpload.mockResolvedValue({ error: null });

    const results = await uploadFilesResumable([file]);

    expect(results).toHaveLength(1);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it('calls onProgress with correct byte counts', async () => {
    const file = makeFile('f1', 512);
    mockUpload.mockResolvedValue({ error: null });

    const progressCalls: any[] = [];
    await uploadFilesResumable([file], {
      onProgress: (p) => progressCalls.push(p),
    });

    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    const lastProgress = progressCalls[progressCalls.length - 1];
    expect(lastProgress.completedFiles).toBe(1);
    expect(lastProgress.overallPercent).toBe(100);
    expect(lastProgress.files[0].percent).toBe(100);
  });

  it('retries a failed upload and succeeds on retry', async () => {
    const file = makeFile('f1', 256);
    mockUpload
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ error: null });

    const results = await uploadFilesResumable([file]);

    expect(results).toHaveLength(1);
    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  it('pauses on network drop and resumes when network returns', async () => {
    const file = makeFile('f1', 256);
    let callCount = 0;
    mockUpload.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        mockIsOnline.mockReturnValue(false);
        return Promise.reject(new Error('network error'));
      }
      return Promise.resolve({ error: null });
    });

    setTimeout(() => mockIsOnline.mockReturnValue(true), 500);

    const results = await uploadFilesResumable([file]);

    expect(results).toHaveLength(1);
    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  it('throws when network does not recover within timeout', async () => {
    const file = makeFile('f1', 256);
    mockIsOnline.mockReturnValue(false);
    mockUpload.mockResolvedValue({ error: null });

    await expect(
      uploadFilesResumable([file]),
    ).rejects.toThrow(/network|\uB124\uD2B8\uC6CC\uD06C/);
  }, 35000);

  it('respects AbortSignal cancellation', async () => {
    const file = makeFile('f1', 1024);
    const controller = new AbortController();

    mockUpload.mockImplementation(() => {
      return new Promise((_resolve, reject) => {
        const timer = setTimeout(_resolve, 5000);
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Aborted'));
        });
      });
    });

    setTimeout(() => controller.abort(), 50);

    await expect(
      uploadFilesResumable([file], {
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancel|취소/);
  });

  it('handles multiple files sequentially', async () => {
    const files = [makeFile('f1', 256), makeFile('f2', 256), makeFile('f3', 256)];
    mockUpload.mockResolvedValue({ error: null });

    const results = await uploadFilesResumable(files);

    expect(results).toHaveLength(3);
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(results[0].fileId).toBe('f1');
    expect(results[2].fileId).toBe('f3');
  });

  it('reports per-file progress during multi-file upload', async () => {
    const files = [makeFile('f1', 512), makeFile('f2', 512)];
    mockUpload.mockResolvedValue({ error: null });

    const progressCalls: any[] = [];
    await uploadFilesResumable(files, {
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

  it('marks file as failed when all retries exhausted', async () => {
    const file = makeFile('f1', 256);
    mockUpload.mockResolvedValue({ error: { message: 'server error' } });

    const progressCalls: any[] = [];
    await expect(
      uploadFilesResumable([file], {
        onProgress: (p) => progressCalls.push(p),
      }),
    ).rejects.toThrow();

    const failedProgress = progressCalls.find((p) => p.files[0]?.status === 'failed');
    expect(failedProgress).toBeDefined();
  });

  it('rejects empty files', async () => {
    const file = makeFile('f1', 0);
    mockUpload.mockResolvedValue({ error: null });

    await expect(
      uploadFilesResumable([file]),
    ).rejects.toThrow(/빈 파일/);
  });
});
