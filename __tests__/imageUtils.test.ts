import { getThumbnailUrl } from '@/lib/imageUtils';

// Mock react-native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock supabase to provide supabaseUrl
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
}));

describe('getThumbnailUrl', () => {
  it('appends resize params to Supabase Storage public URLs', () => {
    const url = 'https://test.supabase.co/storage/v1/object/public/scans/photo-123.webp';
    const result = getThumbnailUrl(url, 200);
    expect(result).toContain('width=200');
    expect(result).toContain('resize=cover');
    expect(result).toContain('quality=60');
  });

  it('appends compress params to Pexels image URLs', () => {
    const url = 'https://images.pexels.com/photos/12345/freephoto.jpg';
    const result = getThumbnailUrl(url, 200);
    expect(result).toContain('auto=compress');
    expect(result).toContain('w=200');
  });

  it('returns base64 data URLs unchanged', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ';
    const result = getThumbnailUrl(dataUrl, 200);
    expect(result).toBe(dataUrl);
  });

  it('returns empty string unchanged', () => {
    expect(getThumbnailUrl('', 200)).toBe('');
  });

  it('returns unknown URLs unchanged', () => {
    const url = 'https://example.com/image.png';
    expect(getThumbnailUrl(url, 200)).toBe(url);
  });
});
