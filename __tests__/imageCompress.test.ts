import { compressBase64ForUpload } from '@/lib/imageEdit';

// Mock expo-image-manipulator and expo-file-system since they're native-only
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 1, PNG: 2 },
  FlipType: { Horizontal: 'horizontal' },
}));

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

// Mock react-native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Image: { getSize: jest.fn() },
}));

// Mock apiClient to avoid useNetworkStatus window.addEventListener issue
jest.mock('@/lib/apiClient', () => ({
  safeFetch: jest.fn(),
}));

// Mock supabase to avoid network init
jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: jest.fn() } },
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
}));

describe('compressBase64ForUpload', () => {
  beforeEach(() => {
    (global as any).Image = class {
      naturalWidth = 2400;
      naturalHeight = 1600;
      onload: () => void = () => {};
      onerror: () => void = () => {};
      set src(_val: string) {
        setTimeout(() => this.onload(), 0);
      }
    };

    (global as any).document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({
              drawImage: jest.fn(),
            }),
            toDataURL: jest.fn(() => 'data:image/webp;base64,UklGRkAAAABXRUJQ'),
          };
        }
        return {};
      },
    };
  });

  afterEach(() => {
    delete (global as any).Image;
    delete (global as any).document;
  });

  it('compresses large images to WebP format', async () => {
    const largeBase64 = 'iVBORw0KGgoAAAANSUhEUgAABQAAA';
    const result = await compressBase64ForUpload(largeBase64, 'image/png');

    expect(result.mimeType).toBe('image/webp');
    expect(result.base64).not.toBe(largeBase64);
  });

  it('falls back to original on compression failure', async () => {
    // Break document to force fallback
    (global as any).document = {
      createElement: () => {
        throw new Error('no canvas');
      },
    };

    const originalBase64 = '/9j/4AAQSkZJRgABAQ';
    const result = await compressBase64ForUpload(originalBase64, 'image/jpeg');

    expect(result.base64).toBe(originalBase64);
    expect(result.mimeType).toBe('image/jpeg');
  });
});
