import {
  recordProsodyOutcome,
  getProsodyLearningStats,
  getLearnedProsodyVector,
  calculateEvolutionDelta,
  type ProsodyOutcome,
} from '@/lib/prosodyLearning';

// Mock storage
jest.mock('@/lib/storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

const { getItem, setItem } = require('@/lib/storage');

function makeOutcome(
  overrides: Partial<ProsodyOutcome> = {},
): ProsodyOutcome {
  return {
    generationMeta: {
      voiceKey: 'f1_trendy_beauty',
      prosodyProfileId: 'trendy_beauty',
      phase: 'full',
      speed: 1.1,
      timestamp: Date.now(),
      textLength: 100,
    },
    completed: true,
    retried: false,
    shared: false,
    durationSec: 15,
    ...overrides,
  };
}

describe('prosodyLearning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getItem.mockResolvedValue(null);
  });

  describe('recordProsodyOutcome', () => {
    it('creates a new profile state on first outcome', async () => {
      await recordProsodyOutcome(makeOutcome());
      expect(setItem).toHaveBeenCalled();
      const savedData = JSON.parse(setItem.mock.calls[0][1]);
      expect(savedData.profiles.trendy_beauty).toBeDefined();
      expect(savedData.profiles.trendy_beauty.generations).toBe(1);
      expect(savedData.totalGenerations).toBe(1);
    });

    it('increments generations on subsequent outcomes', async () => {
      getItem.mockResolvedValueOnce(null);
      await recordProsodyOutcome(makeOutcome());
      const firstSave = JSON.parse(setItem.mock.calls[0][1]);
      getItem.mockResolvedValueOnce(JSON.stringify(firstSave));
      await recordProsodyOutcome(makeOutcome());
      const secondSave = JSON.parse(setItem.mock.calls[1][1]);
      expect(secondSave.profiles.trendy_beauty.generations).toBe(2);
      expect(secondSave.totalGenerations).toBe(2);
    });

    it('records positive signal when completed and not retried', async () => {
      await recordProsodyOutcome(makeOutcome({ completed: true, retried: false }));
      const saved = JSON.parse(setItem.mock.calls[0][1]);
      expect(saved.profiles.trendy_beauty.positiveSignals).toBe(1);
      expect(saved.profiles.trendy_beauty.negativeSignals).toBe(0);
    });

    it('records negative signal when retried', async () => {
      await recordProsodyOutcome(makeOutcome({ completed: false, retried: true }));
      const saved = JSON.parse(setItem.mock.calls[0][1]);
      expect(saved.profiles.trendy_beauty.negativeSignals).toBe(1);
      expect(saved.profiles.trendy_beauty.positiveSignals).toBe(0);
    });

    it('increases warmth when shared', async () => {
      await recordProsodyOutcome(makeOutcome({ shared: true }));
      const saved = JSON.parse(setItem.mock.calls[0][1]);
      const warmth = saved.profiles.trendy_beauty.adjustedVector.warmth;
      expect(warmth).toBeGreaterThan(0.5);
    });

    it('limits recent outcomes to 50 entries', async () => {
      let state: any = null;
      getItem.mockImplementation(() => Promise.resolve(state));
      for (let i = 0; i < 55; i++) {
        await recordProsodyOutcome(makeOutcome());
        state = setItem.mock.calls[setItem.mock.calls.length - 1][1];
        state = typeof state === 'string' ? state : JSON.stringify(state);
      }
      const finalState = JSON.parse(state as string);
      expect(finalState.profiles.trendy_beauty.recentOutcomes.length).toBeLessThanOrEqual(50);
    });
  });

  describe('getLearnedProsodyVector', () => {
    it('returns null when no learning data exists', async () => {
      getItem.mockResolvedValue(null);
      const result = await getLearnedProsodyVector('trendy_beauty');
      expect(result).toBeNull();
    });

    it('returns adjusted vector when learning data exists', async () => {
      await recordProsodyOutcome(makeOutcome());
      const savedState = JSON.parse(setItem.mock.calls[0][1]);
      getItem.mockResolvedValue(JSON.stringify(savedState));
      const result = await getLearnedProsodyVector('trendy_beauty');
      expect(result).not.toBeNull();
      expect(result!.baseSpeed).toBeGreaterThan(0);
    });
  });

  describe('getProsodyLearningStats', () => {
    it('returns stats for all profiles', async () => {
      getItem.mockResolvedValue(null);
      const stats = await getProsodyLearningStats();
      expect(stats.totalGenerations).toBe(0);
      expect(stats.profileStats.length).toBeGreaterThanOrEqual(12);
      expect(stats.profileStats.find(p => p.profileId === 'trendy_beauty')).toBeDefined();
    });

    it('counts generations correctly after outcomes', async () => {
      await recordProsodyOutcome(makeOutcome());
      const savedState = JSON.parse(setItem.mock.calls[0][1]);
      getItem.mockResolvedValue(JSON.stringify(savedState));
      const stats = await getProsodyLearningStats();
      expect(stats.totalGenerations).toBe(1);
      expect(stats.profileStats.find(p => p.profileId === 'trendy_beauty')!.generations).toBe(1);
    });
  });

  describe('calculateEvolutionDelta', () => {
    it('calculates deltas between base and learned vectors', () => {
      const base = { baseSpeed: 1.0, warmth: 0.5, stressIntensity: 0.6 } as any;
      const learned = { baseSpeed: 1.1, warmth: 0.55, stressIntensity: 0.5 } as any;
      const delta = calculateEvolutionDelta(base, learned);
      expect(delta.speedDelta).toBeCloseTo(0.1);
      expect(delta.warmthDelta).toBeCloseTo(0.05);
      expect(delta.stressDelta).toBeCloseTo(-0.1);
    });
  });
});
