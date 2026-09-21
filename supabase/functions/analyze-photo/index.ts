import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PSYCHO_ENGINE_CORE } from "../_shared/psycho-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function stripJsonFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return t;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface ContactInfo {
  type: string;
  label: string;
  value: string;
  action?: string;
}

interface ShoppingMatch {
  platform: string;
  productName: string;
  price: string;
  url: string;
}

interface PlatformVariant {
  hook: string;
  caption: string;
  hashtags: string[];
  cardStyle: "magazine" | "bold" | "minimal" | "feed";
}

interface PsychologyInsight {
  primaryTrigger: string;
  triggerDescription: string;
  emotionPhase: string;
  psychologicalHook: string;
  consumerDesire: string;
  persuasionAngle: string;
  behavioralNudge: string;
}

interface TemplateData {
  priceLabel: string;
  oneLiner: string;
  category: string;
  accentColor: string;
  hook: string;
  hashtags: string[];
  productAdvantages: string[];
  caption: string;
  platformVariants: Record<string, PlatformVariant>;
  psychologyInsight?: PsychologyInsight | null;
}

interface DetectedProduct {
  id: string;
  productName: string;
  productCategory: string;
  priceEstimate: string;
  oneLiner: string;
  shoppingMatches: ShoppingMatch[];
  templateData: TemplateData;
}

interface LocalStoreContext {
  isLocalStore: boolean;
  storeType: string;
  detectedItems: string[];
  suggestedOffer: string;
  neighborhoodTag: string;
}

interface VisualSearchMatch {
  platform: string;
  productName: string;
  price: string;
  url: string;
  similarityScore: number;
  imageHint: string;
}

interface O2OCurationItem {
  type: string;
  label: string;
  reason: string;
  platform: string;
  productName: string;
  price: string;
  url: string;
}

interface HybridMapping {
  localStoreContext: LocalStoreContext | null;
  affiliateMatch: { platform: string; productName: string; price: string; url: string } | null;
  visualSearchMatches: VisualSearchMatch[];
  o2oCuration: O2OCurationItem[];
  verifiedBadge: { verified: boolean; label: string; description: string };
  combinedHook: string;
  combinedCaption: string;
  qrCouponText: string;
}

interface AnalysisResult {
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

const DEFAULT_TEMPLATE: TemplateData = {
  priceLabel: "",
  oneLiner: "",
  category: "",
  accentColor: "#2f9dff",
  hook: "",
  hashtags: [],
  productAdvantages: [],
  caption: "",
  platformVariants: {},
  psychologyInsight: null,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { imageDataUrl, images, fileName, mimeType, mode, preferredStyle, productContext } = body;

    if (!imageDataUrl && !images) {
      return new Response(
        JSON.stringify({ error: "Image data is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let result: AnalysisResult;

    const cleanMime = mimeType || "image/jpeg";
    const openaiKey = await resolveOpenAIKey();

    if (mode === "multi-shot" && Array.isArray(images) && images.length > 0) {
      const sanitizedImages = images.slice(0, 4).map((url: string) => ensureDataUrl(url, cleanMime));
      if (sanitizedImages.length === 0) {
        return new Response(
          JSON.stringify({ error: "No valid images provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (openaiKey) {
        result = await analyzeMultiShotWithOpenAI(sanitizedImages, openaiKey, preferredStyle, productContext);
      } else {
        result = generateContextualAnalysis(fileName || "snapshot");
      }
    } else {
      if (!imageDataUrl) {
        return new Response(
          JSON.stringify({ error: "Image data is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const sanitizedDataUrl = ensureDataUrl(imageDataUrl, cleanMime);
      const recognitionMode = mode === "single" ? "single" : "multi";
      if (openaiKey) {
        result = await analyzeWithOpenAI(sanitizedDataUrl, cleanMime, openaiKey, recognitionMode, preferredStyle, productContext);
      } else {
        result = generateContextualAnalysis(fileName || "snapshot");
      }
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Analysis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function resolveOpenAIKey(): Promise<string | null> {
  const serverKey = Deno.env.get("OPENAI_API_KEY");
  if (serverKey) return serverKey;

  if (supabaseUrl && serviceRoleKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${supabaseUrl}/rest/v1/user_settings?select=openai_api_key&order=created_at.desc&limit=1`, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const rows = await resp.json() as Array<{ openai_api_key: string | null }>;
        const dbKey = rows[0]?.openai_api_key;
        if (dbKey) return dbKey;
      }
    } catch {
      // no fallback beyond env
    }
  }
  return null;
}

interface ProductContext {
  productName?: string;
  description?: string;
  price?: string;
  brand?: string;
  platform?: string;
  url?: string;
}

async function analyzeWithOpenAI(
  imageDataUrl: string,
  mimeType: string,
  apiKey: string,
  mode: "single" | "multi",
  preferredStyle?: string,
  productContext?: ProductContext,
): Promise<AnalysisResult> {
  const isSingle = mode === "single";

  const productInstruction = isSingle
    ? "Identify the SINGLE primary/main product visible in the photo. Focus on the most prominent item. Return a detectedProducts array with exactly ONE element."
    : "Identify ALL distinct products visible in the photo. Return a detectedProducts array with one element per product found. Maximum 4 products — if more than 4 are visible, pick the 4 most prominent and distinct ones. Each product must be genuinely different (not the same item from a different angle).";

  const toneDirective = preferredStyle === 'raw'
    ? `\n\n${PSYCHO_ENGINE_CORE}\n\n위 날것 심리 원칙을 모든 훅, 캡션, 심리 분석에 절대적으로 적용하라. 손실 공포와 FOMO를 첫 2초 훅으로 사용하고, 스튜디오 연출이나 긍정적 이익 강조는 절대 금지한다.`
    : preferredStyle === 'studio'
    ? `\n\n## 스튜디오 프리미엄 원칙\n최상위 1% 수준의 럭셔리 상업 영상에 걸맞은 고품격 톤으로 마케팅 문구를 생성하라. 우아하고 세련된 언어, 프리미엄 브랜드의 톤앤매너, 품질과 가치를 강조하는 고급스러운 표현을 사용하라. 대중적이나 투박한 표현, 손실 공포, FOMO 자극은 금지. 예: '경험을 바꾸는 단 하나의 선택', '완벽함을 경험하다'\n`
    : "";

  const styleHint = preferredStyle
    ? `\nThe user has selected the "${preferredStyle}" platform style as their preferred template. After generating all variants, populate the top-level hook, hashtags, productAdvantages, and caption with the ${preferredStyle.toUpperCase()} variant's values instead of the shortform variant. This is the user's chosen default view.`
    : "";

  const systemPrompt =
    "You are a consumer psychology expert and viral short-form marketing strategist. " +
    "Your core mission: analyze products through the lens of HUMAN PSYCHOLOGY — understand what deep desire, fear, or aspiration the product touches, then craft marketing content that PIERCES through psychological defenses.\n" +
    "\n" +
    "PSYCHOLOGY-DRIVEN ANALYSIS FRAMEWORK (CRITICAL — apply to EVERY product):\n" +
    "Before writing any copy, analyze the product through these psychological lenses:\n" +
    "1. PRIMARY PSYCHOLOGICAL TRIGGER: Which fundamental human drive does this product activate?\n" +
    "   - FOMO (fear of missing out): '이거 지금 안 사면 손해' feeling\n" +
    "   - SOCIAL PROOF: '다들 쓰니까 나도' herd mentality\n" +
    "   - LOSS AVERSION: '이 가격이 마지막일 수도' scarcity fear\n" +
    "   - MIRROR NEURON: '저 사람 쓰는 거 보니까 나도 쓰고 싶다' imitation desire\n" +
    "   - IDENTITY PROJECTION: '이거 쓰면 나도 그런 사람이 될 수 있어' self-image\n" +
    "   - RECIPROCITY: '이렇게 좋은 걸 추천해주니까 보답해야지' gratitude loop\n" +
    "   - AUTHORITY BIAS: '전문가가 인정한 거면 믿을 수 있어' trust transfer\n" +
    "   - CONTRAST EFFECT: '이 가격에 이 품질?' expectation violation\n" +
    "2. EMOTIONAL PHASE: Map the consumer's emotional journey:\n" +
    "   curiosity → shock → empathy → desire → action\n" +
    "3. CONSUMER DESIRE: What is the REAL desire the consumer is trying to fulfill?\n" +
    "   (Not 'I want shoes' but 'I want to feel confident and stylish')\n" +
    "4. PERSUASION ANGLE: How to bypass the consumer's ad defense mechanism:\n" +
    "   - Story-first (not product-first): make the brain think it's watching a story, not an ad\n" +
    "   - Problem-agitation: remind them of a pain point they've been ignoring\n" +
    "   - Aspiration gap: show the gap between current self and ideal self\n" +
    "   - Social validation: imply 'people like you already use this'\n" +
    "5. BEHAVIORAL NUDGE: The subtle push that converts desire into action:\n" +
    "   - Scarcity: '재고 얼마 안 남음'\n" +
    "   - Urgency: '오늘까지만'\n" +
    "   - Anchoring: show original price next to sale price\n" +
    "   - Commitment: '댓글로 문의하면 추가 할인'\n" +
    "\n" +
    "Apply this framework to generate marketing content that doesn't just DESCRIBE the product,\n" +
    "but STIMULATES the psychological triggers that make people WANT it.\n" +
    "The hook, caption, and all copy must be rooted in psychological insight, not product features.\n" +
    "\n" +
    "Return a JSON object with these fields:\n" +
    "- title: short 2-5 word catchy title for the overall scan (in Korean)\n" +
    "- summary: 2-3 sentence description of what's in the photo (in Korean)\n" +
    "- tags: array of 3-6 descriptive single-word tags (mix of Korean and English as appropriate)\n" +
    "- contacts: array of any visible contact info objects with type/label/value\n" +
    "- detectedProducts: ARRAY of objects. Each object must have:\n" +
    "  - id: a short unique identifier (e.g. 'product-1', 'product-2')\n" +
    "  - productName: the identified product name or best guess (e.g. 'Nike Air Force 1')\n" +
    "  - productCategory: category (e.g. sneakers, lamp, jacket, headphones, furniture)\n" +
    "  - priceEstimate: estimated price range in KRW (e.g. '80,000-120,000원')\n" +
    "  - oneLiner: a catchy one-line recommendation in Korean for a short-form post\n" +
    "  - shoppingMatches: array of objects with platform (must be \"BrandConnect\"), productName, price, url\n" +
    "  - templateData: object with ALL of these fields:\n" +
    "    - priceLabel: price string for display\n" +
    "    - oneLiner: the catchy one-liner\n" +
    "    - category: category label in Korean\n" +
    "    - accentColor: hex color matching the product mood (e.g. '#2f9dff')\n" +
    "    - hook: a scroll-stopping hook phrase in Korean (10-20 chars, the kind that makes people stop scrolling). Think curiosity gap + emotional trigger. Examples: '이거 모르면 손해', '다들 이거 사느라 난리남', '가성비 끝판왕 등장', '이 가격에 이 품질?'\n" +
    "    - hashtags: array of 5-8 Korean hashtags WITHOUT the # symbol, optimized for Naver/Instagram search. Mix broad and niche tags. Example: ['착붕템', '가성비', '스니커즈', '신발추천', '옷장필수템', '데일리룩', '오늘뭐입지']\n" +
    "    - productAdvantages: array of 2-4 short Korean phrases describing the product's REAL advantages (e.g. '통화 기능', '가성비', '실용성', '스마트한 일상', '장시간 착용 편안함', '초경량'). Focus on concrete, product-specific benefits — NOT target audience or emotional angle.\n" +
    "    - psychologyInsight: object with ALL of these fields (MANDATORY — this is the core of psychology-driven marketing):\n" +
    "      - primaryTrigger: one of 'FOMO' | 'SOCIAL_PROOF' | 'LOSS_AVERSION' | 'MIRROR_NEURON' | 'IDENTITY_PROJECTION' | 'RECIPROCITY' | 'AUTHORITY_BIAS' | 'CONTRAST_EFFECT' — pick the ONE trigger most relevant to this product\n" +
    "      - triggerDescription: 1-2 sentence explanation in Korean of WHY this trigger works for this product (e.g. '이 상품은 한정 재고여서 손실 회피 심리를 자극합니다')\n" +
    "      - emotionPhase: the dominant emotion this content should evoke — one of 'curiosity' | 'shock' | 'empathy' | 'desire' | 'action'\n" +
    "      - psychologicalHook: a Korean phrase (10-25 chars) that directly targets the psychological trigger, NOT a product description. Examples: '이거 모르면 평생 손해', '다들 이거 쓰더라', '이 가격 다시 없을 수도'\n" +
    "      - consumerDesire: the DEEP underlying desire in Korean (not the product feature, but the emotional need). Examples: '자신감 있는 나를 원함', '더 편한 일상을 갈망함', '남들보다 앞서고 싶은 마음'\n" +
    "      - persuasionAngle: 1-2 sentence Korean explanation of how to bypass the consumer's ad defense (e.g. '제품 소개가 아닌 일상 스토리로 시작하여 광고 거부감 제거')\n" +
    "      - behavioralNudge: a Korean phrase (10-30 chars) that subtly pushes toward action. Examples: '지금 아니면 다시 없을 가격', '댓글 남기면 추가 할인', '선착순 50명 한정'\n" +
    "    - caption: a full 2-4 line caption in Korean for posting (shortform style). MUST be rooted in the psychologyInsight — start with the psychological hook, weave in the consumer desire, and end with the behavioral nudge as a call-to-action. Natural, conversational tone like a real person sharing a discovery, NOT a product pitch. Do NOT include hashtags in the caption.\n" +
    "    - platformVariants: object with 5 platform-specific variant objects. Each key MUST be exactly \"naverBlog\", \"shortform\", \"instagram\", \"threads\", or \"twitter\":\n" +
    "      - naverBlog: optimized for Naver Blog clip format. hook = a curiosity-driven title (15-30 chars Korean, like a blog post title). caption = 3-5 sentence paragraph in Korean, conversational blog-review style, naturally weaving in the product and a recommendation. hashtags = 8-12 Korean blog SEO keywords WITHOUT # symbol (broader, search-intent focused). cardStyle = \"magazine\"\n" +
    "      - shortform: optimized for TikTok/Reels. hook = scroll-stopping phrase (10-20 chars, punchy and visual). caption = 2-3 short punchy lines in Korean with line breaks, influencer speak, end with a CTA. hashtags = 6-10 mix of trending + niche Korean tags WITHOUT # symbol. cardStyle = \"bold\"\n" +
    "      - instagram: optimized for Instagram feed post (square 1:1). hook = an aesthetically pleasing lifestyle phrase (10-20 chars Korean, emotional and aspirational). caption = 2-3 elegant lines in Korean, lifestyle/influencer tone, with emoji-free visual storytelling. hashtags = 10-15 mix of Korean and English tags WITHOUT # symbol (lifestyle + product + aesthetic tags). cardStyle = \"feed\"\n" +
    "      - twitter: optimized for X/Twitter. hook = a provocative or bold claim (10-20 chars). caption = 1-2 lines max 280 chars in Korean, punchy and shareable. hashtags = 3-5 trending Korean tags WITHOUT # symbol. cardStyle = \"minimal\"\n" +
    "      - threads: optimized for Meta Threads. hook = a conversational, thought-provoking question or statement (10-25 chars Korean). caption = 2-4 lines in Korean, casual and discussion-friendly tone, like sharing a personal discovery. hashtags = 5-8 Korean tags WITHOUT # symbol (conversation-driven). cardStyle = \"minimal\"\n" +
    "    All five variants must feel native to that platform, not copy-pasted with minor edits. Different hooks, different caption lengths, different hashtag strategies.\n" +
    "    Also populate the top-level hook, hashtags, productAdvantages, caption with the SHORTFORM variant's values (since shortform is the default view).\n" +
    productInstruction + "\n" +
    "For shoppingMatches, use the official Naver Brand Connect creator page: https://brandconnect.naver.com/about/creator\n" +
    "Also populate the top-level productName, productCategory, priceEstimate, oneLiner, shoppingMatches, and templateData with the FIRST/primary product's data for backward compatibility.\n" +
    "\n" +
    "LOCAL STORE DETECTION (CRITICAL):\n" +
    "If the photo shows a local store scene (menu board, storefront sign, restaurant interior, cafe menu, market stall, salon price list, food display, etc.), set localStoreContext with:\n" +
    "  - isLocalStore: true\n" +
    "  - storeType: one of 'restaurant', 'cafe', 'bakery', 'salon', 'fashion', 'market', 'pharmacy', 'electronics', 'beauty', 'other'\n" +
    "  - detectedItems: array of visible menu items or products (in Korean)\n" +
    "  - suggestedOffer: a catchy today-only promotion phrase in Korean (e.g. '오늘만 김치찌개 5,000원!')\n" +
    "  - neighborhoodTag: a Korean neighborhood-style tag (e.g. '동네맛집', '우리동네카페', '로컬스토어')\n" +
    "\n" +
    "HYBRID MAPPING (CRITICAL):\n" +
    "If localStoreContext.isLocalStore is true, ALSO generate a hybridMapping object:\n" +
    "  - localStoreContext: same as above\n" +
    "  - affiliateMatch: the single best direct affiliate product match { platform: 'Coupang' or 'Naver', productName, price, url: 'https://brandconnect.naver.com/about/creator' }. If no direct match, set to null.\n" +
    "  - visualSearchMatches: array of 3-4 objects representing visual similarity matches from online platforms. Each: { platform: 'Coupang' or 'Naver' or 'AliExpress', productName, price, url: 'https://brandconnect.naver.com/about/creator', similarityScore: 0-100 (estimated % match based on color, shape, packaging), imageHint: short Korean description of what visual feature matched (e.g. '원형 우드 디자인, 따뜻한 갈색 톤') }. Sort by similarityScore descending. These should be REAL product types that exist on these platforms, matched by visual characteristics.\n" +
    "  - o2oCuration: array of 0-3 O2O curation items. Use when the exact menu item has no identical manufactured product (e.g. kimchi stew, handmade cake). Instead of the main dish, suggest RELATED purchasable items: { type: 'sauce'|'kit'|'goods'|'interior'|'ingredient'|'tool'|'other', label: short Korean name, reason: Korean explanation of why this connects (e.g. '이 식당에서 사용하는 특제 소스를 집에서도 직접 만들 수 있습니다'), platform: 'Coupang' or 'Naver', productName, price, url: 'https://brandconnect.naver.com/about/creator' }.\n" +
    "  - verifiedBadge: { verified: true, label: '동네 사장님이 직접 인증한 실물 픽', description: '지금 이 동네 실제 매장에서 쓰고 있는 물건입니다' }. Always set verified=true when isLocalStore is true.\n" +
    "  - combinedHook: a hook combining the local store angle with the affiliate opportunity (e.g. '이 동네 숨은 맛집 + 집에서도 같은 맛?')\n" +
    "  - combinedCaption: 2-3 line caption combining the local store promo and the affiliate product link naturally\n" +
    "  - qrCouponText: short QR coupon banner text for the video ending credit (e.g. 'QR 스캔시 10% 할인쿠폰 + 온라인 주문 링크')\n" +
    "If the photo is NOT a local store scene, set localStoreContext to null and hybridMapping to null.\n" +
    "Return ONLY valid JSON, no markdown." +
    styleHint +
    toneDirective;

  const contextHint = productContext?.productName || productContext?.description
    ? `\n\n사용자가 제공한 제휴 링크에서 추출된 상품 정보:\n- 상품명: ${productContext.productName || "(추출되지 않음 — 사진에서 직접 식별)"}\n- 설명: ${productContext.description || ""}\n- 가격: ${productContext.price || "(가격 미확인)"}\n- 브랜드: ${productContext.brand || ""}\n- 플랫폼: ${productContext.platform || ""}\n이 정보를 사진 분석과 마케팅 문구 생성에 적극 활용해. 사진의 상품과 링크 정보가 일치하면 정확한 상품명과 가격을 반영하고, 링크의 핵심 셀링 포인트를 후킹과 caption에 자연스럽게 녹여내.`
    : "";

  const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
    {
      type: "text",
      text: isSingle
        ? "Identify the single primary product in this image. Generate viral marketing copy, hashtags, and short-form template data for it. Return the detectedProducts array with one element." + (contextHint ? "\n" + contextHint : "")
        : "Identify ALL distinct products in this image. For each product, generate viral marketing copy, hashtags, and short-form template data. Return the detectedProducts array." + (contextHint ? "\n" + contextHint : ""),
    },
    { type: "image_url", image_url: { url: imageDataUrl, detail: isSingle ? "low" : "high" } },
  ];

  return callOpenAIWithRetry(systemPrompt, userContent, apiKey, isSingle ? 1200 : 3200);
}

async function analyzeMultiShotWithOpenAI(
  imageDataUrls: string[],
  apiKey: string,
  preferredStyle?: string,
  productContext?: ProductContext,
): Promise<AnalysisResult> {
  const toneDirective = preferredStyle === 'raw'
    ? `\n\n${PSYCHO_ENGINE_CORE}\n\n위 날것 심리 원칙을 모든 훅, 캡션, 심리 분석에 절대적으로 적용하라. 손실 공포와 FOMO를 첫 2초 훅으로 사용하고, 스튜디오 연출이나 긍정적 이익 강조는 절대 금지한다.`
    : preferredStyle === 'studio'
    ? `\n\n## 스튜디오 프리미엄 원칙\n최상위 1% 수준의 럭셔리 상업 영상에 걸맞은 고품격 톤으로 마케팅 문구를 생성하라. 우아하고 세련된 언어, 프리미엄 브랜드의 톤앤매너, 품질과 가치를 강조하는 고급스러운 표현을 사용하라. 대중적이나 투박한 표현, 손실 공포, FOMO 자극은 금지. 예: '경험을 바꾸는 단 하나의 선택', '완벽함을 경험하다'\n`
    : "";
  const systemPrompt =
    "You are a consumer psychology expert and viral short-form marketing strategist. " +
    "You are given MULTIPLE photos of the SAME product taken from different angles. " +
    "Analyze ALL photos together to get a comprehensive understanding of the product — its design, material, features, brand, and details visible from different sides.\n" +
    "Then generate PSYCHOLOGY-DRIVEN marketing content for this ONE product.\n" +
    "\n" +
    "PSYCHOLOGY-DRIVEN ANALYSIS FRAMEWORK (CRITICAL):\n" +
    "Before writing any copy, analyze the product through human psychological triggers:\n" +
    "1. PRIMARY TRIGGER: Which fundamental human drive does this activate? (FOMO, SOCIAL_PROOF, LOSS_AVERSION, MIRROR_NEURON, IDENTITY_PROJECTION, RECIPROCITY, AUTHORITY_BIAS, CONTRAST_EFFECT)\n" +
    "2. EMOTIONAL PHASE: curiosity → shock → empathy → desire → action\n" +
    "3. CONSUMER DESIRE: The DEEP underlying desire (not 'I want shoes' but 'I want to feel confident')\n" +
    "4. PERSUASION ANGLE: How to bypass ad defense (story-first, problem-agitation, aspiration gap, social validation)\n" +
    "5. BEHAVIORAL NUDGE: The subtle push that converts desire into action (scarcity, urgency, anchoring, commitment)\n" +
    "The hook, caption, and all copy must be rooted in psychological insight, not product features.\n" +
    "Return a JSON object with these fields:\n" +
    "- title: short 2-5 word catchy title for the product (in Korean)\n" +
    "- summary: 2-3 sentence description combining what you see across all angles (in Korean)\n" +
    "- tags: array of 3-6 descriptive single-word tags (mix of Korean and English as appropriate)\n" +
    "- contacts: array of any visible contact info objects with type/label/value\n" +
    "- productName: the identified product name or best guess\n" +
    "- productCategory: category (e.g. sneakers, lamp, jacket, headphones, furniture)\n" +
    "- priceEstimate: estimated price range in KRW (e.g. '80,000-120,000원')\n" +
    "- oneLiner: a catchy one-line recommendation in Korean for a short-form post\n" +
    "- shoppingMatches: array of objects with platform (must be \"BrandConnect\"), productName, price, url\n" +
    "- templateData: object with ALL of these fields:\n" +
    "  - priceLabel: price string for display\n" +
    "  - oneLiner: the catchy one-liner\n" +
    "  - category: category label in Korean\n" +
    "  - accentColor: hex color matching the product mood (e.g. '#2f9dff')\n" +
    "  - hook: a scroll-stopping hook phrase in Korean (10-20 chars, the kind that makes people stop scrolling). Think curiosity gap + emotional trigger. Examples: '이거 모르면 손해', '다들 이거 사느라 난리남', '가성비 끝판왕 등장', '이 가격에 이 품질?'\n" +
    "  - hashtags: array of 5-8 Korean hashtags WITHOUT the # symbol, optimized for Naver/Instagram search. Mix broad and niche tags. Example: ['착붕템', '가성비', '스니커즈', '신발추천', '옷장필수템', '데일리룩', '오늘뭐입지']\n" +
    "  - productAdvantages: array of 2-4 short Korean phrases describing the product's REAL advantages (e.g. '통화 기능', '가성비', '실용성', '스마트한 일상', '장시간 착용 편안함', '초경량'). Focus on concrete, product-specific benefits — NOT target audience or emotional angle.\n" +
    "  - psychologyInsight: object with ALL of these fields (MANDATORY — this is the core of psychology-driven marketing):\n" +
    "    - primaryTrigger: one of 'FOMO' | 'SOCIAL_PROOF' | 'LOSS_AVERSION' | 'MIRROR_NEURON' | 'IDENTITY_PROJECTION' | 'RECIPROCITY' | 'AUTHORITY_BIAS' | 'CONTRAST_EFFECT' — pick the ONE trigger most relevant to this product\n" +
    "    - triggerDescription: 1-2 sentence explanation in Korean of WHY this trigger works for this product\n" +
    "    - emotionPhase: the dominant emotion this content should evoke — one of 'curiosity' | 'shock' | 'empathy' | 'desire' | 'action'\n" +
    "    - psychologicalHook: a Korean phrase (10-25 chars) that directly targets the psychological trigger, NOT a product description. Examples: '이거 모르면 평생 손해', '다들 이거 쓰더라', '이 가격 다시 없을 수도'\n" +
    "    - consumerDesire: the DEEP underlying desire in Korean (not the product feature, but the emotional need)\n" +
    "    - persuasionAngle: 1-2 sentence Korean explanation of how to bypass the consumer's ad defense\n" +
    "    - behavioralNudge: a Korean phrase (10-30 chars) that subtly pushes toward action\n" +
    "  - caption: a full 2-4 line caption in Korean for posting (shortform style). MUST be rooted in the psychologyInsight — start with the psychological hook, weave in the consumer desire, and end with the behavioral nudge as a call-to-action. Natural, conversational tone like a real person sharing a discovery, NOT a product pitch. Do NOT include hashtags in the caption.\n" +
    "  - platformVariants: object with 5 platform-specific variant objects. Each key MUST be exactly \"naverBlog\", \"shortform\", \"instagram\", \"threads\", or \"twitter\":\n" +
    "    - naverBlog: optimized for Naver Blog clip format. hook = a curiosity-driven title (15-30 chars Korean, like a blog post title). caption = 3-5 sentence paragraph in Korean, conversational blog-review style, naturally weaving in the product and a recommendation. hashtags = 8-12 Korean blog SEO keywords WITHOUT # symbol (broader, search-intent focused). cardStyle = \"magazine\"\n" +
    "    - shortform: optimized for TikTok/Reels. hook = scroll-stopping phrase (10-20 chars, punchy and visual). caption = 2-3 short punchy lines in Korean with line breaks, influencer speak, end with a CTA. hashtags = 6-10 mix of trending + niche Korean tags WITHOUT # symbol. cardStyle = \"bold\"\n" +
    "    - instagram: optimized for Instagram feed post (square 1:1). hook = an aesthetically pleasing lifestyle phrase (10-20 chars Korean, emotional and aspirational). caption = 2-3 elegant lines in Korean, lifestyle/influencer tone, with emoji-free visual storytelling. hashtags = 10-15 mix of Korean and English tags WITHOUT # symbol (lifestyle + product + aesthetic tags). cardStyle = \"feed\"\n" +
    "    - twitter: optimized for X/Twitter. hook = a provocative or bold claim (10-20 chars). caption = 1-2 lines max 280 chars in Korean, punchy and shareable. hashtags = 3-5 trending Korean tags WITHOUT # symbol. cardStyle = \"minimal\"\n" +
    "    - threads: optimized for Meta Threads. hook = a conversational, thought-provoking question or statement (10-25 chars Korean). caption = 2-4 lines in Korean, casual and discussion-friendly tone, like sharing a personal discovery. hashtags = 5-8 Korean tags WITHOUT # symbol (conversation-driven). cardStyle = \"minimal\"\n" +
    "  All five variants must feel native to that platform, not copy-pasted with minor edits. Different hooks, different caption lengths, different hashtag strategies.\n" +
    "  Each variant's hook and caption should also reflect the psychologyInsight — adapt the psychological trigger to each platform's culture.\n" +
    "  Also populate the top-level hook, hashtags, productAdvantages, caption with the SHORTFORM variant's values (since shortform is the default view).\n" +
    "Also populate detectedProducts as an array with exactly ONE element using the same product data (for backward compatibility).\n" +
    "For shoppingMatches, use the official Naver Brand Connect creator page: https://brandconnect.naver.com/about/creator\n" +
    "Return ONLY valid JSON, no markdown." +
    toneDirective;

  const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
    {
      type: "text",
      text: `These ${imageDataUrls.length} photos show the SAME product from different angles. Analyze all of them together to identify the product comprehensively, then generate viral marketing copy, hashtags, and short-form template data for this single product.` + (productContext?.productName || productContext?.description ? `\n\n제휴 링크에서 추출된 상품 정보:\n- 상품명: ${productContext.productName || "(추출되지 않음 — 사진에서 직접 식별)"}\n- 설명: ${productContext.description || ""}\n- 가격: ${productContext.price || "(가격 미확인)"}\n이 정보를 마케팅 문구에 적극 반영해.` : ""),
    },
    ...imageDataUrls.map((url) => ({
      type: "image_url",
      image_url: { url, detail: "low" as const },
    })),
  ];

  const result = await callOpenAIWithRetry(systemPrompt, userContent, apiKey, 3200);
  return result;
}

async function callOpenAIWithRetry(
  systemPrompt: string,
  userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }>,
  apiKey: string,
  maxTokens: number,
): Promise<AnalysisResult> {
  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        const err = new Error(`OpenAI API error: ${response.status} - ${errText}`);
        if ((response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
          lastError = err;
          clearTimeout(timeout);
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * (attempt + 1);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("No content returned from OpenAI");

      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === "length") {
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), 55000);
        try {
          const retryResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            signal: retryController.signal,
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent },
                { role: "assistant", content },
                { role: "user", content: "Continue and complete the JSON. Return only the remaining fields." },
              ],
              max_tokens: 1600,
              temperature: 0.7,
              response_format: { type: "json_object" },
            }),
          });
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            const retryContent = retryData.choices?.[0]?.message?.content;
            if (retryContent) {
              try {
                const base = JSON.parse(stripJsonFence(content));
                try {
                  const ext = JSON.parse(stripJsonFence(retryContent));
                  return normalizeResult({ ...base, ...ext });
                } catch {
                  return normalizeResult(base);
                }
              } catch {
                try {
                  return normalizeResult(JSON.parse(stripJsonFence(retryContent)));
                } catch {
                  // retry content wasn't valid JSON either
                }
              }
            }
          }
        } catch {
          // retry failed, try parsing original content
        } finally {
          clearTimeout(retryTimeout);
        }
      }

      try {
        const parsed = JSON.parse(stripJsonFence(content));
        return normalizeResult(parsed);
      } catch {
        throw new Error('AI 분석 결과를 파싱하지 못했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new Error("AI 분석 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
        if (attempt < MAX_RETRIES) {
          clearTimeout(timeout);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw lastError;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("AI 분석에 실패했습니다. 잠시 후 다시 시도해주세요.");
}

function normalizePsychologyInsight(raw: unknown): PsychologyInsight | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const trigger = String(obj.primaryTrigger || "").toUpperCase();
  const validTriggers = ["FOMO", "SOCIAL_PROOF", "LOSS_AVERSION", "MIRROR_NEURON", "IDENTITY_PROJECTION", "RECIPROCITY", "AUTHORITY_BIAS", "CONTRAST_EFFECT"];
  if (!validTriggers.includes(trigger)) return null;
  return {
    primaryTrigger: trigger,
    triggerDescription: String(obj.triggerDescription || ""),
    emotionPhase: String(obj.emotionPhase || "desire"),
    psychologicalHook: String(obj.psychologicalHook || ""),
    consumerDesire: String(obj.consumerDesire || ""),
    persuasionAngle: String(obj.persuasionAngle || ""),
    behavioralNudge: String(obj.behavioralNudge || ""),
  };
}

function normalizeTemplate(raw: Record<string, unknown> | undefined, fallback: Partial<TemplateData>): TemplateData {
  const td = (raw || {}) as Record<string, unknown>;
  return {
    priceLabel: String(td.priceLabel || fallback.priceLabel || ""),
    oneLiner: sanitizeText(String(td.oneLiner || fallback.oneLiner || "")),
    category: String(td.category || fallback.category || ""),
    accentColor: String(td.accentColor || fallback.accentColor || "#2f9dff"),
    hook: sanitizeText(String(td.hook || fallback.hook || "")),
    hashtags: Array.isArray(td.hashtags) ? td.hashtags.map(String) : (Array.isArray(fallback.hashtags) ? fallback.hashtags : []),
    productAdvantages: Array.isArray(td.productAdvantages) ? td.productAdvantages.map(String).filter(Boolean) : (Array.isArray(fallback.productAdvantages) ? fallback.productAdvantages : []),
    caption: sanitizeText(String(td.caption || fallback.caption || "")),
    psychologyInsight: normalizePsychologyInsight(td.psychologyInsight),
    platformVariants: normalizePlatformVariants(td.platformVariants, {
      hook: sanitizeText(String(td.hook || fallback.hook || "")),
      caption: sanitizeText(String(td.caption || fallback.caption || "")),
      hashtags: Array.isArray(td.hashtags) ? td.hashtags.map(String) : (Array.isArray(fallback.hashtags) ? fallback.hashtags : []),
    }),
  };
}

function normalizePlatformVariants(
  raw: unknown,
  defaults: { hook: string; caption: string; hashtags: string[] },
): Record<string, PlatformVariant> {
  if (!raw || typeof raw !== "object") {
    const fallback: PlatformVariant = {
      hook: defaults.hook,
      caption: defaults.caption,
      hashtags: defaults.hashtags,
      cardStyle: "bold",
    };
    return {
      naverBlog: { ...fallback, cardStyle: "magazine" },
      shortform: { ...fallback, cardStyle: "bold" },
      instagram: { ...fallback, cardStyle: "feed" },
      threads: { ...fallback, cardStyle: "minimal" },
      twitter: { ...fallback, cardStyle: "minimal" },
    };
  }

  const obj = raw as Record<string, unknown>;
  const result: Record<string, PlatformVariant> = {};

  for (const key of ["naverBlog", "shortform", "instagram", "threads", "twitter"]) {
    const v = obj[key] as Record<string, unknown> | undefined;
    if (v) {
      result[key] = {
        hook: String(v.hook || defaults.hook),
        caption: String(v.caption || defaults.caption),
        hashtags: Array.isArray(v.hashtags) ? v.hashtags.map(String) : defaults.hashtags,
        cardStyle: (String(v.cardStyle || "bold") === "magazine" || String(v.cardStyle || "bold") === "minimal" || String(v.cardStyle || "bold") === "feed")
          ? String(v.cardStyle) as "magazine" | "minimal" | "feed" : "bold",
      };
    } else {
      const styleMap: Record<string, "magazine" | "bold" | "minimal" | "feed"> = {
        naverBlog: "magazine",
        shortform: "bold",
        instagram: "feed",
        threads: "minimal",
        twitter: "minimal",
      };
      result[key] = {
        hook: defaults.hook,
        caption: defaults.caption,
        hashtags: defaults.hashtags,
        cardStyle: styleMap[key],
      };
    }
  }

  return result;
}

const UNKNOWN_PRODUCT_NAMES = new Set([
  "",
  "알 수 없음",
  "알수없음",
  "unknown",
  "unknown product",
  "identified product",
  "product captured",
]);

const FALLBACK_PRODUCT_NAME = "지금 가장 핫한 추천 아이템";
const FALLBACK_COMMERCE_PHRASE = "시선 집중! 지금 바로 확인하세요";

const UNKNOWN_PATTERNS = [
  /알\s*수\s*없/gi,
  /알수없/gi,
  /unknown/gi,
  /미확인/gi,
  /미상/gi,
  /unidentified/gi,
  /not\s*identified/gi,
];

function normalizeProductName(raw: Record<string, unknown>): string {
  const name = String(raw.productName || raw.product_name || "").trim();
  if (UNKNOWN_PRODUCT_NAMES.has(name.toLowerCase())) {
    return FALLBACK_PRODUCT_NAME;
  }
  for (const pattern of UNKNOWN_PATTERNS) {
    if (pattern.test(name)) {
      return FALLBACK_PRODUCT_NAME;
    }
  }
  return name;
}

function sanitizeText(value: string): string {
  if (!value) return value;
  let result = value;
  for (const pattern of UNKNOWN_PATTERNS) {
    result = result.replace(pattern, FALLBACK_COMMERCE_PHRASE);
  }
  return result;
}

function normalizeResult(raw: Record<string, unknown>): AnalysisResult {
  const productName = normalizeProductName(raw);
  const productCategory = String(raw.productCategory || raw.product_category || "product");
  const priceEstimate = String(raw.priceEstimate || raw.price_estimate || "");
  const oneLiner = String(raw.oneLiner || raw.one_liner || "");
  const rawMatches = Array.isArray(raw.shoppingMatches) ? raw.shoppingMatches as ShoppingMatch[] : [];
  const shoppingMatches: ShoppingMatch[] = rawMatches.length > 0
    ? rawMatches.slice(0, 1).map((m) => {
        const url = String(m?.url || "");
        return {
          platform: "BrandConnect" as const,
          productName: String(m?.productName || ""),
          price: String(m?.price || ""),
          url: url.includes("brandconnect.naver.com") || url.includes("brand.naver.com")
            ? url
            : "https://brandconnect.naver.com/about/creator",
        };
      })
    : [];
  const templateData = normalizeTemplate(raw.templateData as Record<string, unknown>, {
    priceLabel: priceEstimate,
    oneLiner,
    category: productCategory,
    hook: String(raw.hook || raw.hook || ""),
    caption: String(raw.caption || raw.caption || ""),
  });

  const rawProducts = Array.isArray(raw.detectedProducts) ? raw.detectedProducts as Record<string, unknown>[] : [];

  const detectedProducts: DetectedProduct[] = rawProducts.length > 0
    ? rawProducts.slice(0, 4).map((p, i) => ({
        id: String(p.id || `product-${i + 1}`),
        productName: sanitizeText(String(p.productName || p.product_name || "")),
        productCategory: String(p.productCategory || p.product_category || "product"),
        priceEstimate: String(p.priceEstimate || p.price_estimate || ""),
        oneLiner: sanitizeText(String(p.oneLiner || p.one_liner || "")),
        shoppingMatches: Array.isArray(p.shoppingMatches) ? (p.shoppingMatches as ShoppingMatch[]).slice(0, 1).map((m) => {
          const url = String(m?.url || "");
          return {
            platform: "BrandConnect" as const,
            productName: String(m?.productName || ""),
            price: String(m?.price || ""),
            url: url.includes("brandconnect.naver.com") || url.includes("brand.naver.com")
              ? url
              : "https://brandconnect.naver.com/about/creator",
          };
        }) : [],
        templateData: normalizeTemplate(p.templateData as Record<string, unknown>, {
          priceLabel: String(p.priceEstimate || ""),
          oneLiner: String(p.oneLiner || ""),
          category: String(p.productCategory || ""),
        }),
      }))
    : [{
        id: "product-1",
        productName: normalizeProductName(raw),
        productCategory,
        priceEstimate,
        oneLiner,
        shoppingMatches,
        templateData,
      }];

  return {
    title: sanitizeText(String(raw.title || "Product Captured")),
    summary: sanitizeText(String(raw.summary || "")),
    contacts: Array.isArray(raw.contacts) ? raw.contacts as ContactInfo[] : [],
    tags: Array.isArray(raw.tags) ? raw.tags as string[] : [],
    productName,
    productCategory,
    priceEstimate,
    oneLiner: sanitizeText(oneLiner),
    shoppingMatches,
    templateData,
    detectedProducts,
    localStoreContext: normalizeLocalStoreContext(raw.localStoreContext),
    hybridMapping: normalizeHybridMapping(raw.hybridMapping),
  };
}

function normalizeLocalStoreContext(raw: unknown): LocalStoreContext | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.isLocalStore !== true) return null;
  return {
    isLocalStore: true,
    storeType: String(obj.storeType || "other"),
    detectedItems: Array.isArray(obj.detectedItems) ? obj.detectedItems.map(String).filter(Boolean) : [],
    suggestedOffer: String(obj.suggestedOffer || ""),
    neighborhoodTag: String(obj.neighborhoodTag || "동네맛집"),
  };
}

function normalizeHybridMapping(raw: unknown): HybridMapping | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const ctx = normalizeLocalStoreContext(obj.localStoreContext);
  if (!ctx) return null;
  const am = obj.affiliateMatch as Record<string, unknown> | null;
  const rawVsm = Array.isArray(obj.visualSearchMatches) ? obj.visualSearchMatches : [];
  const visualSearchMatches: VisualSearchMatch[] = rawVsm.slice(0, 4).map((m: Record<string, unknown>) => ({
    platform: String(m.platform || "Coupang"),
    productName: String(m.productName || ""),
    price: String(m.price || ""),
    url: String(m.url || "https://brandconnect.naver.com/about/creator"),
    similarityScore: Number(m.similarityScore) || 0,
    imageHint: String(m.imageHint || ""),
  }));

  const rawO2o = Array.isArray(obj.o2oCuration) ? obj.o2oCuration : [];
  const o2oCuration: O2OCurationItem[] = rawO2o.slice(0, 3).map((m: Record<string, unknown>) => ({
    type: String(m.type || "other"),
    label: String(m.label || ""),
    reason: String(m.reason || ""),
    platform: String(m.platform || "Coupang"),
    productName: String(m.productName || ""),
    price: String(m.price || ""),
    url: String(m.url || "https://brandconnect.naver.com/about/creator"),
  }));

  const rawBadge = obj.verifiedBadge as Record<string, unknown> | null;
  const verifiedBadge = rawBadge && typeof rawBadge === "object"
    ? {
        verified: rawBadge.verified === true,
        label: String(rawBadge.label || "동네 사장님이 직접 인증한 실물 픽"),
        description: String(rawBadge.description || "지금 이 동네 실제 매장에서 쓰고 있는 물건입니다"),
      }
    : { verified: true, label: "동네 사장님이 직접 인증한 실물 픽", description: "지금 이 동네 실제 매장에서 쓰고 있는 물건입니다" };

  return {
    localStoreContext: ctx,
    affiliateMatch: am && typeof am === "object" ? {
      platform: String(am.platform || "Coupang"),
      productName: String(am.productName || ""),
      price: String(am.price || ""),
      url: String(am.url || "https://brandconnect.naver.com/about/creator"),
    } : null,
    visualSearchMatches,
    o2oCuration,
    verifiedBadge,
    combinedHook: sanitizeText(String(obj.combinedHook || "")),
    combinedCaption: sanitizeText(String(obj.combinedCaption || "")),
    qrCouponText: String(obj.qrCouponText || "QR 스캔시 할인쿠폰 + 온라인 주문 링크"),
  };
}

function ensureDataUrl(imageDataUrl: string, mimeType: string): string {
  if (!imageDataUrl) return "";

  const trimmed = imageDataUrl.trim().replace(/\s/g, "");

  if (trimmed.startsWith("data:")) {
    return trimmed;
  }

  return `data:${mimeType};base64,${trimmed}`;
}

function generateContextualAnalysis(fileName: string): AnalysisResult {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const base = fileName.toLowerCase();
  let title = "Product Captured";
  let summary = `A photo was captured on ${dateLabel}. `;
  const tags: string[] = ["product", "shopping"];
  const contacts: ContactInfo[] = [];
  let productName = "";
  let productCategory = "product";
  let priceEstimate = "";
  let oneLiner = "";
  const shoppingMatches: ShoppingMatch[] = [];
  let hook = "";
  let hashtags: string[] = [];
  let productAdvantages: string[] = [];
  let caption = "";

  if (base.includes("shoe") || base.includes("sneaker") || base.includes("신발")) {
    title = "스니커즈 매치";
    productCategory = "sneakers";
    productName = "Athletic Sneakers";
    priceEstimate = "50,000-150,000원";
    oneLiner = "이 신발, 착붕템 인정!";
    hook = "다들 이거 사느라 난리남";
    hashtags = ["착붕템", "스니커즈", "신발추천", "가성비", "데일리룩", "스타일링"];
    productAdvantages = ["가성비", "스타일링", "데일리 착용감"];
    caption = "다들 이거 사느라 난리남\n지금 가장 핫한 신발, 내 발에 딱 맞는 핏까지\n구매 링크에서 확인해보세요.";
    summary = `A pair of sneakers was captured on ${dateLabel}. `;
    tags.push("sneakers", "fashion", "footwear");
  } else if (base.includes("lamp") || base.includes("light") || base.includes("조명")) {
    title = "조명 매치";
    productCategory = "lighting";
    productName = "Modern Desk Lamp";
    priceEstimate = "20,000-80,000원";
    oneLiner = "공간의 분위기를 바꾸는 조명";
    hook = "방 분위기 확 바뀜";
    hashtags = ["조명", "인테리어", "자취방꾸미기", "감성", "데스크조명", "공간변화"];
    productAdvantages = ["감성 인테리어", "공간 변화", "조명 효과"];
    caption = "방 분위기 확 바뀜\n이 조명 하나로 공간이 완전히 달라져요\n지금 바로 확인해보세요.";
    summary = `A lighting fixture was captured on ${dateLabel}. `;
    tags.push("lamp", "lighting", "interior");
  } else if (base.includes("cloth") || base.includes("jacket") || base.includes("shirt") || base.includes("옷")) {
    title = "패션 매치";
    productCategory = "clothing";
    productName = "Stylish Jacket";
    priceEstimate = "30,000-200,000원";
    oneLiner = "이번 코디, 완벽해!";
    hook = "이거 입고 나갔더면 칭찬 빵빵";
    hashtags = ["패션", "아우터", "코디", "데일리룩", "가성비옷", "옷장필수템"];
    productAdvantages = ["코디 완성", "가성비", "트렌드 디자인"];
    caption = "이거 입고 나갔더니 칭찬 빵빵\n이번 시즌 완벽한 코디 완성템\n구매 링크에서 만나보세요.";
    summary = `A clothing item was captured on ${dateLabel}. `;
    tags.push("fashion", "clothing", "style");
  } else {
    productName = "Identified Product";
    priceEstimate = "가격 정보 필요";
    oneLiner = "이 아이템, 주목해!";
    hook = "이거 모르면 손해";
    hashtags = ["아이템", "추천", "쇼핑"];
    productAdvantages = ["실용성", "가성비"];
    caption = "이거 모르면 손해\n사진 한 장으로 바로 만날 수 있어요\n잠시 후 다시 시도하면 풀버전 마케팅 카드가 생성됩니다.";
    summary += "AI 분석이 일시적으로 비활성화되었습니다. 잠시 후 다시 시도해주세요.";
    tags.push("item", "capture");
    contacts.push(
      { type: "note", label: "AI 분석 준비 중", value: "AI 분석이 일시적으로 비활성화되었습니다. 잠시 후 다시 시도해주세요.", action: "retry" },
    );
  }

  if (productName && productName !== "Identified Product") {
    const encodedQuery = encodeURIComponent(productName);
    shoppingMatches.push(
      { platform: "BrandConnect", productName, price: priceEstimate, url: "https://brandconnect.naver.com/about/creator" },
    );
  }

  const accentColors: Record<string, string> = {
    sneakers: "#2f9dff",
    lighting: "#f59e0b",
    clothing: "#06b3d4",
    product: "#2f9dff",
  };

  const td: TemplateData = {
    priceLabel: priceEstimate,
    oneLiner,
    category: productCategory,
    accentColor: accentColors[productCategory] || "#2f9dff",
    hook,
    hashtags,
    productAdvantages,
    caption,
    platformVariants: {
      naverBlog: {
        hook: hook + " — 후기",
        caption: caption + "\n이 제품을 직접 사용해보니, 기대했던 것 이상이었습니다. 디자인부터 성능까지 만족스러운 부지기수예요. 비슷한 제품을 찾고 계셨다면 이걸로 정하셔도 후회 없으실 겁니다. 가격대도 합리적이라 추천할 만한 아이템입니다.",
        hashtags: [...hashtags, "리뷰", "추천템", "후기"],
        cardStyle: "magazine",
      },
      shortform: {
        hook,
        caption,
        hashtags,
        cardStyle: "bold",
      },
      instagram: {
        hook: hook + " ✨",
        caption: `${oneLiner}\n${caption.split('\n')[0]}\n${priceEstimate ? `가격대 ${priceEstimate}` : ''}`,
        hashtags: [...hashtags, "ootd", "lifestyle", "daily"],
        cardStyle: "feed",
      },
      twitter: {
        hook: hook + "인정",
        caption: `${oneLiner} ${priceEstimate ? `가격대 ${priceEstimate}.` : ""} 지금 확인하세요.`,
        hashtags: hashtags.slice(0, 4),
        cardStyle: "minimal",
      },
      threads: {
        hook: hook + " — 진짜였음",
        caption: `${oneLiner}\n${caption.split('\n')[0]}\n${priceEstimate ? `가격대 ${priceEstimate}` : ''}\n직접 써보니 이해되는 맛이 있어요.`,
        hashtags: [...hashtags.slice(0, 6), "스레드", "일상"],
        cardStyle: "minimal",
      },
    },
  };

  return {
    title,
    summary,
    contacts,
    tags,
    productName,
    productCategory,
    priceEstimate,
    oneLiner,
    shoppingMatches,
    templateData: td,
    detectedProducts: [{
      id: "product-1",
      productName,
      productCategory,
      priceEstimate,
      oneLiner,
      shoppingMatches,
      templateData: td,
    }],
  };
}
