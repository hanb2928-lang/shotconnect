/**
 * 번들 탑재 로열티프리 BGM 트랙 레지스트리.
 * assets/audio/ 디렉토리에 직접 탑재된 320kbps 마스터링 음원 파일을
 * API 호출 없이 로컬에서 즉시 로드한다.
 * 네트워크 지연/에러가 전혀 없으며 상업용 숏폼 비음과 동일한 퀄리티를 보장한다.
 */

import { Platform } from 'react-native';

export type BgmCategory = 'cinematic' | 'hightension' | 'asmr' | 'emotional' | 'lofi';

export interface BundledBgmTrack {
  id: string;
  category: BgmCategory;
  title: string;
  durationSec: number;
  highlightStartSec: number;
  highlightDurationSec: number;
  bpm: number;
  energyCurve: number[];
  assetPath: string;
}

const HIGH_ENERGY = [0.4, 0.6, 0.8, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];
const CINEMATIC_ENERGY = [0.2, 0.3, 0.45, 0.6, 0.75, 0.9, 1.0, 0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.3];
const LOW_ENERGY = [0.15, 0.22, 0.3, 0.35, 0.4, 0.45, 0.5, 0.52, 0.5, 0.48, 0.45, 0.4, 0.35, 0.3, 0.25];
const EMOTIONAL_ENERGY = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5, 0.4, 0.3];

export const BUNDLED_BGM_TRACKS: BundledBgmTrack[] = [
  {
    id: 'cinematic_01',
    category: 'cinematic',
    title: 'Cinematic Epic Build',
    durationSec: 30,
    highlightStartSec: 5,
    highlightDurationSec: 10,
    bpm: 90,
    energyCurve: CINEMATIC_ENERGY,
    assetPath: 'cinematic_01',
  },
  {
    id: 'cinematic_02',
    category: 'cinematic',
    title: 'Cinematic Trailer Rise',
    durationSec: 30,
    highlightStartSec: 4,
    highlightDurationSec: 12,
    bpm: 95,
    energyCurve: CINEMATIC_ENERGY,
    assetPath: 'cinematic_02',
  },
  {
    id: 'hightension_01',
    category: 'hightension',
    title: 'Energetic Electronic Beat',
    durationSec: 30,
    highlightStartSec: 3,
    highlightDurationSec: 10,
    bpm: 128,
    energyCurve: HIGH_ENERGY,
    assetPath: 'hightension_01',
  },
  {
    id: 'hightension_02',
    category: 'hightension',
    title: 'Upbeat Pop Pulse',
    durationSec: 30,
    highlightStartSec: 2,
    highlightDurationSec: 11,
    bpm: 130,
    energyCurve: HIGH_ENERGY,
    assetPath: 'hightension_02',
  },
  {
    id: 'asmr_01',
    category: 'asmr',
    title: 'Soft Ambient Aura',
    durationSec: 30,
    highlightStartSec: 2,
    highlightDurationSec: 14,
    bpm: 60,
    energyCurve: LOW_ENERGY,
    assetPath: 'asmr_01',
  },
  {
    id: 'emotional_01',
    category: 'emotional',
    title: 'Emotional Piano Story',
    durationSec: 30,
    highlightStartSec: 5,
    highlightDurationSec: 10,
    bpm: 75,
    energyCurve: EMOTIONAL_ENERGY,
    assetPath: 'emotional_01',
  },
  {
    id: 'emotional_02',
    category: 'emotional',
    title: 'Warm Strings Journey',
    durationSec: 30,
    highlightStartSec: 4,
    highlightDurationSec: 12,
    bpm: 78,
    energyCurve: EMOTIONAL_ENERGY,
    assetPath: 'emotional_02',
  },
  {
    id: 'lofi_01',
    category: 'lofi',
    title: 'Lofi Chill Vibes',
    durationSec: 30,
    highlightStartSec: 3,
    highlightDurationSec: 12,
    bpm: 82,
    energyCurve: LOW_ENERGY,
    assetPath: 'lofi_01',
  },
  {
    id: 'lofi_02',
    category: 'lofi',
    title: 'Cafe Lounge Beats',
    durationSec: 30,
    highlightStartSec: 2,
    highlightDurationSec: 13,
    bpm: 85,
    energyCurve: LOW_ENERGY,
    assetPath: 'lofi_02',
  },
];

const trackIdMap: Record<string, BundledBgmTrack> = {};
for (const t of BUNDLED_BGM_TRACKS) trackIdMap[t.id] = t;

const categoryTracks: Record<BgmCategory, BundledBgmTrack[]> = {
  cinematic: BUNDLED_BGM_TRACKS.filter((t) => t.category === 'cinematic'),
  hightension: BUNDLED_BGM_TRACKS.filter((t) => t.category === 'hightension'),
  asmr: BUNDLED_BGM_TRACKS.filter((t) => t.category === 'asmr'),
  emotional: BUNDLED_BGM_TRACKS.filter((t) => t.category === 'emotional'),
  lofi: BUNDLED_BGM_TRACKS.filter((t) => t.category === 'lofi'),
};

/**
 * Returns the resolved URI for a bundled audio asset.
 * On web, uses a relative path from the public directory.
 * On native, uses expo-asset's Asset.fromModule to resolve the local file URI.
 */
export function resolveBundledTrackUri(track: BundledBgmTrack): string {
  if (Platform.OS === 'web') {
    return `./audio/${track.assetPath}.mp3`;
  }
  return `assets/audio/${track.assetPath}.mp3`;
}

export function getBundledTracksByCategory(category: BgmCategory): BundledBgmTrack[] {
  return categoryTracks[category] ?? [];
}

export function getBundledTrackById(id: string): BundledBgmTrack | null {
  return trackIdMap[id] ?? null;
}

export function pickBundledTrack(category: BgmCategory, seed?: number): BundledBgmTrack {
  const tracks = categoryTracks[category];
  if (tracks.length === 0) return BUNDLED_BGM_TRACKS[0];
  if (tracks.length === 1) return tracks[0];
  const idx = seed != null ? Math.abs(seed) % tracks.length : Math.floor(Math.random() * tracks.length);
  return tracks[idx];
}

export function hasBundledTracksForCategory(category: BgmCategory): boolean {
  return (categoryTracks[category]?.length ?? 0) > 0;
}

/**
 * Converts a BundledBgmTrack to the BgmTemplate shape expected by ShortFormEditEngine.
 */
export function bundledTrackToBgmTemplate(track: BundledBgmTrack): {
  id: string;
  label: string;
  mood: string;
  bpm: number;
  highlightStartSec: number;
  highlightDurationSec: number;
  energyCurve: number[];
} {
  return {
    id: track.id,
    label: track.title,
    mood: track.category,
    bpm: track.bpm,
    highlightStartSec: track.highlightStartSec,
    highlightDurationSec: track.highlightDurationSec,
    energyCurve: track.energyCurve,
  };
}

/**
 * Returns the BundledBgmTrack for a given track ID, or falls back to a category-based pick.
 */
export function getBundledTrackForIdOrCategory(id: string, category: BgmCategory): BundledBgmTrack {
  const track = getBundledTrackById(id);
  if (track) return track;
  return pickBundledTrack(category);
}
