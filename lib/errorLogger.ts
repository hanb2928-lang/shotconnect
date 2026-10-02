import { Platform } from 'react-native';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';

const APP_VERSION = '1.0.0';
const APP_RELEASE = `${APP_VERSION}-${Platform.OS}`;

const SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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

function getUserAgent(): string | null {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return navigator.userAgent ?? null;
  }
  return null;
}

function getCurrentUrl(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location?.href ?? null;
  }
  return null;
}

export type LogLevel = 'fatal' | 'error' | 'warning';

export interface LogContext {
  component?: string;
  action?: string;
  route?: string;
  extra?: Record<string, unknown>;
}

export interface Breadcrumb {
  timestamp: string;
  category: string;
  message: string;
  level?: LogLevel;
  data?: Record<string, unknown>;
}

const MAX_BREADCRUMBS = 30;
const breadcrumbs: Breadcrumb[] = [];

export function addBreadcrumb(
  category: string,
  message: string,
  level: LogLevel = 'warning',
  data?: Record<string, unknown>,
): void {
  breadcrumbs.push({
    timestamp: new Date().toISOString(),
    category,
    message,
    level,
    data,
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.splice(0, breadcrumbs.length - MAX_BREADCRUMBS);
  }
}

export function getBreadcrumbs(): Breadcrumb[] {
  return [...breadcrumbs];
}

function consumeBreadcrumbs(): Breadcrumb[] {
  const snapshot = [...breadcrumbs];
  breadcrumbs.length = 0;
  return snapshot;
}

const pendingQueue: Array<{
  level: LogLevel;
  message: string;
  stack?: string;
  context?: LogContext;
  breadcrumbs?: Breadcrumb[];
  timestamp: string;
}> = [];

let isFlushing = false;

const FLUSH_TIMEOUT_MS = 5000;
const MAX_QUEUE_SIZE = 50;

async function flushQueue(): Promise<void> {
  if (isFlushing || pendingQueue.length === 0) return;
  isFlushing = true;
  const batch = pendingQueue.splice(0, 10);
  try {
    const rows = batch.map((item) => ({
      level: item.level,
      message: item.message,
      stack: item.stack ?? null,
      context: item.context ?? null,
      breadcrumbs: item.breadcrumbs ?? null,
      platform: Platform.OS,
      app_version: APP_VERSION,
      release: APP_RELEASE,
      device_info: getDeviceInfo(),
      session_id: SESSION_ID,
      url: getCurrentUrl(),
      user_agent: getUserAgent(),
      created_at: item.timestamp,
    }));
    const insertPromise = supabase.from('error_logs').insert(rows);
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      flushTimer = setTimeout(() => resolve({ error: { message: 'flush timeout' } }), FLUSH_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([
        insertPromise.then((r) => ({ error: r.error })),
        timeoutPromise,
      ]);
      if (result?.error) throw new Error(result.error.message);
    } finally {
      if (flushTimer) clearTimeout(flushTimer);
    }
  } catch {
    if (pendingQueue.length < MAX_QUEUE_SIZE) {
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
  const tag = level === 'fatal' ? 'SC_FATAL' : level === 'warning' ? 'SC_WARN' : 'SC_ERROR';
  const ctxStr = context
    ? ` | component=${context.component ?? '-'} action=${context.action ?? '-'} route=${context.route ?? '-'}`
    : '';
  const consoleFn = level === 'warning' ? console.warn : console.error;
  consoleFn(`[${tag}] ${message}${ctxStr}`);
  if (stack) consoleFn(`[${tag}:STACK] ${stack.split('\n').slice(0, 8).join(' | ')}`);

  pendingQueue.push({
    level,
    message,
    stack,
    context,
    breadcrumbs: consumeBreadcrumbs(),
    timestamp: new Date().toISOString(),
  });
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

function safeStringify(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// --- Global error handler installation ---

let handlersInstalled = false;

function tryInstallPromiseHandler(): boolean {
  try {
    if (typeof (global as any).onunhandledrejection === 'undefined' &&
        typeof (global as any).Promise === 'undefined') {
      return false;
    }
    const origHandler = (global as any).onunhandledrejection;
    (global as any).onunhandledrejection = (event: any) => {
      const reason = event?.reason ?? event;
      addBreadcrumb('promise', 'Unhandled promise rejection', 'error', {
        reason: reason instanceof Error ? reason.message : safeStringify(reason),
      });
      logFatal(safeStringify(reason), {
        action: 'unhandledrejection',
        extra: reason instanceof Error ? { stack: reason.stack } : undefined,
      });
      try {
        if (typeof origHandler === 'function') origHandler(event);
      } catch {
        // swallow
      }
    };
    return true;
  } catch {
    return false;
  }
}

function tryInstallErrorHandler(): boolean {
  try {
    const errorUtils = (global as any).ErrorUtils;
    if (!errorUtils?.setGlobalHandler || !errorUtils?.getGlobalHandler) {
      return false;
    }
    const prevHandler = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      const msg = error instanceof Error ? error.message : safeStringify(error);
      const stack = error instanceof Error ? error.stack : undefined;
      if (isFatal) {
        logFatal(msg, { action: 'globalHandler', extra: { isFatal: true, stack } });
        if (Platform.OS !== 'web' && typeof stack === 'string' && stack.length > 0) {
          try {
            Alert.alert(
              'Fatal Error',
              msg + '\n\n' + stack.split('\n').slice(0, 8).join('\n'),
              [{ text: 'OK' }],
            );
          } catch {
            // Alert.alert itself can throw if the native module isn't ready
          }
        }
      } else {
        logError(msg, { action: 'globalHandler', extra: { isFatal: false } });
      }
      try {
        if (typeof prevHandler === 'function') {
          prevHandler(error, isFatal);
        }
      } catch {
        // prevHandler may re-throw fatal errors
      }
    });
    return true;
  } catch {
    return false;
  }
}

function tryInstallWebErrorHandler(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  const origOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    const msg = error instanceof Error ? error.message : safeStringify(message);
    const stack = error instanceof Error ? error.stack : undefined;
    addBreadcrumb('window', 'Uncaught error', 'error', { source, lineno, colno });
    logError(msg, {
      action: 'window.onerror',
      extra: { source, lineno, colno, stack },
    });
    if (typeof origOnError === 'function') {
      try { origOnError(message, source, lineno, colno, error); } catch { /* swallow */ }
    }
    return false;
  };

  const origOnRejection = window.onunhandledrejection;
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const reason = event?.reason;
    addBreadcrumb('promise', 'Unhandled rejection', 'error', {
      reason: reason instanceof Error ? reason.message : safeStringify(reason),
    });
    logFatal(safeStringify(reason), {
      action: 'unhandledrejection',
      extra: reason instanceof Error ? { stack: reason.stack } : undefined,
    });
    if (typeof origOnRejection === 'function') {
      try { origOnRejection.call(window, event); } catch { /* swallow */ }
    }
  };

  return true;
}

function tryInstallWebglContextLossHandler(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  document.addEventListener('webglcontextlost', (e: Event) => {
    const canvas = e.target as HTMLCanvasElement | null;
    addBreadcrumb('webgl', 'WebGL context lost', 'error', {
      canvasId: canvas?.id ?? null,
    });
    logError('WebGL context lost', {
      component: 'glRenderer',
      action: 'webglcontextlost',
      extra: { canvasId: canvas?.id ?? null },
    });
  }, true);

  document.addEventListener('webglcontextrestored', () => {
    addBreadcrumb('webgl', 'WebGL context restored', 'warning');
    logWarning('WebGL context restored', { component: 'glRenderer' });
  }, true);

  return true;
}

function tryInstallWorkerErrorHandler(): boolean {
  if (Platform.OS !== 'web' || typeof Worker === 'undefined') return false;

  const origWorker = window.Worker;
  if (!origWorker) return false;

  try {
    class InstrumentedWorker extends origWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        this.addEventListener('error', (ev: ErrorEvent) => {
          addBreadcrumb('worker', 'Worker error', 'error', {
            filename: ev.filename,
            lineno: ev.lineno,
          });
          logError(ev.message || 'Worker error', {
            component: 'worker',
            action: 'worker.onerror',
            extra: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno },
          });
        });
        this.addEventListener('messageerror', () => {
          addBreadcrumb('worker', 'Worker message error', 'warning');
          logWarning('Worker message serialization error', { component: 'worker' });
        });
      }
    }

    (window as any).Worker = InstrumentedWorker;
    return true;
  } catch {
    return false;
  }
}

function installWithRetry(): void {
  if (handlersInstalled) return;

  const promiseOk = tryInstallPromiseHandler();
  const errorOk = tryInstallErrorHandler();
  const webOk = tryInstallWebErrorHandler();
  const webglOk = tryInstallWebglContextLossHandler();
  const workerOk = tryInstallWorkerErrorHandler();

  if (promiseOk && errorOk) {
    handlersInstalled = true;
    if (webOk) addBreadcrumb('telemetry', 'Web error handlers installed', 'warning');
    if (webglOk) addBreadcrumb('telemetry', 'WebGL context-loss handler installed', 'warning');
    if (workerOk) addBreadcrumb('telemetry', 'Worker error handler installed', 'warning');
    return;
  }

  let attempts = 0;
  const maxAttempts = 20;
  const retry = () => {
    if (handlersInstalled || attempts >= maxAttempts) return;
    attempts++;
    const pOk = tryInstallPromiseHandler();
    const eOk = tryInstallErrorHandler();
    if (pOk && eOk) {
      handlersInstalled = true;
      tryInstallWebErrorHandler();
      tryInstallWebglContextLossHandler();
      tryInstallWorkerErrorHandler();
    } else if (!handlersInstalled) {
      const delay = Math.min(10 * Math.pow(2, attempts - 1), 500);
      setTimeout(retry, delay);
    }
  };
  setTimeout(retry, 0);
}

export function installGlobalErrorHandlers(): void {
  if (handlersInstalled) return;
  installWithRetry();
}

export async function fetchRecentLogs(limit = 50): Promise<{
  id: string;
  level: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  breadcrumbs: Breadcrumb[] | null;
  platform: string | null;
  app_version: string | null;
  release: string | null;
  session_id: string | null;
  url: string | null;
  created_at: string;
}[]> {
  const { data, error } = await supabase
    .from('error_logs')
    .select('id, level, message, stack, context, breadcrumbs, platform, app_version, release, session_id, url, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as any;
}

export { SESSION_ID, APP_RELEASE };
