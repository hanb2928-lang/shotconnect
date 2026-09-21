import {
  checkCooldown,
  formatCooldownTime,
  type ShareAction,
} from '@/lib/shareCooldown';

// Mock the storage module
jest.mock('@/lib/storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

describe('shareCooldown', () => {
  const now = Date.now();

  describe('checkCooldown', () => {
    it('allows sharing with 0 actions', () => {
      const result = checkCooldown([], now);
      expect(result.shouldBlock).toBe(false);
      expect(result.recentActions).toBe(0);
    });

    it('allows sharing with 4 actions within window', () => {
      const history: ShareAction[] = [
        { timestamp: now - 1000, platform: 'instagram' },
        { timestamp: now - 2000, platform: 'naver' },
        { timestamp: now - 3000, platform: 'kakao' },
        { timestamp: now - 4000, platform: 'blog' },
      ];
      const result = checkCooldown(history, now);
      expect(result.shouldBlock).toBe(false);
      expect(result.recentActions).toBe(4);
    });

    it('blocks sharing with 5 actions within window', () => {
      const history: ShareAction[] = [
        { timestamp: now - 1000, platform: 'instagram' },
        { timestamp: now - 2000, platform: 'naver' },
        { timestamp: now - 3000, platform: 'kakao' },
        { timestamp: now - 4000, platform: 'blog' },
        { timestamp: now - 5000, platform: 'instagram' },
      ];
      const result = checkCooldown(history, now);
      expect(result.shouldBlock).toBe(true);
      expect(result.recentActions).toBe(5);
      expect(result.remainingCooldown).toBeGreaterThan(0);
    });

    it('allows sharing when old actions are outside window', () => {
      const tenMin = 10 * 60 * 1000;
      const history: ShareAction[] = [
        { timestamp: now - tenMin - 1000, platform: 'instagram' },
        { timestamp: now - tenMin - 2000, platform: 'naver' },
        { timestamp: now - tenMin - 3000, platform: 'kakao' },
        { timestamp: now - tenMin - 4000, platform: 'blog' },
        { timestamp: now - tenMin - 5000, platform: 'instagram' },
      ];
      const result = checkCooldown(history, now);
      expect(result.shouldBlock).toBe(false);
      expect(result.recentActions).toBe(0);
    });

    it('unblocks after cooldown duration passes', () => {
      const fiveActionsAgo = now - 61 * 60 * 1000; // 61 minutes ago
      const history: ShareAction[] = [
        { timestamp: fiveActionsAgo, platform: 'instagram' },
        { timestamp: fiveActionsAgo, platform: 'naver' },
        { timestamp: fiveActionsAgo, platform: 'kakao' },
        { timestamp: fiveActionsAgo, platform: 'blog' },
        { timestamp: fiveActionsAgo, platform: 'instagram' },
      ];
      // These are outside the 10-min window, so they won't count
      const result = checkCooldown(history, now);
      expect(result.shouldBlock).toBe(false);
    });

    it('reports correct remaining cooldown time', () => {
      const oneMinAgo = now - 60 * 1000;
      const history: ShareAction[] = [
        { timestamp: oneMinAgo, platform: 'a' },
        { timestamp: oneMinAgo, platform: 'b' },
        { timestamp: oneMinAgo, platform: 'c' },
        { timestamp: oneMinAgo, platform: 'd' },
        { timestamp: oneMinAgo, platform: 'e' },
      ];
      const result = checkCooldown(history, now);
      expect(result.shouldBlock).toBe(true);
      // Cooldown ends 1 hour after the 5th action
      // remaining = (oneMinAgo + 1hr) - now = 1hr - 1min = 59min
      expect(result.remainingCooldown).toBeGreaterThan(55 * 60 * 1000);
      expect(result.remainingCooldown).toBeLessThan(60 * 60 * 1000);
    });
  });

  describe('formatCooldownTime', () => {
    it('formats 0ms', () => {
      expect(formatCooldownTime(0)).toBe('0분');
    });

    it('formats minutes', () => {
      expect(formatCooldownTime(5 * 60 * 1000)).toBe('5분');
    });

    it('formats 30 minutes', () => {
      expect(formatCooldownTime(30 * 60 * 1000)).toBe('30분');
    });

    it('formats exactly 60 minutes as 1시간', () => {
      expect(formatCooldownTime(60 * 60 * 1000)).toBe('1시간');
    });

    it('formats hours and minutes', () => {
      expect(formatCooldownTime(90 * 60 * 1000)).toBe('1시간 30분');
    });

    it('formats 2 hours', () => {
      expect(formatCooldownTime(120 * 60 * 1000)).toBe('2시간');
    });

    it('handles negative values', () => {
      expect(formatCooldownTime(-1000)).toBe('0분');
    });
  });
});
