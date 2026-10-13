/**
 * AI Self-Diagnostic & Self-Learning Engine
 *
 * Tracks every AI video generation attempt, classifies failures, applies
 * auto-fixes, and learns parameter adjustments over time using EMA-based
 * adaptation — same pattern as prosodyLearning.ts.
 *
 * Closed loop:
 *   1. recordDiagnostic() — logs each attempt to Supabase ai_diagnostics
 *   2. analyzePatterns() — queries recent diagnostics to find recurring issues
 *   3. getLearnedAdjustments() — returns parameter tweaks learned from history
 *   4. applyAutoFix() — prescribes a fix for a given failure category
 *   5. getDiagnosticStats() — summary for the settings UI
 */

import { supabase } from '@/lib/supabase';
import { getItem, setItem } from '@/lib/storage';
import { classifyFailure, type FailureCategory } from '@/lib/selfHeal';
import { addBreadcrumb } from '@/lib/errorLogger';

const LEARNING_KEY = 'ai_diagnostic_learning';
const MAX_LOCAL_HISTORY = 100;
const LEARNING_RATE = 0.1;
const DECAY_RATE = 0.05;
const ANALYSIS_WINDOW_HOURS = 24;

export type PipelineStage = 'submit' | 'render' | 'poll' | 'hd_upgrade' | 'mux';
export type DiagnosticOutcome = 'success' | 'failed' | 'timeout' | 'abandoned';

export interface DiagnosticEvent {
  sessionId: string;
  scanId?: string;
  jobId?: string;
  pipelineStage: PipelineStage;
  failureCategory?: FailureCategory;
  failureDetail?: string;
  autoFixApplied?: string;
  autoFixSucceeded?: boolean;
  renderDurationMs?: number;
  modelUsed?: string;
  resolution?: string;
  fps?: number;
  durationSec?: number;
  isDraft?: boolean;
  selectedMode?: string;
  enableVirtualFitting?: boolean;
  hadModelImage?: boolean;
  outcome: DiagnosticOutcome;
  deviceInfo?: Record<string, unknown>;
}

interface LearnedAdjustments {
  optimalDurationSec: number;
  optimalResolution: string;
  optimalFps: number;
  draftSuccessRate: number;
  fullSuccessRate: number;
  avgRenderTimeMs: number;
  topFailureCategory: string | null;
  recommendedAutoFixes: AutoFixRecommendation[];
  totalAttempts: number;
  successStreak: number;
  lastUpdated: number;
}

export interface AutoFixRecommendation {
  category: FailureCategory;
  fix: string;
  confidence: number;
  applyCount: number;
  successCount: number;
}

interface LearningState {
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  recentOutcomes: { outcome: DiagnosticOutcome; category?: string; durationSec?: number; timestamp: number }[];
  perCategoryFixes: Record<string, { applyCount: number; successCount: number }>;
  emaDurationSec: number;
  emaRenderTimeMs: number;
  successStreak: number;
  lastUpdated: number;
}

function defaultLearningState(): LearningState {
  return {
    totalAttempts: 0,
    successCount: 0,
    failureCount: 0,
    recentOutcomes: [],
    perCategoryFixes: {},
    emaDurationSec: 5,
    emaRenderTimeMs: 30000,
    successStreak: 0,
    lastUpdated: Date.now(),
  };
}

async function loadLearningState(): Promise<LearningState> {
  try {
    const raw = await getItem(LEARNING_KEY);
    if (!raw) return defaultLearningState();
    const parsed = JSON.parse(raw) as LearningState;
    return { ...defaultLearningState(), ...parsed };
  } catch {
    return defaultLearningState();
  }
}

async function saveLearningState(state: LearningState): Promise<void> {
  try {
    await setItem(LEARNING_KEY, JSON.stringify(state));
  } catch {
    // non-fatal — learning is best-effort
  }
}

/**
 * Prescribes an auto-fix action for a given failure category.
 * Returns the fix description and any parameter adjustments.
 */
export function applyAutoFix(category: FailureCategory): {
  fix: string;
  adjustments: Partial<{ durationSec: number; resolution: string; fps: number; qualityTier: string }>;
} {
  switch (category) {
    case 'payload_too_large':
      return {
        fix: '이미지 압축률 증가 + 해상도 다운스케일',
        adjustments: { resolution: '480p', fps: 12 },
      };
    case 'memory_pressure':
      return {
        fix: '초안 모드 강제 전환 + 메모리 가드 활성화',
        adjustments: { resolution: '480p', fps: 12, qualityTier: 'standard' },
      };
    case 'network_timeout':
      return {
        fix: '재시도 + 소프트 타임아웃 연장',
        adjustments: {},
      };
    case 'network_unstable':
      return {
        fix: '네트워크 복구 대기 후 재시도',
        adjustments: {},
      };
    case 'rate_limited':
      return {
        fix: '백오프 대기 후 재시도 (최대 1회)',
        adjustments: {},
      };
    case 'server_error':
      return {
        fix: '지수 백오프 재시도 (최대 2회)',
        adjustments: {},
      };
    case 'auth_error':
      return {
        fix: '세션 갱신 후 재시도',
        adjustments: {},
      };
    default:
      return { fix: '수동 확인 필요', adjustments: {} };
  }
}

/**
 * Records a diagnostic event to Supabase and updates the local learning state.
 * This is the primary entry point — call it after every generation attempt
 * (success or failure).
 */
export async function recordDiagnostic(event: DiagnosticEvent): Promise<void> {
  addBreadcrumb('diagnostic', `stage=${event.pipelineStage} outcome=${event.outcome}`, 'warning', {
    category: event.failureCategory,
    scanId: event.scanId,
  });

  // Write to Supabase (fire-and-forget, non-blocking)
  try {
    await supabase.from('ai_diagnostics').insert({
      session_id: event.sessionId,
      scan_id: event.scanId ?? null,
      job_id: event.jobId ?? null,
      pipeline_stage: event.pipelineStage,
      failure_category: event.failureCategory ?? null,
      failure_detail: event.failureDetail ?? null,
      auto_fix_applied: event.autoFixApplied ?? null,
      auto_fix_succeeded: event.autoFixSucceeded ?? null,
      render_duration_ms: event.renderDurationMs ?? null,
      model_used: event.modelUsed ?? null,
      resolution: event.resolution ?? null,
      fps: event.fps ?? null,
      duration_sec: event.durationSec ?? null,
      is_draft: event.isDraft ?? false,
      selected_mode: event.selectedMode ?? null,
      enable_virtual_fitting: event.enableVirtualFitting ?? false,
      had_model_image: event.hadModelImage ?? false,
      outcome: event.outcome,
      device_info: event.deviceInfo ?? null,
    });
  } catch {
    // Supabase write failure is non-fatal — local learning still works
  }

  // Update local learning state with EMA
  const state = await loadLearningState();
  state.totalAttempts += 1;

  if (event.outcome === 'success') {
    state.successCount += 1;
    state.successStreak += 1;
    if (event.durationSec && event.durationSec > 0) {
      state.emaDurationSec = state.emaDurationSec * (1 - LEARNING_RATE) + event.durationSec * LEARNING_RATE;
    }
    if (event.renderDurationMs && event.renderDurationMs > 0) {
      state.emaRenderTimeMs = state.emaRenderTimeMs * (1 - LEARNING_RATE) + event.renderDurationMs * LEARNING_RATE;
    }
  } else {
    state.failureCount += 1;
    state.successStreak = 0;
    if (event.durationSec && event.durationSec > 0) {
      state.emaDurationSec = state.emaDurationSec * (1 - DECAY_RATE) + event.durationSec * DECAY_RATE;
    }
  }

  // Track auto-fix effectiveness
  if (event.autoFixApplied && event.failureCategory) {
    const key = event.failureCategory;
    if (!state.perCategoryFixes[key]) {
      state.perCategoryFixes[key] = { applyCount: 0, successCount: 0 };
    }
    state.perCategoryFixes[key].applyCount += 1;
    if (event.autoFixSucceeded) {
      state.perCategoryFixes[key].successCount += 1;
    }
  }

  state.recentOutcomes.push({
    outcome: event.outcome,
    category: event.failureCategory,
    durationSec: event.durationSec,
    timestamp: Date.now(),
  });
  if (state.recentOutcomes.length > MAX_LOCAL_HISTORY) {
    state.recentOutcomes.shift();
  }

  state.lastUpdated = Date.now();
  await saveLearningState(state);
}

/**
 * Queries the Supabase ai_diagnostics table for recent patterns.
 * Returns aggregated failure categories and success rates.
 */
export async function analyzePatterns(sessionId?: string): Promise<{
  totalEvents: number;
  successRate: number;
  failureBreakdown: Record<string, number>;
  avgRenderTimeMs: number;
  topIssues: Array<{ category: string; count: number; fixSuccessRate: number }>;
  recommendations: Array<{ type: string; message: string; priority: string }>;
}> {
  try {
    const since = new Date(Date.now() - ANALYSIS_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    let query = supabase
      .from('ai_diagnostics')
      .select('outcome, failure_category, auto_fix_succeeded, render_duration_ms')
      .gte('created_at', since);
    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }
    const { data, error } = await query;
    if (error || !data) {
      return { totalEvents: 0, successRate: 0, failureBreakdown: {}, avgRenderTimeMs: 0, topIssues: [], recommendations: [] };
    }

    const total = data.length;
    const successes = data.filter((r) => r.outcome === 'success').length;
    const failures = data.filter((r) => r.outcome !== 'success');

    const breakdown: Record<string, number> = {};
    const fixStats: Record<string, { count: number; fixed: number }> = {};
    let totalRenderMs = 0;
    let renderCount = 0;

    for (const row of failures) {
      const cat = row.failure_category ?? 'unknown';
      breakdown[cat] = (breakdown[cat] ?? 0) + 1;
      if (row.auto_fix_succeeded !== null) {
        if (!fixStats[cat]) fixStats[cat] = { count: 0, fixed: 0 };
        fixStats[cat].count += 1;
        if (row.auto_fix_succeeded) fixStats[cat].fixed += 1;
      }
    }

    for (const row of data) {
      if (row.render_duration_ms && row.render_duration_ms > 0) {
        totalRenderMs += row.render_duration_ms;
        renderCount += 1;
      }
    }

    const topIssues = Object.entries(breakdown)
      .map(([category, count]) => ({
        category,
        count,
        fixSuccessRate: fixStats[category] ? fixStats[category].fixed / fixStats[category].count : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalEvents: total,
      successRate: total > 0 ? successes / total : 0,
      failureBreakdown: breakdown,
      avgRenderTimeMs: renderCount > 0 ? Math.round(totalRenderMs / renderCount) : 0,
      topIssues,
      recommendations: [],
    };
  } catch {
    return { totalEvents: 0, successRate: 0, failureBreakdown: {}, avgRenderTimeMs: 0, topIssues: [], recommendations: [] };
  }
}

/**
 * Returns the current learned adjustments based on local EMA state.
 * These are parameter tweaks the pipeline should apply proactively.
 */
export async function getLearnedAdjustments(): Promise<LearnedAdjustments> {
  const state = await loadLearningState();

  const recommendedAutoFixes: AutoFixRecommendation[] = Object.entries(state.perCategoryFixes)
    .map(([category, stats]) => ({
      category: category as FailureCategory,
      fix: applyAutoFix(category as FailureCategory).fix,
      confidence: stats.applyCount > 0 ? stats.successCount / stats.applyCount : 0,
      applyCount: stats.applyCount,
      successCount: stats.successCount,
    }))
    .filter((r) => r.applyCount >= 2)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  // Determine top failure category from recent outcomes
  const recentFailures = state.recentOutcomes.filter((o) => o.outcome !== 'success');
  const categoryCounts: Record<string, number> = {};
  for (const f of recentFailures) {
    const cat = f.category ?? 'unknown';
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }
  const topFailureCategory = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Determine optimal resolution based on success patterns
  const draftSuccesses = state.recentOutcomes.filter((o) => o.outcome === 'success' && o.durationSec && o.durationSec <= 5).length;
  const fullSuccesses = state.recentOutcomes.filter((o) => o.outcome === 'success' && o.durationSec && o.durationSec > 5).length;
  const draftTotal = state.recentOutcomes.filter((o) => o.durationSec && o.durationSec <= 5).length;
  const fullTotal = state.recentOutcomes.filter((o) => o.durationSec && o.durationSec > 5).length;

  return {
    optimalDurationSec: Math.round(Math.min(Math.max(state.emaDurationSec, 3), 30)),
    optimalResolution: state.emaRenderTimeMs < 20000 ? '720p' : '480p',
    optimalFps: state.emaRenderTimeMs < 20000 ? 24 : 12,
    draftSuccessRate: draftTotal > 0 ? draftSuccesses / draftTotal : 0,
    fullSuccessRate: fullTotal > 0 ? fullSuccesses / fullTotal : 0,
    avgRenderTimeMs: Math.round(state.emaRenderTimeMs),
    topFailureCategory,
    recommendedAutoFixes,
    totalAttempts: state.totalAttempts,
    successStreak: state.successStreak,
    lastUpdated: state.lastUpdated,
  };
}

/**
 * Returns a summary of diagnostic stats for the settings UI.
 */
export async function getDiagnosticStats(): Promise<{
  totalAttempts: number;
  successRate: number;
  successStreak: number;
  avgRenderTimeMs: number;
  topFailureCategory: string | null;
  recommendedFixes: AutoFixRecommendation[];
  recentOutcomes: Array<{ outcome: string; category?: string; timestamp: number }>;
}> {
  const state = await loadLearningState();
  const total = state.successCount + state.failureCount;
  const adjustments = await getLearnedAdjustments();

  return {
    totalAttempts: state.totalAttempts,
    successRate: total > 0 ? state.successCount / total : 0,
    successStreak: state.successStreak,
    avgRenderTimeMs: Math.round(state.emaRenderTimeMs),
    topFailureCategory: adjustments.topFailureCategory,
    recommendedFixes: adjustments.recommendedAutoFixes,
    recentOutcomes: state.recentOutcomes.slice(-20),
  };
}

/**
 * Attempts to self-heal a failed generation by classifying the error,
 * applying an auto-fix, and recording the outcome.
 *
 * Returns the fix description and whether a retry should be attempted.
 */
export async function selfHealGeneration(
  err: unknown,
  context: { scanId?: string; jobId?: string; sessionId: string; isDraft?: boolean; selectedMode?: string },
): Promise<{ shouldRetry: boolean; fixDescription: string; fixApplied: string | null }> {
  const category = classifyFailure(err);
  const { fix, adjustments } = applyAutoFix(category);
  const errorMsg = err instanceof Error ? err.message : String(err);

  // Record the failure
  await recordDiagnostic({
    sessionId: context.sessionId,
    scanId: context.scanId,
    jobId: context.jobId,
    pipelineStage: 'render',
    failureCategory: category,
    failureDetail: errorMsg,
    autoFixApplied: fix,
    autoFixSucceeded: false, // will be updated if retry succeeds
    isDraft: context.isDraft,
    selectedMode: context.selectedMode,
    outcome: 'failed',
  });

  // Determine if retry is worthwhile
  const shouldRetry = category !== 'auth_error' && category !== 'unknown' && fix !== '수동 확인 필요';

  return {
    shouldRetry,
    fixDescription: fix,
    fixApplied: shouldRetry ? fix : null,
  };
}

/**
 * Records a successful generation, including any auto-fix that was applied.
 */
export async function recordSuccessfulGeneration(
  context: { scanId?: string; jobId?: string; sessionId: string; renderDurationMs?: number; modelUsed?: string; resolution?: string; fps?: number; durationSec?: number; isDraft?: boolean; selectedMode?: string; enableVirtualFitting?: boolean; hadModelImage?: boolean; autoFixApplied?: string },
): Promise<void> {
  await recordDiagnostic({
    sessionId: context.sessionId,
    scanId: context.scanId,
    jobId: context.jobId,
    pipelineStage: 'render',
    autoFixApplied: context.autoFixApplied,
    autoFixSucceeded: context.autoFixApplied ? true : undefined,
    renderDurationMs: context.renderDurationMs,
    modelUsed: context.modelUsed,
    resolution: context.resolution,
    fps: context.fps,
    durationSec: context.durationSec,
    isDraft: context.isDraft,
    selectedMode: context.selectedMode,
    enableVirtualFitting: context.enableVirtualFitting,
    hadModelImage: context.hadModelImage,
    outcome: 'success',
  });
}

/**
 * Clears all local learning state. Server-side diagnostics are preserved.
 */
export async function resetLearningState(): Promise<void> {
  await saveLearningState(defaultLearningState());
}
