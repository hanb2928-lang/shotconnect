import { supabase } from '@/lib/supabase';

export interface OriginalityFactors {
  hasPersonaSignature: boolean;
  hasCustomTone: boolean;
  hasVoiceClone: boolean;
  hasMicroEdit: boolean;
  hasUniqueAngle: boolean;
  cacheHitCount: number;
}

export interface OriginalityResult {
  score: number;
  level: 'danger' | 'caution' | 'good' | 'unique';
  message: string;
  suggestions: string[];
}

/**
 * Calculate an originality score (0-100) based on how much
 * the current content differs from cookie-cutter AI output.
 *
 * - No persona, no micro-edit, high cache hits → low score (cookie-cutter)
 * - Persona signature + custom tone + micro-edit → high score (unique)
 */
export function calculateOriginalityScore(factors: OriginalityFactors): OriginalityResult {
  let score = 30; // Base: pure AI default
  const suggestions: string[] = [];

  if (factors.hasPersonaSignature) {
    score += 20;
  } else {
    suggestions.push('마이 페르소나에 시그니처 오프닝을 등록하면 +20점');
  }

  if (factors.hasCustomTone) {
    score += 15;
  } else {
    suggestions.push('톤앤매너를 내 스타일로 설정하면 +15점');
  }

  if (factors.hasVoiceClone) {
    score += 15;
  } else {
    suggestions.push('내 목소리 클론을 적용하면 +15점');
  }

  if (factors.hasMicroEdit) {
    score += 10;
  } else {
    suggestions.push('나만의 사용 후기 1줄을 직접 적어 넣으면 +10점');
  }

  if (factors.hasUniqueAngle) {
    score += 10;
  } else {
    suggestions.push('Snap-Mix에서 다른 시각/무드를 선택하면 +10점');
  }

  // Penalize for high cache usage (many others used same content)
  if (factors.cacheHitCount > 100) {
    score -= 15;
    suggestions.push('이 스타일은 이번 주에 많이 사용됐습니다. 톤을 바꾸면 독창성이 올라갑니다!');
  } else if (factors.cacheHitCount > 50) {
    score -= 8;
    suggestions.push('이 스타일을 사용한 사람이 꽤 있습니다. 개성을 더해보세요.');
  } else if (factors.cacheHitCount > 20) {
    score -= 3;
  }

  score = Math.min(100, Math.max(0, score));

  let level: OriginalityResult['level'];
  let message: string;

  if (score >= 85) {
    level = 'unique';
    message = '독창성이 매우 높습니다! 크리에이터 개성이 뚜렷하게 드러납니다.';
  } else if (score >= 65) {
    level = 'good';
    message = '독창성이 양호합니다. 개성이 잘 반영되어 있어요.';
  } else if (score >= 45) {
    level = 'caution';
    message = '다른 크리에이터와 비슷한 톤입니다. 개성을 더 더해보세요.';
  } else {
    level = 'danger';
    message = '현재 스타일은 양산형 AI 콘텐츠와 유사합니다. 페르소나를 적용해보세요!';
  }

  return { score, level, message, suggestions: suggestions.slice(0, 3) };
}

/**
 * Fetch the cache hit count for a given content hash
 * to determine how many other creators used the same style.
 */
export async function getContentPopularity(cacheKey: string): Promise<number> {
  try {
    const { data } = await supabase
      .from('ai_content_cache')
      .select('hit_count')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    return data?.hit_count ?? 0;
  } catch {
    return 0;
  }
}
