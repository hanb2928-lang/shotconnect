import { fetchStyleRecommendation, type StyleRecommendation } from '@/lib/styleRecommend';
import { resolveHybridTemplate, type HybridTemplateResult } from '@/lib/hybridTemplate';
import { getTtsVoiceByKey, type VoiceCategory, type TtsVoice } from '@/lib/ttsVoices';

export interface AiRecommendBundle {
  style: StyleRecommendation;
  template: HybridTemplateResult;
  voice: TtsVoice;
  templateLabel: string;
  summary: string;
}

function pickVoiceCategory(style: StyleRecommendation, category: string): VoiceCategory {
  const cat = (category || '').toLowerCase();
  if (style.cardStyle === 'bold') return 'trendy_hype';
  if (style.cardStyle === 'magazine') return 'calm_documentarian';
  if (style.musicMood === 'calm' || style.musicMood === 'emotional') return 'emotional';
  if (cat.includes('beauty') || cat.includes('fashion') || cat.includes('뷰티') || cat.includes('패션')) return 'trendy_beauty';
  if (cat.includes('tech') || cat.includes('electronic') || cat.includes('전자') || cat.includes('가전')) return 'analytical_tech';
  if (cat.includes('운동') || cat.includes('헬스') || cat.includes('아웃도어') || cat.includes('fitness')) return 'energetic_leader';
  if (cat.includes('할인') || cat.includes('공구') || cat.includes('가성비')) return 'high_energy';
  return 'trendy_beauty';
}

function mapStyleToTemplateLabel(style: StyleRecommendation): string {
  if (style.hybridMode === 'photo-to-comic') return '웹툰형 만화';
  if (style.format === 'horizontal') return '카드뉴스';
  return '숏폼 영상';
}

export async function fetchAiRecommendBundle(params: {
  productName: string;
  productCategory: string;
  accentColor?: string;
  hook?: string;
  oneLiner?: string;
  platform?: string;
  fallbackHashtags?: string[];
}): Promise<AiRecommendBundle> {
  const [style, template] = await Promise.all([
    fetchStyleRecommendation({
      productName: params.productName,
      productCategory: params.productCategory,
      accentColor: params.accentColor,
      hook: params.hook,
      oneLiner: params.oneLiner,
      platform: params.platform,
    }),
    resolveHybridTemplate({
      category: params.productCategory,
      platform: params.platform,
      productName: params.productName,
      fallbackHook: params.hook,
      fallbackHashtags: params.fallbackHashtags,
      fallbackAccentColor: params.accentColor,
    }),
  ]);

  const voiceCategory = pickVoiceCategory(style, params.productCategory);
  const voices: Record<VoiceCategory, string> = {
    trendy_beauty: 'f1_trendy_beauty',
    professional: 'f2_professional',
    emotional: 'f3_emotional',
    high_energy: 'f4_high_energy',
    chic_smart: 'f5_chic_smart',
    friendly_casual: 'f6_friendly_casual',
    authoritative: 'm1_authoritative',
    trendy_hype: 'm2_trendy_hype',
    calm_documentarian: 'm3_calm_documentarian',
    analytical_tech: 'm4_analytical_tech',
    witty_casual: 'm5_witty_casual',
    energetic_leader: 'm6_energetic_leader',
  };
  const voice = getTtsVoiceByKey(voices[voiceCategory])!;

  const templateLabel = mapStyleToTemplateLabel(style);
  const summary = `${templateLabel} · ${style.cardStyle} 스타일 · ${style.musicMood} BGM · ${voice.label} 내레이션 · ${style.duration}초`;

  return { style, template, voice, templateLabel, summary };
}
