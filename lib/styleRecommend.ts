import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { aiCachedCall } from '@/lib/aiCache';

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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 115000);

      try {
        const response = await fetch(RECOMMEND_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseAnonKey}`,
            apikey: supabaseAnonKey,
          },
          signal: controller.signal,
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'AI 스타일 추천 서버 오류가 발생했습니다.' }));
          throw new Error(errData.error || `AI 스타일 추천 실패 (${response.status})`);
        }

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        return data as StyleRecommendation;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('AI 스타일 추천 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    },
    'recommend-style',
  );
  return data;
}
