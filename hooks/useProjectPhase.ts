import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { registerAppStateHandler } from '@/lib/appStateCoordinator';
import { isInFlushWindow } from '@/lib/foregroundFlushGuard';

export type ProjectStep = 'idle' | 'uploading' | 'rendering' | 'completed' | 'failed';

interface VideoJobRow {
  id: string;
  step: ProjectStep;
  status: string;
  video_url: string | null;
  error_message: string | null;
  [key: string]: unknown;
}

interface UseProjectPhaseOptions {
  scanId?: string | null;
}

export function useProjectPhase(jobId: string | null, options: UseProjectPhaseOptions = {}) {
  const { scanId } = options;
  const [step, setStep] = useState<ProjectStep>('idle');
  const [data, setData] = useState<VideoJobRow | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const isSoft = jobId.startsWith('soft-') || jobId.startsWith('hd-soft-');
    const useScanId = isSoft && scanId;

    const setupChannel = () => {
      if (cancelled || channelRef.current) return;
      const channel = supabase
        .channel(`project-phase-${jobId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'video_jobs',
            filter: useScanId ? `scan_id=eq.${scanId}` : `task_id=eq.${jobId}`,
          },
          (payload) => {
            if (cancelled) return;
            if (isInFlushWindow()) return;
            const updated = payload.new as VideoJobRow;
            setStep(updated.step);
            setData(updated);
          },
        )
        .subscribe();
      channelRef.current = channel;
    };

    const teardownChannel = () => {
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch { /* ignore */ }
        channelRef.current = null;
      }
    };

    (async () => {
      if (cancelled) return;

      let query = supabase.from('video_jobs').select('*');
      const queryPromise = useScanId
        ? query.eq('scan_id', scanId!).order('created_at', { ascending: false }).limit(1).maybeSingle()
        : query.eq('task_id', jobId).maybeSingle();

      timeoutId = setTimeout(() => {
        if (!cancelled) {
          // query may still resolve later; the `cancelled` guard prevents stale state
        }
      }, 5000);

      Promise.race([
        queryPromise,
        new Promise<{ data: null }>((resolve) =>
          setTimeout(() => resolve({ data: null }), 5000),
        ),
      ]).then(({ data: res }) => {
        if (cancelled || !res) return;
        const row = res as VideoJobRow;
        setStep(row.step);
        setData(row);
      }, () => {});

      if (cancelled) return;

      setupChannel();
    })();

    // Remove the Realtime channel on background to prevent the socket
    // from attempting reconnect storms while the OS is suspending the
    // process. Re-subscribe on foreground to resume live updates.
    const unsubAppState = registerAppStateHandler('deferred', (nextState: string) => {
      if (nextState === 'background' || nextState === 'inactive') {
        teardownChannel();
      } else if (nextState === 'active') {
        setupChannel();
      }
    });

    return () => {
      cancelled = true;
      unsubAppState();
      if (timeoutId) clearTimeout(timeoutId);
      teardownChannel();
    };
  }, [jobId, scanId]);

  return { step, data };
}
