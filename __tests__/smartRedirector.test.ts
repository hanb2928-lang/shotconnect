import { getPlatformLink, smartRedirect, PLATFORM_LINKS } from '@/lib/smartRedirector';

// Mock react-native Platform and Linking
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Linking: {
    canOpenURL: jest.fn().mockResolvedValue(true),
    openURL: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

describe('smartRedirector', () => {
  describe('getPlatformLink', () => {
    it('returns link config for known platforms', () => {
      const link = getPlatformLink('instagram');
      expect(link.appUrl).toBe('instagram://');
      expect(link.webUrl).toBe('https://www.instagram.com');
      expect(link.label).toBe('인스타그램');
    });

    it('returns fallback config for unknown platforms', () => {
      const link = getPlatformLink('unknownplatform');
      expect(link.webUrl).toContain('unknownplatform');
      expect(link.label).toBe('unknownplatform');
    });

    it('has all expected platforms', () => {
      expect(PLATFORM_LINKS.instagram).toBeDefined();
      expect(PLATFORM_LINKS.youtube).toBeDefined();
      expect(PLATFORM_LINKS.tiktok).toBeDefined();
      expect(PLATFORM_LINKS.naverBlog).toBeDefined();
      expect(PLATFORM_LINKS.twitter).toBeDefined();
      expect(PLATFORM_LINKS.threads).toBeDefined();
      expect(PLATFORM_LINKS.pinterest).toBeDefined();
      expect(PLATFORM_LINKS.kakao).toBeDefined();
    });
  });

  describe('smartRedirect (web)', () => {
    it('copies to clipboard and opens web URL on web platform', async () => {
      const result = await smartRedirect('instagram', '테스트 문구');
      expect(result.success).toBe(true);
      expect(result.method).toBe('web');
      expect(result.message).toContain('인스타그램');
    });

    it('calls onClipboardCopied callback', async () => {
      let copied = false;
      await smartRedirect('youtube', '테스트', {
        onClipboardCopied: () => { copied = true; },
      });
      // On web, clipboard should succeed
      expect(copied).toBe(true);
    });

    it('calls onFallback callback on web', async () => {
      let fallbackUrl = '';
      await smartRedirect('tiktok', '테스트', {
        onFallback: (url) => { fallbackUrl = url; },
      });
      expect(fallbackUrl).toBe('https://www.tiktok.com');
    });
  });
});
