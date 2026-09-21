import { ApiError, friendlyApiError } from '@/lib/apiClient';

describe('ApiError', () => {
  it('메시지와 상태 코드를 저장한다', () => {
    const err = new ApiError('테스트 에러', 500);
    expect(err.message).toBe('테스트 에러');
    expect(err.status).toBe(500);
    expect(err.name).toBe('ApiError');
  });

  it('Error를 상속한다', () => {
    const err = new ApiError('테스트', 404);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('friendlyApiError', () => {
  it('ApiError는 메시지를 그대로 반환한다', () => {
    const err = new ApiError('커스텀 메시지', 400);
    expect(friendlyApiError(err, '기본')).toBe('커스텀 메시지');
  });

  it('일반 Error는 메시지를 반환한다', () => {
    expect(friendlyApiError(new Error('일반 에러'), '기본')).toBe('일반 에러');
  });

  it('문자열은 기본값을 반환한다 (Error가 아니므로)', () => {
    expect(friendlyApiError('문자열 에러', '기본')).toBe('기본');
  });

  it('알 수 없는 타입은 기본값을 반환한다', () => {
    expect(friendlyApiError(42, '기본값')).toBe('기본값');
    expect(friendlyApiError(null, '기본값')).toBe('기본값');
  });
});
