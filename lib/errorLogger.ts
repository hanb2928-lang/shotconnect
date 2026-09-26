import { Platform } from 'react-native';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';

const APP_VERSION = '1.0.0';

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

export type LogLevel = 'fatal' | 'error' | 'warning';

export interface LogContext {
  component?: string;
  action?: string;
  route?: string;
  extra?: Record<string, unknown>;
}

const pendingQueue: Array<{
  level: LogLevel;
  message: string;
  stack?: string;
  context?: LogContext;
  timestamp: string;
}> = [];

let isFlushing = false;

const FLUSH_TIMEOUT_MS = 5000;

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
      platform: Platform.OS,
      app_version: APP_VERSION,
      device_info: getDeviceInfo(),
      session_id: SESSION_ID,
      created_at: item.timestamp,
    }));
    const insertPromise = supabase.from('error_logs').insert(rows);
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ error: { message: 'flush timeout' } }), FLUSH_TIMEOUT_MS),
    );
    await Promise.race([insertPromise, timeoutPromise]);
  } catch {
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
  const tag = level === 'fatal' ? 'SC_FATAL' : level === 'warning' ? 'SC_WARN' : 'SC_ERROR';
  const ctxStr = context
    ? ` | component=${context.component ?? '-'} action=${context.action ?? '-'} route=${context.route ?? '-'}`
    : '';
  const consoleFn = level === 'warning' ? console.warn : console.error;
  consoleFn(`[${tag}] ${message}${ctxStr}`);
  if (stack) consoleFn(`[${tag}:STACK] ${stack.split('\n').slice(0, 8).join(' | ')}`);

  pendingQueue.push({ level, message, stack, context, timestamp: new Date().toISOString() });
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

// Track installation state so we don't double-install
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
        if (Platform.OS !== 'web' && stack) {
          Alert.alert(
            'Fatal Error',
            msg + '\n\n' + stack.split('\n').slice(0, 8).join('\n'),
            [{ text: 'OK' }],
          );
        }
      } else {
        logError(msg, { action: 'globalHandler', extra: { isFatal: false } });
      }
      try {
        if (typeof prevHandler === 'function') {
          prevHandler(error, isFatal);
        }
      } catch {
        // prevHandler may re-throw fatal errors — swallow to prevent crash loop
      }
    });
    return true;
  } catch {
    return false;
  }
}

function installWithRetry(): void {
  if (handlersInstalled) return;

  const promiseOk = tryInstallPromiseHandler();
  const errorOk = tryInstallErrorHandler();

  if (promiseOk && errorOk) {
    handlersInstalled = true;
    return;
  }

  // On native, ErrorUtils may not be available at module-eval time.
  // Retry on next microtask, then on a longer interval if still not ready.
  let attempts = 0;
  const maxAttempts = 20;
  const retry = () => {
    if (handlersInstalled || attempts >= maxAttempts) return;
    attempts++;
    const pOk = tryInstallPromiseHandler();
    const eOk = tryInstallErrorHandler();
    if (pOk && eOk) {
      handlersInstalled = true;
    } else if (!handlersInstalled) {
      // Exponential backoff: 10ms, 20ms, 40ms... capped at 500ms
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
  platform: string | null;
  app_version: string | null;
  session_id: string | null;
  created_at: string;
}[]> {
  const { data, error } = await supabase
    .from('error_logs')
    .select('id, level, message, stack, context, platform, app_version, session_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as any;
}

export { SESSION_ID };
