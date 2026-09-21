import { ApiError } from '@/lib/apiClient';

export function friendlyError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (err instanceof ApiError) return err.message;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes('network') || lower.includes('failed to fetch') || (lower.includes('fetch') && lower.includes('error'))) {
    return '인터넷 연결을 확인해주세요. 네트워크가 일시적으로 불안정합니다.';
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('시간 초과')) {
    return '요청 시간이 초과되었습니다. 네트워크 상태를 확인하고 잠시 후 다시 시도해 주세요.';
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('api key')) {
    return 'AI 분석 서비스 인증에 실패했습니다. 설정에서 API 키를 확인해주세요.';
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  }
  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('server')) {
    return '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }
  if (lower.includes('upload') || lower.includes('storage')) {
    return '이미지 업로드에 실패했습니다. 네트워크 연결을 확인해주세요.';
  }
  if (lower.includes('capture') || lower.includes('camera')) {
    return '사진 촬영에 실패했습니다. 카메라를 다시 시도해주세요.';
  }
  if (lower.includes('notallowed') || lower.includes('not-allowed') || lower.includes('permission')) {
    return '카메라 또는 파일 접근 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.';
  }
  if (lower.includes('notreadable') || lower.includes('not-readable')) {
    return '이미지를 읽을 수 없습니다. 다른 사진으로 시도해주세요.';
  }

  return fallback;
}
