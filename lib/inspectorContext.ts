import { createContext, useContext } from 'react';
import type { BoundAffiliateLink } from '@/components/InspectorPanel';
import type { ToonCharacter, ToonPersonaPreset } from '@/components/PhotoToonUpload';

export type InspectorMode = 'affiliate' | 'persona';

export interface InspectorContextValue {
  boundLinks: BoundAffiliateLink[];
  selectedCutId: string | null;
  setSelectedCutId: (id: string | null) => void;
  inspectorMode: InspectorMode;
  setInspectorMode: (mode: InspectorMode) => void;
  toonCharacter: ToonCharacter | null;
  setToonCharacter: (char: ToonCharacter | null) => void;
  selectedPresetId: string;
  setSelectedPresetId: (id: string) => void;
  toneLevel: number;
  setToneLevel: (level: number) => void;
}

export const InspectorContext = createContext<InspectorContextValue>({
  boundLinks: [],
  selectedCutId: null,
  setSelectedCutId: () => {},
  inspectorMode: 'affiliate',
  setInspectorMode: () => {},
  toonCharacter: null,
  setToonCharacter: () => {},
  selectedPresetId: 'veteran',
  setSelectedPresetId: () => {},
  toneLevel: 50,
  setToneLevel: () => {},
});

export function useInspectorContext(): InspectorContextValue {
  return useContext(InspectorContext);
}
