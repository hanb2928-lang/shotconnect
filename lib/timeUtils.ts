/**
 * Shared time utilities for consistent KST (Asia/Seoul) display and
 * server-relative duration calculation across the app.
 *
 * Supabase stores all timestamps in UTC (timestamptz). We format on the
 * client with `timeZone: 'Asia/Seoul'` so display never depends on the
 * device's local timezone, and we compute durations from server-returned
 * timestamps rather than `Date.now()` so device clock skew can't distort
 * progress bars.
 */

const KST_TZ = 'Asia/Seoul';
const KST_LOCALE = 'ko-KR';

/** Format an ISO timestamp as `YYYY.MM.DD` in KST. */
export function formatDateKST(iso: string): string {
  return new Date(iso).toLocaleDateString(KST_LOCALE, {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '');
}

/** Format an ISO timestamp as `YYYY.MM.DD 오전/오후 HH:MM` in KST. */
export function formatDateTimeKST(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString(KST_LOCALE, {
    timeZone: KST_TZ,
    month: '2-digit',
    day: '2-digit',
  }).replace(/\. /g, '/').replace(/\.$/, '');
  const timePart = d.toLocaleTimeString(KST_LOCALE, {
    timeZone: KST_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} ${timePart}`;
}

/**
 * Relative "time ago" in Korean, using KST for the boundary between
 * "today" and earlier days. Returns `방금 전`, `N분 전`, `N시간 전`,
 * `N일 전`, or a KST short date.
 */
export function formatRelativeTimeKST(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHr < 24) return `${diffHr}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;

  return d.toLocaleDateString(KST_LOCALE, {
    timeZone: KST_TZ,
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get the KST date key (`YYYY-MM-DD`) for a given timestamp, useful for
 * day-bucketing analytics. Uses `Intl.DateTimeFormat` with `Asia/Seoul`
 * instead of a manual +9h offset.
 */
export function getKSTDateKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${d}`;
}

/**
 * Current time as a KST date key (for "today" comparisons in analytics).
 */
export function getTodayKSTKey(): string {
  return getKSTDateKey(new Date().toISOString());
}

/**
 * Compute elapsed seconds from a server-provided start timestamp to a
 * server-provided end timestamp (both ISO strings). Falls back to
 * `Date.now()` only when the end timestamp is unavailable, which is
 * immune to clock skew as long as the server timestamps are used
 * whenever possible.
 */
export function elapsedSecondsFromServer(
  startIso: string,
  endIso?: string | null,
): number {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 1000));
}

/**
 * Clock-skew-tolerant token expiry check. Returns true if the token
 * will expire within `bufferSeconds` (default 60) from now. The buffer
 * absorbs small device-clock drift so we don't reject a still-valid token.
 */
export function isTokenExpiringSoon(
  expiresAtSeconds: number | null | undefined,
  bufferSeconds = 60,
): boolean {
  if (!expiresAtSeconds) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return expiresAtSeconds - nowSeconds <= bufferSeconds;
}

/**
 * Monotonic elapsed seconds since `startEpochMs`. Uses `performance.now()`
 * when available (immune to system clock adjustments / NTP jumps) and
 * falls back to `Date.now()` on platforms without `performance`.
 * This ensures progress bars and elapsed-time displays don't jump or
 * freeze when the device clock is corrected mid-operation.
 *
 * The `startEpochMs` should be obtained from `monotonicStart()` below.
 */
export function monotonicStart(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function monotonicElapsedSec(startMonotonicMs: number): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return Math.max(0, Math.round((performance.now() - startMonotonicMs) / 1000));
  }
  return Math.max(0, Math.round((Date.now() - startMonotonicMs) / 1000));
}
