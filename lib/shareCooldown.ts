import { getItem, setItem } from '@/lib/storage';

const SHARE_HISTORY_KEY = 'share_action_history';
const SHARE_COOLDOWN_UNTIL_KEY = 'share_cooldown_until';
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const COOLDOWN_DURATION_MS = 60 * 60 * 1000; // 1 hour

export interface ShareAction {
  timestamp: number;
  platform: string;
}

export interface CooldownResult {
  shouldBlock: boolean;
  remainingCooldown: number; // ms remaining, 0 if no cooldown
  recentActions: number;
  windowMs: number;
  cooldownMs: number;
}

export async function recordShareAction(platform: string): Promise<CooldownResult> {
  const history = await getShareHistory();
  const now = Date.now();

  history.push({ timestamp: now, platform });
  const pruned = history.filter((a) => now - a.timestamp < COOLDOWN_DURATION_MS);
  await setItem(SHARE_HISTORY_KEY, JSON.stringify(pruned));

  const result = checkCooldown(pruned, now);
  if (result.shouldBlock) {
    await setItem(SHARE_COOLDOWN_UNTIL_KEY, String(now + result.remainingCooldown));
  }
  return result;
}

export async function getShareHistory(): Promise<ShareAction[]> {
  try {
    const raw = await getItem(SHARE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: any) =>
        item &&
        typeof item.timestamp === 'number' &&
        typeof item.platform === 'string',
    );
  } catch {
    return [];
  }
}

export async function checkShareCooldown(): Promise<CooldownResult> {
  const history = await getShareHistory();
  const now = Date.now();

  try {
    const cooldownUntilRaw = await getItem(SHARE_COOLDOWN_UNTIL_KEY);
    if (cooldownUntilRaw) {
      const cooldownUntil = Number(cooldownUntilRaw);
      if (now < cooldownUntil) {
        const recent = history.filter((a) => now - a.timestamp < RATE_LIMIT_WINDOW_MS);
        return {
          shouldBlock: true,
          remainingCooldown: cooldownUntil - now,
          recentActions: recent.length,
          windowMs: RATE_LIMIT_WINDOW_MS,
          cooldownMs: COOLDOWN_DURATION_MS,
        };
      }
    }
  } catch {
    // ignore storage read errors
  }

  return checkCooldown(history, now);
}

export function checkCooldown(history: ShareAction[], now: number): CooldownResult {
  // Filter to actions within the rate limit window
  const recent = history.filter(
    (action) => now - action.timestamp < RATE_LIMIT_WINDOW_MS,
  );

  // Check if user has hit the rate limit
  if (recent.length < RATE_LIMIT_COUNT) {
    return {
      shouldBlock: false,
      remainingCooldown: 0,
      recentActions: recent.length,
      windowMs: RATE_LIMIT_WINDOW_MS,
      cooldownMs: COOLDOWN_DURATION_MS,
    };
  }

  // Find when the rate limit was first hit
  // The 5th most recent action within the window
  const sortedRecent = [...recent].sort((a, b) => a.timestamp - b.timestamp);
  const fifthAction = sortedRecent[RATE_LIMIT_COUNT - 1];
  const cooldownEnd = fifthAction.timestamp + COOLDOWN_DURATION_MS;

  if (now >= cooldownEnd) {
    return {
      shouldBlock: false,
      remainingCooldown: 0,
      recentActions: recent.length,
      windowMs: RATE_LIMIT_WINDOW_MS,
      cooldownMs: COOLDOWN_DURATION_MS,
    };
  }

  return {
    shouldBlock: true,
    remainingCooldown: cooldownEnd - now,
    recentActions: recent.length,
    windowMs: RATE_LIMIT_WINDOW_MS,
    cooldownMs: COOLDOWN_DURATION_MS,
  };
}

export function formatCooldownTime(ms: number): string {
  if (ms <= 0) return '0분';
  const minutes = Math.ceil(ms / (60 * 1000));
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (remMinutes === 0) return `${hours}시간`;
  return `${hours}시간 ${remMinutes}분`;
}

export async function clearShareHistory(): Promise<void> {
  await setItem(SHARE_HISTORY_KEY, JSON.stringify([]));
}
