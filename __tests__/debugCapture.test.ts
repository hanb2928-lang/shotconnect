import {
  debugSaveRawCapture,
  debugSaveNormalizedCapture,
  debugSaveCompressedCapture,
  isDebugCaptureEnabled,
  clearDebugCaptures,
  getDebugCaptureDir,
} from '@/lib/debugCapture';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

function setupWebDomMock() {
  const anchor = {
    href: '',
    download: '',
    click: jest.fn(),
  };
  const body = {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
  };
  (global as any).document = {
    createElement: jest.fn(() => anchor),
    body,
  };
  (global as any).window = (global as any).window ?? {};
  return { anchor, body };
}

function teardownWebDomMock() {
  delete (global as any).document;
}

describe('debugCapture', () => {
  const originalDev = (global as any).__DEV__;

  afterEach(() => {
    (global as any).__DEV__ = originalDev;
    teardownWebDomMock();
  });

  describe('when __DEV__ is false (production)', () => {
    beforeEach(() => {
      (global as any).__DEV__ = false;
    });

    it('isDebugCaptureEnabled returns false', () => {
      expect(isDebugCaptureEnabled()).toBe(false);
    });

    it('debugSaveRawCapture is a no-op', async () => {
      await expect(
        debugSaveRawCapture('base64data', 'image/jpeg', 720, 1280, 'test'),
      ).resolves.toBeUndefined();
    });

    it('debugSaveNormalizedCapture is a no-op', async () => {
      await expect(
        debugSaveNormalizedCapture('base64data', 'image/jpeg', 720, 1280, 'test'),
      ).resolves.toBeUndefined();
    });

    it('debugSaveCompressedCapture is a no-op', async () => {
      await expect(
        debugSaveCompressedCapture('base64data', 'image/webp', 720, 1280, 'test'),
      ).resolves.toBeUndefined();
    });

    it('clearDebugCaptures returns 0', async () => {
      expect(await clearDebugCaptures()).toBe(0);
    });

    it('getDebugCaptureDir returns null', async () => {
      expect(await getDebugCaptureDir()).toBeNull();
    });
  });

  describe('when __DEV__ is true (development)', () => {
    beforeEach(() => {
      (global as any).__DEV__ = true;
    });

    it('isDebugCaptureEnabled returns true', () => {
      expect(isDebugCaptureEnabled()).toBe(true);
    });

    it('debugSaveRawCapture triggers a download on web', async () => {
      const { anchor, body } = setupWebDomMock();

      await debugSaveRawCapture('rawdata', 'image/jpeg', 1080, 1920, 'inline-web-raw');

      expect(anchor.click).toHaveBeenCalled();
      expect(body.appendChild).toHaveBeenCalledWith(anchor);
      expect(body.removeChild).toHaveBeenCalledWith(anchor);
      expect(anchor.download).toContain('raw');
      expect(anchor.download).toContain('inline_web_raw');
      expect(anchor.href).toContain('data:image/jpeg;base64,rawdata');
    });

    it('debugSaveNormalizedCapture creates download with normalized stage tag', async () => {
      const { anchor } = setupWebDomMock();

      await debugSaveNormalizedCapture('normdata', 'image/webp', 720, 720, 'test-source');

      expect(anchor.click).toHaveBeenCalled();
      expect(anchor.download).toContain('normalized');
      expect(anchor.href).toContain('data:image/webp;base64,normdata');
    });

    it('debugSaveCompressedCapture creates download with compressed stage tag', async () => {
      const { anchor } = setupWebDomMock();

      await debugSaveCompressedCapture('compdata', 'image/jpeg', 720, 720, 'test');

      expect(anchor.click).toHaveBeenCalled();
      expect(anchor.download).toContain('compressed');
    });

    it('swallows errors without throwing', async () => {
      (global as any).document = {
        createElement: jest.fn(() => {
          throw new Error('DOM error');
        }),
        body: { appendChild: jest.fn(), removeChild: jest.fn() },
      };

      await expect(
        debugSaveRawCapture('data', 'image/jpeg', 720, 720, 'test'),
      ).resolves.toBeUndefined();
    });

    it('getDebugCaptureDir returns null on web even in dev', async () => {
      expect(await getDebugCaptureDir()).toBeNull();
    });
  });
});
