import { Platform } from 'react-native';
import {
  resolveBundledTrackUri,
  pickBundledTrack,
  getBundledTrackForIdOrCategory,
  hasBundledTracksForCategory,
  bundledTrackToBgmTemplate,
  type BundledBgmTrack,
} from './bundledBgm';
import { aiCachedCall } from './aiCache';
import { hashObject } from './contentHash';
import { cleanBase64 } from './base64';
import { supabase } from './supabase';

/**
 * Web Audio API BGM engine — supports both bundled audio files and FM synthesis fallback.
 * When bundled royalty-free mastered tracks are available in assets/audio/,
 * the engine plays them directly for studio-grade quality with zero network latency.
 * Falls back to FM synthesis if the bundled file fails to load.
 *
 * Each mood uses multi-oscillator FM patches emulating real instruments:
 *   - cinematic:  string pad (FM bell + saw) + timpani-style bass
 *   - hightension: supersaw lead + 808 sub bass + electronic drums
 *   - asmr:       soft electric piano (FM sine/sine) + warm sub
 *   - emotional:  acoustic piano emulation (FM triangle) + cello pad
 *   - lofi:       Rhodes EP (FM sine) + vinyl drum kit + wow/flutter
 */

export type BgmCategory = 'cinematic' | 'hightension' | 'asmr' | 'emotional' | 'lofi';

interface BgmTrack {
  url: string;
  title: string;
  durationSec: number;
  highlightStartSec: number;
  highlightDurationSec: number;
}

interface BgmMoodConfig {
  category: BgmCategory;
  label: string;
  bpm: number;
  tracks: BgmTrack[];
  energyCurve: number[];
}

const DEFAULT_ENERGY_CURVE: number[] = [0.3, 0.45, 0.6, 0.75, 0.9, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.55, 0.45];
const LOW_ENERGY_CURVE: number[] = [0.15, 0.22, 0.3, 0.35, 0.4, 0.45, 0.5, 0.52, 0.5, 0.48, 0.45, 0.4, 0.35, 0.3, 0.25];
const HIGH_ENERGY_CURVE: number[] = [0.4, 0.6, 0.8, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];

const MOOD_CONFIGS: Record<BgmCategory, BgmMoodConfig> = {
  cinematic: { category: 'cinematic', label: '시네마틱', bpm: 90,
    energyCurve: [0.2, 0.3, 0.45, 0.6, 0.75, 0.9, 1.0, 0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.3],
    tracks: [{ url: '', title: 'Cinematic Epic Build', durationSec: 30, highlightStartSec: 5, highlightDurationSec: 10 }] },
  hightension: { category: 'hightension', label: '하이텐션', bpm: 128,
    energyCurve: HIGH_ENERGY_CURVE,
    tracks: [{ url: '', title: 'Energetic Electronic', durationSec: 30, highlightStartSec: 3, highlightDurationSec: 10 }] },
  asmr: { category: 'asmr', label: 'ASMR', bpm: 60,
    energyCurve: LOW_ENERGY_CURVE,
    tracks: [{ url: '', title: 'Soft Ambient', durationSec: 30, highlightStartSec: 2, highlightDurationSec: 14 }] },
  emotional: { category: 'emotional', label: '감성', bpm: 75,
    energyCurve: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5, 0.4, 0.3],
    tracks: [{ url: '', title: 'Emotional Piano', durationSec: 30, highlightStartSec: 5, highlightDurationSec: 10 }] },
  lofi: { category: 'lofi', label: '로파이', bpm: 82,
    energyCurve: LOW_ENERGY_CURVE,
    tracks: [{ url: '', title: 'Lofi Chill', durationSec: 30, highlightStartSec: 3, highlightDurationSec: 12 }] },
};

const FALLBACK_TRACK_URL = '';

const MOOD_LABEL_MAP: Record<string, BgmCategory> = {
  '시네마틱': 'cinematic', '하이텐션': 'hightension', 'ASMR': 'asmr',
  '감성': 'emotional', '로파이': 'lofi', '트렌디': 'hightension',
  'upbeat_pop': 'hightension', 'lofi_chill': 'lofi',
  'acoustic_indie': 'emotional', 'energy_hiphop': 'hightension',
};
const CATEGORY_TO_BGM_CATEGORY: Record<string, BgmCategory> = {
  cinematic: 'cinematic', hightension: 'hightension', asmr: 'asmr',
  emotional: 'emotional', lofi: 'lofi',
};

export function moodLabelToCategory(moodLabel: string): BgmCategory {
  if (MOOD_LABEL_MAP[moodLabel]) return MOOD_LABEL_MAP[moodLabel];
  if (CATEGORY_TO_BGM_CATEGORY[moodLabel]) return CATEGORY_TO_BGM_CATEGORY[moodLabel];
  return 'hightension';
}

export function categoryToMoodLabel(category: BgmCategory): string {
  return MOOD_CONFIGS[category].label;
}

function pickTrack(category: BgmCategory, seed?: number): BgmTrack {
  const config = MOOD_CONFIGS[category];
  if (config.tracks.length === 1) return config.tracks[0];
  const idx = seed != null ? Math.abs(seed) % config.tracks.length : Math.floor(Math.random() * config.tracks.length);
  return config.tracks[idx];
}

const SEMITONE_MAP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteFreq(note: string): number {
  const m = note.match(/^([A-G])([#b]?)(\d)$/);
  if (!m) return 0;
  const [, letter, accidental, octaveStr] = m;
  let st = SEMITONE_MAP[letter] ?? 0;
  if (accidental === '#') st += 1;
  if (accidental === 'b') st -= 1;
  const midi = (parseInt(octaveStr) + 1) * 12 + st;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const REST = -1;

/* ─── Patch definitions ─── */

type PatchType = 'piano' | 'ep' | 'pad' | 'supersaw' | 'sub808' | 'cello' | 'bell' | 'timpani';

interface PatchParams {
  type: PatchType;
  carrier: OscillatorType;
  modulator: OscillatorType;
  modRatio: number;
  modIndex: number;
  detune: number;
  unison: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  gain: number;
  filterFreq: number;
  filterQ: number;
}

function makePatch(type: PatchType, overrides: Partial<PatchParams> = {}): PatchParams {
  const defaults: Record<PatchType, PatchParams> = {
    piano:    { type: 'piano',    carrier: 'triangle', modulator: 'sine',     modRatio: 2,  modIndex: 3,  detune: 2,  unison: 2, attack: 0.003, decay: 0.25, sustain: 0.0,  release: 0.4,  gain: 0.3,  filterFreq: 4000, filterQ: 0.5 },
    ep:       { type: 'ep',       carrier: 'sine',     modulator: 'sine',     modRatio: 4,  modIndex: 1.5,detune: 4,  unison: 2, attack: 0.01,  decay: 0.6,  sustain: 0.3,  release: 0.5,  gain: 0.25, filterFreq: 2500, filterQ: 0.4 },
    pad:      { type: 'pad',      carrier: 'sawtooth', modulator: 'sine',     modRatio: 1,  modIndex: 0.5,detune: 7,  unison: 3, attack: 0.6,   decay: 0.3,  sustain: 0.8,  release: 1.5,  gain: 0.08, filterFreq: 1500, filterQ: 0.7 },
    supersaw: { type: 'supersaw', carrier: 'sawtooth', modulator: 'square',   modRatio: 0.5,modIndex: 0.3,detune: 12, unison: 4, attack: 0.01,  decay: 0.15, sustain: 0.6,  release: 0.2,  gain: 0.12, filterFreq: 3000, filterQ: 1.0 },
    sub808:   { type: 'sub808',   carrier: 'sine',     modulator: 'sine',     modRatio: 0.5,modIndex: 0,  detune: 0,  unison: 1, attack: 0.02,  decay: 0.3,  sustain: 0.5,  release: 0.3,  gain: 0.35, filterFreq: 300,  filterQ: 0.5 },
    cello:    { type: 'cello',    carrier: 'sawtooth', modulator: 'triangle', modRatio: 1,  modIndex: 1,  detune: 3,  unison: 2, attack: 0.08,  decay: 0.2,  sustain: 0.7,  release: 0.6,  gain: 0.12, filterFreq: 2000, filterQ: 0.6 },
    bell:     { type: 'bell',     carrier: 'sine',     modulator: 'sine',     modRatio: 3,  modIndex: 2,  detune: 5,  unison: 2, attack: 0.001, decay: 1.5,  sustain: 0.0,  release: 1.0,  gain: 0.1,  filterFreq: 5000, filterQ: 0.3 },
    timpani:  { type: 'timpani',  carrier: 'sine',     modulator: 'triangle', modRatio: 0.25,modIndex: 0.8,detune: 0,  unison: 1, attack: 0.005, decay: 0.6,  sustain: 0.0,  release: 0.3,  gain: 0.4,  filterFreq: 600,  filterQ: 0.8 },
  };
  return { ...defaults[type], ...overrides };
}

interface DrumPattern {
  kick: number[];
  snare: number[];
  hh: number[];
}

interface MoodSynthConfig {
  chords: string[][];
  bassPatch: PatchParams;
  bassPattern: number[];
  melodyPatch: PatchParams;
  melodyPattern: number[];
  padPatch: PatchParams;
  drums: DrumPattern | null;
  reverbDuration: number;
  reverbDecay: number;
  reverbWet: number;
  swing: number;
  humanize: number;
  delayMs: number;
  delayFeedback: number;
  delayWet: number;
}

const MOOD_SYNTH_CONFIGS: Record<BgmCategory, MoodSynthConfig> = {
  cinematic: {
    chords: [
      ['C3', 'Eb3', 'G3', 'Bb3'],
      ['Ab2', 'C3', 'Eb3', 'G3'],
      ['F2', 'Ab2', 'C3', 'Eb3'],
      ['G2', 'B2', 'D3', 'F3'],
    ],
    bassPatch: makePatch('timpani'),
    bassPattern: [0,REST,REST,REST, REST,REST,7,REST, REST,REST,REST,REST, REST,REST,5,REST],
    melodyPatch: makePatch('bell', { gain: 0.15, release: 1.5 }),
    melodyPattern: [REST,REST,REST,12, REST,REST,15,REST, REST,REST,12,REST, 10,REST,7,REST],
    padPatch: makePatch('pad', { carrier: 'sawtooth', gain: 0.06, attack: 0.8, release: 2.0, filterFreq: 1200 }),
    drums: null,
    reverbDuration: 4, reverbDecay: 2.5, reverbWet: 0.4,
    swing: 0, humanize: 0.04,
    delayMs: 375, delayFeedback: 0.3, delayWet: 0.2,
  },
  hightension: {
    chords: [
      ['A3', 'C4', 'E4', 'G4'],
      ['F3', 'A3', 'C4', 'E4'],
      ['G3', 'B3', 'D4', 'F4'],
      ['E3', 'G3', 'B3', 'D4'],
    ],
    bassPatch: makePatch('sub808', { gain: 0.3 }),
    bassPattern: [0,0,REST,0, 7,REST,0,0, 0,REST,5,REST, 0,0,3,REST],
    melodyPatch: makePatch('supersaw', { gain: 0.1, detune: 14, filterFreq: 3500 }),
    melodyPattern: [12,REST,15,REST, 12,10,REST,12, 15,REST,12,REST, 10,7,REST,REST],
    padPatch: makePatch('supersaw', { gain: 0.04, attack: 0.05, release: 0.3, filterFreq: 2000 }),
    drums: {
      kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
      hh:    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1],
    },
    reverbDuration: 1, reverbDecay: 3, reverbWet: 0.1,
    swing: 0, humanize: 0.02,
    delayMs: 187, delayFeedback: 0.25, delayWet: 0.08,
  },
  asmr: {
    chords: [
      ['C4', 'E4', 'G4', 'D5'],
      ['A3', 'C4', 'E4', 'B4'],
      ['F3', 'A3', 'C4', 'E4'],
      ['G3', 'B3', 'D4', 'F4'],
    ],
    bassPatch: makePatch('sub808', { gain: 0.12, attack: 0.3, release: 0.8 }),
    bassPattern: [0,REST,REST,REST, REST,REST,REST,REST, REST,REST,REST,REST, REST,REST,REST,REST],
    melodyPatch: makePatch('ep', { gain: 0.12, attack: 0.05, release: 1.0, filterFreq: 1800 }),
    melodyPattern: [REST,REST,REST,REST, 12,REST,REST,REST, REST,REST,REST,REST, REST,10,REST,REST],
    padPatch: makePatch('pad', { carrier: 'sine', gain: 0.05, attack: 1.5, release: 3.0, filterFreq: 600, detune: 8 }),
    drums: null,
    reverbDuration: 6, reverbDecay: 2, reverbWet: 0.55,
    swing: 0, humanize: 0.05,
    delayMs: 500, delayFeedback: 0.35, delayWet: 0.15,
  },
  emotional: {
    chords: [
      ['C3', 'E3', 'G3', 'B3'],
      ['A2', 'C3', 'E3', 'G3'],
      ['F2', 'A2', 'C3', 'E3'],
      ['G2', 'B2', 'D3', 'F3'],
    ],
    bassPatch: makePatch('cello', { gain: 0.15, filterFreq: 1500 }),
    bassPattern: [0,REST,REST,7, REST,REST,5,REST, REST,3,REST,REST, 7,REST,REST,REST],
    melodyPatch: makePatch('piano', { gain: 0.2, release: 0.6 }),
    melodyPattern: [REST,REST,12,REST, 10,REST,12,REST, 15,REST,12,REST, 10,REST,7,REST],
    padPatch: makePatch('cello', { gain: 0.06, attack: 0.3, release: 1.0 }),
    drums: null,
    reverbDuration: 3, reverbDecay: 2.5, reverbWet: 0.3,
    swing: 0, humanize: 0.03,
    delayMs: 320, delayFeedback: 0.3, delayWet: 0.12,
  },
  lofi: {
    chords: [
      ['D3', 'F3', 'A3', 'C4'],
      ['Bb2', 'D3', 'F3', 'A3'],
      ['G2', 'Bb2', 'D3', 'F3'],
      ['A2', 'C3', 'E3', 'G3'],
    ],
    bassPatch: makePatch('sub808', { carrier: 'triangle', gain: 0.18, filterFreq: 500 }),
    bassPattern: [0,REST,REST,3, REST,5,REST,3, REST,REST,7,REST, 5,REST,3,REST],
    melodyPatch: makePatch('ep', { gain: 0.14, detune: 7, filterFreq: 1200, attack: 0.02, release: 0.8 }),
    melodyPattern: [REST,REST,15,REST, 12,REST,REST,10, REST,12,REST,REST, 7,REST,REST,REST],
    padPatch: makePatch('pad', { carrier: 'sine', gain: 0.05, attack: 0.2, release: 1.2, filterFreq: 1000, detune: 12 }),
    drums: {
      kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hh:    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    },
    reverbDuration: 2, reverbDecay: 2.8, reverbWet: 0.22,
    swing: 0.18, humanize: 0.06,
    delayMs: 292, delayFeedback: 0.28, delayWet: 0.1,
  },
};

/* ─── BgmPlayer ─── */

export class BgmPlayer {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private isPlaying = false;
  private volume = 0.7;
  private currentCategory: BgmCategory = 'hightension';
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;
  private wowFlutterLfo: OscillatorNode | null = null;
  private wowFlutterGain: GainNode | null = null;
  private bundledAudioEl: HTMLAudioElement | null = null;
  private currentBundledTrack: BundledBgmTrack | null = null;
  private usingBundledFile = false;

  private getOrCreateContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = 0;
      this.masterGain.connect(ctx.destination);

      // Dry path
      this.dryGain = ctx.createGain();
      this.dryGain.gain.value = 0.75;
      this.dryGain.connect(this.masterGain);

      // Reverb send
      this.reverbGain = ctx.createGain();
      this.reverbGain.gain.value = 0;
      this.reverbConvolver = ctx.createConvolver();
      this.reverbConvolver.connect(this.reverbGain);
      this.reverbGain.connect(this.masterGain);

      // Delay send
      this.delayWet = ctx.createGain();
      this.delayWet.gain.value = 0;
      this.delayNode = ctx.createDelay(2);
      this.delayFeedback = ctx.createGain();
      this.delayFeedback.gain.value = 0.3;
      this.delayNode.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      this.delayNode.connect(this.delayWet);
      this.delayWet.connect(this.masterGain);

      this.audioCtx = ctx;
    }
    return this.audioCtx;
  }

  private createReverbImpulse(ctx: AudioContext, durationSec: number, decay: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * durationSec);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  unlockAudio(): void {
    const ctx = this.getOrCreateContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  start(
    bgmTemplateId: string,
    bpm?: number,
    _highlightStartSec?: number,
    _highlightDurationSec?: number,
    _energyCurve?: number[],
  ): void {
    const ctx = this.getOrCreateContext();
    if (!ctx || !this.masterGain || !this.dryGain || !this.reverbConvolver || !this.reverbGain || !this.delayNode || !this.delayFeedback || !this.delayWet) return;
    if (this.isPlaying) this.stop();

    this.unlockAudio();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const category = moodLabelToCategory(bgmTemplateId);
    this.currentCategory = category;

    // Try bundled audio file first — zero network latency, studio-grade quality
    if (Platform.OS === 'web' && hasBundledTracksForCategory(category)) {
      const track = getBundledTrackForIdOrCategory(bgmTemplateId, category);
      const uri = resolveBundledTrackUri(track);
      try {
        if (this.bundledAudioEl) {
          this.bundledAudioEl.pause();
          this.bundledAudioEl = null;
        }
        const audio = new Audio(uri);
        audio.loop = true;
        audio.volume = this.volume;
        audio.crossOrigin = 'anonymous';
        const sourceNode = ctx.createMediaElementSource(audio);
        sourceNode.connect(this.dryGain);
        sourceNode.connect(this.reverbConvolver);
        audio.play().catch(() => {
          // Bundled file failed — fall back to FM synthesis
          this.usingBundledFile = false;
          this.startFmSynthesis(category, bpm, ctx);
        });
        this.bundledAudioEl = audio;
        this.currentBundledTrack = track;
        this.usingBundledFile = true;
        this.isPlaying = true;
        this.masterGain.gain.cancelScheduledValues(ctx.currentTime);
        this.masterGain.gain.setValueAtTime(0, ctx.currentTime);
        this.masterGain.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 0.4);
        return;
      } catch {
        // Fall through to FM synthesis
      }
    }

    this.startFmSynthesis(category, bpm, ctx);
  }

  private startFmSynthesis(category: BgmCategory, bpm: number | undefined, ctx: AudioContext): void {
    if (!this.masterGain || !this.dryGain || !this.reverbConvolver || !this.reverbGain || !this.delayNode || !this.delayFeedback || !this.delayWet) return;
    this.usingBundledFile = false;
    const config = MOOD_SYNTH_CONFIGS[category];
    const effectiveBpm = bpm ?? MOOD_CONFIGS[category].bpm;

    this.reverbConvolver.buffer = this.createReverbImpulse(ctx, config.reverbDuration, config.reverbDecay);
    this.reverbGain.gain.value = config.reverbWet;
    this.delayNode.delayTime.value = config.delayMs / 1000;
    this.delayFeedback.gain.value = config.delayFeedback;
    this.delayWet.gain.value = config.delayWet;

    // Lofi wow/flutter — subtle pitch wobble
    if (category === 'lofi' && !this.wowFlutterLfo) {
      this.wowFlutterLfo = ctx.createOscillator();
      this.wowFlutterLfo.type = 'sine';
      this.wowFlutterLfo.frequency.value = 0.6;
      this.wowFlutterGain = ctx.createGain();
      this.wowFlutterGain.gain.value = 3;
      this.wowFlutterLfo.connect(this.wowFlutterGain);
      this.wowFlutterLfo.start();
    } else if (category !== 'lofi' && this.wowFlutterLfo) {
      try { this.wowFlutterLfo.stop(); } catch { /* ignore */ }
      this.wowFlutterLfo = null;
      this.wowFlutterGain = null;
    }

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = ctx.currentTime + 0.05;

    const stepDurSec = 60 / effectiveBpm / 4;
    const totalSteps = config.chords.length * 16;

    const scheduleNotes = () => {
      if (!this.isPlaying || !this.audioCtx || !this.dryGain) return;
      while (this.nextNoteTime < this.audioCtx.currentTime + 0.15) {
        const t = this.applySwing(this.currentStep, this.nextNoteTime, stepDurSec, config.swing);
        this.playStep(config, this.currentStep, t, stepDurSec);
        this.currentStep = (this.currentStep + 1) % totalSteps;
        this.nextNoteTime += stepDurSec;
      }
    };

    this.masterGain.gain.cancelScheduledValues(ctx.currentTime);
    this.masterGain.gain.setValueAtTime(0, ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 0.4);

    scheduleNotes();
    this.schedulerTimer = setInterval(scheduleNotes, 25);
  }

  private applySwing(step: number, time: number, stepDur: number, swing: number): number {
    if (swing <= 0) return time;
    if (step % 2 === 1) return time + stepDur * swing;
    return time;
  }

  private playStep(config: MoodSynthConfig, step: number, time: number, stepDur: number): void {
    if (!this.audioCtx || !this.dryGain || !this.reverbConvolver || !this.delayNode) return;

    const barStep = step % 16;
    const chordIdx = Math.floor(step / 16) % config.chords.length;
    const chord = config.chords[chordIdx];
    const rootFreq = noteFreq(chord[0]);
    if (rootFreq <= 0) return;

    // Pad on chord change
    if (barStep === 0) {
      for (const note of chord) {
        this.playFmNote(noteFreq(note), time, stepDur * 16, config.padPatch, config);
      }
    }

    // Bass
    const bassOff = config.bassPattern[barStep];
    if (bassOff !== undefined && bassOff >= 0) {
      const f = rootFreq * Math.pow(2, bassOff / 12);
      this.playFmNote(f, time, stepDur * 2.5, config.bassPatch, config);
    }

    // Melody
    const melOff = config.melodyPattern[barStep];
    if (melOff !== undefined && melOff >= 0) {
      const f = rootFreq * Math.pow(2, melOff / 12);
      const humanGain = 1 - config.humanize + Math.random() * config.humanize * 2;
      this.playFmNote(f, time, stepDur * 2, { ...config.melodyPatch, gain: config.melodyPatch.gain * humanGain }, config);
    }

    // Drums
    if (config.drums) {
      if (config.drums.kick[barStep]) this.playKick(time);
      if (config.drums.snare[barStep]) this.playSnare(time);
      if (config.drums.hh[barStep]) this.playHihat(time, barStep % 4 === 2);
    }
  }

  private playFmNote(freq: number, time: number, durationSec: number, patch: PatchParams, config: MoodSynthConfig): void {
    if (!this.audioCtx || !this.dryGain || !this.reverbConvolver || !this.delayNode) return;
    const ctx = this.audioCtx;

    const totalGain = ctx.createGain();
    const a = Math.min(patch.attack, durationSec * 0.4);
    const d = Math.min(patch.decay, durationSec * 0.3);
    const s = patch.sustain;
    const r = Math.min(patch.release, durationSec * 0.5);
    const peak = patch.gain;
    const sustainLevel = peak * s;

    totalGain.gain.setValueAtTime(0, time);
    totalGain.gain.linearRampToValueAtTime(peak, time + a);
    totalGain.gain.linearRampToValueAtTime(sustainLevel, time + a + d);
    const releaseStart = Math.max(time + a + d, time + durationSec - r);
    totalGain.gain.setValueAtTime(sustainLevel, releaseStart);
    totalGain.gain.linearRampToValueAtTime(0, time + durationSec);

    // Filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = patch.filterFreq;
    filter.Q.value = patch.filterQ;
    filter.connect(totalGain);

    // Unison oscillators with FM
    const detuneSpread = patch.detune;
    for (let i = 0; i < patch.unison; i++) {
      const detune = patch.unison > 1
        ? (i / (patch.unison - 1) - 0.5) * detuneSpread * 2
        : 0;

      // Carrier
      const carrier = ctx.createOscillator();
      carrier.type = patch.carrier;
      carrier.frequency.value = freq;

      // Apply wow/flutter for lofi
      if (this.wowFlutterGain && this.currentCategory === 'lofi') {
        this.wowFlutterGain.connect(carrier.detune);
      }
      carrier.detune.value = detune;

      // Modulator
      const modulator = ctx.createOscillator();
      modulator.type = patch.modulator;
      modulator.frequency.value = freq * patch.modRatio;

      const modGain = ctx.createGain();
      modGain.gain.value = freq * patch.modIndex;
      modulator.connect(modGain);
      modGain.connect(carrier.frequency);

      carrier.connect(filter);
      carrier.start(time);
      modulator.start(time);
      carrier.stop(time + durationSec + 0.1);
      modulator.stop(time + durationSec + 0.1);
    }

    // Send to dry, reverb, delay
    totalGain.connect(this.dryGain);
    totalGain.connect(this.reverbConvolver);
    if (patch.type !== 'sub808' && patch.type !== 'timpani') {
      totalGain.connect(this.delayNode);
    }
  }

  private playKick(time: number): void {
    if (!this.audioCtx || !this.dryGain || !this.reverbConvolver) return;
    const ctx = this.audioCtx;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);

    const click = ctx.createOscillator();
    click.type = 'square';
    click.frequency.value = 800;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.08, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.008);
    click.connect(clickGain);
    clickGain.connect(this.dryGain);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    osc.connect(gain);
    gain.connect(this.dryGain);
    gain.connect(this.reverbConvolver);

    osc.start(time); osc.stop(time + 0.25);
    click.start(time); click.stop(time + 0.02);
  }

  private playSnare(time: number): void {
    if (!this.audioCtx || !this.dryGain || !this.reverbConvolver) return;
    const ctx = this.audioCtx;

    // Noise component
    const noiseLen = 0.15;
    const bufSize = Math.floor(ctx.sampleRate * noiseLen);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 2000; nf.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.3, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
    noise.connect(nf); nf.connect(ng); ng.connect(this.dryGain); ng.connect(this.reverbConvolver);

    // Tonal component
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(200, time);
    tone.frequency.exponentialRampToValueAtTime(120, time + 0.08);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.18, time);
    tg.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    tone.connect(tg); tg.connect(this.dryGain);

    noise.start(time); noise.stop(time + 0.16);
    tone.start(time); tone.stop(time + 0.12);
  }

  private playHihat(time: number, open: boolean): void {
    if (!this.audioCtx || !this.dryGain) return;
    const ctx = this.audioCtx;
    const dur = open ? 0.1 : 0.035;
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 8000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(open ? 0.05 : 0.08, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    noise.connect(hp); hp.connect(g); g.connect(this.dryGain);
    noise.start(time); noise.stop(time + dur + 0.02);
  }

  pause(): void {
    if (this.usingBundledFile && this.bundledAudioEl) {
      this.bundledAudioEl.pause();
    }
    if (this.schedulerTimer) { clearInterval(this.schedulerTimer); this.schedulerTimer = null; }
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.1);
    }
    this.isPlaying = false;
  }

  resume(): void {
    if (!this.audioCtx || !this.masterGain) return;
    this.unlockAudio();
    this.masterGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(this.volume, this.audioCtx.currentTime + 0.2);
    this.isPlaying = true;
    if (this.usingBundledFile && this.bundledAudioEl) {
      this.bundledAudioEl.play().catch(() => {});
      return;
    }
    this.nextNoteTime = this.audioCtx.currentTime + 0.05;
    const config = MOOD_SYNTH_CONFIGS[this.currentCategory];
    const bpm = MOOD_CONFIGS[this.currentCategory].bpm;
    const stepDurSec = 60 / bpm / 4;
    const totalSteps = config.chords.length * 16;
    const scheduleNotes = () => {
      if (!this.isPlaying || !this.audioCtx || !this.dryGain) return;
      while (this.nextNoteTime < this.audioCtx.currentTime + 0.15) {
        const t = this.applySwing(this.currentStep, this.nextNoteTime, stepDurSec, config.swing);
        this.playStep(config, this.currentStep, t, stepDurSec);
        this.currentStep = (this.currentStep + 1) % totalSteps;
        this.nextNoteTime += stepDurSec;
      }
    };
    scheduleNotes();
    this.schedulerTimer = setInterval(scheduleNotes, 25);
  }

  stop(): void {
    this.isPlaying = false;
    if (this.bundledAudioEl) {
      this.bundledAudioEl.pause();
      this.bundledAudioEl = null;
    }
    this.usingBundledFile = false;
    this.currentBundledTrack = null;
    if (this.schedulerTimer) { clearInterval(this.schedulerTimer); this.schedulerTimer = null; }
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.15);
    }
  }

  setVolume(vol: number): void {
    this.volume = vol;
    if (this.usingBundledFile && this.bundledAudioEl) {
      this.bundledAudioEl.volume = vol;
    }
    if (this.masterGain && this.audioCtx && this.isPlaying) {
      this.masterGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(vol, this.audioCtx.currentTime + 0.05);
    }
  }

  dispose(): void {
    this.stop();
    if (this.bundledAudioEl) { this.bundledAudioEl.pause(); this.bundledAudioEl = null; }
    if (this.wowFlutterLfo) { try { this.wowFlutterLfo.stop(); } catch { /* ignore */ } this.wowFlutterLfo = null; this.wowFlutterGain = null; }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch { /* ignore */ }
      this.audioCtx = null; this.masterGain = null; this.dryGain = null;
      this.reverbConvolver = null; this.reverbGain = null;
      this.delayNode = null; this.delayFeedback = null; this.delayWet = null;
    }
  }

  get playing(): boolean { return this.isPlaying; }
  get category(): BgmCategory { return this.currentCategory; }
  get bundledTrack(): BundledBgmTrack | null { return this.currentBundledTrack; }
  get isBundled(): boolean { return this.usingBundledFile; }
}

/* ─── Utility exports ─── */

export function getBgmStreamUrl(moodLabel: string, trackIndex?: number): string {
  const category = moodLabelToCategory(moodLabel);
  if (!hasBundledTracksForCategory(category)) return '';
  const track = pickBundledTrack(category, trackIndex);
  return resolveBundledTrackUri(track);
}

export function getBgmStreamUrlByMood(moodLabel: string, trackIndex?: number): string {
  return getBgmStreamUrl(moodLabel, trackIndex);
}

export function getBgmTemplateForMood(moodLabel: string): {
  id: string; label: string; mood: string; bpm: number;
  highlightStartSec: number; highlightDurationSec: number; energyCurve: number[];
} {
  const category = moodLabelToCategory(moodLabel);
  if (hasBundledTracksForCategory(category)) {
    const track = pickBundledTrack(category);
    return bundledTrackToBgmTemplate(track);
  }
  const config = MOOD_CONFIGS[category];
  const track = config.tracks[0];
  return { id: category, label: config.label, mood: config.label, bpm: config.bpm,
    highlightStartSec: track.highlightStartSec, highlightDurationSec: track.highlightDurationSec, energyCurve: config.energyCurve };
}

export async function mixBgmIntoVideo(_videoUri: string, _bgmTemplateId: string, _bpm?: number, _durationSec?: number, _highlightStartSec?: number, _highlightDurationSec?: number, _energyCurve?: number[]): Promise<string> { return _videoUri; }

export interface BgmRecommendation { category: BgmCategory; templateId: string; label: string; description: string; bpm: number; reason: string; highlightStartSec: number; highlightDurationSec: number; energyCurve: number[]; }

const FALLBACK_RECOMMENDATION: BgmRecommendation = { category: 'hightension', templateId: 'hightension', label: '하이텐션', description: '틱톡 및 릴스에서 가장 인기 있는 경쾌한 일렉트로닉 비트', bpm: 128, reason: '이미지 분석 없이 하이텐션 무드를 기본 추천했습니다.', highlightStartSec: 3, highlightDurationSec: 10, energyCurve: HIGH_ENERGY_CURVE };

const MOOD_DESCRIPTIONS: Record<BgmCategory, string> = { cinematic: '웅장하고 드라마틱한 오케스트라 빌드업 — 제품 집중, 네이버 클립에 최적', hightension: '빠르고 에너제틱한 일렉트로닉 비트 — 틱톡/쇼츠 FYP 진입용', asmr: '차분하고 미니멀한 앰비언트 — 제품 디테일 어필, 광고 전환용', emotional: '따뜻하고 감성적인 피아노/스트링 — 인스타 릴스 스토리텔링용', lofi: '편안한 로파이 비트 — 카페/일상/힐링 콘텐츠에 최적' };

export async function fetchBgmRecommendation(imageDataUrl: string, mimeType: string = 'image/jpeg'): Promise<BgmRecommendation> {
  const b64 = cleanBase64(imageDataUrl);
  const cacheInput = { task: 'bgm-recommend', imageHash: hashObject({ b64 }).slice(0, 16), mimeType };

  try {
    const { data } = await aiCachedCall<BgmRecommendation>(
      'bgm-recommend',
      cacheInput,
      async () => {
        const { data, error } = await supabase.functions.invoke('recommend-bgm', { body: { imageDataUrl, mimeType } });
        if (error || !data) return FALLBACK_RECOMMENDATION;
        const raw = data as Record<string, unknown>;
        const rawCategory = String(raw.category ?? raw.templateId ?? '');
        const mappedCategory: BgmCategory = moodLabelToCategory(rawCategory);
        return { category: mappedCategory, templateId: mappedCategory, label: MOOD_CONFIGS[mappedCategory].label, description: String(raw.description ?? MOOD_DESCRIPTIONS[mappedCategory]), bpm: Number(raw.bpm ?? MOOD_CONFIGS[mappedCategory].bpm), reason: String(raw.reason ?? `${MOOD_CONFIGS[mappedCategory].label} 무드를 추천했습니다.`), highlightStartSec: Number(raw.highlightStartSec ?? MOOD_CONFIGS[mappedCategory].tracks[0].highlightStartSec), highlightDurationSec: Number(raw.highlightDurationSec ?? MOOD_CONFIGS[mappedCategory].tracks[0].highlightDurationSec), energyCurve: Array.isArray(raw.energyCurve) ? raw.energyCurve as number[] : MOOD_CONFIGS[mappedCategory].energyCurve };
      },
      'gpt-4o',
    );
    return data;
  } catch { return FALLBACK_RECOMMENDATION; }
}

export const BGM_CATEGORY_LABELS: Record<BgmCategory, string> = { cinematic: '시네마틱', hightension: '하이텐션', asmr: 'ASMR', emotional: '감성', lofi: '로파이' };
export const BGM_MOOD_LIST: { label: string; category: BgmCategory; description: string }[] = [
  { label: '시네마틱', category: 'cinematic', description: MOOD_DESCRIPTIONS.cinematic },
  { label: '하이텐션', category: 'hightension', description: MOOD_DESCRIPTIONS.hightension },
  { label: 'ASMR', category: 'asmr', description: MOOD_DESCRIPTIONS.asmr },
  { label: '감성', category: 'emotional', description: MOOD_DESCRIPTIONS.emotional },
  { label: '로파이', category: 'lofi', description: MOOD_DESCRIPTIONS.lofi },
];
