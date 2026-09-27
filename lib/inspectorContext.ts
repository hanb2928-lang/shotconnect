import { createContext, useContext } from 'react';
import type { BoundAffiliateLink } from '@/components/InspectorPanel';

export interface InspectorContextValue {
  boundLinks: BoundAffiliateLink[];
  selectedCutId: string | null;
  setSelectedCutId: (id: string | null) => void;
}

export const InspectorContext = createContext<InspectorContextValue>({
  boundLinks: [],
  selectedCutId: null,
  setSelectedCutId: () => {},
});

export function useInspectorContext(): InspectorContextValue {
  return useContext(InspectorContext);
}
