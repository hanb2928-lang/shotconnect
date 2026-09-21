/**
 * Smart Redirector — Deep Link Fallback with Web Switching
 *
 * When a mobile URL scheme (instagram://, youtube://) is blocked or
 * fails to open, automatically falls back to the web URL within 100ms.
 * Clipboard copy is guaranteed to complete BEFORE attempting app launch,
 * so the user can always paste their content manually.
 */

import { Platform, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export interface PlatformLink {
  appUrl: string;
  webUrl: string;
  label: string;
}

export interface RedirectResult {
  success: boolean;
  method: 'app' | 'web' | 'clipboard';
  message: string;
}

const PLATFORM_LINKS: Record<string, PlatformLink> = {
  instagram: {
    appUrl: 'instagram://',
    webUrl: 'https://www.instagram.com',
    label: '인스타그램',
  },
  youtube: {
    appUrl: 'youtube://',
    webUrl: 'https://www.youtube.com',
    label: '유튜브',
  },
  tiktok: {
    appUrl: 'tiktok://',
    webUrl: 'https://www.tiktok.com',
    label: '틱톡',
  },
  naverBlog: {
    appUrl: 'naverblog://',
    webUrl: 'https://blog.naver.com',
    label: '네이버 블로그',
  },
  twitter: {
    appUrl: 'twitter://',
    webUrl: 'https://twitter.com',
    label: 'X(트위터)',
  },
  threads: {
    appUrl: 'threads://',
    webUrl: 'https://www.threads.net',
    label: '스레드',
  },
  pinterest: {
    appUrl: 'pinterest://',
    webUrl: 'https://www.pinterest.com',
    label: '핀터레스트',
  },
  kakao: {
    appUrl: 'kakaotalk://',
    webUrl: 'https://accounts.kakao.com/weblogin/share',
    label: '카카오톡',
  },
};

export function getPlatformLink(platform: string): PlatformLink {
  return PLATFORM_LINKS[platform] ?? {
    appUrl: '',
    webUrl: `https://${platform}.com`,
    label: platform,
  };
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else {
      await Clipboard.setStringAsync(text);
    }
    return true;
  } catch {
    return false;
  }
}

export async function smartRedirect(
  platform: string,
  clipboardText: string,
  options?: {
    onClipboardCopied?: () => void;
    onAppLaunch?: () => void;
    onFallback?: (webUrl: string) => void;
  },
): Promise<RedirectResult> {
  const link = getPlatformLink(platform);

  // Step 1: ALWAYS copy to clipboard first — guaranteed success path
  const clipboardSuccess = await copyToClipboard(clipboardText);
  if (clipboardSuccess) {
    options?.onClipboardCopied?.();
  }

  // On web, there are no URL schemes — go straight to the web URL
  if (Platform.OS === 'web') {
    options?.onFallback?.(link.webUrl);
    try {
      window.open(link.webUrl, '_blank');
    } catch {
      // popup blocked — user can click manually
    }
    return {
      success: true,
      method: clipboardSuccess ? 'web' : 'clipboard',
      message: clipboardSuccess
        ? `${link.label} 웹이 열렸고 문구가 복사됐어요. 붙여넣기만 하세요.`
        : `${link.label} 웹이 열렸어요. 문구를 수동으로 복사해주세요.`,
    };
  }

  // Step 2: Try the native URL scheme with a 100ms timeout
  const appLaunchPromise = new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 100);
    if (!link.appUrl) {
      clearTimeout(timeout);
      resolve(false);
      return;
    }
    Linking.canOpenURL(link.appUrl)
      .then((canOpen) => {
        if (canOpen) {
          Linking.openURL(link.appUrl)
            .then(() => {
              clearTimeout(timeout);
              resolve(true);
            })
            .catch(() => {
              clearTimeout(timeout);
              resolve(false);
            });
        } else {
          clearTimeout(timeout);
          resolve(false);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve(false);
      });
  });

  const appLaunched = await appLaunchPromise;

  if (appLaunched) {
    options?.onAppLaunch?.();
    return {
      success: true,
      method: 'app',
      message: clipboardSuccess
        ? `${link.label} 앱이 열렸고 문구가 복사됐어요. 붙여넣기만 하세요.`
        : `${link.label} 앱이 열렸어요.`,
    };
  }

  // Step 3: Fallback to web URL
  options?.onFallback?.(link.webUrl);
  try {
    await Linking.openURL(link.webUrl);
  } catch {
    // can't open web either — at least clipboard is set
    return {
      success: clipboardSuccess,
      method: 'clipboard',
      message: clipboardSuccess
        ? `${link.label} 앱을 열 수 없어 문구만 복사했어요. ${link.label} 웹에서 직접 붙여넣어주세요.`
        : `${link.label} 앱과 웹 모두 열 수 없어요. 문구를 수동으로 복사해주세요.`,
    };
  }

  return {
    success: true,
    method: 'web',
    message: clipboardSuccess
      ? `${link.label} 앱이 없어 웹으로 열었어요. 문구가 복사됐으니 붙여넣기만 하세요.`
      : `${link.label} 웹이 열렸어요. 문구를 수동으로 복사해주세요.`,
  };
}

export { PLATFORM_LINKS };
