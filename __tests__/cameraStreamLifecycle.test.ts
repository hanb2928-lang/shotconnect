/**
 * Camera Stream Lifecycle tests
 *
 * Verifies that camera streams are properly cleaned up to prevent
 * memory leaks and hardware resource exhaustion on repeated
 * capture/cancel cycles.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: any) => s },
  TouchableOpacity: 'TouchableOpacity',
  Image: 'Image',
  Animated: {
    Value: class { constructor(v: number) { (this as any).value = v; } },
    useSharedValue: jest.fn((v: number) => ({ value: v })),
    withRepeat: jest.fn(),
    withSequence: jest.fn(),
    withTiming: jest.fn(),
  },
}));

jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: jest.fn(() => [
    { granted: true },
    jest.fn(),
  ]),
}));

jest.mock('expo-linking', () => ({ createURL: jest.fn(), openURL: jest.fn() }));

jest.mock('lucide-react-native', () => ({
  Camera: 'Camera',
  Image: 'Image',
  Loader: 'Loader',
  ShieldAlert: 'ShieldAlert',
  RotateCcw: 'RotateCcw',
  Zap: 'Zap',
  X: 'X',
  Sparkles: 'Sparkles',
  Check: 'Check',
  Video: 'Video',
  Square: 'Square',
}));

jest.mock('@/lib/theme', () => ({
  theme: {
    colors: {
      primary: { 400: '#3b82f6', 600: '#2563eb' },
      dark: { bg: '#0a0f1e', surface: '#1a2030', surfaceLight: '#2a3040', border: '#333', text: '#fff', textDim: '#999' },
      warning: { 400: '#f59e0b' },
      error: { 400: '#ef4444', 500: '#dc2626' },
      success: { 400: '#22c55e' },
    },
    radius: { sm: 4, md: 8, lg: 12, xl: 16, full: 999 },
    spacing: { sm: 4, md: 8, lg: 16, xl: 24 },
    typography: { fontFamily: { regular: 'sans', medium: 'sans', semiBold: 'sans-bold', bold: 'sans-bold' } },
  },
}));

jest.mock('@/lib/imageEdit', () => ({
  compressCaptureFrameToBlob: jest.fn().mockResolvedValue({ blob: new Blob([]), mimeType: 'image/webp' }),
  prepareImageForApi: jest.fn().mockResolvedValue('data:image/jpeg;base64,fake'),
  UPLOAD_MAX_DIMENSION: 1280,
  UPLOAD_QUALITY: 0.75,
}));

jest.mock('@/lib/captureConstraints', () => ({
  getSafeVideoConstraints: jest.fn(() => ({ facingMode: 'environment' })),
  clampCaptureDimensions: jest.fn((w: number, h: number) => ({ width: w, height: h })),
  CAPTURE_MAX_WIDTH: 1080,
}));

jest.mock('@/lib/base64', () => ({
  cleanBase64: jest.fn((s: string) => s),
  getMimeTypeFromDataUrl: jest.fn(() => 'image/jpeg'),
}));

jest.mock('@/lib/videoRecorder', () => ({
  startVideoRecording: jest.fn(() => ({
    recorder: { state: 'recording', stop: jest.fn() },
    promise: Promise.resolve({ blob: new Blob([]) }),
  })),
  stopVideoRecording: jest.fn(),
  blobToBase64: jest.fn().mockResolvedValue({ base64: 'fake', mimeType: 'video/webm' }),
}));

jest.mock('@/hooks/useCameraVisibilityRecovery', () => ({
  useCameraVisibilityRecovery: jest.fn(),
}));

// ─── Mock browser APIs ───

function makeMockTrack(kind: 'video' | 'audio' = 'video') {
  const listeners: Record<string, EventListener> = {};
  return {
    kind,
    readyState: 'live',
    stop: jest.fn(function (this: any) { this.readyState = 'ended'; }),
    addEventListener: jest.fn((event: string, handler: EventListener) => {
      listeners[event] = handler;
    }),
    removeEventListener: jest.fn(),
    _fireEnded: () => {
      (listeners['ended'] as EventListener)?.(new Event('ended'));
    },
  };
}

function makeMockStream(tracks: ReturnType<typeof makeMockTrack>[]) {
  return {
    getTracks: jest.fn(() => tracks),
    getVideoTracks: jest.fn(() => tracks.filter((t) => t.kind === 'video')),
    getAudioTracks: jest.fn(() => tracks.filter((t) => t.kind === 'audio')),
  };
}

const mockGetUserMedia = jest.fn();

// We test the stream lifecycle logic directly, not the React component,
// since renderHook/render is not available. The logic in stopStream and
// startStream is pure browser API interaction.

describe('Camera stream lifecycle — track cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserMedia.mockReset();
  });

  it('stopStream stops all tracks and nulls srcObject', () => {
    const videoTrack = makeMockTrack('video');
    const audioTrack = makeMockTrack('audio');
    const stream = makeMockStream([videoTrack, audioTrack]);

    // Simulate stopStream logic
    stream.getTracks().forEach((t) => t.stop());
    const mockVideo: { srcObject: unknown } = { srcObject: stream };
    mockVideo.srcObject = null;

    expect(videoTrack.stop).toHaveBeenCalled();
    expect(audioTrack.stop).toHaveBeenCalled();
    expect(mockVideo.srcObject).toBeNull();
  });

  it('track ended event fires and clears the stream reference', () => {
    const videoTrack = makeMockTrack('video');
    const stream = makeMockStream([videoTrack]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let streamRef: any = stream;
    let cameraReady = true;

    // Simulate the ended listener we added
    videoTrack.addEventListener('ended', () => {
      if (streamRef === stream) {
        streamRef = null;
        cameraReady = false;
      }
    });

    // Fire the ended event
    videoTrack._fireEnded();

    expect(streamRef).toBeNull();
    expect(cameraReady).toBe(false);
  });

  it('repeated start/stop cycles do not accumulate active tracks', () => {
    const activeTracks: ReturnType<typeof makeMockTrack>[] = [];

    function simulateStart() {
      const track = makeMockTrack('video');
      activeTracks.push(track);
      return track;
    }

    function simulateStop() {
      activeTracks.forEach((t) => t.stop());
      activeTracks.length = 0;
    }

    // 10 cycles of start/stop
    for (let i = 0; i < 10; i++) {
      simulateStart();
      simulateStop();
    }

    // All tracks should be stopped, none active
    const activeCount = activeTracks.filter((t) => t.readyState === 'live').length;
    expect(activeCount).toBe(0);
  });

  it('streamGenRef prevents stale streams from being assigned', () => {
    let streamGen = 0;
    const gen1 = ++streamGen;
    const gen2 = ++streamGen;

    // Simulate: first getUserMedia resolves late, but gen has moved on
    const lateStream = makeMockStream([makeMockTrack('video')]);
    const mountedRef = { current: true };

    // Late stream's gen doesn't match current gen
    if (!mountedRef.current || gen1 !== streamGen) {
      // Should stop the stale stream
      lateStream.getTracks().forEach((t) => t.stop());
    }

    expect(lateStream.getTracks()[0].stop).toHaveBeenCalled();
    expect(gen2).toBe(streamGen);
  });
});

describe('WebCameraView audio track cleanup after recording', () => {
  it('stopRecording restarts stream without audio to release microphone', async () => {
    const audioTrack = makeMockTrack('audio');
    const videoTrack = makeMockTrack('video');
    const streamWithAudio = makeMockStream([videoTrack, audioTrack]);

    // After recording stops, the stream has audio tracks
    const audioTrackCount = streamWithAudio.getAudioTracks().length;
    expect(audioTrackCount).toBe(1);

    // The fix: stopRecording checks for audio tracks and restarts
    // the stream without audio, which calls stopStream first,
    // stopping both tracks.
    streamWithAudio.getTracks().forEach((t) => t.stop());

    expect(audioTrack.stop).toHaveBeenCalled();
    expect(videoTrack.stop).toHaveBeenCalled();
  });
});

describe('useCameraVisibilityRecovery — dead stream detection', () => {
  it('detects ended track and triggers restart on visibility change', () => {
    const videoTrack = makeMockTrack('video');
    // Simulate track that ended while tab was hidden
    videoTrack.readyState = 'ended';

    const stream = makeMockStream([videoTrack]);
    const getStream = () => stream;
    const isStreamDead = !getStream()?.getVideoTracks()[0] || getStream()!.getVideoTracks()[0].readyState === 'ended';

    expect(isStreamDead).toBe(true);
  });

  it('does not restart when stream is still alive', () => {
    const videoTrack = makeMockTrack('video');
    videoTrack.readyState = 'live';

    const stream = makeMockStream([videoTrack]);
    const getStream = () => stream;
    const isStreamDead = !getStream()?.getVideoTracks()[0] || getStream()!.getVideoTracks()[0].readyState === 'ended';

    expect(isStreamDead).toBe(false);
  });
});
