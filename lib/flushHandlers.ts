/**
 * Default flush handler registration.
 *
 * Wires the proactive memory flush guard to the app's actual cache
 * and resource cleanup functions. This module is imported once at
 * startup — it registers handlers as a side-effect.
 */

import { Platform } from 'react-native';
import { registerFlushHandler, runProactiveFlush } from '@/lib/proactiveMemoryFlush';
import { mediaCacheClear, flushPendingToL2, sweepL2StaleEntries } from '@/lib/mediaCache';
import { releaseAllGLContexts } from '@/lib/glRenderer';
import { sweepTempFiles } from '@/lib/tempFileManager';
import { sweepStaleOfflineCache } from '@/lib/offlineCache';
import { sweepIntermediateTempFiles } from '@/lib/storageLifecycle';
import { clearBgmCache, clearSfxCache } from '@/lib/assetPreloader';
import { registerAppStateHandler } from '@/lib/appStateCoordinator';

let registered = false;

/**
 * Register all default flush handlers. Safe to call multiple times —
 * guards against double-registration.
 *
 * Also wires the flush system to native AppState transitions so that
 * memory is proactively freed BEFORE the OS OOM-killer strikes. On
 * native, the web-only performance.memory pressure detector is
 * unavailable, so without this wiring the entire flush system is
 * inert and large base64 strings in mediaCache L1 stay pinned in
 * the JS heap during background — the primary cause of OOM kills.
 */
export function registerDefaultFlushHandlers(): void {
  if (registered) return;
  registered = true;

  registerFlushHandler('gl-contexts', () => {
    releaseAllGLContexts();
  });

  registerFlushHandler('temp-files', async () => {
    await sweepTempFiles(30_000);
  });

  registerFlushHandler('media-cache-l2', async () => {
    await flushPendingToL2();
    await sweepL2StaleEntries();
  });

  registerFlushHandler('offline-cache', async () => {
    await sweepStaleOfflineCache();
  });

  registerFlushHandler('intermediate-temp-files', async () => {
    await sweepIntermediateTempFiles();
  });

  registerFlushHandler('media-cache-l1', () => {
    mediaCacheClear();
  });

  registerFlushHandler('bgm-sfx-cache', () => {
    clearBgmCache();
    clearSfxCache();
  });

  // Native: the web-only performance.memory pressure detector is
  // unavailable, so we use AppState transitions as the trigger.
  // Immediate phase: evict L1 cache (pure JS — no bridge calls) to
  //   free large base64 strings from the JS heap before the OS
  //   locks the bridge and before the OOM killer targets the app.
  // Deferred phase: flush pending L2 writes and run the full
  //   proactive flush (bridge-touching operations like temp file
  //   sweeps and GL context release) in sequential macrotasks so
  //   they don't flood the bridge during the lock window.
  if (Platform.OS !== 'web') {
    registerAppStateHandler('immediate', (nextState: string) => {
      if (nextState === 'background' || nextState === 'inactive') {
        mediaCacheClear();
      }
    });

    registerAppStateHandler('deferred', (nextState: string) => {
      if (nextState === 'background' || nextState === 'inactive') {
        flushPendingToL2().catch(() => {});
        runProactiveFlush(true).catch(() => {});
      }
    });
  }
}
