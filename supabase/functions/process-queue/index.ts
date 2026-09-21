import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MAX_ATTEMPTS = 3;
const MIN_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 10;
const JOB_TIMEOUT_MS = 200000;

// Sliding window failure backoff
const FAILURE_WINDOW_MS = 60_000;
const FAILURE_THRESHOLD = 3;
const BACKOFF_DELAY_MS = 5_000;

const WORKER_ID = `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const ALLOWED_JOB_TYPES = new Set([
  "analyze-photo",
  "virtual-fitting",
  "virtual-cuts",
  "generate-tts",
  "generate-copy",
  "generate-review",
  "generate-comic-scenario",
  "render-video",
]);

const JOB_TYPE_TO_FUNCTION_SLUG: Record<string, string> = {
  "virtual-cuts": "generate-virtual-cuts",
  "virtual-fitting": "generate-virtual-fitting",
};

interface RenderJob {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  priority?: number;
  scan_id?: string;
  consecutive_failures?: number;
}

interface FailureRecord {
  timestamp: number;
}

const failureWindow: FailureRecord[] = [];

function recordFailure(): void {
  const now = Date.now();
  failureWindow.push({ timestamp: now });
  while (failureWindow.length > 0 && now - failureWindow[0].timestamp > FAILURE_WINDOW_MS) {
    failureWindow.shift();
  }
}

function getRecentFailureCount(): number {
  const now = Date.now();
  while (failureWindow.length > 0 && now - failureWindow[0].timestamp > FAILURE_WINDOW_MS) {
    failureWindow.shift();
  }
  return failureWindow.length;
}

function shouldBackoff(): boolean {
  return getRecentFailureCount() >= FAILURE_THRESHOLD;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const processed: Array<{ id: string; status: string; error?: string }> = [];

    // Optional job-type filter: when the caller provides `jobTypes`, the worker
    // only claims jobs of those types, enabling specialized worker routing.
    let requestedJobTypes: string[] | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.jobTypes) && body.jobTypes.length > 0) {
        requestedJobTypes = body.jobTypes;
      }
    } catch { /* no body or invalid JSON — ignore, use default dequeue */ }

    if (shouldBackoff()) {
      const backoffSeconds = Math.ceil(BACKOFF_DELAY_MS / 1000);
      await new Promise((r) => setTimeout(r, BACKOFF_DELAY_MS));
      await markWorkerDone();
      return new Response(
        JSON.stringify({
          processed,
          count: 0,
          workerId: WORKER_ID,
          backoff: true,
          reason: `sliding_window_backoff (${getRecentFailureCount()} recent failures in ${FAILURE_WINDOW_MS / 1000}s)`,
          backoffSeconds,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await registerWorker();
    await recoverStaleJobs();

    const queueDepth = await checkQueuedJobsRaw();
    const activeWorkers = await fetchActiveWorkerCount();
    const autoscaleConfig = await fetchAutoscaleConfig();
    const workerConcurrency = autoscaleConfig?.worker_concurrency ?? 8;
    const batchSize = computeBatchSize(queueDepth, activeWorkers, workerConcurrency);

    const jobs = requestedJobTypes
      ? await dequeueBatchJobsByType(requestedJobTypes, batchSize, MAX_ATTEMPTS)
      : await dequeueBatchJobs(batchSize, MAX_ATTEMPTS);
    if (jobs.length === 0) {
      await markWorkerDone();
      return new Response(
        JSON.stringify({
          processed,
          count: 0,
          workerId: WORKER_ID,
          queueDepth,
          activeWorkers,
          batchSize,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await Promise.all(
      jobs.map(async (job) => {
        try {
          const result = await processJob(job);
          try {
            await markJobDone(job.id, result);
          } catch (markErr) {
            console.error('markJobDone failed for job', job.id, markErr);
          }
          processed.push({ id: job.id, status: "done" });
        } catch (err) {
          recordFailure();
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          const newAttempts = job.attempts + 1;
          const newConsecutiveFailures = (job.consecutive_failures ?? 0) + 1;

          if (newAttempts >= MAX_ATTEMPTS) {
            await markJobError(job.id, newAttempts, errorMsg, newConsecutiveFailures);
            processed.push({ id: job.id, status: "error", error: errorMsg });
          } else {
            const backoffMultiplier = Math.min(newConsecutiveFailures, 4);
            const requeueDelay = BACKOFF_DELAY_MS * backoffMultiplier;
            await requeueJob(job.id, newAttempts, errorMsg, newConsecutiveFailures);
            processed.push({ id: job.id, status: "requeued", error: errorMsg });
            // Fire-and-forget trigger after delay to retry the requeued job
            if (requeueDelay > 0) {
              setTimeout(() => {
                fetch(`${supabaseUrl}/functions/v1/process-queue`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${serviceRoleKey}`,
                    apikey: serviceRoleKey,
                  },
                  body: JSON.stringify({ trigger: true, retry: true }),
                }).catch(() => {});
              }, requeueDelay);
            }
          }
        }
      }),
    );

    const hasRequeued = processed.some((p) => p.status === "requeued");
    const hasRemaining = processed.length > 0 ? await checkQueuedJobs() : false;
    if ((hasRequeued || hasRemaining) && processed.length > 0) {
      await updateWorkerHeartbeat(processed.length);
      fetch(`${supabaseUrl}/functions/v1/autoscale-manager`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        body: JSON.stringify({ trigger: true }),
      }).catch(() => {});
    } else if (processed.length === 0) {
      await markWorkerDone();
    }

    await markWorkerDone();
    return new Response(
      JSON.stringify({
        processed,
        count: processed.length,
        workerId: WORKER_ID,
        queueDepth,
        activeWorkers,
        batchSize,
        recentFailures: getRecentFailureCount(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Queue processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function computeBatchSize(queueDepth: number, activeWorkers: number, workerConcurrency: number): number {
  if (queueDepth === 0) return MIN_BATCH_SIZE;
  // Each worker should process roughly queueDepth / activeWorkers jobs,
  // capped to MIN/MAX_BATCH_SIZE bounds. When worker_concurrency is
  // configured (> 0), scale the ideal batch by the per-worker concurrency
  // capacity so a single worker can claim more jobs when the queue is deep
  // and few workers are active, maximizing throughput per worker invocation.
  const concurrency = Math.max(workerConcurrency, 1);
  const ideal = activeWorkers > 0
    ? Math.ceil((queueDepth / Math.max(activeWorkers, 1)) * Math.min(concurrency / 4, 2))
    : Math.min(queueDepth, MAX_BATCH_SIZE);
  return Math.max(MIN_BATCH_SIZE, Math.min(ideal, MAX_BATCH_SIZE));
}

async function fetchActiveWorkerCount(): Promise<number> {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/rpc/count_active_workers`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_timeout_sec: 60 }),
      },
    );
    if (!resp.ok) return 0;
    const data = await resp.json();
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

async function fetchAutoscaleConfig(): Promise<{ worker_concurrency: number } | null> {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/gpu_autoscale_config?select=worker_concurrency&id=eq.1`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    if (!resp.ok) return null;
    const rows = await resp.json() as Array<{ worker_concurrency: number }>;
    return rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

async function registerWorker(): Promise<void> {
  try {
    const queueDepth = await checkQueuedJobsRaw();
    await fetch(`${supabaseUrl}/rest/v1/gpu_worker_heartbeats`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        worker_id: WORKER_ID,
        status: 'ACTIVE',
        queue_depth_at_start: queueDepth,
      }),
    });
  } catch {
    // non-fatal — heartbeat is best-effort
  }
}

async function updateWorkerHeartbeat(jobsProcessed: number): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/gpu_worker_heartbeats?worker_id=eq.${WORKER_ID}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        last_heartbeat_at: new Date().toISOString(),
        jobs_processed: jobsProcessed,
      }),
    });
  } catch {
    // non-fatal
  }
}

async function markWorkerDone(): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/gpu_worker_heartbeats?worker_id=eq.${WORKER_ID}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: 'DONE',
        last_heartbeat_at: new Date().toISOString(),
      }),
    });
  } catch {
    // non-fatal
  }
}

async function checkQueuedJobsRaw(): Promise<number> {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/render_jobs?select=id&status=eq.queued`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    if (!resp.ok) return 0;
    const rows = await resp.json() as Array<{ id: string }>;
    return rows.length;
  } catch {
    return 0;
  }
}

async function checkQueuedJobs(): Promise<boolean> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/render_jobs?select=id&status=eq.queued&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  if (!resp.ok) return false;
  const rows = await resp.json() as Array<{ id: string }>;
  return rows.length > 0;
}

async function dequeueBatchJobs(maxCount: number, maxAttempts: number): Promise<RenderJob[]> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/rpc/dequeue_render_jobs`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_max_count: maxCount, p_max_attempts: maxAttempts }),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Batch dequeue RPC failed: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  if (!data || !Array.isArray(data)) return [];

  return data.map((job: Record<string, unknown>) => ({
    id: job.id as string,
    job_type: job.job_type as string,
    payload: job.payload as Record<string, unknown>,
    attempts: (job.attempts as number) ?? 0,
    priority: job.priority as number | undefined,
    scan_id: job.scan_id as string | undefined,
    consecutive_failures: (job.consecutive_failures as number) ?? 0,
  }));
}

async function dequeueBatchJobsByType(
  jobTypes: string[],
  maxCount: number,
  maxAttempts: number,
): Promise<RenderJob[]> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/rpc/dequeue_render_jobs_by_type`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_job_types: jobTypes,
        p_max_count: maxCount,
        p_max_attempts: maxAttempts,
      }),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Type-aware dequeue RPC failed: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  if (!data || !Array.isArray(data)) return [];

  return data.map((job: Record<string, unknown>) => ({
    id: job.id as string,
    job_type: job.job_type as string,
    payload: job.payload as Record<string, unknown>,
    attempts: (job.attempts as number) ?? 0,
    priority: job.priority as number | undefined,
    scan_id: job.scan_id as string | undefined,
    consecutive_failures: (job.consecutive_failures as number) ?? 0,
  }));
}

async function markJobDone(jobId: string, result: Record<string, unknown>): Promise<void> {
  const resp = await fetch(`${supabaseUrl}/rest/v1/render_jobs?id=eq.${jobId}&status=eq.processing`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "done",
      result: result,
      completed_at: new Date().toISOString(),
      error_message: null,
      consecutive_failures: 0,
    }),
  });
  if (!resp.ok) throw new Error(`Mark done failed: ${resp.status}`);
}

async function markJobError(
  jobId: string,
  attempts: number,
  errorMsg: string,
  consecutiveFailures: number,
): Promise<void> {
  const resp = await fetch(`${supabaseUrl}/rest/v1/render_jobs?id=eq.${jobId}&status=eq.processing`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "error",
      error_message: errorMsg,
      attempts: attempts,
      consecutive_failures: consecutiveFailures,
      completed_at: new Date().toISOString(),
    }),
  });
  if (!resp.ok) {
    console.error(`markJobError failed for job ${jobId}: ${resp.status}`);
  }
}

async function requeueJob(
  jobId: string,
  attempts: number,
  errorMsg: string,
  consecutiveFailures: number,
): Promise<void> {
  const resp = await fetch(`${supabaseUrl}/rest/v1/render_jobs?id=eq.${jobId}&status=eq.processing`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "queued",
      attempts: attempts,
      error_message: errorMsg,
      consecutive_failures: consecutiveFailures,
    }),
  });
  if (!resp.ok) {
    console.error(`requeueJob failed for job ${jobId}: ${resp.status}`);
  }
}

async function recoverStaleJobs(): Promise<void> {
  const staleThreshold = new Date(Date.now() - JOB_TIMEOUT_MS).toISOString();
  try {
    // Requeue stale jobs that still have retries left. The attempt count
    // stays as-is — the next dequeue will pick it up, and if it fails again
    // the normal failure path increments attempts. This avoids infinite
    // stale-recovery loops where a perpetually crashing worker keeps
    // requeuing the same job without advancing the attempt counter.
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/render_jobs?status=eq.processing&started_at=lt.${staleThreshold}&attempts=lt.${MAX_ATTEMPTS}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "queued" }),
      },
    );
    if (!resp.ok) {
      console.warn(`recoverStaleJobs requeue PATCH failed: ${resp.status}`);
    }

    // Mark stale jobs that have exhausted retries as error so
    // they don't block the queue indefinitely.
    const errResp = await fetch(
      `${supabaseUrl}/rest/v1/render_jobs?status=eq.processing&started_at=lt.${staleThreshold}&attempts=gte.${MAX_ATTEMPTS}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "error",
          error_message: "Job timed out and exceeded max retry attempts",
          completed_at: new Date().toISOString(),
        }),
      },
    );
    if (!errResp.ok) {
      console.warn(`recoverStaleJobs error PATCH failed: ${errResp.status}`);
    }
  } catch (err) {
    console.warn('recoverStaleJobs error', err instanceof Error ? err.message : String(err));
  }
}

async function processJob(job: RenderJob): Promise<Record<string, unknown>> {
  if (!ALLOWED_JOB_TYPES.has(job.job_type)) {
    throw new Error(`Disallowed job_type: ${job.job_type}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);

  try {
    const functionSlug = JOB_TYPE_TO_FUNCTION_SLUG[job.job_type] ?? job.job_type;
    const functionUrl = `${supabaseUrl}/functions/v1/${functionSlug}`;
    const resp = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      signal: controller.signal,
      body: JSON.stringify(job.payload),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "Unknown error");
      throw new Error(`${job.job_type} failed (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}
