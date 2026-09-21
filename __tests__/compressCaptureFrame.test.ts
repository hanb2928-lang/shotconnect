import { compressCaptureFrameToBlob } from '@/lib/imageEdit';

// Mock Platform as web so prepareImageForApi uses the canvas path
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulateAsync: jest.fn(),
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  },
}));

jest.mock('expo-file-system', () => ({
  FileSystem: {
    EncodingType: { Base64: 'base64' },
    readAsStringAsync: jest.fn(),
    getInfoAsync: jest.fn(),
  },
}));

jest.mock('@/lib/apiClient', () => ({
  safeFetch: jest.fn(),
  ANALYSIS_FUNCTION_URL: '',
  fetchWithTimeout: jest.fn(),
}));

const mockCanvas = {
  width: 0,
  height: 0,
  getContext: () => ({
    drawImage: jest.fn(),
    setTransform: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    fillRect: jest.fn(),
  }),
  toDataURL: jest.fn().mockReturnValue('data:image/jpeg;base64,/9j/compressed123'),
};

const mockWindowAddEventListener = jest.fn();
const mockNavigator = { onLine: true };

(global as any).document = {
  createElement: jest.fn().mockReturnValue(mockCanvas),
};
(global as any).window = {
  addEventListener: mockWindowAddEventListener,
  removeEventListener: jest.fn(),
};
(global as any).navigator = mockNavigator;

// Mock atob for base64ToBlob
(global as any).atob = (str: string) => str;

(global as any).Blob = class Blob {
  parts: unknown[];
  type: string;
  constructor(parts: unknown[], options: { type: string }) {
    this.parts = parts;
    this.type = options.type;
  }
};

(global as any).Image = class {
  naturalWidth = 1920;
  naturalHeight = 1080;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin: string | null = null;
  private _src: string = '';
  set src(val: string) {
    this._src = val;
    if (this.onload) {
      this.onload();
    }
  }
  get src() {
    return this._src;
  }
};

describe('compressCaptureFrameToBlob', () => {
  it('compresses a raw capture frame to JPEG Blob at 1080px max with quality 0.78', async () => {
    const rawBase64 = 'rawbase64data';
    const result = await compressCaptureFrameToBlob(rawBase64, 'image/jpeg');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.base64).toBe('/9j/compressed123');
    expect(result.blob).toBeInstanceOf((global as any).Blob);
    expect((result.blob as Blob).type).toBe('image/jpeg');
    expect(mockCanvas.width).toBe(0); // canvas was cleaned up
  });

  it('returns original data as Blob when compression fails', async () => {
    mockCanvas.toDataURL = jest.fn().mockImplementation(() => {
      throw new Error('canvas error');
    });
    const rawBase64 = 'rawbase64data';
    const result = await compressCaptureFrameToBlob(rawBase64, 'image/jpeg');
    expect(result.base64).toBe(rawBase64);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.blob).toBeInstanceOf((global as any).Blob);
    // Restore mock
    mockCanvas.toDataURL = jest.fn().mockReturnValue('data:image/jpeg;base64,/9j/compressed123');
  });
});
