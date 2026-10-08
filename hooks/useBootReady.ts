/**
 * Centralized boot readiness guard.
 *
 * Aggregates all essential resource initialization signals — fonts,
 * storage, and a hard timeout fallback — into a single boolean that
 * gates the splash-to-app transition. This prevents the splash from
 * fading out before critical resources are ready, which would expose
 * a blank or partially-rendered screen during preview updates.
 *
 * The guard is designed to survive Fast Refresh: on a remount, the
 * hook reads the sessionStorage boot marker from useBootState. If
 * already booted, it immediately reports ready without re-running
 * any init logic.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { initStorage, isStorageReady } from '@/lib/storage';

const BOOT_READY_TIMEOUT_MS = 2500;

interface BootReadyInputs {
  /** Whether fonts have loaded (or errored / timed out). */
  fontsReady: boolean;
  /** Whether the boot phase is 'booted' (from useBootState). */
  bootPhase: 'booting' | 'booted';
}

export function useBootReady({ fontsReady, bootPhase }: BootReadyInputs): {
  isBootReady: boolean;
} {
  const [isBootReady, setIsBootReady] = useState(() => {
    if (bootPhase !== 'booted') return false;
    if (!fontsReady) return false;
    return isStorageReady();
  });
  const initStartedRef = useRef(false);
  const fontsReadyRef = useRef(fontsReady);
  fontsReadyRef.current = fontsReady;
  const bootPhaseRef = useRef(bootPhase);
  bootPhaseRef.current = bootPhase;

  const checkReady = useCallback(() => {
    if (bootPhaseRef.current !== 'booted') return false;
    if (!fontsReadyRef.current) return false;
    if (!isStorageReady()) return false;
    return true;
  }, []);

  useEffect(() => {
    if (bootPhase === 'booted') {
      // Fast Refresh remount — boot already completed in a prior
      // session. Verify resources are still available (storage init
      // is idempotent and may already be done from module scope).
      if (fontsReady && isStorageReady()) {
        setIsBootReady(true);
        return;
      }
    }

    if (initStartedRef.current) return;
    initStartedRef.current = true;

    let cancelled = false;
    let storageTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let hardTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    const resourcePromise = (async () => {
      // Storage was kicked off at module scope in _layout. Await it
      // here with a timeout fallback so a hung native bridge doesn't
      // block boot forever.
      await Promise.race([
        initStorage(),
        new Promise<void>((resolve) => {
          storageTimeoutId = setTimeout(resolve, 1000);
        }),
      ]);
    })();

    const hardTimeout = new Promise<void>((resolve) => {
      hardTimeoutId = setTimeout(resolve, BOOT_READY_TIMEOUT_MS);
    });

    Promise.race([resourcePromise, hardTimeout]).then(() => {
      if (cancelled) return;
      // Even after resources settle, we still need fonts. If fonts
      // aren't ready yet, poll until they are or the hard timeout
      // fires (whichever comes first — the hard timeout already
      // elapsed if we're here from the race loser).
      if (checkReady()) {
        setIsBootReady(true);
      } else {
        // Poll for font readiness up to 1 more second.
        const pollEnd = Date.now() + 1000;
        pollId = setInterval(() => {
          if (cancelled) { if (pollId) clearInterval(pollId); return; }
          if (checkReady() || Date.now() > pollEnd) {
            if (pollId) clearInterval(pollId);
            // Force-ready after timeout: better to show the app with
            // system fonts than to hang on the splash forever.
            setIsBootReady(true);
          }
        }, 50);
      }
    }).catch(() => {
      if (cancelled) return;
      // If resourcePromise rejects (e.g. initStorage throws before
      // the timeout fallback resolves), still proceed to boot — the
      // hard timeout would have done the same.
      setIsBootReady(true);
    });

    return () => {
      cancelled = true;
      if (storageTimeoutId) clearTimeout(storageTimeoutId);
      if (hardTimeoutId) clearTimeout(hardTimeoutId);
      if (pollId) clearInterval(pollId);
    };
  }, [bootPhase, fontsReady, checkReady]);

  return { isBootReady };
}
