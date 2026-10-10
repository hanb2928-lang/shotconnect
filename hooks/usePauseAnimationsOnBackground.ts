/**
 * Cancels Reanimated infinite animations on background and re-arms them
 * on foreground to prevent UI-thread zombie nodes.
 *
 * On native, when the app backgrounds, the JS thread suspends but the
 * Reanimated UI thread keeps running withRepeat animations. On return,
 * the UI thread tries to sync with stale animation nodes, causing white
 * screens or crashes. This hook registers an immediate AppState handler
 * that cancels all provided SharedValues on 'background'/'inactive'.
 *
 * The caller passes a ref to an array of SharedValues so the handler
 * always sees the current set without re-registering.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useEffect, useCallback } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { cancelAnimation } from 'react-native-reanimated';
import { Platform } from 'react-native';
import { registerAppStateHandler } from '@/lib/appStateCoordinator';

export function usePauseAnimationsOnBackground() {
  const valuesRef = useRef<SharedValue<any>[]>([]);

  const register = useCallback((...values: SharedValue<any>[]) => {
    valuesRef.current = values;
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const unsub = registerAppStateHandler('immediate', (nextState: string) => {
      if (nextState === 'background' || nextState === 'inactive') {
        for (const sv of valuesRef.current) {
          try {
            cancelAnimation(sv);
          } catch {
            // SharedValue may already be detached
          }
        }
      }
    });
    return () => { unsub(); };
  }, []);

  return register;
}
