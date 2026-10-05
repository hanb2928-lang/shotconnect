import { ApiError } from '@/lib/apiClient';

export function friendlyError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (err instanceof ApiError) return err.message;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  // Always log the raw error so the actual cause (status code, server
  // response, stack trace) is never lost behind a friendly message.
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[friendlyError] raw error:', err instanceof Error ? err.stack || err.message : String(err));
  }

  // Extract HTTP status code if present, to append to the friendly message.
  const statusMatch = msg.match(/\b(\d{3})\b/);
  const statusCode = statusMatch && parseInt(statusMatch[1], 10);
  const hasStatus = statusCode && statusCode >= 400 && statusCode < 600;
  const suffix = hasStatus ? ` (오류 코드: ${statusCode})` : '';

  if (lower.includes('network') || lower.includes('failed to fetch') || (lower.includes('fetch') && lower.includes('error'))) {
    return `인터넷 연결을 확인해주세요. 네트워크가 일시적으로 불안정합니다.${suffix}`;
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('시간 초과')) {
    return `요청 시간이 초과되었습니다. 네트워크 상태를 확인하고 잠시 후 다시 시도해 주세요.${suffix}`;
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('api key')) {
    return `AI 분석 서비스 인증에 실패했습니다. 설정에서 API 키를 확인해주세요.${suffix}`;
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return `요청이 너무 많습니다. 잠시 후 다시 시도해주세요.${suffix}`;
  }
  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('server')) {
    return `서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.${suffix}`;
  }
  if (lower.includes('413') || lower.includes('payload too large') || lower.includes('entity too large')) {
    return `이미지 크기가 서버 허용 한도를 초과했습니다. 더 작은 이미지로 다시 시도해주세요.${suffix}`;
  }
  if (lower.includes('403') || lower.includes('forbidden')) {
    return `접근 권한이 거부되었습니다. 스토리지 설정을 확인해주세요.${suffix}`;
  }
  if (lower.includes('409') || lower.includes('conflict')) {
    return `이미 존재하는 파일입니다. 다시 시도해주세요.${suffix}`;
  }
  if (lower.includes('tls') || lower.includes('ssl') || lower.includes('certificate') || lower.includes('handshake') || lower.includes('secure connection')) {
    return `보안 연결에 실패했습니다. Wi-Fi 환경을 변경하거나 VPN/프록시 설정을 확인해 주세요.${suffix}`;
  }
  if (lower.includes('만료') || lower.includes('expired') || lower.includes('삭제되') || lower.includes('not found') || lower.includes('찾을 수 없')) {
    return `촬영된 이미지가 만료되었거나 삭제되었습니다. 다시 촬영해주세요.${suffix}`;
  }
  if (lower.includes('upload') || lower.includes('storage')) {
    return `이미지 업로드에 실패했습니다. 네트워크 연결을 확인 후 다시 시도해주세요.${suffix}`;
  }
  if (lower.includes('capture') || lower.includes('camera')) {
    return `사진 촬영에 실패했습니다. 카메라를 다시 시도해주세요.${suffix}`;
  }
  if (lower.includes('notallowed') || lower.includes('not-allowed') || lower.includes('permission')) {
    return `카메라 또는 파일 접근 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.${suffix}`;
  }
  if (lower.includes('notreadable') || lower.includes('not-readable')) {
    return `이미지를 읽을 수 없습니다. 다른 사진으로 시도해주세요.${suffix}`;
  }

  // If we couldn't match any pattern but the error has a status code,
  // include it so the user (and support) has something actionable.
  if (hasStatus) return `${fallback}${suffix}`;
  return fallback;
}
