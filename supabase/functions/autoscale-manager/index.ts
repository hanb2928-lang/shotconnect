import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface AutoscaleConfig {
  id: number;
  min_workers: number;
  max_workers: number;
  scale_up_threshold: number;
  scale_down_threshold: number;
  worker_idle_ttl_sec: number;
  scale_cooldown_sec: number;
  heartbeat_timeout_sec: number;
  enabled: boolean;
  worker_concurrency: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const result = await runAutoscale();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Autoscale failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function runAutoscale(): Promise<{
  enabled: boolean;
  queueDepth: number;
  activeWorkers: number;
  targetWorkers: number;
  spawned: number;
  pruned: number;
  action: string;
}> {
  const config = await fetchConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      queueDepth: 0,
      activeWorkers: 0,
      targetWorkers: 0,
      spawned: 0,
      pruned: 0,
      action: "disabled",
    };
  }

  const queueDepth = await fetchQueueDepth();
  const activeWorkers = await countActiveWorkers(config.heartbeat_timeout_sec);
  const pruned = await cleanStaleWorkers(config.heartbeat_timeout_sec);

  const targetWorkers = computeTarget(config, queueDepth, activeWorkers);

  let spawned = 0;
  if (targetWorkers > activeWorkers) {
    spawned = await spawnWorkers(
      targetWorkers - activeWorkers,
      queueDepth,
    );
  }

  const action = spawned > 0
    ? `scaled_up: ${activeWorkers}→${targetWorkers}`
    : targetWorkers < activeWorkers
    ? `scaled_down: ${activeWorkers}→${targetWorkers} (natural decay)`
    : "steady";

  return {
    enabled: true,
    queueDepth,
    activeWorkers,
    targetWorkers,
    spawned,
    pruned,
    action,
  };
}

async function fetchConfig(): Promise<AutoscaleConfig> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/gpu_autoscale_config?id=eq.1&select=*`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  if (!resp.ok) throw new Error(`Failed to fetch autoscale config: ${resp.status}`);
  const rows = await resp.json() as AutoscaleConfig[];
  if (rows.length === 0) throw new Error("Autoscale config row not found");
  return rows[0];
}

async function fetchQueueDepth(): Promise<number> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/render_jobs?select=id&status=eq.queued`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  if (!resp.ok) return 0;
  const rows = await resp.json() as Array<{ id: string }>;
  return rows.length;
}

async function countActiveWorkers(timeoutSec: number): Promise<number> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/rpc/count_active_workers`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_timeout_sec: timeoutSec }),
    },
  );
  if (!resp.ok) return 0;
  const data = await resp.json();
  return typeof data === "number" ? data : 0;
}

async function cleanStaleWorkers(timeoutSec: number): Promise<number> {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/rpc/clean_stale_workers`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_timeout_sec: timeoutSec }),
      },
    );
    if (!resp.ok) return 0;
    return 1;
  } catch {
    return 0;
  }
}

function computeTarget(
  config: AutoscaleConfig,
  queueDepth: number,
  activeWorkers: number,
): number {
  if (queueDepth === 0) {
    return config.min_workers;
  }

  if (queueDepth <= config.scale_down_threshold) {
    return config.min_workers;
  }

  if (queueDepth >= config.scale_up_threshold) {
    // Target enough workers to drain the queue in one parallel wave,
    // where each worker handles worker_concurrency jobs concurrently.
    const concurrency = Math.max(config.worker_concurrency, 1);
    const proportional = Math.ceil(queueDepth / concurrency);
    return Math.min(proportional, config.max_workers);
  }

  // Between thresholds: scale proportionally with the queue depth,
  // accounting for per-worker concurrency capacity.
  const concurrency = Math.max(config.worker_concurrency, 1);
  const needed = Math.ceil(queueDepth / concurrency);
  return Math.max(config.min_workers, Math.min(needed, config.max_workers));
}

async function spawnWorkers(
  count: number,
  queueDepth: number,
): Promise<number> {
  const processorUrl = `${supabaseUrl}/functions/v1/process-queue`;
  let spawned = 0;

  const tasks: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    tasks.push(
      (async () => {
        try {
          await fetch(processorUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
            },
            body: JSON.stringify({ trigger: true, autoscale: true }),
          });
          spawned++;
        } catch {
          // individual spawn failure is non-fatal
        }
      })(),
    );
  }

  await Promise.allSettled(tasks);
  return spawned;
}
