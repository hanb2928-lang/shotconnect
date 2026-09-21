import { supabase } from '@/lib/supabase';
import { getUserSettings } from '@/lib/settings';

export type TonePreset = 'honest' | 'humor' | 'emotional' | 'expert' | 'casual';

export interface CreatorPersona {
  id: string;
  signature_opening: string | null;
  signature_ending: string | null;
  tone_preset: TonePreset;
  voice_clone_ref: string | null;
  signature_font: string | null;
  signature_color: string | null;
  caricature_url: string | null;
  created_at: string;
  updated_at: string;
}

export const TONE_PRESETS: Record<TonePreset, { label: string; emoji: string; description: string }> = {
  honest: { label: '솔직/비판적 리뷰', emoji: '🔥', description: '장단점 비교, 솔직한 비판' },
  humor: { label: '팩트 폭격 유머', emoji: '⚡', description: '위트 있고 재미있는 팩트 전달' },
  emotional: { label: '감성 자취 브이로그', emoji: '🌿', description: '따뜻하고 감성적인 일상 톤' },
  expert: { label: '전문가 분석', emoji: '📊', description: '데이터 기반 전문적인 리뷰' },
  casual: { label: '친근한 일상 톤', emoji: '💬', description: '편안한 친구 같은 말투' },
};

export async function getOrCreatePersona(): Promise<CreatorPersona | null> {
  try {
    const { data: existing } = await supabase
      .from('creator_persona')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return existing as CreatorPersona;

    const { data, error } = await supabase
      .from('creator_persona')
      .insert({ tone_preset: 'casual' })
      .select()
      .single();

    if (error || !data) return null;
    return data as CreatorPersona;
  } catch {
    return null;
  }
}

export async function updatePersona(
  id: string,
  updates: Partial<Omit<CreatorPersona, 'id' | 'created_at' | 'updated_at'>>,
): Promise<CreatorPersona | null> {
  try {
    const { data, error } = await supabase
      .from('creator_persona')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return null;
    return data as CreatorPersona;
  } catch {
    return null;
  }
}

/**
 * Build a persona directive string to inject into AI copy/review prompts.
 * This extends the existing brand_persona field with structured persona data.
 */
export function buildPersonaDirective(persona: CreatorPersona | null): string {
  if (!persona) return '';

  const parts: string[] = [];

  if (persona.signature_opening) {
    parts.push(`시그니처 오프닝: "${persona.signature_opening}" — 모든 카피의 첫 줄에 이 문구를 자연스럽게 통합하세요.`);
  }

  if (persona.signature_ending) {
    parts.push(`시그니처 엔딩: "${persona.signature_ending}" — 카피 마지막에 이 인사말을 자연스럽게 추가하세요.`);
  }

  const tone = TONE_PRESETS[persona.tone_preset];
  if (tone) {
    parts.push(`톤앤매너: ${tone.label} — ${tone.description}`);
  }

  if (persona.signature_color) {
    parts.push(`대표 컬러: ${persona.signature_color}`);
  }

  return parts.join('\n');
}

/**
 * Merge persona directive with existing brand_persona setting.
 */
export async function getCombinedPersonaDirective(): Promise<string | null> {
  const [persona, settings] = await Promise.all([
    getOrCreatePersona(),
    getUserSettings(),
  ]);

  const directive = buildPersonaDirective(persona);
  const brand = settings?.brand_persona;

  if (directive && brand) {
    return `${brand}\n\n${directive}`;
  }
  if (directive) return directive;
  if (brand) return brand;
  return null;
}
