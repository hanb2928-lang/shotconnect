import { createContext, useContext } from 'react';
import type { BoundAffiliateLink } from '@/components/InspectorPanel';
import type { ToonCharacter, ToonPersonaPreset } from '@/components/PhotoToonUpload';

export type InspectorMode = 'affiliate' | 'persona';
export type ToonStyle = 'color' | 'mono';
export type ArtStyle = 'digital-webtoon' | 'analog-manga' | 'vintage-sketch';

export interface InspectorCutData {
  id: string;
  label: string;
  speechBubble: string;
  affiliateLink: BoundAffiliateLink | null;
  imageUrl: string | null;
}

export interface InspectorContextValue {
  boundLinks: BoundAffiliateLink[];
  selectedCutId: string | null;
  setSelectedCutId: (id: string | null) => void;
  cuts: InspectorCutData[];
  setCuts: (cuts: InspectorCutData[]) => void;
  onUpdateCut: (id: string, updates: Partial<Omit<InspectorCutData, 'id'>>) => void;
  selectedCutIndex: number;
  inspectorMode: InspectorMode;
  setInspectorMode: (mode: InspectorMode) => void;
  toonCharacter: ToonCharacter | null;
  setToonCharacter: (char: ToonCharacter | null) => void;
  selectedPresetId: string;
  setSelectedPresetId: (id: string) => void;
  toneLevel: number;
  setToneLevel: (level: number) => void;
  toonStyle: ToonStyle;
  setToonStyle: (style: ToonStyle) => void;
  artStyle: ArtStyle;
  setArtStyle: (style: ArtStyle) => void;
  batchToonTrigger: number;
  triggerBatchToon: () => void;
  batchTooning: boolean;
  setBatchTooning: (v: boolean) => void;
}

export const InspectorContext = createContext<InspectorContextValue>({
  boundLinks: [],
  selectedCutId: null,
  setSelectedCutId: () => {},
  cuts: [],
  setCuts: () => {},
  onUpdateCut: () => {},
  selectedCutIndex: -1,
  inspectorMode: 'affiliate',
  setInspectorMode: () => {},
  toonCharacter: null,
  setToonCharacter: () => {},
  selectedPresetId: 'veteran',
  setSelectedPresetId: () => {},
  toneLevel: 50,
  setToneLevel: () => {},
  toonStyle: 'color',
  setToonStyle: () => {},
  artStyle: 'digital-webtoon',
  setArtStyle: () => {},
  batchToonTrigger: 0,
  triggerBatchToon: () => {},
  batchTooning: false,
  setBatchTooning: () => {},
});

export function useInspectorContext(): InspectorContextValue {
  return useContext(InspectorContext);
}
