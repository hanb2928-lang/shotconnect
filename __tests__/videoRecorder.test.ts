import { createVideoRecorder, startVideoRecording, stopVideoRecording } from '@/lib/videoRecorder';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string;
  stream: MediaStream;
  ondataavailable: ((e: BlobEvent) => void) | null = null;
  onstop: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private chunks: Blob[] = [];

  constructor(stream: MediaStream, options?: { mimeType?: string; videoBitsPerSecond?: number; audioBitsPerSecond?: number }) {
    this.stream = stream;
    this.mimeType = options?.mimeType || 'video/webm';
  }

  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(this.chunks, { type: this.mimeType }) } as unknown as BlobEvent);
    }
    if (this.onstop) this.onstop(new Event('stop'));
  }
}

(global as any).MediaRecorder = MockMediaRecorder;
(global as any).MediaRecorder.isTypeSupported = (mime: string) => mime.startsWith('video/webm');

describe('videoRecorder', () => {
  it('createVideoRecorder sets videoBitsPerSecond explicitly', () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const recorder = createVideoRecorder(stream, { videoBitsPerSecond: 2_500_000 });
    expect(recorder).toBeInstanceOf(MockMediaRecorder);
    expect(recorder!.mimeType).toBe('video/webm;codecs=vp9,opus');
  });

  it('startVideoRecording returns recorder and promise', async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const result = startVideoRecording(stream, { maxDurationMs: 5000, videoBitsPerSecond: 3_000_000 });
    expect(result).not.toBeNull();
    expect(result!.recorder.state).toBe('recording');
    stopVideoRecording(result!.recorder);
    const recordingResult = await result!.promise;
    expect(recordingResult.mimeType).toBe('video/webm;codecs=vp9,opus');
    expect(recordingResult.blob).toBeInstanceOf(Blob);
    expect(recordingResult.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('stopVideoRecording is safe to call on inactive recorder', () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const recorder = createVideoRecorder(stream);
    expect(recorder).not.toBeNull();
    stopVideoRecording(recorder!);
    expect(recorder!.state).toBe('inactive');
  });

  it('returns null on non-web platform', () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const rn = require('react-native') as { Platform: { OS: string } };
    const originalOS = rn.Platform.OS;
    rn.Platform.OS = 'ios';
    const recorder = createVideoRecorder(stream);
    expect(recorder).toBeNull();
    rn.Platform.OS = originalOS;
  });
});
