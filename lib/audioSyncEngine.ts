import { pickBundledTrack, type BundledBgmTrack, type BgmCategory } from './bundledBgm';
import { moodLabelToCategory } from './bgmEngine';
import type { EditSegment } from './shortFormEditEngine';

export interface BeatMarker {
  index: number;
  timeSec: number;
  isDownbeat: boolean;
  snappedCutIndex: number | null;
}

export interface DuckingSegment {
  startSec: number;
  endSec: number;
  levelDb: number;
  fadeType: 'fadeIn' | 'fadeOut' | 'hold' | 'restore';
}

export interface BeatSyncResult {
  bpm: number;
  beatIntervalSec: number;
  beats: BeatMarker[];
  cutOffsets: CutOffset[];
  duckingCurve: DuckingSegment[];
  selectedTrack: BundledBgmTrack | null;
  selectionReason: string;
}

export interface CutOffset {
  cutIndex: number;
  originalSec: number;
  snappedSec: number;
  offsetMs: number;
}

const DUCK_LEVEL_DB = -18;
const FULL_LEVEL_DB = 0;
const DUCK_FADE_SEC = 0.08;
const RESTORE_FADE_SEC = 0.12;

export function generateBeatTimeline(
  bpm: number,
  totalDurationSec: number,
  segments: EditSegment[],
): BeatMarker[] {
  const beatInterval = 60 / bpm;
  const beats: BeatMarker[] = [];
  const cutTimes = segments.map((s) => s.startSec);

  let t = 0;
  let beatIdx = 0;
  while (t < totalDurationSec) {
    const isDownbeat = beatIdx % 4 === 0;
    const nearestCut = cutTimes.findIndex((ct) => Math.abs(ct - t) < beatInterval * 0.5);
    beats.push({
      index: beatIdx,
      timeSec: Math.round(t * 1000) / 1000,
      isDownbeat,
      snappedCutIndex: nearestCut >= 0 ? nearestCut : null,
    });
    t += beatInterval;
    beatIdx++;
  }
  return beats;
}

export function snapCutsToBeats(
  segments: EditSegment[],
  beats: BeatMarker[],
): CutOffset[] {
  return segments.map((seg, cutIdx) => {
    const original = seg.startSec;
    let bestBeat = beats[0];
    let bestDist = Infinity;
    for (const b of beats) {
      const d = Math.abs(b.timeSec - original);
      if (d < bestDist) {
        bestDist = d;
        bestBeat = b;
      }
    }
    return {
      cutIndex: cutIdx,
      originalSec: original,
      snappedSec: bestBeat.timeSec,
      offsetMs: Math.round((bestBeat.timeSec - original) * 1000),
    };
  });
}

export function generateDuckingCurve(
  segments: EditSegment[],
  totalDurationSec: number,
): DuckingSegment[] {
  const curve: DuckingSegment[] = [];
  const events: { time: number; level: number; fade: 'fadeIn' | 'fadeOut' }[] = [];

  for (const seg of segments) {
    const hasNarration = seg.narrationCue && seg.narrationCue.length > 0;
    if (hasNarration) {
      events.push({ time: seg.startSec, level: DUCK_LEVEL_DB, fade: 'fadeOut' });
      events.push({ time: seg.endSec, level: FULL_LEVEL_DB, fade: 'fadeIn' });
    }
  }

  events.sort((a, b) => a.time - b.time);

  if (events.length === 0) {
    curve.push({ startSec: 0, endSec: totalDurationSec, levelDb: FULL_LEVEL_DB, fadeType: 'hold' });
    return curve;
  }

  let prevLevel = FULL_LEVEL_DB;
  let prevTime = 0;

  for (const ev of events) {
    if (ev.time > prevTime) {
      curve.push({
        startSec: prevTime,
        endSec: ev.time,
        levelDb: prevLevel,
        fadeType: prevLevel === FULL_LEVEL_DB ? 'hold' : 'hold',
      });
    }
    const fadeDuration = ev.fade === 'fadeOut' ? DUCK_FADE_SEC : RESTORE_FADE_SEC;
    curve.push({
      startSec: ev.time,
      endSec: Math.min(ev.time + fadeDuration, totalDurationSec),
      levelDb: ev.level,
      fadeType: ev.fade === 'fadeOut' ? 'fadeOut' : 'fadeIn',
    });
    prevLevel = ev.level;
    prevTime = ev.time + fadeDuration;
  }

  if (prevTime < totalDurationSec) {
    curve.push({
      startSec: prevTime,
      endSec: totalDurationSec,
      levelDb: prevLevel,
      fadeType: 'restore',
    });
  }

  return curve;
}

const BPM_TOLERANCE = 15;

export function selectTrackByBpm(
  moodLabel: string,
  targetBpm: number,
  seed?: number,
): { track: BundledBgmTrack | null; reason: string } {
  const category = moodLabelToCategory(moodLabel);
  const tracks = getAllTracksForCategory(category);

  if (tracks.length === 0) {
    return { track: null, reason: `${moodLabel} 카테고리에 사용 가능한 트랙이 없습니다.` };
  }

  let best = tracks[0];
  let bestDiff = Infinity;
  for (const t of tracks) {
    const diff = Math.abs(t.bpm - targetBpm);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = t;
    }
  }

  if (bestDiff <= BPM_TOLERANCE) {
    return {
      track: best,
      reason: `${moodLabel} 무드에서 BPM ${best.bpm} 트랙이 목표 ${targetBpm}BPM과 ${bestDiff}BPM 차이로 최적 매칭되었습니다.`,
    };
  }

  const fallback = pickBundledTrack(category, seed);
  return {
    track: fallback,
    reason: `${moodLabel} 무드에서 정확한 BPM 매칭 트랙이 없어 ${fallback.bpm}BPM 트랙을 fallback 선택했습니다. (목표: ${targetBpm}BPM)`,
  };
}

function getAllTracksForCategory(category: BgmCategory): BundledBgmTrack[] {
  const all: BundledBgmTrack[] = [
    { id: 'cinematic_01', category: 'cinematic', title: 'Cinematic Epic Build', durationSec: 30, highlightStartSec: 5, highlightDurationSec: 10, bpm: 90, energyCurve: [], assetPath: 'cinematic_01' },
    { id: 'cinematic_02', category: 'cinematic', title: 'Cinematic Trailer Rise', durationSec: 30, highlightStartSec: 4, highlightDurationSec: 12, bpm: 95, energyCurve: [], assetPath: 'cinematic_02' },
    { id: 'hightension_01', category: 'hightension', title: 'Energetic Electronic Beat', durationSec: 30, highlightStartSec: 3, highlightDurationSec: 10, bpm: 128, energyCurve: [], assetPath: 'hightension_01' },
    { id: 'hightension_02', category: 'hightension', title: 'Upbeat Pop Pulse', durationSec: 30, highlightStartSec: 2, highlightDurationSec: 11, bpm: 130, energyCurve: [], assetPath: 'hightension_02' },
    { id: 'asmr_01', category: 'asmr', title: 'Soft Ambient Aura', durationSec: 30, highlightStartSec: 2, highlightDurationSec: 14, bpm: 60, energyCurve: [], assetPath: 'asmr_01' },
    { id: 'emotional_01', category: 'emotional', title: 'Emotional Piano Story', durationSec: 30, highlightStartSec: 5, highlightDurationSec: 10, bpm: 75, energyCurve: [], assetPath: 'emotional_01' },
    { id: 'emotional_02', category: 'emotional', title: 'Warm Strings Journey', durationSec: 30, highlightStartSec: 4, highlightDurationSec: 12, bpm: 78, energyCurve: [], assetPath: 'emotional_02' },
    { id: 'lofi_01', category: 'lofi', title: 'Lofi Chill Vibes', durationSec: 30, highlightStartSec: 3, highlightDurationSec: 12, bpm: 82, energyCurve: [], assetPath: 'lofi_01' },
    { id: 'lofi_02', category: 'lofi', title: 'Cafe Lounge Beats', durationSec: 30, highlightStartSec: 2, highlightDurationSec: 13, bpm: 85, energyCurve: [], assetPath: 'lofi_02' },
  ];
  return all.filter((t) => t.category === category);
}

export function buildBeatSync(
  bpm: number,
  totalDurationSec: number,
  segments: EditSegment[],
  moodLabel: string,
  seed?: number,
): BeatSyncResult {
  const beats = generateBeatTimeline(bpm, totalDurationSec, segments);
  const cutOffsets = snapCutsToBeats(segments, beats);
  const duckingCurve = generateDuckingCurve(segments, totalDurationSec);
  const { track, reason } = selectTrackByBpm(moodLabel, bpm, seed);

  return {
    bpm,
    beatIntervalSec: Math.round((60 / bpm) * 1000) / 1000,
    beats,
    cutOffsets,
    duckingCurve,
    selectedTrack: track,
    selectionReason: reason,
  };
}

export function formatBeatSyncSummary(sync: BeatSyncResult): string {
  const beatCount = sync.beats.length;
  const downbeatCount = sync.beats.filter((b) => b.isDownbeat).length;
  const snappedCuts = sync.cutOffsets.filter((c) => c.offsetMs !== 0).length;
  const duckSegments = sync.duckingCurve.filter((d) => d.fadeType === 'fadeOut' || d.fadeType === 'fadeIn').length;

  return [
    `BPM: ${sync.bpm} | 비트 간격: ${sync.beatIntervalSec}초 | 총 비트: ${beatCount} (다운비트 ${downbeatCount})`,
    `컷 비트 스냅: ${sync.cutOffsets.length}개 중 ${snappedCuts}개 조정됨 (최대 오프셋: ${Math.max(0, ...sync.cutOffsets.map((c) => Math.abs(c.offsetMs)))}ms)`,
    `오디오 더킹: ${duckSegments}개 구간 자동 볼륨 조절 (나레이션 시 -${Math.abs(-18)}dB)`,
    `BGM 트랙: ${sync.selectedTrack?.title ?? 'N/A'} (${sync.selectedTrack?.bpm ?? 0}BPM) — ${sync.selectionReason}`,
  ].join('\n');
}

export function getBeatSyncAccuracyLabel(sync: BeatSyncResult): string {
  const maxOffset = Math.max(0, ...sync.cutOffsets.map((c) => Math.abs(c.offsetMs)));
  if (maxOffset <= 50) return '밀리초급 정밀 동기화';
  if (maxOffset <= 150) return '프리미엄 동기화';
  if (maxOffset <= 300) return '표준 동기화';
  return '기본 동기화';
}
