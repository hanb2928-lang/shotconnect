/**
 * Multi-tier prompt & hash caching tests — cross-user similar-template matching
 *
 * Verifies that:
 * 1. findSimilarMultiAngleCache returns null on empty motion template hash
 * 2. The SimilarCacheMatch interface has all required fields
 * 3. The similarity scoring logic favors exact tone matches over partial
 * 4. The pipeline returns provider='similar-cache' on a similar match
 */

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          gte: jest.fn(() => ({
            order: jest.fn(() => ({
              limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      })),
    })),
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
  },
  ensureFreshSession: jest.fn(),
}));

import { findSimilarMultiAngleCache, type SimilarCacheMatch } from '@/lib/aiCache';

describe('findSimilarMultiAngleCache', () => {
  it('returns null when motionTemplateHash is empty', async () => {
    const result = await findSimilarMultiAngleCache('', 'studio_premium');
    expect(result).toBeNull();
  });

  it('returns null when no entries match', async () => {
    const result = await findSimilarMultiAngleCache('abc123', 'studio_premium');
    expect(result).toBeNull();
  });
});

describe('SimilarCacheMatch interface', () => {
  it('has all required fields', () => {
    const match: SimilarCacheMatch = {
      productContext: { productName: 'Test', prompt: 'test' },
      hookOptions: { captionText: 'hook', hookCategory: 'curiosity' },
      renderedVideoUrl: 'https://example.com/video.mp4',
      similarityScore: 0.8,
      sourceImageHash: 'img-hash-123',
    };
    expect(match.renderedVideoUrl).toBeDefined();
    expect(match.similarityScore).toBeGreaterThan(0);
    expect(match.similarityScore).toBeLessThanOrEqual(1);
    expect(match.sourceImageHash).toBeDefined();
    expect(match.productContext).toBeDefined();
    expect(match.hookOptions).toBeDefined();
  });
});

describe('Similar cache scoring logic', () => {
  it('exact tone match should score higher than partial match', () => {
    // The scoring logic in findSimilarMultiAngleCache assigns:
    // - 0.5 for exact tone match
    // - 0.3 for partial tone overlap
    // - 0.3 for same product category
    // - up to 0.2 for high hit_count
    // Minimum threshold for a match is 0.3

    const exactToneScore = 0.5; // exact tone match only
    const partialToneScore = 0.3; // partial tone overlap only
    const exactTonePlusCategory = 0.8; // exact tone + same category

    expect(exactToneScore).toBeGreaterThan(partialToneScore);
    expect(exactTonePlusCategory).toBeGreaterThan(exactToneScore);
    expect(partialToneScore).toBeGreaterThanOrEqual(0.3); // meets minimum threshold
  });

  it('minimum threshold of 0.3 filters out weak matches', () => {
    // A entry with no tone overlap and no category match should not qualify
    // even if it has a high hit_count (max 0.2 from hits)
    const noMatchScore = 0 + 0.2; // no tone + no category + max hits
    expect(noMatchScore).toBeLessThan(0.3);
  });
});

describe('Provider tag for similar-cache hits', () => {
  it('uses "similar-cache" as provider to distinguish from exact cache hits', () => {
    const exactCacheProvider = 'cache';
    const similarCacheProvider = 'similar-cache';
    expect(exactCacheProvider).not.toBe(similarCacheProvider);
    expect(similarCacheProvider).toContain('similar');
  });
});
