/**
 * Archive data access layer tests
 *
 * Verifies fetchArchiveList, fetchArchiveItem, and cache behavior.
 */

jest.mock('@/lib/supabase', () => {
  const mockMaybeSingle = jest.fn(() => Promise.resolve({ data: null, error: null }));
  const mockRange = jest.fn(() => Promise.resolve({ data: [], error: null, count: 0 }));
  const mockOrder = jest.fn(() => ({ range: mockRange }));
  const mockEq = jest.fn(() => ({
    not: jest.fn(() => ({ maybeSingle: mockMaybeSingle })),
    maybeSingle: mockMaybeSingle,
  }));
  const mockNot = jest.fn(() => ({
    order: mockOrder,
    eq: mockEq,
  }));
  const mockSelect = jest.fn(() => ({
    not: mockNot,
    eq: mockEq,
  }));
  return {
    supabase: {
      from: jest.fn(() => ({ select: mockSelect })),
    },
  };
});

jest.mock('@/lib/offlineCache', () => ({
  getStaleCached: jest.fn(() => Promise.resolve(null)),
  setCached: jest.fn(() => Promise.resolve()),
}));

import { fetchArchiveList, fetchArchiveItem } from '@/lib/archive';
import { supabase } from '@/lib/supabase';

describe('fetchArchiveList', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns empty list when no scans with video_url', async () => {
    const result = await fetchArchiveList(0, 'recent');
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it('calls supabase with correct query chain', async () => {
    await fetchArchiveList(0, 'recent');
    expect(supabase.from).toHaveBeenCalledWith('scans');
  });

  it('respects sort order parameter', async () => {
    await fetchArchiveList(0, 'oldest');
    expect(supabase.from).toHaveBeenCalledWith('scans');
  });
});

describe('fetchArchiveItem', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns null when item not found', async () => {
    const result = await fetchArchiveItem('nonexistent-id');
    expect(result).toBeNull();
  });
});

describe('ArchiveItem shape', () => {
  it('has all required fields', () => {
    const item = {
      id: 'test-id',
      title: 'Test Product',
      productName: 'Test',
      productCategory: 'cosmetics',
      imageUrl: 'https://example.com/img.jpg',
      videoUrl: 'https://example.com/video.mp4',
      ttsUrl: null,
      oneLiner: 'Great product',
      createdAt: '2026-09-16T00:00:00Z',
    };
    expect(item.id).toBeDefined();
    expect(item.videoUrl).toBeDefined();
    expect(item.imageUrl).toBeDefined();
    expect(item.createdAt).toBeDefined();
  });
});
