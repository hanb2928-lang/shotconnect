// Test the orphan recovery helper functions: rememberActiveScan, forgetActiveScan
// and the storage-backed scan tracking that powers the recovery flow.
// The hook itself depends on AppState + Supabase so we test the pure helpers.

jest.mock('@/lib/storage', () => {
  const mockStore: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => { mockStore[key] = value; return Promise.resolve(); }),
    removeItem: jest.fn((key: string) => { delete mockStore[key]; return Promise.resolve(); }),
    getItemSync: jest.fn((key: string) => mockStore[key] ?? null),
    __mockStore: mockStore,
  };
});

jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
  ensureFreshSession: jest.fn(() => Promise.resolve()),
}));

import { rememberActiveScan, forgetActiveScan } from '@/hooks/useOrphanJobRecovery';
const { __mockStore } = require('@/lib/storage') as { __mockStore: Record<string, string> };

describe('orphan job recovery helpers', () => {
  beforeEach(() => {
    for (const k of Object.keys(__mockStore)) delete __mockStore[k];
    jest.clearAllMocks();
  });

  it('rememberActiveScan stores scan ID and timestamp', async () => {
    rememberActiveScan('scan-123');
    await new Promise((r) => setTimeout(r, 10));
    expect(__mockStore['last_active_scan_id']).toBe('scan-123');
    expect(__mockStore['last_active_scan_at']).not.toBeUndefined();
  });

  it('forgetActiveScan removes stored scan ID and timestamp', async () => {
    rememberActiveScan('scan-456');
    await new Promise((r) => setTimeout(r, 10));
    expect(__mockStore['last_active_scan_id']).toBe('scan-456');
    forgetActiveScan();
    await new Promise((r) => setTimeout(r, 10));
    expect(__mockStore['last_active_scan_id']).toBeUndefined();
    expect(__mockStore['last_active_scan_at']).toBeUndefined();
  });

  it('rememberActiveScan overwrites previous scan ID', async () => {
    rememberActiveScan('scan-A');
    await new Promise((r) => setTimeout(r, 10));
    rememberActiveScan('scan-B');
    await new Promise((r) => setTimeout(r, 10));
    expect(__mockStore['last_active_scan_id']).toBe('scan-B');
  });

  it('forgetActiveScan is safe to call when nothing is stored', () => {
    expect(() => forgetActiveScan()).not.toThrow();
  });
});
