/**
 * AI Self-Diagnostic Edge Function
 *
 * Endpoints:
 *   POST /ai-diagnostic          — record a diagnostic event (from client)
 *   GET  /ai-diagnostic/analyze  — analyze recent patterns + return recommendations
 *   GET  /ai-diagnostic/health   — simple health check
 *
 * This function persists events to the ai_diagnostics table and reads
 * aggregated patterns for learning. It does NOT mutate any generation
 * pipeline state — it only reads and writes diagnostics data.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface DiagnosticRecord {
  session_id: string;
  scan_id?: string | null;
  job_id?: string | null;
  pipeline_stage: string;
  failure_category?: string | null;
  failure_detail?: string | null;
  auto_fix_applied?: string | null;
  auto_fix_succeeded?: boolean | null;
  render_duration_ms?: number | null;
  model_used?: string | null;
  resolution?: string | null;
  fps?: number | null;
  duration_sec?: number | null;
  is_draft?: boolean;
  selected_mode?: string | null;
  enable_virtual_fitting?: boolean;
  had_model_image?: boolean;
  outcome: string;
  device_info?: Record<string, unknown> | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/ai-diagnostic/, "") || "/";

  try {
    // GET /health
    if (req.method === "GET" && path === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", service: "ai-diagnostic", timestamp: Date.now() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // GET /analyze — aggregate patterns from last 24h
    if (req.method === "GET" && path === "/analyze") {
      const sessionId = url.searchParams.get("session_id") ?? undefined;
      const hours = parseInt(url.searchParams.get("hours") ?? "24", 10);
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const sb = getSupabase();
      let query = sb
        .from("ai_diagnostics")
        .select("outcome, failure_category, auto_fix_applied, auto_fix_succeeded, render_duration_ms, model_used, resolution, is_draft, selected_mode, pipeline_stage, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);

      if (sessionId) {
        query = query.eq("session_id", sessionId);
      }

      const { data, error } = await query;
      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!data || data.length === 0) {
        return new Response(
          JSON.stringify({
            totalEvents: 0,
            successRate: 0,
            failureBreakdown: {},
            avgRenderTimeMs: 0,
            topIssues: [],
            recommendations: [],
            modelPerformance: {},
            message: "최근 진단 데이터가 없습니다.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const total = data.length;
      const successes = data.filter((r: any) => r.outcome === "success").length;
      const failures = data.filter((r: any) => r.outcome !== "success");

      // Failure breakdown by category
      const breakdown: Record<string, number> = {};
      const fixStats: Record<string, { count: number; fixed: number }> = {};
      for (const row of failures) {
        const cat = row.failure_category ?? "unknown";
        breakdown[cat] = (breakdown[cat] ?? 0) + 1;
        if (row.auto_fix_applied) {
          if (!fixStats[cat]) fixStats[cat] = { count: 0, fixed: 0 };
          fixStats[cat].count += 1;
          if (row.auto_fix_succeeded) fixStats[cat].fixed += 1;
        }
      }

      // Model performance
      const modelStats: Record<string, { total: number; success: number; avgTime: number; timeCount: number }> = {};
      for (const row of data) {
        const model = row.model_used ?? "unknown";
        if (!modelStats[model]) modelStats[model] = { total: 0, success: 0, avgTime: 0, timeCount: 0 };
        modelStats[model].total += 1;
        if (row.outcome === "success") modelStats[model].success += 1;
        if (row.render_duration_ms && row.render_duration_ms > 0) {
          modelStats[model].avgTime += row.render_duration_ms;
          modelStats[model].timeCount += 1;
        }
      }

      const modelPerformance: Record<string, { successRate: number; avgRenderTimeMs: number; total: number }> = {};
      for (const [model, stats] of Object.entries(modelStats)) {
        modelPerformance[model] = {
          successRate: stats.total > 0 ? stats.success / stats.total : 0,
          avgRenderTimeMs: stats.timeCount > 0 ? Math.round(stats.avgTime / stats.timeCount) : 0,
          total: stats.total,
        };
      }

      // Average render time
      const renderTimes = data.filter((r: any) => r.render_duration_ms && r.render_duration_ms > 0);
      const avgRenderTimeMs = renderTimes.length > 0
        ? Math.round(renderTimes.reduce((sum: number, r: any) => sum + r.render_duration_ms, 0) / renderTimes.length)
        : 0;

      // Top issues
      const topIssues = Object.entries(breakdown)
        .map(([category, count]) => ({
          category,
          count,
          fixSuccessRate: fixStats[category] ? fixStats[category].fixed / fixStats[category].count : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Generate recommendations
      const recommendations: Array<{ type: string; message: string; priority: string }> = [];

      // Recommend model switch if one model has significantly lower success rate
      const modelEntries = Object.entries(modelPerformance);
      if (modelEntries.length >= 2) {
        const sorted = modelEntries.sort((a, b) => a[1].successRate - b[1].successRate);
        const worst = sorted[0];
        const best = sorted[sorted.length - 1];
        if (worst[1].total >= 3 && worst[1].successRate < best[1].successRate - 0.2) {
          recommendations.push({
            type: "model_switch",
            message: `${worst[0]} 모델 성공률 ${Math.round(worst[1].successRate * 100)}% → ${best[0]} 모델(성공률 ${Math.round(best[1].successRate * 100)}%) 사용을 권장합니다.`,
            priority: "high",
          });
        }
      }

      // Recommend draft mode if full renders fail often
      const draftSuccessRate = data.filter((r: any) => r.is_draft && r.outcome === "success").length /
        Math.max(1, data.filter((r: any) => r.is_draft).length);
      const fullSuccessRate = data.filter((r: any) => !r.is_draft && r.outcome === "success").length /
        Math.max(1, data.filter((r: any) => !r.is_draft).length);
      if (fullSuccessRate < 0.5 && draftSuccessRate > fullSuccessRate + 0.2) {
        recommendations.push({
          type: "use_draft",
          message: "풀 렌더링 실패율이 높습니다. 초안 모드(480p/12fps) 우선 사용을 권장합니다.",
          priority: "medium",
        });
      }

      // Recommend virtual fitting fix if model image missing
      const vfFailures = failures.filter((r: any) => r.selected_mode === "universal_synthesis" && !r.had_model_image);
      if (vfFailures.length >= 2) {
        recommendations.push({
          type: "missing_model_image",
          message: "AI 범용 합성 모드에서 모델 이미지 누락이 반복되었습니다. 모델 이미지 업로드를 확인해주세요.",
          priority: "high",
        });
      }

      // Recommend quality reduction if payload_too_large is frequent
      if ((breakdown["payload_too_large"] ?? 0) >= 3) {
        recommendations.push({
          type: "reduce_quality",
          message: "이미지 용량 초과가 반복되었습니다. 이미지 압축 또는 480p 해상도 사용을 권장합니다.",
          priority: "medium",
        });
      }

      return new Response(
        JSON.stringify({
          totalEvents: total,
          successRate: total > 0 ? successes / total : 0,
          failureBreakdown: breakdown,
          avgRenderTimeMs,
          topIssues,
          recommendations,
          modelPerformance,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // POST / — record a diagnostic event
    if (req.method === "POST" && path === "/") {
      const body = await req.json() as DiagnosticRecord;

      if (!body.session_id || !body.pipeline_stage || !body.outcome) {
        return new Response(
          JSON.stringify({ error: "session_id, pipeline_stage, outcome는 필수입니다." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const sb = getSupabase();
      const { error } = await sb.from("ai_diagnostics").insert({
        session_id: body.session_id,
        scan_id: body.scan_id ?? null,
        job_id: body.job_id ?? null,
        pipeline_stage: body.pipeline_stage,
        failure_category: body.failure_category ?? null,
        failure_detail: body.failure_detail ?? null,
        auto_fix_applied: body.auto_fix_applied ?? null,
        auto_fix_succeeded: body.auto_fix_succeeded ?? null,
        render_duration_ms: body.render_duration_ms ?? null,
        model_used: body.model_used ?? null,
        resolution: body.resolution ?? null,
        fps: body.fps ?? null,
        duration_sec: body.duration_sec ?? null,
        is_draft: body.is_draft ?? false,
        selected_mode: body.selected_mode ?? null,
        enable_virtual_fitting: body.enable_virtual_fitting ?? false,
        had_model_image: body.had_model_image ?? false,
        outcome: body.outcome,
        device_info: body.device_info ?? null,
      });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ status: "recorded" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Unknown route
    return new Response(
      JSON.stringify({ error: "Unknown endpoint" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
