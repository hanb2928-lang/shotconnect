/**
 * Default flush handler registration.
 *
 * Wires the proactive memory flush guard to the app's actual cache
 * and resource cleanup functions. This module is imported once at
 * startup — it registers handlers as a side-effect.
 */

import { registerFlushHandler } from '@/lib/proactiveMemoryFlush';
import { mediaCacheClear, flushPendingToL2, sweepL2StaleEntries } from '@/lib/mediaCache';
import { releaseAllGLContexts } from '@/lib/glRenderer';
import { sweepTempFiles } from '@/lib/tempFileManager';
import { sweepStaleOfflineCache } from '@/lib/offlineCache';
import { sweepIntermediateTempFiles } from '@/lib/storageLifecycle';
import { clearBgmCache, clearSfxCache } from '@/lib/assetPreloader';

let registered = false;

/**
 * Register all default flush handlers. Safe to call multiple times —
 * guards against double-registration.
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
}
