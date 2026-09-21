import { ApiError } from '@/lib/apiClient';
import { friendlyError } from '@/lib/errors';

describe('friendlyError', () => {
  it('null/undefined 에러는 기본 메시지를 반환한다', () => {
    expect(friendlyError(null, '기본 메시지')).toBe('기본 메시지');
    expect(friendlyError(undefined, '기본 메시지')).toBe('기본 메시지');
  });

  it('ApiError 인스턴스는 해당 메시지를 반환한다', () => {
    const err = new ApiError('인증이 만료되었습니다.', 401);
    expect(friendlyError(err, '기본')).toBe('인증이 만료되었습니다.');
  });

  it('네트워크 에러 메시지를 친절하게 변환한다', () => {
    expect(friendlyError(new Error('Failed to fetch'), '기본')).toContain('인터넷 연결');
    expect(friendlyError(new Error('network error'), '기본')).toContain('인터넷 연결');
  });

  it('타임아웃 에러를 변환한다', () => {
    expect(friendlyError(new Error('Request timed out'), '기본')).toContain('시간이 초과');
    expect(friendlyError(new Error('timeout occurred'), '기본')).toContain('시간이 초과');
  });

  it('401 인증 에러를 변환한다', () => {
    expect(friendlyError(new Error('401 Unauthorized'), '기본')).toContain('API 키');
    expect(friendlyError(new Error('Unauthorized access'), '기본')).toContain('API 키');
  });

  it('429 rate limit 에러를 변환한다', () => {
    expect(friendlyError(new Error('429 Too Many Requests'), '기본')).toContain('요청이 너무 많');
    expect(friendlyError(new Error('rate limit exceeded'), '기본')).toContain('요청이 너무 많');
    expect(friendlyError(new Error('quota exceeded'), '기본')).toContain('요청이 너무 많');
  });

  it('5xx 서버 에러를 변환한다', () => {
    expect(friendlyError(new Error('500 Internal Server Error'), '기본')).toContain('서버에');
    expect(friendlyError(new Error('502 Bad Gateway'), '기본')).toContain('서버에');
    expect(friendlyError(new Error('503 Service Unavailable'), '기본')).toContain('서버에');
  });

  it('업로드 에러를 변환한다', () => {
    expect(friendlyError(new Error('upload failed'), '기본')).toContain('업로드');
  });

  it('카메라 에러를 변환한다', () => {
    expect(friendlyError(new Error('camera capture failed'), '기본')).toContain('사진 촬영');
  });

  it('권한 거부 에러를 변환한다', () => {
    expect(friendlyError(new Error('NotAllowedError'), '기본')).toContain('권한');
    expect(friendlyError(new Error('Permission denied'), '기본')).toContain('권한');
  });

  it('매칭되지 않는 에러는 기본 메시지를 반환한다', () => {
    expect(friendlyError(new Error('something weird'), '기본 메시지')).toBe('기본 메시지');
  });

  it('문자열 에러도 처리한다', () => {
    expect(friendlyError('timeout', '기본')).toContain('시간이 초과');
  });
});
