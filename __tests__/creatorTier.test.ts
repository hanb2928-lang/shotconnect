import {
  calculateTierPoints,
  determineTier,
  TIER_CONFIG,
  getTierProgress,
  type CreatorTier,
} from '@/lib/creatorTier';

describe('creatorTier', () => {
  describe('TIER_CONFIG', () => {
    it('has all 4 tiers', () => {
      expect(Object.keys(TIER_CONFIG)).toHaveLength(4);
      expect(TIER_CONFIG.bronze).toBeDefined();
      expect(TIER_CONFIG.silver).toBeDefined();
      expect(TIER_CONFIG.gold).toBeDefined();
      expect(TIER_CONFIG.master).toBeDefined();
    });

    it('tiers have increasing minPoints', () => {
      expect(TIER_CONFIG.bronze.minPoints).toBeLessThan(TIER_CONFIG.silver.minPoints);
      expect(TIER_CONFIG.silver.minPoints).toBeLessThan(TIER_CONFIG.gold.minPoints);
      expect(TIER_CONFIG.gold.minPoints).toBeLessThan(TIER_CONFIG.master.minPoints);
    });

    it('master has no next tier', () => {
      expect(TIER_CONFIG.master.nextTier).toBeNull();
    });

    it('each tier has perks', () => {
      for (const key of Object.keys(TIER_CONFIG) as (keyof typeof TIER_CONFIG)[]) {
        expect(TIER_CONFIG[key].perks.length).toBeGreaterThan(0);
      }
    });
  });

  describe('calculateTierPoints', () => {
    it('calculates points from scans, clicks, revenue', () => {
      const points = calculateTierPoints(10, 100, 50000);
      expect(points).toBe(10 * 5 + 100 * 2 + Math.floor(50000 / 100));
      expect(points).toBe(750);
    });

    it('handles zero values', () => {
      expect(calculateTierPoints(0, 0, 0)).toBe(0);
    });
  });

  describe('determineTier', () => {
    it('returns bronze for 0 points', () => {
      expect(determineTier(0)).toBe('bronze');
    });

    it('returns bronze for 499 points', () => {
      expect(determineTier(499)).toBe('bronze');
    });

    it('returns silver for 500 points', () => {
      expect(determineTier(500)).toBe('silver');
    });

    it('returns gold for 2000 points', () => {
      expect(determineTier(2000)).toBe('gold');
    });

    it('returns master for 5000 points', () => {
      expect(determineTier(5000)).toBe('master');
    });

    it('returns master for 99999 points', () => {
      expect(determineTier(99999)).toBe('master');
    });
  });

  describe('getTierProgress', () => {
    it('returns 100% for master tier', () => {
      const tier: CreatorTier = {
        id: 1,
        tier_level: 'master',
        total_scans: 1000,
        total_clicks: 10000,
        total_revenue: 1000000,
        tier_points: 30000,
      };
      const progress = getTierProgress(tier);
      expect(progress.percent).toBe(100);
      expect(progress.next).toBeNull();
      expect(progress.pointsToNext).toBe(0);
    });

    it('calculates progress for bronze', () => {
      const tier: CreatorTier = {
        id: 1,
        tier_level: 'bronze',
        total_scans: 10,
        total_clicks: 50,
        total_revenue: 10000,
        tier_points: 350,
      };
      const progress = getTierProgress(tier);
      expect(progress.next).toBe(500);
      expect(progress.percent).toBeLessThan(100);
      expect(progress.pointsToNext).toBe(150);
    });

    it('calculates progress for silver', () => {
      const tier: CreatorTier = {
        id: 1,
        tier_level: 'silver',
        total_scans: 50,
        total_clicks: 200,
        total_revenue: 50000,
        tier_points: 1250,
      };
      const progress = getTierProgress(tier);
      expect(progress.next).toBe(2000);
      expect(progress.percent).toBeLessThan(100);
    });
  });
});
