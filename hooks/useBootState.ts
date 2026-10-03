/**
 * Boot state guard for reliable splash screen display.
 *
 * During Fast Refresh / hot module reloading, React preserves component
 * state across re-renders. This means `ready: 'app'` and
 * `splashHiddenRef.current = true` survive a hot reload, causing the
 * splash screen to be skipped on the refreshed tree — the user sees a
 * flash of unstyled or partially-loaded content instead of the proper
 * loading screen.
 *
 * This hook uses sessionStorage to distinguish a true fresh page load
 * (full navigation/reload) from a Fast Refresh remount. On a fresh
 * load, sessionStorage has no boot marker — we initialize to 'loading'
 * and write the marker once boot completes. On a Fast Refresh remount,
 * the marker is already present from the previous boot, so we know the
 * boot already ran and can safely stay in 'app' state.
 *
 * In development/preview mode (__DEV__), the boot marker is always
 * ignored — every remount forces a fresh boot so the splash screen
 * is always visible during preview updates, preventing stale boot
 * state from skipping the loading animation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

const BOOT_MARKER_KEY = 'shotconnect-boot-session';
const BOOT_VERSION_KEY = 'shotconnect-boot-version';

// Must match SHOTCONNECT_PREVIEW_VERSION in _layout.tsx. When the
// preview version changes, the boot marker is invalidated so the
// splash screen and boot sequence run fresh — preventing a stale
// "already booted" flag from skipping the splash during preview updates.
const BOOT_VERSION = '20261001-shotconnect-v2';

type BootPhase = 'booting' | 'booted';

/**
 * Returns true in development/preview mode. Metro injects `__DEV__`
 * as a global boolean at build time. In production builds it is false.
 * Falls back to checking process.env.NODE_ENV for non-Metro environments
 * (e.g. Jest tests).
 */
function isDevMode(): boolean {
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  } catch {
    // __DEV__ not defined — not in Metro environment
  }
  try {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') return true;
  } catch {
    // process not available
  }
  return false;
}

function readBootMarker(): boolean {
  // In dev/preview mode, always force a fresh boot so the splash
  // screen shows on every hot reload and preview update. This
  // prevents stale sessionStorage markers from skipping the boot
  // sequence during development.
  if (isDevMode()) return false;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (typeof window.sessionStorage === 'undefined') return false;
  try {
    const marker = window.sessionStorage.getItem(BOOT_MARKER_KEY);
    const version = window.sessionStorage.getItem(BOOT_VERSION_KEY);
    // Only treat as booted if the marker exists AND the version matches.
    // A version mismatch means the app was updated (preview refresh or
    // deploy) and the old boot state is stale — force a fresh boot.
    if (marker === '1' && version === BOOT_VERSION) return true;
    // Clean up stale version marker so a subsequent read is clean.
    if (marker === '1' && version !== BOOT_VERSION) {
      window.sessionStorage.removeItem(BOOT_MARKER_KEY);
      window.sessionStorage.removeItem(BOOT_VERSION_KEY);
    }
    return false;
  } catch {
    return false;
  }
}

function writeBootMarker(): void {
  // Don't persist boot marker in dev mode — every remount should
  // start fresh so the splash is always shown during preview updates.
  if (isDevMode()) return;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (typeof window.sessionStorage === 'undefined') return;
  try {
    window.sessionStorage.setItem(BOOT_MARKER_KEY, '1');
    window.sessionStorage.setItem(BOOT_VERSION_KEY, BOOT_VERSION);
  } catch {
    // Restricted sessionStorage — skip silently.
  }
}

function clearBootMarker(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (typeof window.sessionStorage === 'undefined') return;
  try {
    window.sessionStorage.removeItem(BOOT_MARKER_KEY);
    window.sessionStorage.removeItem(BOOT_VERSION_KEY);
  } catch {
    // Restricted — skip.
  }
}

/**
 * Ensures the splash/loading screen shows on every fresh page load,
 * while allowing Fast Refresh to skip the boot sequence.
 *
 * Returns the current boot phase and a `markBooted` callback. The
 * phase starts as 'booting' on a fresh load, or 'booted' on a Fast
 * Refresh remount (detected via the sessionStorage marker). Once
 * boot completes, call `markBooted()` to write the marker and
 * transition to 'booted'.
 *
 * Also exposes `isFreshBoot` for components that need to know whether
 * they should run one-time boot logic.
 */
export function useBootState(): {
  phase: BootPhase;
  isFreshBoot: boolean;
  markBooted: () => void;
} {
  // Read sessionStorage ONCE at initialization. On a fresh page load,
  // the marker is absent → 'booting'. On Fast Refresh, state is
  // preserved so this initializer doesn't re-run — but even if it
  // did, the marker would be present → 'booted'.
  const [phase, setPhase] = useState<BootPhase>(() => {
    const alreadyBooted = readBootMarker();
    return alreadyBooted ? 'booted' : 'booting';
  });

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const markBooted = useCallback(() => {
    if (phaseRef.current === 'booted') return;
    writeBootMarker();
    setPhase('booted');
  }, []);

  // Safety net: if the app unmounts while still booting (e.g. user
  // navigates away during splash), clear the marker so the next
  // visit starts fresh.
  useEffect(() => {
    return () => {
      if (phaseRef.current === 'booting') {
        clearBootMarker();
      }
    };
  }, []);

  return {
    phase,
    isFreshBoot: phase === 'booting',
    markBooted,
  };
}

/**
 * Clears the boot marker. Intended for testing or explicit logout
 * flows that want to force a fresh boot experience.
 */
export function resetBootState(): void {
  clearBootMarker();
}
