/**
 * Realtime WebSocket reconnect debounce guard.
 *
 * Problem: when the native app is backgrounded, the OS suspends the
 * WebSocket socket. On foreground return, the Supabase RealtimeClient
 * detects the dead socket and immediately attempts an auto-reconnect.
 * This reconnect fires BEFORE the native bridge has fully warmed up from
 * suspension — the reconnect packet hits the bridge while it's still
 * initializing, causing the JS thread to block waiting for a response
 * that can't arrive. This is the 97% bottleneck: the render pipeline
 * stalls because the socket reconnect is deadlocked, and touching the
 * app while in this state triggers a watchdog SIGKILL.
 *
 * Solution: explicitly disconnect the RealtimeClient WebSocket on
 * background (immediate phase — no bridge calls, just a socket close
 * flag), then reconnect it AFTER the flush window completes on
 * foreground return. This ensures the socket reconnect happens only
 * after the bridge is stable and the 1-second flush window has
 * staggered all other consumers' bridge work.
 */

import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { registerAppStateHandler } from '@/lib/appStateCoordinator';
import { onFlushComplete, isInFlushWindow } from '@/lib/foregroundFlushGuard';
import { withBridgeThrottle } from '@/lib/bridgeRateLimiter';

let installed = false;

/**
 * Access the underlying RealtimeClient. The Supabase JS client exposes
 * this as `supabase.realtime` at runtime, though the TypeScript types
 * don't include it. We access it defensively.
 */
function getRealtimeClient(): { disconnect: () => void; connect: () => void } | null {
  try {
    const rt = (supabase as unknown as { realtime?: { disconnect: () => void; connect: () => void } }).realtime;
    if (rt && typeof rt.disconnect === 'function' && typeof rt.connect === 'function') {
      return rt;
    }
  } catch {
    // non-fatal
  }
  return null;
}

/**
 * Install the reconnect guard. Called once at startup from _layout.tsx.
 * On native only — web doesn't suspend sockets.
 *
 * Immediate phase (background): disconnect the RealtimeClient socket
 *   so the OS suspension doesn't leave a half-open socket that the
 *   client tries to auto-reconnect on resume.
 *
 * Deferred phase (foreground): after the flush window completes,
 *   reconnect the socket. Channels re-subscribe automatically once
 *   the socket is live. If the flush window is already closed, the
 *   reconnect fires on the next macrotask.
 */
export function installRealtimeReconnectGuard(): () => void {
  if (installed) return () => {};
  if (Platform.OS === 'web') {
    installed = true;
    return () => {};
  }

  const rt = getRealtimeClient();
  if (!rt) {
    installed = true;
    return () => {};
  }

  const unsubBg = registerAppStateHandler('immediate', (nextState: string) => {
    // Only disconnect on full background — NOT on iOS 'inactive'.
    // 'inactive' fires for transient interruptions (notification banner,
    // Control Center, Siri). Tearing down the socket on 'inactive'
    // triggers a full reconnect stampede when 'active' follows seconds
    // later, overloading the native bridge and crashing the app.
    if (nextState === 'background') {
      // rt.disconnect() is a WebSocket bridge call. On Android, the JS
      // thread suspends faster than iOS — calling it synchronously in
      // the immediate phase blocks the JS thread waiting for a bridge
      // response that will never arrive, causing an ANR → SIGKILL.
      // Defer to setTimeout(0): if the OS suspends before it fires,
      // the socket stays alive but the foreground reconnect handler
      // re-establishes it cleanly via rt.connect().
      setTimeout(() => {
        try { rt.disconnect(); } catch { /* non-fatal */ }
      }, 0);
    }
  });

  const unsubFg = registerAppStateHandler('deferred', (nextState: string) => {
    if (nextState !== 'active') return;
    const doReconnect = () => {
      try { rt.connect(); } catch { /* non-fatal */ }
    };
    if (isInFlushWindow()) {
      onFlushComplete(() => withBridgeThrottle(doReconnect));
    } else {
      withBridgeThrottle(doReconnect);
    }
  });

  installed = true;

  return () => {
    unsubBg();
    unsubFg();
    installed = false;
  };
}
