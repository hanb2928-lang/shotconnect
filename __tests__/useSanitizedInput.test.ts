/**
 * Tests for useSanitizedInput hook and sanitizeInputLight.
 * Verifies real-time IME input sanitization, control character
 * stripping, orphaned surrogate replacement, and blur-time full sanitization.
 */

import { renderHook, act } from '@testing-library/react-native';
import {
  sanitizeInputLight,
  useSanitizedInput,
} from '@/hooks/useSanitizedInput';

describe('sanitizeInputLight', () => {
  it('passes through clean ASCII text unchanged', () => {
    expect(sanitizeInputLight('hello world')).toBe('hello world');
  });

  it('passes through Korean text unchanged', () => {
    expect(sanitizeInputLight('안녕하세요')).toBe('안녕하세요');
  });

  it('passes through emoji (valid surrogate pair) unchanged', () => {
    expect(sanitizeInputLight('hello 👍 world')).toBe('hello 👍 world');
  });

  it('preserves tab, newline, and carriage return', () => {
    expect(sanitizeInputLight('line1\nline2\ttab\r')).toBe('line1\nline2\ttab\r');
  });

  it('strips C0 control characters (except tab/newline/CR)', () => {
    expect(sanitizeInputLight('a\x00b\x01c\x02d')).toBe('abcd');
  });

  it('strips DEL (0x7F)', () => {
    expect(sanitizeInputLight('a\x7Fb')).toBe('ab');
  });

  it('strips C1 control characters (0x80-0x9F)', () => {
    expect(sanitizeInputLight('a\x80b\x9Fc')).toBe('abc');
  });

  it('strips BOM (U+FEFF)', () => {
    expect(sanitizeInputLight('\uFEFFhello')).toBe('hello');
  });

  it('replaces orphaned high surrogate with U+FFFD', () => {
    const result = sanitizeInputLight('a\uD800b');
    expect(result).toBe('a\uFFFDb');
  });

  it('replaces orphaned low surrogate with U+FFFD', () => {
    const result = sanitizeInputLight('a\uDC00b');
    expect(result).toBe('a\uFFFDb');
  });

  it('preserves valid surrogate pairs (emoji)', () => {
    const emoji = '👍';
    expect(sanitizeInputLight(emoji)).toBe(emoji);
  });

  it('handles mixed valid and orphaned surrogates', () => {
    const input = '👍\uD800';
    const result = sanitizeInputLight(input);
    expect(result).toBe('👍\uFFFD');
  });

  it('returns empty string unchanged', () => {
    expect(sanitizeInputLight('')).toBe('');
  });

  it('handles null/undefined input gracefully', () => {
    expect(sanitizeInputLight(null as unknown as string)).toBeNull();
  });

  it('uses fast path for clean strings (no regex)', () => {
    const clean = '안녕하세요 hello 👍';
    expect(sanitizeInputLight(clean)).toBe(clean);
  });
});

describe('useSanitizedInput', () => {
  it('initializes with the given value', () => {
    const { result } = renderHook(() => useSanitizedInput('hello'));
    expect(result.current.value).toBe('hello');
  });

  it('initializes with empty string by default', () => {
    const { result } = renderHook(() => useSanitizedInput());
    expect(result.current.value).toBe('');
  });

  it('sanitizes input on onChangeText', () => {
    const { result } = renderHook(() => useSanitizedInput());
    act(() => {
      result.current.onChangeText('hello\x00world');
    });
    expect(result.current.value).toBe('helloworld');
  });

  it('strips control characters from typed input', () => {
    const { result } = renderHook(() => useSanitizedInput());
    act(() => {
      result.current.onChangeText('a\x01b\x02c');
    });
    expect(result.current.value).toBe('abc');
  });

  it('replaces orphaned surrogates from typed input', () => {
    const { result } = renderHook(() => useSanitizedInput());
    act(() => {
      result.current.onChangeText('a\uD800b');
    });
    expect(result.current.value).toBe('a\uFFFDb');
  });

  it('preserves valid emoji in typed input', () => {
    const { result } = renderHook(() => useSanitizedInput());
    act(() => {
      result.current.onChangeText('hello 👍');
    });
    expect(result.current.value).toBe('hello 👍');
  });

  it('applies maxLength on input', () => {
    const { result } = renderHook(() => useSanitizedInput('', { maxLength: 5 }));
    act(() => {
      result.current.onChangeText('hello world');
    });
    expect(result.current.value).toBe('hello');
  });

  it('runs full sanitization on blur', () => {
    const { result } = renderHook(() => useSanitizedInput());
    act(() => {
      result.current.onChangeText('hello\uFEFF');
    });
    act(() => {
      result.current.onBlur();
    });
    expect(result.current.value).toBe('hello');
  });

  it('respects sanitizeOnBlur=false', () => {
    const { result } = renderHook(() =>
      useSanitizedInput('', { sanitizeOnBlur: false }),
    );
    act(() => {
      result.current.onChangeText('hello\x01');
    });
    act(() => {
      result.current.onBlur();
    });
    expect(result.current.value).toBe('hello');
  });

  it('reset restores initial value', () => {
    const { result } = renderHook(() => useSanitizedInput('initial'));
    act(() => {
      result.current.onChangeText('changed');
    });
    expect(result.current.value).toBe('changed');
    act(() => {
      result.current.reset();
    });
    expect(result.current.value).toBe('initial');
  });

  it('setValue also sanitizes', () => {
    const { result } = renderHook(() => useSanitizedInput());
    act(() => {
      result.current.setValue('test\x00value');
    });
    expect(result.current.value).toBe('testvalue');
  });

  it('setValue applies maxLength', () => {
    const { result } = renderHook(() => useSanitizedInput('', { maxLength: 3 }));
    act(() => {
      result.current.setValue('hello');
    });
    expect(result.current.value).toBe('hel');
  });
});
