import { useEffect, useRef, useState, useCallback } from 'react';
import { registerAppStateHandler } from '@/lib/appStateCoordinator';
import { onFlushComplete } from '@/lib/foregroundFlushGuard';
import { supabase, ensureFreshSession } from '@/lib/supabase';
import { getItem, setItem, removeItem } from '@/lib/storage';

export interface OrphanedScan {
  id: string;
  created_at: string;
  image_url: string;
  video_url: string | null;
  muxed_video_url: string | null;
  edited_image_url: string | null;
}

export interface OrphanRecoveryResult {
  found: OrphanedScan[];
  recovered: OrphanedScan | null;
}

const STALE_SCAN_THRESHOLD_MIN = 10;
const STORAGE_KEY_LAST_SCAN_ID = 'last_active_scan_id';
const STORAGE_KEY_LAST_SCAN_AT = 'last_active_scan_at';

export function rememberActiveScan(scanId: string): void {
  setItem(STORAGE_KEY_LAST_SCAN_ID, scanId).catch(() => {});
  setItem(STORAGE_KEY_LAST_SCAN_AT, String(Date.now())).catch(() => {});
}

export function forgetActiveScan(): void {
  removeItem(STORAGE_KEY_LAST_SCAN_ID).catch(() => {});
  removeItem(STORAGE_KEY_LAST_SCAN_AT).catch(() => {});
}

async function getStoredScanId(): Promise<string | null> {
  return getItem(STORAGE_KEY_LAST_SCAN_ID);
}

async function getStoredScanAt(): Promise<number | null> {
  const raw = await getItem(STORAGE_KEY_LAST_SCAN_AT);
  return raw ? parseInt(raw, 10) : null;
}

async function queryOrphanedScans(): Promise<OrphanedScan[]> {
  const cutoff = new Date(Date.now() - STALE_SCAN_THRESHOLD_MIN * 60_000).toISOString();
  try {
    const { data, error } = await supabase
      .from('scans')
      .select('id, created_at, image_url, video_url, muxed_video_url, edited_image_url')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error || !data) return [];
    return data as OrphanedScan[];
  } catch {
    return [];
  }
}

async function checkScanCompletion(scanId: string): Promise<OrphanedScan | null> {
  try {
    const { data, error } = await supabase
      .from('scans')
      .select('id, created_at, image_url, video_url, muxed_video_url, edited_image_url')
      .eq('id', scanId)
      .maybeSingle();
    if (error || !data) return null;
    return data as OrphanedScan;
  } catch {
    return null;
  }
}

/**
 * Detects orphaned AI jobs on app foreground/resume.
 *
 * When the app loses connection during an AI pipeline run, the local UI
 * may freeze while the server continues processing. On resume, this hook:
 * 1. Checks if a scan was in-progress (tracked via localStorage).
 * 2. Queries the DB to see if that scan has completed.
 * 3. Falls back to scanning recent scans for completed work the user
 *    never saw.
 *
 * If a completed orphan is found, `onRecover` is called with the scan
 * so the UI can re-attach the user to their result.
 */
export function useOrphanJobRecovery(
  onRecover: (scan: OrphanedScan) => void,
): {
  isChecking: boolean;
  lastRecoveryScan: OrphanedScan | null;
  triggerRecoveryCheck: () => void;
} {
  const [isChecking, setIsChecking] = useState(false);
  const [lastRecoveryScan, setLastRecoveryScan] = useState<OrphanedScan | null>(null);
  const callbackRef = useRef(onRecover);
  callbackRef.current = onRecover;
  const lastCheckRef = useRef(0);
  const mountedRef = useRef(true);

  const runRecovery = useCallback(async () => {
    if (!mountedRef.current) return;
    const now = Date.now();
    if (now - lastCheckRef.current < 5000) return;
    lastCheckRef.current = now;
    setIsChecking(true);

    try {
      await ensureFreshSession();
    } catch { /* non-fatal */ }

    const storedId = await getStoredScanId();
    const storedAt = await getStoredScanAt();

    if (storedId) {
      const scan = await checkScanCompletion(storedId);
      if (mountedRef.current && scan) {
        const hasResult = scan.video_url || scan.muxed_video_url || scan.edited_image_url;
        if (hasResult) {
          setLastRecoveryScan(scan);
          callbackRef.current(scan);
          forgetActiveScan();
          setIsChecking(false);
          return;
        }
        if (storedAt && now - storedAt > 15 * 60_000) {
          forgetActiveScan();
        }
      }
    }

    const recentScans = await queryOrphanedScans();
    if (!mountedRef.current) { setIsChecking(false); return; }

    const orphan = recentScans.find(
      (s) => s.video_url || s.muxed_video_url || s.edited_image_url,
    );
    if (orphan) {
      setLastRecoveryScan(orphan);
      callbackRef.current(orphan);
    }

    setIsChecking(false);
  }, []);

  const triggerRecoveryCheck = useCallback(() => {
    runRecovery();
  }, [runRecovery]);

  useEffect(() => {
    mountedRef.current = true;

    const unsubHandler = registerAppStateHandler('deferred', (state) => {
      if (state === 'active') onFlushComplete(() => runRecovery());
    });
    return () => {
      mountedRef.current = false;
      unsubHandler();
    };
  }, [runRecovery]);

  return { isChecking, lastRecoveryScan, triggerRecoveryCheck };
}
