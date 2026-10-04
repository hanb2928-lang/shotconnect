/**
 * Real-time upload network debug logger.
 *
 * In __DEV__, every upload request is logged with:
 *   - request URL, method, headers (auth redacted)
 *   - file URI, file size, MIME type
 *   - upload path (native uploadAsync vs supabase-js vs blob)
 *   - HTTP response status code and body (first 500 chars)
 *   - timing (latency in ms)
 *   - error details if the upload failed
 *
 * In production, __DEV__ is false and all functions are no-ops.
 *
 * Logs are emitted to:
 *   1. console.log with [SC_UPLOAD] prefix — visible in Flipper,
 *      React Native Debugger, and `DEBUG=*` terminal output
 *   2. addBreadcrumb — so error reports include the upload trail
 *   3. an in-memory ring buffer — consumed by the in-app debug overlay
 */

import { addBreadcrumb } from '@/lib/errorLogger';

export type UploadPath = 'native_uploadAsync' | 'supabase_js' | 'blob_fallback';

export interface UploadDebugEvent {
  id: string;
  timestamp: string;
  path: UploadPath;
  method: string;
  url: string;
  fileUri?: string;
  fileSize?: number;
  mimeType?: string;
  requestHeaders?: Record<string, string>;
  status?: number;
  responseBody?: string;
  latencyMs?: number;
  error?: string;
  attempt?: number;
}

const MAX_EVENTS = 50;
const eventBuffer: UploadDebugEvent[] = [];
const listeners: Set<(events: UploadDebugEvent[]) => void> = new Set();

let eventCounter = 0;

function nextId(): string {
  return `upload-${Date.now()}-${eventCounter++}`;
}

function notifyListeners(): void {
  if (listeners.size === 0) return;
  const snapshot = [...eventBuffer];
  for (const fn of listeners) {
    try { fn(snapshot); } catch { /* listener errors must not break uploads */ }
  }
}

/**
 * Subscribe to upload debug events. Returns an unsubscribe function.
 * In production this is a no-op that returns a no-op.
 */
export function subscribeToUploadEvents(
  fn: (events: UploadDebugEvent[]) => void,
): () => void {
  if (!__DEV__) return () => {};
  listeners.add(fn);
  fn([...eventBuffer]);
  return () => { listeners.delete(fn); };
}

/**
 * Get the current upload debug event buffer.
 */
export function getUploadEvents(): UploadDebugEvent[] {
  return [...eventBuffer];
}

/**
 * Clear the upload debug event buffer.
 */
export function clearUploadEvents(): void {
  eventBuffer.length = 0;
  notifyListeners();
}

function redactHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization|apikey|token/i.test(key)) {
      redacted[key] = `${value.slice(0, 12)}…(redacted)`;
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Log an upload start event. Returns a completion function that should be
 * called with the result (or error) when the upload finishes.
 *
 * Usage:
 *   const finish = logUploadStart({ path: 'native_uploadAsync', ... });
 *   try {
 *     const result = await doUpload();
 *     finish({ status: 200, responseBody: '...' });
 *   } catch (err) {
 *     finish({ error: err.message });
 *   }
 */
export function logUploadStart(params: {
  path: UploadPath;
  method?: string;
  url: string;
  fileUri?: string;
  fileSize?: number;
  mimeType?: string;
  requestHeaders?: Record<string, string>;
  attempt?: number;
}): (result: { status?: number; responseBody?: string; error?: string }) => void {
  if (!__DEV__) return () => {};

  const id = nextId();
  const startTime = Date.now();
  const method = params.method ?? 'POST';

  const event: UploadDebugEvent = {
    id,
    timestamp: new Date().toISOString(),
    path: params.path,
    method,
    url: params.url,
    fileUri: params.fileUri,
    fileSize: params.fileSize,
    mimeType: params.mimeType,
    requestHeaders: redactHeaders(params.requestHeaders),
    attempt: params.attempt,
  };

  const sizeStr = params.fileSize
    ? `${(params.fileSize / 1024).toFixed(1)}KB`
    : 'unknown size';
  console.log(
    `[SC_UPLOAD] ▶ ${method} ${params.url} | path=${params.path} | ${sizeStr}` +
    (params.attempt ? ` | attempt=${params.attempt}` : ''),
  );

  return (result: { status?: number; responseBody?: string; error?: string }) => {
    const latencyMs = Date.now() - startTime;
    event.latencyMs = latencyMs;
    event.status = result.status;
    event.responseBody = result.responseBody?.slice(0, 500);
    event.error = result.error;

    eventBuffer.push(event);
    if (eventBuffer.length > MAX_EVENTS) {
      eventBuffer.splice(0, eventBuffer.length - MAX_EVENTS);
    }

    if (result.error) {
      console.error(
        `[SC_UPLOAD] ✖ ${method} ${params.url} | ${latencyMs}ms | error: ${result.error}`,
      );
      addBreadcrumb('upload', `FAILED ${method} ${params.url}`, 'error', {
        path: params.path,
        latencyMs,
        error: result.error,
        fileSize: params.fileSize,
        attempt: params.attempt,
      });
    } else {
      console.log(
        `[SC_UPLOAD] ✔ ${method} ${params.url} | ${latencyMs}ms | status=${result.status ?? '???'}`,
      );
      addBreadcrumb('upload', `OK ${method} ${params.url}`, 'warning', {
        path: params.path,
        latencyMs,
        status: result.status,
        fileSize: params.fileSize,
      });
    }

    notifyListeners();
  };
}

/**
 * Convenience: log a completed upload event (start + finish in one call).
 */
export function logUploadEvent(params: {
  path: UploadPath;
  method?: string;
  url: string;
  fileUri?: string;
  fileSize?: number;
  mimeType?: string;
  status?: number;
  responseBody?: string;
  error?: string;
  latencyMs?: number;
  attempt?: number;
}): void {
  if (!__DEV__) return;
  const event: UploadDebugEvent = {
    id: nextId(),
    timestamp: new Date().toISOString(),
    path: params.path,
    method: params.method ?? 'POST',
    url: params.url,
    fileUri: params.fileUri,
    fileSize: params.fileSize,
    mimeType: params.mimeType,
    status: params.status,
    responseBody: params.responseBody?.slice(0, 500),
    error: params.error,
    latencyMs: params.latencyMs,
    attempt: params.attempt,
  };
  eventBuffer.push(event);
  if (eventBuffer.length > MAX_EVENTS) {
    eventBuffer.splice(0, eventBuffer.length - MAX_EVENTS);
  }

  if (params.error) {
    console.error(
      `[SC_UPLOAD] ✖ ${event.method} ${params.url} | ${params.latencyMs ?? '?'}ms | error: ${params.error}`,
    );
  } else {
    console.log(
      `[SC_UPLOAD] ✔ ${event.method} ${params.url} | ${params.latencyMs ?? '?'}ms | status=${params.status ?? '???'}`,
    );
  }

  addBreadcrumb('upload', params.error ? 'Upload failed' : 'Upload OK', 'warning', {
    path: params.path,
    url: params.url,
    status: params.status,
    latencyMs: params.latencyMs,
    error: params.error,
  });

  notifyListeners();
}
