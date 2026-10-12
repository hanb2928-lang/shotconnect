import { useEffect, useRef, useState, useCallback } from 'react';
import { registerAppStateHandler } from '@/lib/appStateCoordinator';
import { isInFlushWindow, onFlushComplete } from '@/lib/foregroundFlushGuard';
import { supabase, ensureFreshSession, withQueryTimeout } from '@/lib/supabase';
import { createChannel, safeRemoveChannel } from '@/lib/channelManager';

import { safeSetTimeout, type SafeTimerSet, createSafeTimerSet, clearAllSafeTimers } from '@/lib/safeTimer';
import { stepToProgress } from '@/lib/videoGenSteps';
import { HybridRealtimePoller } from '@/lib/hybridRealtimePoller';

export type JobState = 'idle' | 'polling' | 'completed' | 'failed' | 'timeout';

export interface ResultPollingOptions {
  /** Scan ID associated with the video job (used for DB force-sync lookups). */
  scanId?: string | null;
  /** Called when the job completes successfully. */
  onCompleted?: (videoUrl: string) => void;
  /** Called when the job fails or times out. */
  onError?: (errorMsg: string) => void;
  /** Called when the 120-second soft-warning threshold is crossed. */
  onSoftWarn?: () => void;
}

const POLL_FIRST_DELAY_MS = 2000;
const SOFT_WARN_MS = 120_000;
const HARD_TIMEOUT_MS = 240_000; // 4 min circuit breaker — no job may exceed this
const POLL_ERROR_WINDOW_MS = 60_000;
const MAX_POLL_ERRORS_IN_WINDOW = 8;

/**
 * Encapsulates Runway direct polling and DB force-sync for a video job.
 *
 * - Polls the `generate-video` edge function in `poll` mode every 2 seconds.
 * - Falls back to a direct `video_jobs` DB query (force sync) if the edge
 *   function call fails repeatedly.
 * - Fires a soft warning after 120 seconds and a hard timeout at 600 seconds.
 */
export function useResultPolling(
  jobId: string | null,
  options: ResultPollingOptions = {},
) {
  const { scanId, onCompleted, onError, onSoftWarn } = options;

  const [jobState, setJobState] = useState<JobState>('idle');
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [serverProgress, setServerProgress] = useState<number | null>(null);
  const [serverStep, setServerStep] = useState<string | null>(null);
  const [isTimeout, setIsTimeout] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const callbacksRef = useRef({ onCompleted, onError, onSoftWarn });
  callbacksRef.current = { onCompleted, onError, onSoftWarn };

  const settledRef = useRef(false);

  const settle = useCallback(
    (state: JobState, errMsg?: string, videoUrl?: string) => {
      if (settledRef.current) return;
      settledRef.current = true;
      setJobState(state);
      if (state === 'completed' && videoUrl) {
        setProgressMessage('영상 생성 완료');
        callbacksRef.current.onCompleted?.(videoUrl);
      } else if (state === 'failed' || state === 'timeout') {
        const msg = errMsg ?? '영상 생성에 실패했습니다.';
        setError(msg);
        setProgressMessage(msg);
        if (state === 'timeout') setIsTimeout(true);
        callbacksRef.current.onError?.(msg);
      }
    },
    [],
  );

  useEffect(() => {
    if (!jobId) {
      setJobState('idle');
      return;
    }

    settledRef.current = false;
    setJobState('polling');
    setProgressMessage('영상 생성 상태를 확인하는 중...');
    setServerProgress(null);
    setServerStep(null);
    setError(null);
    setIsTimeout(false);

    const startTime = Date.now();
    let cancelled = false;
    const hybridPoller = new HybridRealtimePoller();
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let softWarnTimer: ReturnType<typeof setTimeout> | null = null;
    let pollAbort: AbortController | null = null;
    let forceSyncAbort: AbortController | null = null;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    const pendingRemovals: SafeTimerSet = createSafeTimerSet();
    // Hoisted early so cleanup() can reference it without TDZ issues.
    let resumeBurstTimer: ReturnType<typeof setTimeout> | null = null;
    let softWarnFired = false;
    let bgEnterTime: number | null = null;
    const pollErrorWindow: number[] = [];
    let notFoundRetries = 0;
    const MAX_404_RETRIES = 3;
    let pollInFlight = false;
    let isPaused = false;
    // Guard against repeated Realtime re-subscribe attempts at 85%+.
    // Without this, every 4s poll cycle triggers a createRealtimeChannel()
    // call when the channel is null, creating a reconnect storm that
    // saturates the native bridge and connection pool.
    let realtimeReconnectAttempted = false;
    // Monotonic guard: track the highest progress and latest step seen
    // across both realtime and polling. Stale realtime payloads that arrive
    // after a newer poll result (common on background→foreground transition)
    // are rejected instead of regressing the UI backwards.
    let highestProgressSeen = 0;
    let latestStepSeen: string | null = null;
    let progressFrame: number | ReturnType<typeof setTimeout> | null = null;
    let pendingProgressMessage: string | null = null;
    let pendingServerProgress: number | null = null;
    let pendingServerStep: string | null = null;

    const flushProgressState = () => {
      progressFrame = null;
      if (pendingProgressMessage !== null) {
        setProgressMessage(pendingProgressMessage);
        pendingProgressMessage = null;
      }
      if (pendingServerProgress !== null) {
        const nextProgress = pendingServerProgress;
        pendingServerProgress = null;
        setServerProgress((prev) => Math.max(prev ?? 0, nextProgress));
      }
      if (pendingServerStep !== null) {
        setServerStep(pendingServerStep);
        pendingServerStep = null;
      }
    };

    const scheduleProgressState = () => {
      if (progressFrame !== null) return;
      if (typeof requestAnimationFrame === 'function') {
        progressFrame = requestAnimationFrame(flushProgressState);
      } else {
        progressFrame = setTimeout(flushProgressState, 16);
      }
    };

    const applyProgress = (stepProg: number | null, step: string | null) => {
      if (stepProg !== null && !isNaN(stepProg) && stepProg > 0) {
        const isStepChange = step !== null && step !== latestStepSeen;
        if (stepProg < highestProgressSeen && !isStepChange) return; // stale — reject
        // Suppress sub-0.5% progress deltas when above 95%. At 97-100%,
        // the server sends rapid micro-updates (97.1%, 97.3%, 97.7%...)
        // that each trigger a state update + re-render. Coalescing them
        // via rAF isn't enough — the sheer volume of Realtime payloads
        // saturates the JS main thread with microtask processing before
        // the rAF flush even runs. Dropping deltas < 0.5% above 95%
        // reduces render count from ~20/frame to ~2/frame.
        const delta = stepProg - highestProgressSeen;
        if (stepProg >= 0.95 && !isStepChange && delta < 0.005) return;
        if (isStepChange) highestProgressSeen = Math.max(highestProgressSeen, stepProg);
        else highestProgressSeen = Math.max(highestProgressSeen, stepProg);
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        const pctLabel = ` (${Math.round(stepProg * 100)}%)`;
        pendingProgressMessage = `AI가 영상을 렌더링하고 있어요${pctLabel} · ${elapsedSec}초`;
        pendingServerProgress = Math.max(pendingServerProgress ?? 0, stepProg);
        scheduleProgressState();
      }
      if (step && step !== latestStepSeen) {
        latestStepSeen = step;
        pendingServerStep = step;
        scheduleProgressState();
      }
    };

    // Primary trigger: Realtime websocket push on video_jobs row update.
    // This fires the instant the server writes a terminal status, giving
    // millisecond-level completion detection without waiting for the next poll.
    // When the task ID is a soft-fallback placeholder (server didn't respond
    // within 10s), filter by scan_id instead of task_id so we still receive
    // updates for the real job row the server created asynchronously.
    const isSoftTaskId = jobId.startsWith('soft-');
    const realtimeFilter = isSoftTaskId && scanId
      ? `scan_id=eq.${scanId}`
      : `task_id=eq.${jobId}`;

    const createRealtimeChannel = async () => {
      const ch = await createChannel(`job-poll-${jobId}`);
      ch.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'video_jobs',
            filter: realtimeFilter,
          },
          (payload) => {
            if (cancelled || settledRef.current) return;
            // Only drop non-terminal progress updates during the flush window.
            // Terminal events (SUCCESS/FAILED) must ALWAYS be processed —
            // dropping them is the primary cause of the 97% stall on native.
            const isTerminal = payload.new && (
              (payload.new as { status?: string }).status === 'SUCCESS' ||
              (payload.new as { status?: string }).status === 'FAILED'
            );
            if (isInFlushWindow() && !isTerminal) return;
            hybridPoller.onRealtimeEvent();
            try {
              const row = payload.new as { status: string; video_url: string | null; error_message: string | null; step: string | null; progress: number | null };
              if (!row || typeof row.status !== 'string') return;
              if (row.status === 'SUCCESS' && row.video_url) {
                handleResult('SUCCESS', row.video_url);
              } else if (row.status === 'FAILED') {
                handleResult(row.status, null, row.error_message ?? undefined);
              } else {
                const numericProgress = typeof row.progress === 'number' && !isNaN(row.progress) && row.progress > 0
                  ? row.progress
                  : null;
                applyProgress(numericProgress, row.step ?? null);
              }
            } catch {
              // Malformed payload — ignore, polling will catch up
            }
          },
        );

      if (scanId) {
        ch.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'scans',
            filter: `id=eq.${scanId}`,
          },
          (payload) => {
            if (cancelled || settledRef.current) return;
            // Do NOT drop scans table events during the flush window.
            // The scans table carries the terminal muxed_video_url which is
            // the most reliable completion signal. Dropping it during the
            // flush window is a primary cause of the 97% stall on native.
            hybridPoller.onRealtimeEvent();
            try {
              const row = payload.new as { video_url?: string | null; muxed_video_url?: string | null };
              const finalUrl = row?.video_url ?? row?.muxed_video_url;
              if (finalUrl) {
                handleResult('SUCCESS', finalUrl);
              }
            } catch {
              // Malformed payload — ignore, polling will catch up
            }
          },
        );
      }

      return ch.subscribe((status: string) => {
        if (cancelled || settledRef.current) return;
        const health = HybridRealtimePoller.statusToHealth(status);
        if (health === 'HEALTHY') hybridPoller.markHealthy();
        else if (health === 'DEGRADED') hybridPoller.markDegraded();
        else hybridPoller.markDisconnected();
      });
    };

    createRealtimeChannel().then((ch) => {
      if (cancelled || settledRef.current) { safeRemoveChannel(ch); return; }
      realtimeChannel = ch;
    }).catch(() => {
      // Realtime unavailable — polling still works as fallback
    });

    const cleanup = () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (softWarnTimer) clearTimeout(softWarnTimer);
      if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
      pollInFlight = false;
      if (realtimeChannel) {
        safeRemoveChannel(realtimeChannel);
        realtimeChannel = null;
      }
      clearAllSafeTimers(pendingRemovals);
      if (progressFrame !== null) {
        if (typeof cancelAnimationFrame === 'function' && typeof progressFrame === 'number') {
          cancelAnimationFrame(progressFrame);
        } else {
          clearTimeout(progressFrame);
        }
        progressFrame = null;
      }
      pendingProgressMessage = null;
      pendingServerProgress = null;
      pendingServerStep = null;
      pollAbort?.abort();
      forceSyncAbort?.abort();
    };

    // Direct DB force-sync: query video_jobs table as a fallback.
    // For soft-fallback task IDs, look up by scan_id since no real row
    // has the fake task ID.
    // Unified DB force-sync: checks scans once (video_url + muxed_video_url),
    // then video_jobs once — 2 queries total. This replaces the previous
    // pattern of calling forceSyncDb() + forceSyncByScan() separately which
    // duplicated the scans query (4 queries/cycle → 2 queries/cycle),
    // halving DB load and render cycles at the 97% bottleneck.
    const forceSyncUnified = async (): Promise<{ status: string; videoUrl: string | null; step: string | null; progress: number | null } | null> => {
      forceSyncAbort?.abort();
      forceSyncAbort = new AbortController();
      const signal = forceSyncAbort.signal;
      try {
        // Parallel query: fire scans and video_jobs simultaneously.
        // Sequential queries doubled the wall-clock time at 85%+ where
        // every 4s cycle waited ~200-400ms for scans before even
        // starting the video_jobs query. Parallel execution halves the
        // round-trip time and reduces the window for bridge saturation.
        const scanPromise = scanId
          ? withQueryTimeout(
              supabase.from('scans').select('video_url, muxed_video_url').eq('id', scanId).abortSignal(signal).maybeSingle(),
              5000,
              'forceSyncUnified.scans',
            )
          : Promise.resolve({ data: null } as { data: { video_url: string | null; muxed_video_url: string | null } | null });

        let vjQuery = supabase.from('video_jobs').select('status, video_url, step, progress');
        const jobsPromise = isSoftTaskId && scanId
          ? withQueryTimeout(vjQuery.eq('scan_id', scanId).order('created_at', { ascending: false }).limit(1).abortSignal(signal).maybeSingle(), 5000, 'forceSyncUnified.jobs')
          : withQueryTimeout(vjQuery.eq('task_id', jobId).abortSignal(signal).maybeSingle(), 5000, 'forceSyncUnified.jobs');

        const [scanResult, jobsResult] = await Promise.all([scanPromise, jobsPromise]);

        if (signal.aborted) return null;

        // Check scans first — the webhook writes the terminal URL here,
        // so it's the fastest completion signal.
        const scanData = scanResult.data as { video_url: string | null; muxed_video_url: string | null } | null;
        const finalUrl = scanData?.video_url ?? scanData?.muxed_video_url;
        if (finalUrl) {
          return { status: 'SUCCESS', videoUrl: finalUrl, step: 'completed', progress: 1.0 };
        }

        const data = jobsResult.data;
        const dbError = jobsResult.error;
        if (signal.aborted || dbError || !data) return null;
        const row = data as { status: string; video_url: string | null; step: string | null; progress: number | null };
        if (row.status === 'SUCCESS' && row.video_url) {
          return { status: 'SUCCESS', videoUrl: row.video_url, step: 'completed', progress: 1.0 };
        }
        if (row.status === 'FAILED') {
          return { status: 'FAILED', videoUrl: null, step: row.step, progress: row.progress };
        }
        return { status: row.status, videoUrl: null, step: row.step, progress: row.progress };
      } catch (err) {
        console.error('[useResultPolling] forceSyncUnified error:', err);
        return null;
      }
    };

    const handleResult = (status: string, videoUrl: string | null, errMsg?: string) => {
      if (cancelled || settledRef.current) return;
      if (status === 'SUCCESS' && videoUrl) {
        settle('completed', undefined, videoUrl);
      } else if (status === 'FAILED') {
        settle('failed', errMsg ?? '영상 생성에 실패했습니다.');
      }
    };

    const pollOnce = async () => {
      if (cancelled || settledRef.current) return;
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        await pollOnceInner();
      } finally {
        pollInFlight = false;
      }
    };

    const pollOnceInner = async () => {
      if (cancelled || settledRef.current) return;

      // === SINGLE-SOURCE DB-SCAN POLLING (85%+) ===
      // Once rendering starts, the client polls the DB directly — no edge
      // function calls. The server-poll chain has been halted (see
      // serverPollHalted in handleServerPoll), so the DB is the single
      // source of truth. This eliminates the client↔server ping-pong that
      // saturated the bridge and caused the 97% stall.
      if (highestProgressSeen >= 0.85) {
        // Re-subscribe Realtime if the channel was dropped (e.g. after a
        // background transition). Only attempt once per channel loss —
        // retrying on every 4s poll cycle creates a reconnect storm that
        // saturates the native bridge and connection pool at 97%.
        if (!realtimeChannel && !realtimeReconnectAttempted) {
          realtimeReconnectAttempted = true;
          createRealtimeChannel().then((ch) => {
            if (cancelled || settledRef.current) { safeRemoveChannel(ch); realtimeReconnectAttempted = false; return; }
            realtimeChannel = ch;
            realtimeReconnectAttempted = false;
          }).catch(() => {
            // Realtime unavailable — DB poll still works as fallback.
            // Reset the flag so a future cycle can retry.
            realtimeReconnectAttempted = false;
          });
        }
        // Unified DB force-sync: checks scans first (video_url/muxed_video_url),
        // then video_jobs. This replaces the previous pattern of calling both
        // forceSyncDb() and forceSyncByScan() which duplicated the scans query
        // (4 queries/cycle → 2 queries/cycle), halving DB load at the 97%
        // bottleneck.
        const dbResult = await forceSyncUnified();
        if (cancelled || settledRef.current) return;
        if (dbResult) {
          if (dbResult.step) {
            const sp = typeof dbResult.progress === 'number' && !isNaN(dbResult.progress) && dbResult.progress > 0
              ? dbResult.progress
              : stepToProgress(dbResult.step);
            applyProgress(sp, dbResult.step);
          }
          handleResult(dbResult.status, dbResult.videoUrl);
          if (settledRef.current) return;
        }
        // Gradual polling interval: starts at 4s when entering the 85%+
        // range, decreases to 2s as progress approaches 100%. This smooths
        // the transition from the adaptive backoff (up to 30s) and catches
        // completion faster when the video is nearly done.
        if (!cancelled && !settledRef.current && !isPaused) {
          const prog = highestProgressSeen;
          const renderPollMs = prog >= 0.97 ? 2000 : prog >= 0.90 ? 3000 : 4000;
          pollTimer = setTimeout(pollOnce, renderPollMs);
        }
        return;
      }

      // Abort any previous in-flight poll before starting a new one.
      pollAbort?.abort();
      pollAbort = new AbortController();

      const elapsed = Date.now() - startTime;
      if (elapsed > HARD_TIMEOUT_MS) {
        settle('timeout', '영상 생성이 4분(240초)을 초과했습니다. 다시 시도해주세요.');
        return;
      }

      const elapsedSec = Math.round(elapsed / 1000);

      // When the task ID is a soft-fallback placeholder, skip the edge
      // function poll (it can't find the job by a fake task ID) and go
      // straight to DB lookup by scanId — the real job row was created
      // server-side even though we never got the response. Also propagate
      // step/progress so the UI stays live during the soft path.
      if (isSoftTaskId) {
        const scanResult = await forceSyncUnified();
        if (cancelled || settledRef.current) return;
        if (scanResult) {
          if (scanResult.step) {
            const sp = typeof scanResult.progress === 'number' && !isNaN(scanResult.progress) && scanResult.progress > 0
              ? scanResult.progress
              : stepToProgress(scanResult.step);
            applyProgress(sp, scanResult.step);
          }
          handleResult(scanResult.status, scanResult.videoUrl);
          if (settledRef.current) return;
        }
        if (!cancelled && !settledRef.current && !isPaused) {
          const delayMs = hybridPoller.nextPollDelayMs();
          pollTimer = setTimeout(pollOnce, delayMs);
        }
        return;
      }

      // Primary path: poll via the generate-video edge function.
      try {
        const { data: pollData } = await supabase.functions.invoke('generate-video', {
          body: { mode: 'poll', taskId: jobId, scanId: scanId ?? undefined },
        });

        if (pollAbort.signal.aborted || cancelled || settledRef.current) return;
        if (pollData && typeof pollData === 'object') {
          // Do NOT reset the error window on a successful edge function response.
          // On a flaky network, sporadic successes would keep the count below
          // the threshold, trapping the user in an infinite loading state.
          // The sliding window expires errors naturally by time, so only
          // actual failures are counted.
          const status = pollData.status as string;

          if (status === 'SUCCESS') {
            const pollVideoUrl = (pollData as { videoUrl?: string }).videoUrl;
            if (pollVideoUrl) {
              handleResult('SUCCESS', pollVideoUrl);
              return;
            }
            // Server says SUCCESS but didn't include the URL. Immediately
            // force-sync the DB — unified call checks scans + video_jobs.
            const dbSync = await forceSyncUnified();
            if (cancelled || settledRef.current) return;
            if (dbSync?.videoUrl) {
              handleResult('SUCCESS', dbSync.videoUrl);
              return;
            }
            settle('timeout', '서버가 영상 생성 완료를 보고했지만 주소를 가져오지 못했습니다. 다시 시도해주세요.');
            return;
          } else if (status === 'FAILED') {
            const errStr = (pollData.error as string) ?? '';
            if (errStr.includes('404') && notFoundRetries < MAX_404_RETRIES) {
              notFoundRetries++;
              const notFoundDelay = 3000 * notFoundRetries;
              setProgressMessage(notFoundRetries === 1
                ? '서버에 작업이 등록되는 중입니다. 잠시만 기다려주세요...'
                : '작업 상태를 다시 확인하는 중...');
              if (!cancelled && !settledRef.current && !isPaused) {
                pollTimer = setTimeout(pollOnce, notFoundDelay);
              }
              return;
            }
            handleResult(status, null, errStr || undefined);
            return;
          } else {
            const rawProgress = pollData.progress ? parseFloat(pollData.progress) : NaN;
            const stepProg = stepToProgress(pollData.step as string | undefined);
            const candidate = !isNaN(rawProgress) ? rawProgress : stepProg;
            const bestProgress = Math.max(0, Math.min(1, (candidate ?? 0))) || 0;
            applyProgress(!isNaN(bestProgress) && bestProgress > 0 ? bestProgress : null, (pollData.step as string) ?? null);
          }
        }
      } catch (err) {
        console.error('[useResultPolling] pollOnce error:', err);
        const now = Date.now();
        pollErrorWindow.push(now);
        while (pollErrorWindow.length > 0 && now - pollErrorWindow[0] > POLL_ERROR_WINDOW_MS) {
          pollErrorWindow.shift();
        }
        if (pollErrorWindow.length >= MAX_POLL_ERRORS_IN_WINDOW) {
          // Unified DB force-sync as a last resort before giving up.
          const dbResult = await forceSyncUnified();
          if (dbResult) {
            handleResult(dbResult.status, dbResult.videoUrl);
            return;
          }
          settle('failed', '네트워크 연결이 불안정하여 영상 생성 상태를 확인할 수 없습니다. 다시 시도해주세요.');
          return;
        }
      }

      // Fallback: also try DB force-sync if we haven't resolved yet and
      // the poll failed (but hasn't hit the threshold yet).
      if (!cancelled && !settledRef.current && pollErrorWindow.length > 0) {
        const dbResult = await forceSyncUnified();
        if (cancelled) return;
        if (dbResult) {
          handleResult(dbResult.status, dbResult.videoUrl);
          if (settledRef.current) return;
        }
      }

      if (!cancelled && !settledRef.current && !isPaused) {
        const delayMs = hybridPoller.nextPollDelayMs();
        pollTimer = setTimeout(pollOnce, delayMs);
      }
    };

    const armSoftWarn = (delayMs: number) => {
      if (softWarnTimer) clearTimeout(softWarnTimer);
      softWarnTimer = setTimeout(() => {
        if (!cancelled && !settledRef.current) {
          softWarnFired = true;
          setProgressMessage('영상 생성이 조금 오래 걸리고 있어요. 잠시만 기다려주세요...');
          callbacksRef.current.onSoftWarn?.();
        }
      }, delayMs);
    };

    const armHardTimeout = (delayMs: number) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(() => {
        if (!cancelled && !settledRef.current) {
          settle('timeout', '영상 생성이 4분(240초)을 초과했습니다. 다시 시도해주세요.');
        }
      }, delayMs);
    };

    armSoftWarn(SOFT_WARN_MS);
    armHardTimeout(HARD_TIMEOUT_MS);

    // Start polling — first poll fires at 5s for an initial status check,
    // subsequent polls use the adaptive backoff schedule.
    pollTimer = setTimeout(pollOnce, POLL_FIRST_DELAY_MS);

    // Resume pump: on foreground return, immediately poll once + run a DB
    // force-sync so the UI catches up without waiting for the normal backoff
    // schedule. Only a single burst poll is fired (not 3) to avoid
    // contributing to the foreground thundering-herd — the normal poll
    // schedule resumes immediately after.
    let resumeBurstAborted = false;
    const runResumeBurst = async () => {
      if (cancelled || settledRef.current) {
        resumeBurstTimer = null;
        return;
      }
      try { await ensureFreshSession(); } catch { /* non-fatal */ }
      // Instant DB force-sync on foreground return: the Realtime websocket
      // may take 1-2 seconds to re-subscribe after a network drop, so check
      // the DB directly to catch any completion that happened while
      // backgrounded. This fills the gap before the first poll cycle fires.
      const dbResult = await forceSyncUnified();
      if (cancelled || settledRef.current || resumeBurstAborted) { resumeBurstTimer = null; return; }
      if (dbResult) {
        if (dbResult.step) {
          const sp = typeof dbResult.progress === 'number' && !isNaN(dbResult.progress) && dbResult.progress > 0
            ? dbResult.progress
            : stepToProgress(dbResult.step);
          applyProgress(sp, dbResult.step);
        }
        handleResult(dbResult.status, dbResult.videoUrl);
        if (settledRef.current) return;
      }
      if (!cancelled && !settledRef.current && !resumeBurstAborted) {
        const delayMs = hybridPoller.nextPollDelayMs();
        pollTimer = setTimeout(pollOnce, delayMs);
      }
      resumeBurstTimer = null;
    };

    // Pause polling when app is backgrounded to avoid zombie requests.
    // On background: abort in-flight fetches, clear all timers, and
    // unsubscribe Realtime so the OS can reclaim memory without orphaned
    // callbacks crashing the app. On foreground: re-subscribe Realtime,
    // run a resume burst, and restart the normal poll schedule.
    // Pause runs in 'immediate' phase (synchronous) so timers/channels are
    // cleared BEFORE the OS locks the bridge. If registered as 'deferred',
    // setTimeout(0) never fires on iOS because the JS thread suspends —
    // the channel stays alive with a dead WebSocket, and on foreground
    // return multiple hooks simultaneously try to re-subscribe, flooding
    // the native network module.
    const handlePauseImmediate = (nextState: string) => {
      // Only pause on full background — NOT on iOS 'inactive'.
      // 'inactive' fires for transient UI interruptions; pausing on it
      // causes a reconnect burst when 'active' follows seconds later.
      if (nextState !== 'background') return;
      isPaused = true;
      bgEnterTime = Date.now();
      resumeBurstAborted = true;
      pollAbort?.abort();
      forceSyncAbort?.abort();
      if (resumeBurstTimer) { clearTimeout(resumeBurstTimer); resumeBurstTimer = null; }
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      if (softWarnTimer) { clearTimeout(softWarnTimer); softWarnTimer = null; }
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
      // Detach the channel reference WITHOUT calling safeRemoveChannel here.
      // safeRemoveChannel calls supabase.removeChannel(), which is a WebSocket
      // bridge call. The immediate phase must be bridge-free — calling
      // removeChannel while the OS is locking the native bridge deadlocks
      // the JS thread and triggers a watchdog SIGKILL (the "app dies on
      // background" bug). Defer the actual removal to a setTimeout(0)
      // macrotask, which the coordinator's drain gate has already cleared
      // by the time it fires. If the OS suspends before the macrotask runs,
      // the channel stays alive with a dead WebSocket — but the resume
      // handler re-creates it cleanly via createRealtimeChannel(), and
      // createChannel's singleton guard handles the stale channel.
      const channelToRemove = realtimeChannel;
      realtimeChannel = null;
      if (channelToRemove) {
        safeSetTimeout(pendingRemovals, () => {
          if (!cancelled) {
            safeRemoveChannel(channelToRemove);
          } else {
            // Already cleaned up — just remove silently
            try { safeRemoveChannel(channelToRemove); } catch { /* non-fatal */ }
          }
        }, 0);
      }
    };

    const handleResumeDeferred = (nextState: string) => {
      if (nextState !== 'active') return;
      if (!cancelled && !settledRef.current) {
        isPaused = false;
        resumeBurstAborted = false;
        if (resumeBurstTimer) clearTimeout(resumeBurstTimer);
        onFlushComplete(() => {
          if (cancelled || settledRef.current) return;
          if (!realtimeChannel) {
            createRealtimeChannel().then((ch) => {
              if (cancelled || settledRef.current) { safeRemoveChannel(ch); return; }
              realtimeChannel = ch;
            }).catch(() => {
              // Realtime unavailable — polling still works as fallback
            });
          }
          runResumeBurst();

          if (bgEnterTime !== null) {
            const bgDuration = Date.now() - bgEnterTime;
            bgEnterTime = null;
            const elapsed = Date.now() - startTime - bgDuration;
            const remainingSoft = SOFT_WARN_MS - elapsed;
            const remainingHard = HARD_TIMEOUT_MS - elapsed;
            if (!softWarnFired && remainingSoft > 0) {
              armSoftWarn(remainingSoft);
            } else if (!softWarnFired && remainingSoft <= 0) {
              softWarnFired = true;
              setProgressMessage('영상 생성이 조금 오래 걸리고 있어요. 잠시만 기다려주세요...');
              callbacksRef.current.onSoftWarn?.();
            }
            if (remainingHard > 0) {
              armHardTimeout(remainingHard);
            } else {
              armHardTimeout(5000);
            }
          }
        });
      }
    };

    const unsubPause = registerAppStateHandler('immediate', handlePauseImmediate);
    const unsubResume = registerAppStateHandler('deferred', handleResumeDeferred);

    // NOTE: The tick gate registration was removed. The setTimeout-based
    // pollTimer above already drives pollOnce at the correct adaptive
    // interval. The parallel registerTick(3s) caused double-polling at
    // 85%+ where the poll interval tightens to 2s — two concurrent
    // pollOnce calls hit the DB simultaneously, doubling render cycles
    // and saturating the JS thread at the 97% bottleneck.

    return () => {
      cleanup();
      unsubPause();
      unsubResume();
    };
  }, [jobId, scanId, settle]);

  return { jobState, progressMessage, serverProgress, serverStep, isTimeout, error };
}
