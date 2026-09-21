export interface ContactInfo {
  type: string;
  label: string;
  value: string;
  action?: string;
}

export interface ProductVisionResult {
  productName: string;
  productCategory: string;
  visualFeatures: string[];
  marketingPoints: string[];
  textureDescription: string;
  colorPalette: string[];
  shapeDescription: string;
  materialGuess: string;
  keyAngles: { angle: string; description: string }[];
  orbitalFocusPoint: string;
  parallaxDepthLayers: string[];
  suggestedCopyLayers: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
}

export interface ShoppingMatch {
  platform: string;
  productName: string;
  price: string;
  url: string;
}

export interface AffiliateLink {
  platform: string;
  label: string;
  url: string;
}

export interface CustomAffiliateLink {
  platform: string;
  label: string;
  url: string;
  productIndex: number;
}

export type PlatformKey = 'naverBlog' | 'shortform' | 'twitter' | 'instagram' | 'threads' | 'pinterest' | 'smartstore';

export interface PlatformVariant {
  hook: string;
  caption: string;
  hashtags: string[];
  cardStyle: 'magazine' | 'bold' | 'minimal' | 'feed';
}

export interface PsychologyInsight {
  primaryTrigger: string;
  triggerDescription: string;
  emotionPhase: string;
  psychologicalHook: string;
  consumerDesire: string;
  persuasionAngle: string;
  behavioralNudge: string;
}

export interface TemplateData {
  priceLabel: string;
  oneLiner: string;
  category: string;
  accentColor: string;
  hook: string;
  hashtags: string[];
  productAdvantages: string[];
  caption: string;
  platformVariants?: Record<PlatformKey, PlatformVariant>;
  psychologyInsight?: PsychologyInsight | null;
  cleanMode?: boolean;
}

export interface CustomReview {
  text: string;
  rating: number;
  updatedAt: string;
}

export interface LocalStoreInfo {
  enabled: boolean;
  storeName: string;
  address: string;
  region: string;
  phone: string;
  todayOffer: string;
}

export interface LocalStoreContext {
  isLocalStore: boolean;
  storeType: string;
  detectedItems: string[];
  suggestedOffer: string;
  neighborhoodTag: string;
}

export interface VisualSearchMatch {
  platform: string;
  productName: string;
  price: string;
  url: string;
  similarityScore: number;
  imageHint: string;
}

export interface O2OCurationItem {
  type: 'sauce' | 'kit' | 'goods' | 'interior' | 'ingredient' | 'tool' | 'other';
  label: string;
  reason: string;
  platform: string;
  productName: string;
  price: string;
  url: string;
}

export interface HybridMapping {
  localStoreContext: LocalStoreContext | null;
  affiliateMatch: {
    platform: string;
    productName: string;
    price: string;
    url: string;
  } | null;
  visualSearchMatches: VisualSearchMatch[];
  o2oCuration: O2OCurationItem[];
  verifiedBadge: {
    verified: boolean;
    label: string;
    description: string;
  };
  combinedHook: string;
  combinedCaption: string;
  qrCouponText: string;
}

export interface Scan {
  id: string;
  image_url: string;
  title: string | null;
  summary: string | null;
  contacts: ContactInfo[];
  tags: string[];
  created_at: string;
  product_name: string | null;
  product_category: string | null;
  price_estimate: string | null;
  one_liner: string | null;
  shopping_matches: ShoppingMatch[];
  affiliate_links: AffiliateLink[];
  custom_affiliate_links: CustomAffiliateLink[];
  template_data: TemplateData;
  detected_products: DetectedProduct[];
  edited_image_url?: string | null;
  additional_image_urls?: string[] | null;
  custom_review?: CustomReview | null;
  local_store_info?: LocalStoreInfo | null;
  hybrid_mapping?: HybridMapping | null;
  scan_source?: 'single' | 'multi' | 'template' | null;
  tts_url?: string | null;
  analysis_job_id?: string | null;
  image_hash?: string | null;
  video_url?: string | null;
  product_vision?: ProductVisionResult | null;
}

export interface DetectedProduct {
  id: string;
  productName: string;
  productCategory: string;
  priceEstimate: string;
  oneLiner: string;
  shoppingMatches: ShoppingMatch[];
  templateData: TemplateData;
}

export interface AnalysisResult {
  title: string;
  summary: string;
  contacts: ContactInfo[];
  tags: string[];
  productName: string;
  productCategory: string;
  priceEstimate: string;
  oneLiner: string;
  shoppingMatches: ShoppingMatch[];
  templateData: TemplateData;
  detectedProducts: DetectedProduct[];
  localStoreContext?: LocalStoreContext | null;
  hybridMapping?: HybridMapping | null;
}

export interface UserSettings {
  coupang_partners_id: string | null;
  naver_shopping_id: string | null;
  toss_share_id: string | null;
  openai_api_key: string | null;
  pexels_api_key: string | null;
  tts_api_key: string | null;
  logo_url: string | null;
  default_video_duration: string | null;
  default_tts_voice: string | null;
  tts_speed: number | null;
  tts_pitch: number | null;
  progress_style: string | null;
  auto_disclosure: boolean | null;
  brand_persona: string | null;
  mascot_enabled: boolean | null;
  mascot_style: string | null;
  capture_guide_mode: string | null;
  ui_performance: string | null;
  theme_mode: string | null;
  display_density: string | null;
  theme_preset: string | null;
  app_language: string | null;
  default_caption_tone: string | null;
  fixed_hook_phrase: string | null;
  affiliate_priority_mapping: boolean | null;
  auto_publish_reels: boolean | null;
  auto_publish_tiktok: boolean | null;
  auto_publish_shorts: boolean | null;
  auto_publish_sandbox_mode: boolean | null;
  clean_footage_enabled: boolean | null;
  runway_api_key: string | null;
}

export type CardStyleKey = 'bold' | 'magazine' | 'minimal' | 'feed';

export interface CustomPlatform {
  id: string;
  key: string;
  label: string;
  ratio: string;
  width: number;
  height: number;
  color: string;
  safe_zone_top: number;
  safe_zone_bottom: number;
  safe_zone_sides: number;
  is_enabled: boolean;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
}

export interface TemplateRegistryEntry {
  id: string;
  category: string;
  platform: string;
  hook_duration_sec: number;
  pacing_seconds: number;
  card_style: CardStyleKey;
  accent_color: string;
  bgm_mood: string;
  sfx_triggers: string[];
  caption_preset: string;
  hook_template: string | null;
  hashtag_templates: string[];
  transition_type: string;
  is_default: boolean;
}

export interface SavedAsset {
  id: string;
  scan_id: string | null;
  asset_type: 'image' | 'video';
  title: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  thumbnail_url: string | null;
  platform: string | null;
  affiliate_platform: string | null;
  upload_status: 'not_uploaded' | 'uploaded' | 'scheduled';
  share_url: string | null;
  created_at: string;
}

export interface RevenueRecord {
  id: string;
  platform: string;
  amount: number;
  period_month: string;
  note: string | null;
  created_at: string;
  scan_id: string | null;
}

export interface ShortLinkWithClicks {
  slug: string;
  destination_url: string;
  click_count: number;
  last_clicked_at: string | null;
}

export interface LinkBookmark {
  id: string;
  label: string;
  url: string;
  platform: string;
  short_url: string | null;
  scan_id: string | null;
  click_count: number;
  created_at: string;
}

export interface MarketingSnippet {
  id: string;
  title: string;
  content: string;
  snippet_type: 'copy' | 'hashtag' | 'hook';
  platform: string | null;
  created_at: string;
}
