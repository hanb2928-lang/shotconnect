import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Loader2, Bell, ChevronRight } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { useRouter } from 'expo-router';

interface ActiveJob {
  scan_id: string;
  task_id: string;
  status: string;
  step: string | null;
  progress: number | null;
  is_draft: boolean;
  is_hd: boolean;
  product_name: string | null;
}

const STEP_LABELS: Record<string, string> = {
  planning: '편집 플랜 구성 중',
  submitting: 'AI 렌더링 요청 중',
  rendering: '영상 렌더링 중',
  encoding: '인코딩 중',
  uploading: '저장 중',
  muxing: '오디오 합성 중',
  pending: '대기 중',
};

export function BackgroundJobIndicator() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const mountedRef = useRef(true);

  const loadJobs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('video_jobs')
        .select('scan_id, task_id, status, step, progress, is_draft, is_hd')
        .in('status', ['PENDING', 'PROCESSING', 'RUNNING', 'THROTTLED', 'QUEUED'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (error || !data || !mountedRef.current) return;

      const scanIds = [...new Set(data.map((j) => j.scan_id))];
      if (scanIds.length === 0) {
        setJobs([]);
        return;
      }

      const { data: scans } = await supabase
        .from('scans')
        .select('id, product_name')
        .in('id', scanIds);

      const nameMap = new Map<string, string | null>();
      (scans ?? []).forEach((s: { id: string; product_name: string | null }) => {
        nameMap.set(s.id, s.product_name);
      });

      const enriched: ActiveJob[] = data.map((j) => ({
        scan_id: j.scan_id,
        task_id: j.task_id,
        status: j.status,
        step: j.step,
        progress: j.progress,
        is_draft: j.is_draft,
        is_hd: j.is_hd,
        product_name: nameMap.get(j.scan_id) ?? null,
      }));
      if (mountedRef.current) setJobs(enriched);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadJobs();
    const interval = setInterval(loadJobs, 5000);

    // Debounce Realtime-triggered reloads: multiple job rows can update in
    // rapid succession, and without coalescing each event fires a separate
    // query pair, causing a thundering herd. Wait 800ms after the last
    // event before reloading, so a burst of N events results in 1 reload.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        loadJobs();
      }, 800);
    };

    const channel = supabase
      .channel('bg-jobs-indicator')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_jobs' },
        debouncedReload,
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [loadJobs]);

  if (jobs.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Loader2 size={16} color={theme.colors.primary[300]} strokeWidth={2} />
          <Text style={styles.headerTitle}>백그라운드 작업 {jobs.length}건</Text>
        </View>
        <Bell size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
      </View>
      {jobs.map((job) => {
        const pct = job.progress != null ? Math.round(job.progress * 100) : 0;
        const label = (job.step && STEP_LABELS[job.step]) ?? '처리 중';
        const tierLabel = job.is_hd ? 'HD' : job.is_draft ? '초안' : '';
        return (
          <TouchableOpacity
            key={job.task_id}
            style={styles.jobCard}
            onPress={() => router.push(`/result/${job.scan_id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.jobInfo}>
              <View style={styles.jobNameRow}>
                {tierLabel ? (
                  <View style={[styles.tierBadge, job.is_hd && styles.tierBadgeHd]}>
                    <Text style={styles.tierBadgeText}>{tierLabel}</Text>
                  </View>
                ) : null}
                <Text style={styles.jobName} numberOfLines={1}>
                  {job.product_name || 'AI 영상'}
                </Text>
              </View>
              <Text style={styles.jobStatus}>
                {label}{pct > 0 ? ` · ${pct}%` : ''}
              </Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.max(pct, 5)}%` }]} />
              </View>
            </View>
            <ChevronRight size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '20',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 10,
  },
  jobInfo: {
    flex: 1,
    gap: 4,
  },
  jobNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tierBadge: {
    backgroundColor: theme.colors.primary[500] + '20',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tierBadgeHd: {
    backgroundColor: theme.colors.accent[400] + '20',
  },
  tierBadgeText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.primary[300],
  },
  jobName: {
    flex: 1,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  jobStatus: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  progressBar: {
    height: 3,
    backgroundColor: theme.colors.dark.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary[400],
    borderRadius: 2,
  },
});
