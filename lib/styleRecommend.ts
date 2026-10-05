import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { aiCachedCall } from '@/lib/aiCache';
import { safeFetch } from '@/lib/apiClient';

export interface StyleRecommendation {
  cardStyle: 'bold' | 'magazine' | 'feed' | 'minimal';
  musicMood: 'upbeat' | 'calm' | 'emotional' | 'none';
  motionPreset: 'kenburns' | 'zoom-in' | 'zoom-out' | 'slide-in' | 'slow-motion';
  format: 'vertical' | 'horizontal';
  duration: number;
  durationReason: string;
  hybridMode: 'off' | 'photo-to-comic';
  reason: string;
  alternatives: { label: string; cardStyle: string; reason: string }[];
}

const RECOMMEND_FUNCTION_URL = `${supabaseUrl}/functions/v1/recommend-style`;

export async function fetchStyleRecommendation(params: {
  productName: string;
  productCategory: string;
  accentColor?: string;
  hook?: string;
  oneLiner?: string;
  platform?: string;
}): Promise<StyleRecommendation> {
  const { data } = await aiCachedCall<StyleRecommendation>(
    'recommend-style',
    {
      productCategory: params.productCategory,
      productName: params.productName,
      hook: params.hook || '',
      oneLiner: params.oneLiner || '',
      platform: params.platform || '',
    },
    async () => {
      try {
        const response = await safeFetch(RECOMMEND_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify(params),
          timeoutMs: 115000,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'AI 스타일 추천 서버 오류가 발생했습니다.' }));
          throw new Error(errData.error || `AI 스타일 추천 실패 (${response.status})`);
        }

        const data = await response.json().catch(() => { throw new Error('AI 스타일 추천 응답을 파싱하지 못했습니다.'); });
        if (data.error) throw new Error(data.error);

        return data as StyleRecommendation;
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || /abort|timeout/i.test(err.message))) {
          throw new Error('AI 스타일 추천 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
        }
        throw err;
      }
    },
    'recommend-style',
  );
  return data;
}
