/**
 * Storage namespace registry and unified garbage collector.
 *
 * Every module that persists data to AsyncStorage/localStorage registers its
 * namespace here with a TTL and sweep strategy. The unified GC
 * (runStorageGC) iterates all registered namespaces in a single pass at boot
 * and periodically, removing expired entries without each module having to
 * implement its own sweep.
 *
 * Namespaces are separated into two tiers:
 *
 *   SETTING — persistent user preferences (theme, language, density, API keys).
 *             No TTL. These are small strings that hydrate synchronously at boot
 *             via the read cache. They must never be swept.
 *
 *   TRANSIENT — time-limited data (drafts, cache entries, cooldowns, learning
 *               state, active job markers). Each has a TTL; expired entries are
 *               removed by runStorageGC.
 *
 * This separation ensures that state hydration at boot only touches SETTING
 * keys (via the read cache warm-up in storage.ts), while TRANSIENT keys are
 * lazily read and proactively swept — preventing quota exhaustion from
 * accumulated transient data slowing down boot.
 */

import { getItem, removeItem } from '@/lib/storage';
import { addBreadcrumb } from '@/lib/errorLogger';

export type NamespaceTier = 'setting' | 'transient';

export interface NamespaceSpec {
  prefix: string;
  tier: NamespaceTier;
  ttlMs: number;
  description: string;
}

const registry = new Map<string, NamespaceSpec>();

export function registerNamespace(spec: NamespaceSpec): void {
  registry.set(spec.prefix, spec);
}

export function getRegisteredNamespaces(): NamespaceSpec[] {
  return Array.from(registry.values());
}

export function isTransientPrefix(key: string): boolean {
  for (const spec of registry.values()) {
    if (spec.tier === 'transient' && key.startsWith(spec.prefix)) return true;
  }
  return false;
}

export function getTtlForPrefix(key: string): number | null {
  for (const spec of registry.values()) {
    if (key.startsWith(spec.prefix)) return spec.ttlMs;
  }
  return null;
}

const DEFAULT_SETTING_TTL = Infinity;

export const NAMESPACES = {
  SETTING_THEME: { prefix: 'theme_', tier: 'setting' as const, ttlMs: DEFAULT_SETTING_TTL, description: 'Theme and display density preferences' },
  SETTING_LANGUAGE: { prefix: 'i18n_', tier: 'setting' as const, ttlMs: DEFAULT_SETTING_TTL, description: 'Selected language/locale' },
  SETTING_MASCOT: { prefix: 'mascot_', tier: 'setting' as const, ttlMs: DEFAULT_SETTING_TTL, description: 'Mascot animation preferences' },
  SETTING_API_KEY: { prefix: 'local_api_key_', tier: 'setting' as const, ttlMs: DEFAULT_SETTING_TTL, description: 'Per-provider API keys stored locally' },
  SETTING_DEVICE_ID: { prefix: 'device_id', tier: 'setting' as const, ttlMs: DEFAULT_SETTING_TTL, description: 'Unique device identifier for push' },
  SETTING_DENSITY: { prefix: 'display_density', tier: 'setting' as const, ttlMs: DEFAULT_SETTING_TTL, description: 'UI density mode' },
  SETTING_PRESET: { prefix: 'theme_preset', tier: 'setting' as const, ttlMs: DEFAULT_SETTING_TTL, description: 'Theme color preset name' },
  SETTING_SAFETY: { prefix: 'safety_check_', tier: 'setting' as const, ttlMs: DEFAULT_SETTING_TTL, description: 'Account safety check dismiss state' },
  SETTING_TRIGGER: { prefix: 'trigger_', tier: 'setting' as const, ttlMs: DEFAULT_SETTING_TTL, description: 'Trigger banner dismiss state' },
  TRANSIENT_DRAFT: { prefix: 'draft:', tier: 'transient' as const, ttlMs: 7 * 24 * 60 * 60 * 1000, description: 'In-progress work drafts' },
  TRANSIENT_DRAFT_INDEX: { prefix: 'draft:index', tier: 'transient' as const, ttlMs: 7 * 24 * 60 * 60 * 1000, description: 'Draft index list' },
  TRANSIENT_CACHE: { prefix: 'cache:', tier: 'transient' as const, ttlMs: 5 * 60 * 1000, description: 'Short-lived API response cache' },
  TRANSIENT_SHARE_COOLDOWN: { prefix: 'share_history', tier: 'transient' as const, ttlMs: 24 * 60 * 60 * 1000, description: 'Share cooldown history' },
  TRANSIENT_VIDEO_JOB: { prefix: 'active_video_job', tier: 'transient' as const, ttlMs: 24 * 60 * 60 * 1000, description: 'Active video generation job marker' },
  TRANSIENT_PROSODY: { prefix: 'prosody_learning', tier: 'transient' as const, ttlMs: 30 * 24 * 60 * 60 * 1000, description: 'Prosody learning state' },
  TRANSIENT_PSYCH: { prefix: 'psych_learning', tier: 'transient' as const, ttlMs: 30 * 24 * 60 * 60 * 1000, description: 'Psychology engine learning state' },
  TRANSIENT_PUSH: { prefix: 'push_subscribed', tier: 'transient' as const, ttlMs: 7 * 24 * 60 * 60 * 1000, description: 'Push subscription marker' },
} as const;

let registered = false;

export function registerAllNamespaces(): void {
  if (registered) return;
  registered = true;
  for (const spec of Object.values(NAMESPACES)) {
    registerNamespace(spec);
  }
}

export interface StorageGCResult {
  scanned: number;
  removed: number;
  namespacesAffected: string[];
  durationMs: number;
}

interface StoredEntry {
  timestamp?: number;
  updatedAt?: number;
  ts?: number;
  createdAt?: number;
}

function extractTimestamp(raw: string): number {
  try {
    const parsed = JSON.parse(raw) as StoredEntry;
    return parsed.timestamp ?? parsed.updatedAt ?? parsed.ts ?? parsed.createdAt ?? 0;
  } catch {
    return 0;
  }
}

async function scanAndSweepPrefix(
  prefix: string,
  ttlMs: number,
): Promise<{ scanned: number; removed: number }> {
  let scanned = 0;
  let removed = 0;
  const now = Date.now();

  if (typeof window !== 'undefined' && window.localStorage) {
    const keysToRemove: string[] = [];
    const allKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) allKeys.push(k);
    }
    for (const k of allKeys) {
      scanned++;
      try {
        const raw = window.localStorage.getItem(k);
        if (!raw) {
          keysToRemove.push(k);
          continue;
        }
        const ts = extractTimestamp(raw);
        if (ts === 0 || now - ts > ttlMs) {
          keysToRemove.push(k);
        }
      } catch {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      try {
        window.localStorage.removeItem(k);
        removed++;
      } catch {}
    }
    return { scanned, removed };
  }

  return { scanned, removed };
}

export async function runStorageGC(): Promise<StorageGCResult> {
  registerAllNamespaces();
  const start = Date.now();
  let totalScanned = 0;
  let totalRemoved = 0;
  const affected: string[] = [];

  const transientNamespaces = getRegisteredNamespaces().filter(
    (s) => s.tier === 'transient',
  );

  for (const spec of transientNamespaces) {
    await new Promise<void>((r) => setTimeout(r, 0));
    try {
      const { scanned, removed } = await scanAndSweepPrefix(spec.prefix, spec.ttlMs);
      totalScanned += scanned;
      totalRemoved += removed;
      if (removed > 0) affected.push(spec.prefix);
    } catch {}
  }

  const durationMs = Date.now() - start;
  if (totalRemoved > 0) {
    addBreadcrumb(
      'storageGC',
      `Removed ${totalRemoved} expired entries across ${affected.length} namespaces in ${durationMs}ms`,
      'warning',
      { totalScanned, totalRemoved, affected },
    );
  }

  return {
    scanned: totalScanned,
    removed: totalRemoved,
    namespacesAffected: affected,
    durationMs,
  };
}

let periodicGcTimer: ReturnType<typeof setInterval> | null = null;
const PERIODIC_GC_INTERVAL_MS = 4 * 60 * 60 * 1000;

export function startPeriodicStorageGC(): void {
  if (periodicGcTimer) return;
  periodicGcTimer = setInterval(() => {
    runStorageGC().catch(() => {});
  }, PERIODIC_GC_INTERVAL_MS);
}

export function stopPeriodicStorageGC(): void {
  if (periodicGcTimer) {
    clearInterval(periodicGcTimer);
    periodicGcTimer = null;
  }
}
