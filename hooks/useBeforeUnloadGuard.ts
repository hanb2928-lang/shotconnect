import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * Registers a `beforeunload` event listener on web that triggers a native
 * browser confirmation dialog when the user tries to close the tab,
 * refresh, or navigate away during critical background work.
 *
 * On native platforms this is a no-op — the OS manages app lifecycle
 * differently, and background tasks survive navigation within the app.
 *
 * The guard is active only when `isActive` is true. When the work
 * completes or the component unmounts, the listener is removed so the
 * user can navigate freely again.
 *
 * @param isActive - whether critical work is in progress
 * @param message - debug label (browsers no longer allow custom messages,
 *                  but this is logged for diagnostics)
 */
export function useBeforeUnloadGuard(
  isActive: boolean,
  message: string = '작업이 진행 중입니다. 정말 나가시겠습니까?',
): void {
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (typeof window.addEventListener !== 'function') return;

    const handler = (event: BeforeUnloadEvent) => {
      if (!isActiveRef.current) return;
      event.preventDefault();
      // Chrome requires returnValue to be set; Firefox ignores the message
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);

    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, []);
}

/**
 * Imperative API for non-React contexts (edge functions, workers, etc.).
 * Returns an activate/deactivate pair.
 */
export function createBeforeUnloadGuard(): {
  activate: () => void;
  deactivate: () => void;
} {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return { activate: () => {}, deactivate: () => {} };
  }

  let handler: ((event: BeforeUnloadEvent) => void) | null = null;

  const activate = () => {
    if (handler) return;
    handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
  };

  const deactivate = () => {
    if (!handler) return;
    window.removeEventListener('beforeunload', handler);
    handler = null;
  };

  return { activate, deactivate };
}
