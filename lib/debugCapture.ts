/**
 * Development-only debug capture logger.
 *
 * When __DEV__ is true, captured frames at each pipeline stage are saved
 * to a debug cache directory (native) or as downloadable files (web) so
 * the developer can inspect pixel dimensions, compression quality, and
 * file format on a real device.
 *
 * In production builds, __DEV__ is false and the entire module body is
 * dead-code-eliminated by the bundler. The exported functions become
 * no-ops with zero runtime overhead — no file I/O, no gallery writes,
 * no debug directories created.
 */

import { Platform } from 'react-native';

const DEBUG_DIR_PREFIX = 'debug-capture';
const MAX_DEBUG_FILES = 30;

type DebugStage = 'raw' | 'normalized' | 'compressed';

interface DebugCaptureMeta {
  stage: DebugStage;
  width: number;
  height: number;
  mimeType: string;
  base64: string;
  source: string;
}

let debugFileCounter = 0;

function timestamp(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}${mm}${ss}${ms}`;
}

function debugFilename(stage: DebugStage, source: string, mimeType: string): string {
  const ext = mimeType.includes('webp') ? 'webp' : mimeType.includes('png') ? 'png' : 'jpg';
  const tag = source.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  return `${DEBUG_DIR_PREFIX}/${timestamp()}_${stage}_${tag}_${debugFileCounter++}.${ext}`;
}

/**
 * Save a captured frame to the debug directory. Only runs in __DEV__.
 * On web: creates a temporary download link (the browser saves to Downloads).
 * On native: writes to the cache directory under a debug-capture/ subfolder.
 *
 * All errors are swallowed — debug logging must never break the capture pipeline.
 */
export async function debugSaveCapture(meta: DebugCaptureMeta): Promise<void> {
  if (!__DEV__) return;

  const filename = debugFilename(meta.stage, meta.source, meta.mimeType);
  const dataUrl = `data:${meta.mimeType};base64,${meta.base64}`;

  try {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename.replace(/\//g, '_');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      const fs = await import('expo-file-system/legacy');
      const dir = `${fs.cacheDirectory}${DEBUG_DIR_PREFIX}`;
      const dirInfo = await fs.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await fs.makeDirectoryAsync(dir, { intermediates: true });
      }
      const fullPath = `${dir}/${filename.split('/').pop()}`;
      await fs.writeAsStringAsync(fullPath, meta.base64, {
        encoding: fs.EncodingType.Base64,
      });

      // Prune old debug files to avoid unbounded cache growth
      await pruneDebugDir(fs, dir);
    }
  } catch {
    // Swallow: debug logging is best-effort and must never
    // interfere with the main capture pipeline.
  }
}

/**
 * Convenience wrapper for the raw capture stage — the frame straight
 * from the camera before any normalization.
 */
export async function debugSaveRawCapture(
  base64: string,
  mimeType: string,
  width: number,
  height: number,
  source: string,
): Promise<void> {
  if (!__DEV__) return;
  await debugSaveCapture({
    stage: 'raw',
    width,
    height,
    mimeType,
    base64,
    source,
  });
}

/**
 * Convenience wrapper for the normalized stage — after 720px clamp
 * and JPEG re-encode.
 */
export async function debugSaveNormalizedCapture(
  base64: string,
  mimeType: string,
  width: number,
  height: number,
  source: string,
): Promise<void> {
  if (!__DEV__) return;
  await debugSaveCapture({
    stage: 'normalized',
    width,
    height,
    mimeType,
    base64,
    source,
  });
}

/**
 * Convenience wrapper for the compressed stage — after upload prep
 * (WebP/JPEG at target quality).
 */
export async function debugSaveCompressedCapture(
  base64: string,
  mimeType: string,
  width: number,
  height: number,
  source: string,
): Promise<void> {
  if (!__DEV__) return;
  await debugSaveCapture({
    stage: 'compressed',
    width,
    height,
    mimeType,
    base64,
    source,
  });
}

/**
 * Prune the debug directory to keep at most MAX_DEBUG_FILES files.
 * Removes oldest files first (by mtime).
 */
async function pruneDebugDir(
  fs: typeof import('expo-file-system/legacy'),
  dir: string,
): Promise<void> {
  try {
    const files = await fs.readDirectoryAsync(dir);
    if (files.length <= MAX_DEBUG_FILES) return;

    const infos = await Promise.all(
      files.map(async (name) => {
        const path = `${dir}/${name}`;
        const info = await fs.getInfoAsync(path);
        return { name, path, modificationTime: info.exists ? (info as any).modificationTime ?? 0 : 0 };
      }),
    );

    infos.sort((a, b) => a.modificationTime - b.modificationTime);
    const toRemove = infos.slice(0, infos.length - MAX_DEBUG_FILES);
    await Promise.all(
      toRemove.map((f) => fs.deleteAsync(f.path, { idempotent: true }).catch(() => {})),
    );
  } catch {
    // best-effort
  }
}

/**
 * Whether debug capture logging is currently active.
 * Returns false in production builds.
 */
export function isDebugCaptureEnabled(): boolean {
  return __DEV__;
}

/**
 * Get the debug capture directory path (native only).
 * Returns null on web or in production.
 */
export async function getDebugCaptureDir(): Promise<string | null> {
  if (!__DEV__) return null;
  if (Platform.OS === 'web') return null;
  try {
    const fs = await import('expo-file-system/legacy');
    return `${fs.cacheDirectory}${DEBUG_DIR_PREFIX}`;
  } catch {
    return null;
  }
}

/**
 * Clear all debug capture files. Called from the settings screen
 * when the developer wants to purge old debug frames.
 */
export async function clearDebugCaptures(): Promise<number> {
  if (!__DEV__) return 0;
  if (Platform.OS === 'web') return 0;
  try {
    const fs = await import('expo-file-system/legacy');
    const dir = `${fs.cacheDirectory}${DEBUG_DIR_PREFIX}`;
    const info = await fs.getInfoAsync(dir);
    if (!info.exists) return 0;
    const files = await fs.readDirectoryAsync(dir);
    await Promise.all(
      files.map((name) =>
        fs.deleteAsync(`${dir}/${name}`, { idempotent: true }).catch(() => {}),
      ),
    );
    return files.length;
  } catch {
    return 0;
  }
}
