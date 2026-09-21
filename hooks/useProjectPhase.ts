import { useEffect, useState } from 'react';

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

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    (async () => {
      const { supabase } = await import('@/lib/supabase');
      if (cancelled) return;

      supabase
        .from('video_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle()
        .then(({ data: res }) => {
          if (cancelled || !res) return;
          const row = res as VideoJobRow;
          setStep(row.step);
          setData(row);
        }, () => {});

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

      return () => {
        supabase.removeChannel(channel);
      };
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return { step, data };
}
