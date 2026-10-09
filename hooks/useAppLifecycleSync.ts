import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { ensureFreshSession } from '@/lib/supabase';

/**
 * Refresh the auth session and run sync callbacks when the app returns
 * to the foreground. On native, listens to AppState; on web, listens to
 * the Page Visibility API. The session refresh fires before any caller
 * callbacks so subsequent DB queries use a valid token.
 */
export function useAppLifecycleSync(onForegroundSync?: () => void | Promise<void>): void {
  const callbackRef = useRef(onForegroundSync);
  callbackRef.current = onForegroundSync;

  useEffect(() => {
    let mounted = true;

    const handleForeground = async () => {
      if (!mounted) return;
      try {
        await ensureFreshSession();
      } catch {
        // Token refresh failure is non-fatal — callers retry on their own.
      }
      try {
        await callbackRef.current?.();
      } catch {
        // Caller errors must not crash the lifecycle listener.
      }
    };

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleVisibility = () => {
        if (!document.hidden) handleForeground();
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        mounted = false;
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') handleForeground();
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
}
