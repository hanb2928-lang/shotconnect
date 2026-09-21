import type { StickerStyle } from '@/components/StickerLink';
import type { PlatformKey, PlatformVariant } from '@/types/database';

const CATEGORY_STICKER_MAP: Record<string, StickerStyle> = {
  sneakers: 'pill',
  shoes: 'pill',
  fashion: 'pill',
  clothing: 'pill',
  jacket: 'pill',
  bag: 'pill',
  accessory: 'pill',
  jewelry: 'rounded',
  watch: 'minimal',
  electronics: 'minimal',
  phone: 'minimal',
  laptop: 'minimal',
  lighting: 'rounded',
  lamp: 'rounded',
  furniture: 'rounded',
  decor: 'rounded',
  home: 'rounded',
  beauty: 'pill',
  cosmetic: 'pill',
  skincare: 'pill',
  food: 'pill',
  beverage: 'pill',
  kitchen: 'rounded',
  sports: 'pill',
  fitness: 'pill',
  outdoor: 'pill',
  toy: 'pill',
  book: 'minimal',
  stationery: 'minimal',
  art: 'rounded',
  plant: 'rounded',
  pet: 'pill',
  baby: 'pill',
};

const CARD_STYLE_STICKER_MAP: Record<PlatformVariant['cardStyle'], StickerStyle> = {
  bold: 'pill',
  magazine: 'rounded',
  feed: 'pill',
  minimal: 'minimal',
};

export function recommendStickerStyle(
  cardStyle: PlatformVariant['cardStyle'],
  category: string,
): StickerStyle {
  const normalizedCategory = (category || '').toLowerCase().trim();
  for (const [key, style] of Object.entries(CATEGORY_STICKER_MAP)) {
    if (normalizedCategory.includes(key)) return style;
  }
  return CARD_STYLE_STICKER_MAP[cardStyle] || 'pill';
}

export function recommendStickerSize(cardStyle: PlatformVariant['cardStyle']): number {
  switch (cardStyle) {
    case 'bold':
      return 48;
    case 'magazine':
      return 48;
    case 'feed':
      return 48;
    case 'minimal':
      return 40;
    default:
      return 48;
  }
}

export function getCardStyleForPlatform(
  platform: PlatformKey,
  templateData?: { platformVariants?: Record<PlatformKey, PlatformVariant> } | null,
): PlatformVariant['cardStyle'] {
  if (templateData?.platformVariants?.[platform]) {
    return templateData.platformVariants[platform].cardStyle;
  }
  const fallback: Record<PlatformKey, PlatformVariant['cardStyle']> = {
    naverBlog: 'magazine',
    shortform: 'bold',
    twitter: 'minimal',
    instagram: 'feed',
    threads: 'minimal',
    pinterest: 'magazine',
    smartstore: 'magazine',
  };
  return fallback[platform];
}
