import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ProjectStep = 'idle' | 'uploading' | 'rendering' | 'completed' | 'failed';

interface VideoJobRow {
  id: string;
  step: ProjectStep;
  status: string;
  video_url: string | null;
  error_message: string | null;
  [key: string]: unknown;
}

export function useProjectPhase(jobId: string | null) {
  const [step, setStep] = useState<ProjectStep>('idle');
  const [data, setData] = useState<VideoJobRow | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      if (cancelled) return;

      const queryPromise = supabase
        .from('video_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

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

      const channel = supabase
        .channel(`project-phase-${jobId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'video_jobs',
            filter: `id=eq.${jobId}`,
          },
          (payload) => {
            if (cancelled) return;
            const updated = payload.new as VideoJobRow;
            setStep(updated.step);
            setData(updated);
          },
        )
        .subscribe();

      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch { /* ignore */ }
        channelRef.current = null;
      }
    };
  }, [jobId]);

  return { step, data };
}
