/**
 * Prosody Self-Learning Engine
 *
 * Tracks TTS generation metadata and adjusts prosody vectors over time
 * based on outcome signals (completion rate, user retries, share actions).
 * Uses exponential moving average to gradually evolve each voice profile's
 * prosody vector toward configurations that produce better engagement.
 */

import { getItem, setItem } from '@/lib/storage';
import { type ProsodyProfile, type ProsodyVector, getProsodyProfile, getAllProsodyProfiles } from '@/lib/prosodyProfile';

const LEARNING_KEY = 'prosody_learning_state';
const MAX_HISTORY = 50;

export interface ProsodyGenerationMeta {
  voiceKey: string;
  prosodyProfileId: string;
  phase: string;
  speed: number;
  timestamp: number;
  textLength: number;
}

export interface ProsodyOutcome {
  generationMeta: ProsodyGenerationMeta;
  completed: boolean;
  retried: boolean;
  shared: boolean;
  durationSec: number;
}

interface ProfileLearningState {
  profileId: string;
  adjustedVector: ProsodyVector;
  generations: number;
  positiveSignals: number;
  negativeSignals: number;
  recentOutcomes: ProsodyOutcome[];
  emaSpeed: number;
  emaWarmth: number;
  emaStress: number;
}

interface LearningState {
  profiles: Record<string, ProfileLearningState>;
  totalGenerations: number;
  lastUpdated: number;
}

const LEARNING_RATE = 0.08;
const DECAY_RATE = 0.04;

function defaultProfileState(profile: ProsodyProfile): ProfileLearningState {
  return {
    profileId: profile.id,
    adjustedVector: { ...profile.vector },
    generations: 0,
    positiveSignals: 0,
    negativeSignals: 0,
    recentOutcomes: [],
    emaSpeed: profile.vector.baseSpeed,
    emaWarmth: profile.vector.warmth,
    emaStress: profile.vector.stressIntensity,
  };
}

async function loadLearningState(): Promise<LearningState> {
  try {
    const raw = await getItem(LEARNING_KEY);
    if (!raw) return { profiles: {}, totalGenerations: 0, lastUpdated: Date.now() };
    const parsed = JSON.parse(raw) as LearningState;
    return parsed;
  } catch {
    return { profiles: {}, totalGenerations: 0, lastUpdated: Date.now() };
  }
}

async function saveLearningState(state: LearningState): Promise<void> {
  try {
    await setItem(LEARNING_KEY, JSON.stringify(state));
  } catch {
    // storage failure is non-fatal — learning is best-effort
  }
}

export async function recordProsodyOutcome(outcome: ProsodyOutcome): Promise<void> {
  const state = await loadLearningState();
  const profileId = outcome.generationMeta.prosodyProfileId;

  if (!state.profiles[profileId]) {
    const baseProfile = getProsodyProfile(profileId);
    state.profiles[profileId] = defaultProfileState(baseProfile);
  }

  const ps = state.profiles[profileId];
  ps.generations += 1;
  state.totalGenerations += 1;

  ps.recentOutcomes.push(outcome);
  if (ps.recentOutcomes.length > MAX_HISTORY) {
    ps.recentOutcomes.shift();
  }

  const isPositive = outcome.completed && !outcome.retried;
  const isNegative = outcome.retried || !outcome.completed;

  if (isPositive) {
    ps.positiveSignals += 1;
    ps.emaSpeed = ps.emaSpeed * (1 - LEARNING_RATE) + outcome.generationMeta.speed * LEARNING_RATE;
    if (outcome.shared) {
      ps.emaWarmth = Math.min(1, ps.emaWarmth * (1 - LEARNING_RATE) + (ps.emaWarmth + 0.05) * LEARNING_RATE);
      ps.emaStress = Math.min(1, ps.emaStress * (1 - LEARNING_RATE) + (ps.emaStress + 0.03) * LEARNING_RATE);
    }
  } else if (isNegative) {
    ps.negativeSignals += 1;
    ps.emaSpeed = ps.emaSpeed * (1 - DECAY_RATE) + outcome.generationMeta.speed * DECAY_RATE;
    ps.emaWarmth = Math.max(0, ps.emaWarmth - 0.02);
  }

  const v = ps.adjustedVector;
  v.baseSpeed = Math.min(Math.max(ps.emaSpeed, 0.5), 2.0);
  v.warmth = Math.min(Math.max(ps.emaWarmth, 0), 1);
  v.stressIntensity = Math.min(Math.max(ps.emaStress, 0), 1);

  if (outcome.durationSec > 0 && outcome.generationMeta.textLength > 0) {
    const actualRate = outcome.generationMeta.textLength / outcome.durationSec / 12;
    if (actualRate > 0 && actualRate < 3) {
      v.speedVariation = Math.min(0.3, v.speedVariation * 0.95 + Math.abs(actualRate - v.baseSpeed) * 0.05);
    }
  }

  state.lastUpdated = Date.now();
  await saveLearningState(state);
}

export async function getLearnedProsodyVector(profileId: string): Promise<ProsodyVector | null> {
  const state = await loadLearningState();
  return state.profiles[profileId]?.adjustedVector ?? null;
}

export async function getLearnedProfile(profileId: string): Promise<ProsodyProfile> {
  const base = getProsodyProfile(profileId);
  const learned = await getLearnedProsodyVector(profileId);
  if (!learned) return base;
  return { ...base, vector: learned };
}

export interface LearningStats {
  totalGenerations: number;
  profileStats: Array<{
    profileId: string;
    label: string;
    generations: number;
    positiveRate: number;
    currentSpeed: number;
    currentWarmth: number;
    currentStress: number;
    baseSpeed: number;
    baseWarmth: number;
    baseStress: number;
  }>;
}

export async function getProsodyLearningStats(): Promise<LearningStats> {
  const state = await loadLearningState();
  const allProfiles = getAllProsodyProfiles();

  const profileStats = allProfiles.map((profile) => {
    const ps = state.profiles[profile.id];
    const total = (ps?.positiveSignals ?? 0) + (ps?.negativeSignals ?? 0);
    return {
      profileId: profile.id,
      label: profile.label,
      generations: ps?.generations ?? 0,
      positiveRate: total > 0 ? ps!.positiveSignals / total : 0,
      currentSpeed: ps?.adjustedVector.baseSpeed ?? profile.vector.baseSpeed,
      currentWarmth: ps?.adjustedVector.warmth ?? profile.vector.warmth,
      currentStress: ps?.adjustedVector.stressIntensity ?? profile.vector.stressIntensity,
      baseSpeed: profile.vector.baseSpeed,
      baseWarmth: profile.vector.warmth,
      baseStress: profile.vector.stressIntensity,
    };
  });

  return {
    totalGenerations: state.totalGenerations,
    profileStats,
  };
}

export function calculateEvolutionDelta(
  base: ProsodyVector,
  learned: ProsodyVector,
): { speedDelta: number; warmthDelta: number; stressDelta: number } {
  return {
    speedDelta: learned.baseSpeed - base.baseSpeed,
    warmthDelta: learned.warmth - base.warmth,
    stressDelta: learned.stressIntensity - base.stressIntensity,
  };
}
