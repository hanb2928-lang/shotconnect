/**
 * Tests for payload byte guard.
 * Verifies UTF-8 byte-safe truncation and per-platform byte limits.
 */

import {
  truncateToUtf8Bytes,
  utf8ByteLength,
  applyByteGuard,
  guardPayloadBytes,
  getPlatformByteLimit,
} from '@/lib/payloadByteGuard';
import type { UploadPlatformKey } from '@/lib/platformUpload';

describe('utf8ByteLength', () => {
  it('counts ASCII as 1 byte per character', () => {
    expect(utf8ByteLength('hello')).toBe(5);
  });

  it('counts Korean as 3 bytes per character', () => {
    expect(utf8ByteLength('안녕')).toBe(6);
  });

  it('counts emoji as 4 bytes', () => {
    expect(utf8ByteLength('👍')).toBe(4);
  });

  it('handles mixed content correctly', () => {
    expect(utf8ByteLength('hi안👍')).toBe(2 + 3 + 4);
  });

  it('returns 0 for empty string', () => {
    expect(utf8ByteLength('')).toBe(0);
  });
});

describe('truncateToUtf8Bytes', () => {
  it('returns the string unchanged when within byte limit', () => {
    expect(truncateToUtf8Bytes('hello', 100)).toBe('hello');
  });

  it('truncates ASCII at byte boundary', () => {
    expect(truncateToUtf8Bytes('hello world', 5)).toBe('hello');
  });

  it('truncates Korean without splitting a character', () => {
    const korean = '안녕하세요';
    const result = truncateToUtf8Bytes(korean, 6);
    expect(utf8ByteLength(result)).toBeLessThanOrEqual(6);
    expect(result).toBe('안녕');
  });

  it('truncates mixed content at character boundary', () => {
    const mixed = 'hi안녕하세요';
    const result = truncateToUtf8Bytes(mixed, 8);
    expect(utf8ByteLength(result)).toBeLessThanOrEqual(8);
    expect(result).toBe('hi안녕');
  });

  it('does not split emoji (4-byte surrogate pair)', () => {
    const emoji = 'a👍b';
    const result = truncateToUtf8Bytes(emoji, 2);
    expect(utf8ByteLength(result)).toBeLessThanOrEqual(2);
    expect(result).toBe('a');
  });

  it('keeps emoji when byte limit allows it', () => {
    const emoji = 'a👍b';
    const result = truncateToUtf8Bytes(emoji, 5);
    expect(result).toBe('a👍');
  });

  it('handles empty string', () => {
    expect(truncateToUtf8Bytes('', 100)).toBe('');
  });

  it('handles zero max bytes', () => {
    expect(truncateToUtf8Bytes('hello', 0)).toBe('');
  });

  it('truncates long Korean text correctly', () => {
    const text = '안'.repeat(100);
    const result = truncateToUtf8Bytes(text, 30);
    expect(utf8ByteLength(result)).toBeLessThanOrEqual(30);
    expect(result.length).toBe(10);
  });

  it('truncates URL-encoded Korean (9 bytes per char when encoded)', () => {
    const text = '안녕하세요쿠팡파트너스제휴마케팅광고';
    const result = truncateToUtf8Bytes(text, 15);
    expect(utf8ByteLength(result)).toBeLessThanOrEqual(15);
    expect(result).toBe('안녕하세요');
  });
});

describe('getPlatformByteLimit', () => {
  it('returns byte limits for each platform', () => {
    const platforms: UploadPlatformKey[] = [
      'instagram', 'blog', 'tiktok', 'youtube', 'twitter', 'pinterest', 'naver_clip',
    ];
    for (const p of platforms) {
      const limits = getPlatformByteLimit(p);
      expect(limits.titleMaxBytes).toBeGreaterThan(0);
      expect(limits.bodyMaxBytes).toBeGreaterThan(0);
      expect(limits.fullTextMaxBytes).toBeGreaterThan(0);
      expect(limits.commentMaxBytes).toBeGreaterThan(0);
    }
  });

  it('twitter has the smallest byte budget', () => {
    const twitter = getPlatformByteLimit('twitter');
    const blog = getPlatformByteLimit('blog');
    expect(twitter.fullTextMaxBytes).toBeLessThan(blog.fullTextMaxBytes);
  });
});

describe('applyByteGuard', () => {
  it('truncates all caption fields to platform byte limits', () => {
    const longText = '안'.repeat(500);
    const result = applyByteGuard('twitter', {
      title: longText,
      body: longText,
      fullText: longText,
      commentText: longText,
    });

    expect(utf8ByteLength(result.title)).toBeLessThanOrEqual(840);
    expect(utf8ByteLength(result.body)).toBeLessThanOrEqual(840);
    expect(utf8ByteLength(result.fullText)).toBeLessThanOrEqual(840);
    expect(utf8ByteLength(result.commentText)).toBeLessThanOrEqual(840);
  });

  it('preserves text within byte limits', () => {
    const result = applyByteGuard('tiktok', {
      title: 'Short title',
      body: 'Short body',
      fullText: 'Short full text',
      commentText: 'Short comment',
    });

    expect(result.title).toBe('Short title');
    expect(result.body).toBe('Short body');
    expect(result.fullText).toBe('Short full text');
    expect(result.commentText).toBe('Short comment');
  });

  it('truncates Korean text for tiktok title (300 byte limit)', () => {
    const koreanTitle = '안'.repeat(200);
    const result = applyByteGuard('tiktok', {
      title: koreanTitle,
      body: '',
      fullText: '',
      commentText: '',
    });

    expect(utf8ByteLength(result.title)).toBeLessThanOrEqual(300);
    expect(result.title.length).toBe(100);
  });
});

describe('guardPayloadBytes', () => {
  it('truncates to specified byte limit', () => {
    const text = '안녕하세요';
    const result = guardPayloadBytes(text, 9);
    expect(utf8ByteLength(result)).toBeLessThanOrEqual(9);
    expect(result).toBe('안녕하');
  });

  it('returns unchanged when within limit', () => {
    expect(guardPayloadBytes('hello', 100)).toBe('hello');
  });

  it('handles empty string', () => {
    expect(guardPayloadBytes('', 100)).toBe('');
  });
});

describe('applyByteGuard integration with buildPlatformCaption', () => {
  it('produces byte-safe captions when called through buildPlatformCaption', () => {
    const { buildPlatformCaption } = require('@/lib/platformUpload');
    const longKorean = '안'.repeat(500);
    const result = buildPlatformCaption(
      'twitter',
      longKorean,
      'https://example.com/short',
      ['twitter'],
      true,
    );

    const { utf8ByteLength: ubl } = require('@/lib/payloadByteGuard');
    expect(ubl(result.title)).toBeLessThanOrEqual(840);
    expect(ubl(result.fullText)).toBeLessThanOrEqual(840);
  });
});
