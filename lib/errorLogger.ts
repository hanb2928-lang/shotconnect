import { Platform } from 'react-native';

// App version from app.json — kept in sync manually
const APP_VERSION = '1.0.0';

// Stable per-launch session ID
const SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Lazy device info (computed once)
let cachedDeviceInfo: Record<string, unknown> | null = null;
function getDeviceInfo(): Record<string, unknown> {
  if (cachedDeviceInfo) return cachedDeviceInfo;
  cachedDeviceInfo = {
    platform: Platform.OS,
    version: Platform.Version,
    isTV: Platform.isTV,
    isPad: Platform.OS === 'ios' ? (Platform as any).isPad : false,
  };
  return cachedDeviceInfo;
}

export type LogLevel = 'fatal' | 'error' | 'warning';

export interface LogContext {
  component?: string;
  action?: string;
  route?: string;
  extra?: Record<string, unknown>;
}

// In-memory queue for offline resilience — flushed on next network activity
const pendingQueue: Array<{
  level: LogLevel;
  message: string;
  stack?: string;
  context?: LogContext;
  timestamp: string;
}> = [];

let isFlushing = false;

async function flushQueue(): Promise<void> {
  if (isFlushing || pendingQueue.length === 0) return;
  isFlushing = true;
  const batch = pendingQueue.splice(0, 10);
  try {
    // Lazy import so errorLogger doesn't depend on supabase at module-eval time
    const { supabase } = await import('@/lib/supabase');
    const rows = batch.map((item) => ({
      level: item.level,
      message: item.message,
      stack: item.stack ?? null,
      context: item.context ?? null,
      platform: Platform.OS,
      app_version: APP_VERSION,
      device_info: getDeviceInfo(),
      session_id: SESSION_ID,
      created_at: item.timestamp,
    }));
    await supabase.from('error_logs').insert(rows);
  } catch {
    // Re-queue on failure (up to 50 total to cap memory)
    if (pendingQueue.length < 50) {
      pendingQueue.unshift(...batch);
    }
  } finally {
    isFlushing = false;
  }
}

export function log(
  level: LogLevel,
  message: string,
  stack?: string,
  context?: LogContext,
): void {
  // Structured logcat output — uses SC_ERROR tag so it's easy to filter:
  //   adb logcat *:S SC_ERROR:V
  const tag = level === 'fatal' ? 'SC_FATAL' : level === 'warning' ? 'SC_WARN' : 'SC_ERROR';
  const ctxStr = context
    ? ` | component=${context.component ?? '-'} action=${context.action ?? '-'} route=${context.route ?? '-'}`
    : '';
  const consoleFn = level === 'warning' ? console.warn : console.error;
  consoleFn(`[${tag}] ${message}${ctxStr}`);
  if (stack) consoleFn(`[${tag}:STACK] ${stack.split('\n').slice(0, 8).join(' | ')}`);

  pendingQueue.push({ level, message, stack, context, timestamp: new Date().toISOString() });
  // Fire-and-forget flush
  flushQueue().catch(() => {});
}

export function logError(error: unknown, context?: LogContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  log('error', err.message, err.stack, context);
}

export function logFatal(error: unknown, context?: LogContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  log('fatal', err.message, err.stack, context);
}

export function logWarning(message: string, context?: LogContext): void {
  log('warning', message, undefined, context);
}

// Install global unhandled promise rejection handler.
// Call once from the app root (e.g. _layout.tsx).
export function installGlobalErrorHandlers(): void {
  try {
    // Unhandled promise rejections — guard against Hermes not having
    // the promise polyfill initialized at module-eval time
    const origHandler = (global as any).onunhandledrejection;
    (global as any).onunhandledrejection = (event: PromiseRejectionEvent) => {
      logFatal(event.reason, { action: 'unhandledrejection' });
      if (origHandler) origHandler(event);
    };
  } catch {
    // global not writable or not initialized
  }

  try {
    // React Native global error handler
    const prevHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
    (global as any).ErrorUtils?.setGlobalHandler?.((error: Error, isFatal?: boolean) => {
      if (isFatal) {
        logFatal(error, { action: 'globalHandler', extra: { isFatal: true } });
      } else {
        logError(error, { action: 'globalHandler', extra: { isFatal: false } });
      }
      prevHandler?.(error, isFatal);
    });
  } catch {
    // ErrorUtils not available at this point
  }
}

// Retrieve recent error logs for the in-app viewer
export async function fetchRecentLogs(limit = 50): Promise<{
  id: string;
  level: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  platform: string | null;
  app_version: string | null;
  session_id: string | null;
  created_at: string;
}[]> {
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('error_logs')
    .select('id, level, message, stack, context, platform, app_version, session_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as any;
}

export { SESSION_ID };
