// Test the orphan recovery helper functions: rememberActiveScan, forgetActiveScan
// and the localStorage-backed scan tracking that powers the recovery flow.
// The hook itself depends on AppState + Supabase so we test the pure helpers.

// Mock localStorage for Node environment
const mockStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string): string | null => mockStore[key] ?? null,
  setItem: (key: string, value: string): void => { mockStore[key] = value; },
  removeItem: (key: string): void => { delete mockStore[key]; },
  clear: (): void => { for (const k of Object.keys(mockStore)) delete mockStore[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

import { rememberActiveScan, forgetActiveScan } from '@/hooks/useOrphanJobRecovery';

describe('orphan job recovery helpers', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('rememberActiveScan stores scan ID and timestamp', () => {
    rememberActiveScan('scan-123');
    expect(localStorageMock.getItem('last_active_scan_id')).toBe('scan-123');
    expect(localStorageMock.getItem('last_active_scan_at')).not.toBeNull();
  });

  it('forgetActiveScan removes stored scan ID and timestamp', () => {
    rememberActiveScan('scan-456');
    expect(localStorageMock.getItem('last_active_scan_id')).toBe('scan-456');
    forgetActiveScan();
    expect(localStorageMock.getItem('last_active_scan_id')).toBeNull();
    expect(localStorageMock.getItem('last_active_scan_at')).toBeNull();
  });

  it('rememberActiveScan overwrites previous scan ID', () => {
    rememberActiveScan('scan-A');
    rememberActiveScan('scan-B');
    expect(localStorageMock.getItem('last_active_scan_id')).toBe('scan-B');
  });

  it('forgetActiveScan is safe to call when nothing is stored', () => {
    expect(() => forgetActiveScan()).not.toThrow();
  });
});
