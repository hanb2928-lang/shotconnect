export type SyncEffectType = 'zoomIn' | 'captionBounce' | 'pixelShake' | 'colorPulse';

export interface KeywordTrigger {
  keyword: string;
  effect: SyncEffectType;
  intensity: number;
}

export interface SyncMarker {
  id: string;
  timeSec: number;
  effect: SyncEffectType;
  intensity: number;
  keyword: string;
}

export interface TempoLayer {
  startSec: number;
  endSec: number;
  textPosition: { x: number; y: number };
  fontColor: string;
  bgBrightness: number;
}

export interface MicroSyncTimeline {
  markers: SyncMarker[];
  tempoLayers: TempoLayer[];
  totalDurationSec: number;
}

const HIGHLIGHT_KEYWORDS: KeywordTrigger[] = [
  { keyword: '진짜', effect: 'zoomIn', intensity: 1.2 },
  { keyword: '대박', effect: 'captionBounce', intensity: 1.5 },
  { keyword: '미쳤다', effect: 'pixelShake', intensity: 1.3 },
  { keyword: '헐', effect: 'captionBounce', intensity: 1.4 },
  { keyword: '완전', effect: 'zoomIn', intensity: 1.0 },
  { keyword: '실화', effect: 'pixelShake', intensity: 1.2 },
  { keyword: '소름', effect: 'colorPulse', intensity: 1.3 },
  { keyword: '꿀템', effect: 'zoomIn', intensity: 1.1 },
  { keyword: '인생템', effect: 'captionBounce', intensity: 1.4 },
  { keyword: '찐템', effect: 'zoomIn', intensity: 1.0 },
  { keyword: 'amazing', effect: 'zoomIn', intensity: 1.2 },
  { keyword: 'crazy', effect: 'captionBounce', intensity: 1.5 },
  { keyword: 'wow', effect: 'captionBounce', intensity: 1.4 },
  { keyword: ' obsessed', effect: 'pixelShake', intensity: 1.1 },
  { keyword: 'やばい', effect: 'zoomIn', intensity: 1.3 },
  { keyword: 'えぐい', effect: 'pixelShake', intensity: 1.2 },
  { keyword: 'すごい', effect: 'captionBounce', intensity: 1.2 },
];

const TEMPO_INTERVAL_MIN = 0.8;
const TEMPO_INTERVAL_MAX = 1.2;

const TEXT_POSITIONS = [
  { x: 0.5, y: 0.35 },
  { x: 0.5, y: 0.5 },
  { x: 0.5, y: 0.65 },
  { x: 0.3, y: 0.5 },
  { x: 0.7, y: 0.5 },
];

const FONT_COLORS = [
  '#FFFFFF',
  '#FFE082',
  '#81C784',
  '#FF8A65',
  '#64B5F6',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function generateSyncTimeline(
  scriptText: string,
  totalDurationSec: number,
): MicroSyncTimeline {
  const markers: SyncMarker[] = [];
  const lowerText = scriptText.toLowerCase();

  // Estimate timestamps for keywords based on character position ratio
  const totalChars = scriptText.length || 1;

  for (const trigger of HIGHLIGHT_KEYWORDS) {
    const lowerKeyword = trigger.keyword.toLowerCase();
    let searchIdx = 0;
    while (true) {
      const found = lowerText.indexOf(lowerKeyword, searchIdx);
      if (found === -1) break;

      const timeRatio = found / totalChars;
      const timeSec = Math.round(timeRatio * totalDurationSec * 10) / 10;

      markers.push({
        id: `sync-${timeSec}-${trigger.keyword}-${markers.length}`,
        timeSec,
        effect: trigger.effect,
        intensity: trigger.intensity,
        keyword: trigger.keyword.trim(),
      });

      searchIdx = found + trigger.keyword.length;
    }
  }

  // Sort markers by time
  markers.sort((a, b) => a.timeSec - b.timeSec);

  // Generate tempo layers — visual variation every 0.8~1.2 seconds
  const tempoLayers: TempoLayer[] = [];
  let currentSec = 0;
  let lastPosition = TEXT_POSITIONS[0];
  let lastColor = FONT_COLORS[0];

  while (currentSec < totalDurationSec) {
    const interval = randRange(TEMPO_INTERVAL_MIN, TEMPO_INTERVAL_MAX);
    const endSec = Math.min(currentSec + interval, totalDurationSec);

    // Ensure variation from previous layer
    let position = pick(TEXT_POSITIONS);
    if (TEXT_POSITIONS.length > 1) {
      while (position === lastPosition) {
        position = pick(TEXT_POSITIONS);
      }
    }
    lastPosition = position;

    let color = pick(FONT_COLORS);
    if (FONT_COLORS.length > 1) {
      while (color === lastColor) {
        color = pick(FONT_COLORS);
      }
    }
    lastColor = color;

    tempoLayers.push({
      startSec: currentSec,
      endSec,
      textPosition: position,
      fontColor: color,
      bgBrightness: randRange(0.85, 1.0),
    });

    currentSec = endSec;
  }

  return {
    markers,
    tempoLayers,
    totalDurationSec,
  };
}

export function getSyncMarkersAtTime(timeline: MicroSyncTimeline, timeSec: number): SyncMarker[] {
  const tolerance = 0.15;
  return timeline.markers.filter(
    (m) => Math.abs(m.timeSec - timeSec) < tolerance,
  );
}

export function getTempoLayerAtTime(timeline: MicroSyncTimeline, timeSec: number): TempoLayer | null {
  return timeline.tempoLayers.find(
    (l) => timeSec >= l.startSec && timeSec < l.endSec,
  ) ?? null;
}

export function getEffectLabel(effect: SyncEffectType): string {
  const labels: Record<SyncEffectType, string> = {
    zoomIn: '줌인',
    captionBounce: '자막 바운스',
    pixelShake: '픽셀 셰이크',
    colorPulse: '컬러 펄스',
  };
  return labels[effect];
}

export function getEffectEmoji(effect: SyncEffectType): string {
  const emojis: Record<SyncEffectType, string> = {
    zoomIn: '🔍',
    captionBounce: '💬',
    pixelShake: '📳',
    colorPulse: '🌈',
  };
  return emojis[effect];
}

export function buildRenderInstructions(timeline: MicroSyncTimeline): string {
  const markerLines = timeline.markers.slice(0, 10).map((m) =>
    `  ${m.timeSec.toFixed(1)}s — "${m.keyword}" → ${getEffectLabel(m.effect)} (강도 ${m.intensity.toFixed(1)})`
  );
  const tempoLines = timeline.tempoLayers.slice(0, 8).map((l, i) =>
    `  Layer ${i + 1}: ${l.startSec.toFixed(1)}s~${l.endSec.toFixed(1)}s | 위치 (${l.textPosition.x.toFixed(1)}, ${l.textPosition.y.toFixed(1)}) | 색상 ${l.fontColor} | 밝기 ${(l.bgBrightness * 100).toFixed(0)}%`
  );

  return [
    `[마이크로 비트 동기화 렌더指令]`,
    ``,
    `## 비트-텍스트 동기화 마커:`,
    ...markerLines,
    ``,
    `## 템포 페이싱 레이어 (0.8~1.2초 간격):`,
    ...tempoLines,
    ``,
    `총 마커 수: ${timeline.markers.length} | 총 레이어 수: ${timeline.tempoLayers.length} | 총 길이: ${timeline.totalDurationSec.toFixed(1)}초`,
  ].join('\n');
}
