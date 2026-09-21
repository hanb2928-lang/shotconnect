import {
  cleanBase64,
  getMimeTypeFromDataUrl,
  buildDataUrl,
  base64ToUint8Array,
} from '@/lib/base64';

describe('cleanBase64', () => {
  it('data URL 접두사를 제거한다', () => {
    expect(cleanBase64('data:image/jpeg;base64,abc123')).toBe('abc123');
    expect(cleanBase64('data:image/png;base64,/9j/4AAQ')).toBe('/9j/4AAQ');
  });

  it('공백을 제거한다', () => {
    expect(cleanBase64('  abc 123 \n')).toBe('abc123');
  });

  it('빈 문자열은 빈 문자열을 반환한다', () => {
    expect(cleanBase64('')).toBe('');
  });

  it('이미 접두사가 없으면 그대로 반환한다', () => {
    expect(cleanBase64('abc123')).toBe('abc123');
  });
});

describe('getMimeTypeFromDataUrl', () => {
  it('JPEG 마임 타입을 추출한다', () => {
    expect(getMimeTypeFromDataUrl('data:image/jpeg;base64,abc')).toBe('image/jpeg');
  });

  it('PNG 마임 타입을 추출한다', () => {
    expect(getMimeTypeFromDataUrl('data:image/png;base64,abc')).toBe('image/png');
  });

  it('WebP 마임 타입을 추출한다', () => {
    expect(getMimeTypeFromDataUrl('data:image/webp;base64,abc')).toBe('image/webp');
  });

  it('매칭되지 않으면 기본값 image/png를 반환한다', () => {
    expect(getMimeTypeFromDataUrl('data:application/pdf;base64,abc')).toBe('image/png');
    expect(getMimeTypeFromDataUrl('')).toBe('image/png');
  });
});

describe('buildDataUrl', () => {
  it('base64 문자열을 data URL로 변환한다', () => {
    expect(buildDataUrl('abc123', 'image/jpeg')).toBe('data:image/jpeg;base64,abc123');
  });

  it('입력에 data URL 접두사가 있어도 정상 동작한다', () => {
    expect(buildDataUrl('data:image/png;base64,abc123', 'image/jpeg')).toBe(
      'data:image/jpeg;base64,abc123',
    );
  });

  it('빈 문자열을 처리한다', () => {
    expect(buildDataUrl('', 'image/jpeg')).toBe('data:image/jpeg;base64,');
  });
});

describe('base64ToUint8Array', () => {
  it('base64 문자열을 Uint8Array로 변환한다', () => {
    // "Hello" in base64 = SGVsbG8=
    const result = base64ToUint8Array('SGVsbG8=');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(5);
    expect(String.fromCharCode(...result)).toBe('Hello');
  });

  it('빈 base64 문자열은 빈 Uint8Array를 반환한다', () => {
    const result = base64ToUint8Array('');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });

  it('data URL 접두사가 있는 문자열을 처리한다', () => {
    const result = base64ToUint8Array('data:image/jpeg;base64,SGVsbG8=');
    expect(result.length).toBe(5);
    expect(String.fromCharCode(...result)).toBe('Hello');
  });

  it('패딩이 없는 base64도 처리한다', () => {
    // "Wor" in base64 = V29y (no padding)
    const result = base64ToUint8Array('V29y');
    expect(result.length).toBe(3);
    expect(String.fromCharCode(...result)).toBe('Wor');
  });
});
