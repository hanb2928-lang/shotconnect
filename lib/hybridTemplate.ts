import type { TemplateRegistryEntry, CardStyleKey, PlatformKey } from '@/types/database';
import {
  getTemplate,
  getTemplateSync,
  getCachedTemplates,
  preloadTemplates,
  applyTemplateToCardStyle,
  applyTemplateToAccentColor,
  buildHookFromTemplate,
  buildHashtagsFromTemplate,
  canonicalizeCategory,
  canonicalizePlatform,
} from '@/lib/templateRegistry';

export interface HybridTemplateParams {
  category?: string | null;
  platform?: string | null;
  productName?: string | null;
  fallbackHook?: string;
  fallbackHashtags?: string[];
  fallbackAccentColor?: string;
  fallbackCardStyle?: CardStyleKey;
}

export interface HybridTemplateResult {
  template: TemplateRegistryEntry | null;
  hook: string;
  hashtags: string[];
  accentColor: string;
  cardStyle: CardStyleKey;
  hookDurationSec: number;
  pacingSeconds: number;
  bgmMood: string;
  sfxTriggers: string[];
  captionPreset: string;
  transitionType: string;
  categoryCanonical: string;
  platformCanonical: string;
  matched: boolean;
}

export async function resolveHybridTemplate(params: HybridTemplateParams): Promise<HybridTemplateResult> {
  await preloadTemplates();
  const template = await getTemplate(params.category, params.platform);

  return buildResult(template, params);
}

export function resolveHybridTemplateSync(params: HybridTemplateParams): HybridTemplateResult {
  const cached = getCachedTemplates();
  const template = cached ? getTemplateSync(params.category, params.platform, cached) : null;

  return buildResult(template, params);
}

function buildResult(
  template: TemplateRegistryEntry | null,
  params: HybridTemplateParams,
): HybridTemplateResult {
  const fallbackAccent = params.fallbackAccentColor || '#2f9dff';
  const fallbackCard = params.fallbackCardStyle || 'bold';
  const fallbackHook = params.fallbackHook || '';
  const fallbackTags = params.fallbackHashtags || [];

  return {
    template,
    hook: buildHookFromTemplate(template, params.productName || undefined, fallbackHook),
    hashtags: buildHashtagsFromTemplate(template, fallbackTags),
    accentColor: applyTemplateToAccentColor(template, fallbackAccent),
    cardStyle: applyTemplateToCardStyle(template, fallbackCard),
    hookDurationSec: template?.hook_duration_sec ?? 3,
    pacingSeconds: template?.pacing_seconds ?? 1.2,
    bgmMood: template?.bgm_mood ?? 'energetic',
    sfxTriggers: template?.sfx_triggers ?? [],
    captionPreset: template?.caption_preset ?? 'bold_neon_yellow',
    transitionType: template?.transition_type ?? 'whoosh',
    categoryCanonical: canonicalizeCategory(params.category),
    platformCanonical: canonicalizePlatform(params.platform),
    matched: template !== null && !template.is_default,
  };
}

export function getTemplateBadgeLabel(result: HybridTemplateResult | null): string | null {
  if (!result || !result.matched || !result.template) return null;
  const cat = result.categoryCanonical;
  const plat = result.platformCanonical;
  if (cat === '_default') return null;
  return `${cat} x ${plat} 최적화 템플릿 적용`;
}
