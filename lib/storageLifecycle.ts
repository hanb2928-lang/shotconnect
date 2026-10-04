/**
 * Storage lifecycle management for cloud objects (videos, images, TTS audio).
 *
 * Tracks access events per storage object in the `storage_object_lifecycle`
 * table and provides client-side helpers for:
 *  - Recording access (replay, download, share) to keep objects in the "hot" tier
 *  - Fetching lifecycle policy summaries for the settings UI
 *  - Running a lightweight client-side sweep that classifies locally cached
 *    temp files using the same TTL logic as the server-side function
 *
 * The authoritative tier classification and storage deletion happen server-side
 * via the `storage-lifecycle-sweep` edge function, which calls the
 * `classify_storage_tiers` and `get_expired_objects` DB functions.
 */

import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { sweepTempFiles } from '@/lib/tempFileManager';
import { addBreadcrumb } from '@/lib/errorLogger';

export type StorageTier = 'hot' | 'warm' | 'cold' | 'expired';
export type StorageObjectType = 'video' | 'image' | 'tts_audio' | 'intermediate';

export interface LifecyclePolicy {
  objectType: StorageObjectType;
  hotTtlHours: number;
  warmTtlDays: number;
  coldTtlDays: number;
  deleteOnExpire: boolean;
}

export interface LifecycleSummary {
  tier: StorageTier;
  count: number;
}

export interface StorageLifecycleStats {
  totalObjects: number;
  totalSizeBytes: number;
  byTier: Record<StorageTier, number>;
  policies: LifecyclePolicy[];
}

/**
 * Record an access event for a storage object. This resets the object to the
 * "hot" tier and increments its access count. Called whenever the user
 * replays, downloads, or shares a video.
 */
export async function touchStorageObject(
  scanId: string,
  bucket: string,
  objectPath: string,
  objectType: StorageObjectType = 'video',
  sizeBytes = 0,
): Promise<void> {
  try {
    const { error } = await supabase.rpc('touch_storage_object', {
      p_scan_id: scanId,
      p_bucket: bucket,
      p_object_path: objectPath,
      p_object_type: objectType,
      p_size_bytes: sizeBytes,
    });
    if (error) throw error;
    addBreadcrumb('storage', `Object touched: ${bucket}/${objectPath}`, 'warning', { scanId, objectType });
  } catch (err) {
    // Non-fatal: access tracking is best-effort. The object still works;
    // it just won't have its TTL reset this time.
    addBreadcrumb('storage', `touch_storage_object failed: ${(err as Error).message}`, 'warning');
  }
}

/**
 * Register a newly created storage object in the lifecycle table.
 * Called after a video render or image generation completes and uploads
 * the result to Supabase Storage.
 */
export async function registerStorageObject(
  scanId: string,
  bucket: string,
  objectPath: string,
  objectType: StorageObjectType = 'video',
  sizeBytes = 0,
): Promise<void> {
  try {
    const { error } = await supabase.from('storage_object_lifecycle').upsert(
      {
        scan_id: scanId,
        bucket,
        object_path: objectPath,
        object_type: objectType,
        size_bytes: sizeBytes,
        last_accessed_at: new Date().toISOString(),
        access_count: 0,
        tier: 'hot',
      },
      { onConflict: 'scan_id,bucket,object_path' },
    );
    if (error) throw error;
  } catch {
    // Best-effort: if this fails, the object won't be tracked for lifecycle,
    // but it still exists in storage and is accessible.
  }
}

/**
 * Fetch all lifecycle policies from the DB.
 */
export async function fetchLifecyclePolicies(): Promise<LifecyclePolicy[]> {
  try {
    const { data, error } = await supabase
      .from('storage_lifecycle_policy')
      .select('object_type, hot_ttl_hours, warm_ttl_days, cold_ttl_days, delete_on_expire')
      .order('object_type');
    if (error) throw error;
    if (!data) return [];
    return data.map((row) => ({
      objectType: row.object_type as StorageObjectType,
      hotTtlHours: row.hot_ttl_hours,
      warmTtlDays: row.warm_ttl_days,
      coldTtlDays: row.cold_ttl_days,
      deleteOnExpire: row.delete_on_expire,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch a summary of storage lifecycle status for the settings UI.
 */
export async function fetchLifecycleStats(): Promise<StorageLifecycleStats | null> {
  try {
    const { data, error } = await supabase
      .from('storage_object_lifecycle')
      .select('tier, size_bytes')
      .is('deleted_at', null);
    if (error) throw error;
    if (!data) return null;

    const byTier: Record<StorageTier, number> = { hot: 0, warm: 0, cold: 0, expired: 0 };
    let totalSizeBytes = 0;
    for (const row of data) {
      const tier = (row.tier as StorageTier) ?? 'hot';
      byTier[tier] = (byTier[tier] ?? 0) + 1;
      totalSizeBytes += row.size_bytes ?? 0;
    }

    const policies = await fetchLifecyclePolicies();

    return {
      totalObjects: data.length,
      totalSizeBytes,
      byTier,
      policies,
    };
  } catch {
    return null;
  }
}

/**
 * Trigger the server-side lifecycle sweep edge function.
 * This classifies all objects into tiers and deletes expired ones.
 * Returns a summary of the sweep result, or null on failure.
 */
export async function triggerLifecycleSweep(): Promise<{
  classified: Record<string, number>;
  deleted: number;
} | null> {
  try {
    const url = `${supabaseUrl}/functions/v1/storage-lifecycle-sweep`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    return {
      classified: data.classified ?? {},
      deleted: data.deleted ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Client-side temp file sweep using lifecycle TTL values.
 * This complements the existing 10-minute tempFileManager sweep by also
 * running a longer-interval sweep that uses the storage lifecycle policy
 * TTLs for intermediate files (typically 2 hours hot, 1 day warm).
 *
 * Registered as a flush handler so it runs on memory pressure events.
 */
export async function sweepIntermediateTempFiles(): Promise<number> {
  // Intermediate files use a 2-hour hot TTL by default — we sweep anything
  // older than 2 hours that isn't pinned or locked.
  const INTERMEDIATE_TTL_MS = 2 * 60 * 60 * 1000;
  return sweepTempFiles(INTERMEDIATE_TTL_MS);
}

/**
 * Format bytes into a human-readable string for the UI.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Describe a lifecycle policy in human-readable form.
 */
export function describePolicy(policy: LifecyclePolicy): string {
  const parts: string[] = [];
  parts.push(`HOT ${policy.hotTtlHours}h`);
  parts.push(`WARM ${policy.warmTtlDays}d`);
  parts.push(`COLD ${policy.coldTtlDays}d`);
  if (policy.deleteOnExpire) {
    parts.push('삭제');
  } else {
    parts.push('보존');
  }
  return parts.join(' → ');
}

const TIER_LABELS: Record<StorageTier, string> = {
  hot: 'HOT',
  warm: 'WARM',
  cold: 'COLD',
  expired: 'EXPIRED',
};

const TIER_COLORS: Record<StorageTier, string> = {
  hot: '#FF6B35',
  warm: '#FFB627',
  cold: '#4ECDC4',
  expired: '#888',
};

export function tierLabel(tier: StorageTier): string {
  return TIER_LABELS[tier];
}

export function tierColor(tier: StorageTier): string {
  return TIER_COLORS[tier];
}
