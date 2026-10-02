import { startVideoRecording, stopVideoRecording } from '@/lib/videoRecorder';
import { setMemoryPressure, onMemoryPressureChange, getMemoryPressure } from '@/lib/devicePerformance';
import { addBreadcrumb, logWarning } from '@/lib/errorLogger';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('@/lib/errorLogger', () => ({
  addBreadcrumb: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  logFatal: jest.fn(),
  log: jest.fn(),
}));

class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string;
  videoBitsPerSecond: number | undefined;
  stream: MediaStream;
  ondataavailable: ((e: BlobEvent) => void) | null = null;
  onstop: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  requestDataCalled = false;

  constructor(
    stream: MediaStream,
    options?: { mimeType?: string; videoBitsPerSecond?: number; audioBitsPerSecond?: number },
  ) {
    this.stream = stream;
    this.mimeType = options?.mimeType || 'video/webm';
    this.videoBitsPerSecond = options?.videoBitsPerSecond;
  }

  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob([new ArrayBuffer(1024)], { type: this.mimeType }) } as unknown as BlobEvent);
    }
    if (this.onstop) this.onstop(new Event('stop'));
  }
  requestData() {
    this.requestDataCalled = true;
  }
}

(global as any).MediaRecorder = MockMediaRecorder;
(global as any).MediaRecorder.isTypeSupported = (mime: string) => mime.startsWith('video/webm');

function makeStream(): MediaStream {
  return { getTracks: () => [] } as unknown as MediaStream;
}

describe('videoRecorder memory spike monitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMemoryPressure('none');
  });

  afterEach(() => {
    setMemoryPressure('none');
  });

  it('logs a warning breadcrumb when accumulated chunks exceed 15MB', async () => {
    const result = startVideoRecording(makeStream(), { maxDurationMs: 5000 });
    expect(result).not.toBeNull();

    const recorder = result!.recorder as unknown as MockMediaRecorder;

    // Simulate 16MB of chunk data via ondataavailable
    const bigChunk = new Blob([new ArrayBuffer(16_000_000)], { type: 'video/webm' });
    recorder.ondataavailable!({ data: bigChunk } as unknown as BlobEvent);

    expect(addBreadcrumb).toHaveBeenCalledWith(
      'video',
      expect.stringContaining('Recording chunk memory high'),
      'warning',
      expect.objectContaining({ chunkCount: expect.any(Number) }),
    );

    stopVideoRecording(result!.recorder);
    await result!.promise;
  });

  it('logs an error breadcrumb when accumulated chunks exceed 40MB', async () => {
    const result = startVideoRecording(makeStream(), { maxDurationMs: 5000 });
    expect(result).not.toBeNull();

    const recorder = result!.recorder as unknown as MockMediaRecorder;

    // Simulate 41MB of chunk data in a single event
    const hugeChunk = new Blob([new ArrayBuffer(41_000_000)], { type: 'video/webm' });
    recorder.ondataavailable!({ data: hugeChunk } as unknown as BlobEvent);

    expect(addBreadcrumb).toHaveBeenCalledWith(
      'video',
      expect.stringContaining('Recording chunk memory spike'),
      'error',
      expect.objectContaining({ chunkCount: 1 }),
    );
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('memory spike'),
      expect.objectContaining({
        component: 'videoRecorder',
        action: 'chunk-accumulation',
      }),
    );

    stopVideoRecording(result!.recorder);
    await result!.promise;
  });

  it('calls requestData when severe memory pressure occurs during recording', async () => {
    const result = startVideoRecording(makeStream(), { maxDurationMs: 5000 });
    expect(result).not.toBeNull();

    const recorder = result!.recorder as unknown as MockMediaRecorder;

    // Trigger severe memory pressure
    setMemoryPressure('severe', 'test-spike');

    expect(recorder.requestDataCalled).toBe(true);
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('Severe memory pressure during active video recording'),
      expect.objectContaining({
        component: 'videoRecorder',
        action: 'pressure-spike-during-record',
      }),
    );

    stopVideoRecording(result!.recorder);
    await result!.promise;
  });

  it('does not fire duplicate warnings for the same threshold', async () => {
    const result = startVideoRecording(makeStream(), { maxDurationMs: 5000 });
    expect(result).not.toBeNull();

    const recorder = result!.recorder as unknown as MockMediaRecorder;

    const chunk = new Blob([new ArrayBuffer(16_000_000)], { type: 'video/webm' });
    recorder.ondataavailable!({ data: chunk } as unknown as BlobEvent);
    recorder.ondataavailable!({ data: chunk } as unknown as BlobEvent);

    const warningCalls = (addBreadcrumb as jest.Mock).mock.calls.filter(
      (c) => c[1]?.includes?.('Recording chunk memory high'),
    );
    expect(warningCalls.length).toBe(1);

    stopVideoRecording(result!.recorder);
    await result!.promise;
  });
});
