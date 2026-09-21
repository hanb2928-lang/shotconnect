import type { TemplateRegistryEntry, CardStyleKey, PlatformKey } from '@/types/database';

const CATEGORY_ALIASES: Record<string, string> = {
  '뷰티': 'beauty',
  'beauty': 'beauty',
  'cosmetic': 'beauty',
  'cosmetics': 'beauty',
  'skincare': 'beauty',
  'skin_care': 'beauty',
  '스킨케어': 'beauty',
  '메이크업': 'beauty',
  'makeup': 'beauty',
  '패션': 'fashion',
  'fashion': 'fashion',
  'clothing': 'fashion',
  '의류': 'fashion',
  'apparel': 'fashion',
  'sneakers': 'fashion',
  '신발': 'fashion',
  'shoes': 'fashion',
  'shoe': 'fashion',
  '디지털': 'tech',
  'tech': 'tech',
  'technology': 'tech',
  'gadget': 'tech',
  'gadgets': 'tech',
  'it': 'tech',
  '전자기기': 'tech',
  'electronics': 'tech',
  '가전': 'home_appliance',
  'home_appliance': 'home_appliance',
  'appliance': 'home_appliance',
  'appliances': 'home_appliance',
  'lighting': 'home_appliance',
  '조명': 'home_appliance',
  '생활': 'living',
  'living': 'living',
  'lifestyle': 'living',
  'home': 'living',
  'household': 'living',
  '인테리어': 'living',
  'interior': 'living',
  '주방': 'kitchen',
  'kitchen': 'kitchen',
  'cookware': 'kitchen',
  '식품': 'food',
  'food': 'food',
  'grocery': 'food',
  'snack': 'food',
  'snacks': 'food',
  '먹거리': 'food',
  '유아': 'baby',
  'baby': 'baby',
  'kids': 'baby',
  'kid': 'baby',
  'children': 'baby',
  'child': 'baby',
  '스포츠': 'sports',
  'sports': 'sports',
  'sport': 'sports',
  'fitness': 'sports',
  '운동': 'sports',
  '반려': 'pet',
  'pet': 'pet',
  'pets': 'pet',
  'animal': 'pet',
  '동물': 'pet',
  'product': '_default',
  '제품': '_default',
  '상품': '_default',
};

const PLATFORM_ALIASES: Record<string, string> = {
  'shortform': 'shorts',
  'shorts': 'shorts',
  'youtube_shorts': 'shorts',
  'youtube_short': 'shorts',
  'yt_shorts': 'shorts',
  'reels': 'reels',
  'instagram_reels': 'reels',
  'tiktok': 'tiktok',
  'naverBlog': 'naverBlog',
  'naver_blog': 'naverBlog',
  'blog': 'naverBlog',
  'instagram': 'instagram',
  'insta': 'instagram',
  'threads': 'threads',
  'twitter': 'twitter',
  'x': 'twitter',
  'pinterest': 'instagram',
  'smartstore': 'naverBlog',
};

let cachedTemplates: TemplateRegistryEntry[] | null = null;
let fetchPromise: Promise<TemplateRegistryEntry[]> | null = null;

export function canonicalizeCategory(raw: string | undefined | null): string {
  if (!raw) return '_default';
  const lower = raw.toLowerCase().trim();
  return CATEGORY_ALIASES[lower] || CATEGORY_ALIASES[raw.trim()] || '_default';
}

export function canonicalizePlatform(raw: string | undefined | null): string {
  if (!raw) return 'shorts';
  const lower = raw.toLowerCase().trim();
  return PLATFORM_ALIASES[lower] || PLATFORM_ALIASES[raw.trim()] || 'shorts';
}

async function fetchAllTemplates(): Promise<TemplateRegistryEntry[]> {
  if (cachedTemplates) return cachedTemplates;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    const { supabase } = await import('@/lib/supabase');
    const { data, error } = await supabase
      .from('template_registry')
      .select('*');

    if (error || !data) {
      fetchPromise = null;
      return [];
    }

    cachedTemplates = data as TemplateRegistryEntry[];
    return cachedTemplates;
  })();

  return fetchPromise;
}

export function invalidateTemplateCache(): void {
  cachedTemplates = null;
  fetchPromise = null;
}

export async function getTemplate(
  category: string | undefined | null,
  platform: string | undefined | null,
): Promise<TemplateRegistryEntry | null> {
  const templates = await fetchAllTemplates();
  if (templates.length === 0) return null;

  const canonCategory = canonicalizeCategory(category);
  const canonPlatform = canonicalizePlatform(platform);

  const exact = templates.find(
    (t) => t.category === canonCategory && t.platform === canonPlatform && !t.is_default,
  );
  if (exact) return exact;

  const platformDefault = templates.find(
    (t) => t.category === '_default' && t.platform === canonPlatform,
  );
  if (platformDefault) return platformDefault;

  const globalDefault = templates.find(
    (t) => t.category === '_default' && t.platform === 'shorts',
  );
  return globalDefault || templates[0] || null;
}

export function getTemplateSync(
  category: string | undefined | null,
  platform: string | undefined | null,
  cached: TemplateRegistryEntry[],
): TemplateRegistryEntry | null {
  if (cached.length === 0) return null;

  const canonCategory = canonicalizeCategory(category);
  const canonPlatform = canonicalizePlatform(platform);

  const exact = cached.find(
    (t) => t.category === canonCategory && t.platform === canonPlatform && !t.is_default,
  );
  if (exact) return exact;

  const platformDefault = cached.find(
    (t) => t.category === '_default' && t.platform === canonPlatform,
  );
  if (platformDefault) return platformDefault;

  const globalDefault = cached.find(
    (t) => t.category === '_default' && t.platform === 'shorts',
  );
  return globalDefault || cached[0] || null;
}

export async function preloadTemplates(): Promise<void> {
  await fetchAllTemplates();
}

export function getCachedTemplates(): TemplateRegistryEntry[] | null {
  return cachedTemplates;
}

export function applyTemplateToCardStyle(
  template: TemplateRegistryEntry | null,
  fallback: CardStyleKey,
): CardStyleKey {
  if (!template) return fallback;
  return template.card_style;
}

export function applyTemplateToAccentColor(
  template: TemplateRegistryEntry | null,
  fallback: string,
): string {
  if (!template) return fallback;
  return template.accent_color;
}

export function buildHookFromTemplate(
  template: TemplateRegistryEntry | null,
  productName: string | undefined,
  fallback: string,
): string {
  if (!template || !template.hook_template) return fallback;
  const name = productName || '이 제품';
  return template.hook_template.replace(/\{product\}/g, name);
}

export function buildHashtagsFromTemplate(
  template: TemplateRegistryEntry | null,
  fallback: string[],
): string[] {
  if (!template || !template.hashtag_templates || template.hashtag_templates.length === 0) {
    return fallback;
  }
  return template.hashtag_templates;
}
