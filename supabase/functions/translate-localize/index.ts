import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

interface LocalizeRequest {
  hook: string;
  title: string;
  caption: string;
  hashtags: string[];
  productName: string;
  productCategory: string;
  narrationText?: string;
  targetLanguages: string[];
  affiliateUrl?: string;
}

interface LocalizedContent {
  language: string;
  languageCode: string;
  hook: string;
  title: string;
  caption: string;
  hashtags: string[];
  narrationText: string;
  ttsVoice: string;
  affiliatePlatform: string;
  affiliateUrl: string;
  disclosureText: string;
  disclosureRegulation: string;
  personaTone: string;
  localizedHashtags: string[];
}

interface LocalizeResponse {
  localizations: LocalizedContent[];
}

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
    const body: LocalizeRequest = await req.json();

    if (!body.targetLanguages || body.targetLanguages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Target languages are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = await resolveOpenAIKey();

    let result: LocalizeResponse;

    if (openaiKey) {
      try {
        result = await localizeWithOpenAI(body, openaiKey);
      } catch {
        result = localizeLocal(body);
      }
    } else {
      result = localizeLocal(body);
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Localization failed" }),
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
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/user_settings?select=openai_api_key&order=created_at.desc&limit=1`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          signal: controller.signal,
        },
      );
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

interface LangMeta {
  code: string;
  nativeName: string;
  voice: string;
  platform: string;
  persona: string;
  tone: string;
  hashtags: string[];
  disclosure: string;
  regulation: string;
}

const LANG_INFO: Record<string, LangMeta> = {
  en: {
    code: 'en', nativeName: 'English', voice: 'alloy', platform: 'Amazon US / TikTok Shop US',
    persona: 'Energetic 20-something American TikTok influencer who loves finding "game-changer" products',
    tone: 'Casual, hype-driven, uses slang naturally (game-changer, must-have, literally obsessed)',
    hashtags: ['#amazonfinds', '#tiktokmademebuyit', '#musthave', '#productreview', '#lifehacks'],
    disclosure: '*This post contains affiliate links. I may earn a commission from purchases made through these links.',
    regulation: 'FTC',
  },
  ja: {
    code: 'ja', nativeName: '日本語', voice: 'nova', platform: 'Amazon JP / TikTok Shop JP',
    persona: '親しみやすい20代の日本のTikTokクリエイター、便利グッズを紹介するのが得意',
    tone: '丁寧で親しみやすい、#買ってよかった スタイルの自然な商品紹介',
    hashtags: ['#おすすめ', '#Qoo10', '#便利グッズ', '#買ってよかった', '#コスパ最強'],
    disclosure: '※本ページにはプロモーションが含まれています。',
    regulation: 'ステマ規制',
  },
  zh: {
    code: 'zh', nativeName: '中文', voice: 'echo', platform: 'AliExpress / TikTok Shop CN',
    persona: '充满活力的中国短视频博主，擅长发现性价比好物',
    tone: '活泼、接地气，使用网络流行语自然带出产品卖点',
    hashtags: ['#好物推荐', '#必买清单', '#性价比', '#种草', '#生活好物'],
    disclosure: '※本页面包含推广内容。',
    regulation: '广告法',
  },
  es: {
    code: 'es', nativeName: 'Español', voice: 'shimmer', platform: 'Amazon ES / TikTok Shop LATAM',
    persona: 'Energético creador de contenido latinoamericano en TikTok, experto en productos virales',
    tone: 'Entusiasta, cercano, usa expresiones locales自然mente (¡increíble!, lo necesitas ya)',
    hashtags: ['#amazonfinds', '#tiktokmademebuyit', '#decompras', '#reseña', '#imperdible'],
    disclosure: '*Esta publicación contiene enlaces de afiliados. Puede recibir una comisión por las compras realizadas a través de estos enlaces.',
    regulation: 'FTC-style',
  },
  vi: {
    code: 'vi', nativeName: 'Tiếng Việt', voice: 'alloy', platform: 'Shopee VN / TikTok Shop VN',
    persona: 'Người review sản phẩm trẻ trung trên TikTok Việt Nam, yêu tìm đồ giá trị',
    tone: 'Tự nhiên, năng động, dùng tiếng lóng gần gũi (xịn xò, phải chọi ngay)',
    hashtags: ['#gocreview', '#shopeefinds', '#tiktokmademebuyit', '#sanphamhay', '#chiase'],
    disclosure: '*Bài viết này có chứa liên kết tiếp thị liên kết.',
    regulation: 'Bộ Công Thương',
  },
  th: {
    code: 'th', nativeName: 'ภาษาไทย', voice: 'nova', platform: 'Shopee TH / TikTok Shop TH',
    persona: 'ผู้รีวิวสินค้าบน TikTok ไทย สไตล์เพื่อนซี้แนะนำของดี',
    tone: 'เป็นธรรมชาติ สนุกสนาน ใช้ภาษาแชทที่คุ้นเคย',
    hashtags: ['#รีวิว', '#shopeethailand', '#ของดีต้องแชร์', '#ทิคต็อกแนะนำ', '#คุ้มค่า'],
    disclosure: '*โพสต์นี้มีลิงก์พันธมิตร',
    regulation: 'OCPB',
  },
  id: {
    code: 'id', nativeName: 'Bahasa Indonesia', voice: 'echo', platform: 'Shopee ID / TikTok Shop ID',
    persona: 'Kreator TikTok Indonesia yang energetic dan suka review produk kekinian',
    tone: 'Santai, asik, pakai bahasa gaul yang relate (wajib punya, gokil, cuss checkout)',
    hashtags: ['#racunshopee', '#rekomendasi', '#tiktokmademebuyit', '#reviewproduk', '#wajibpunya'],
    disclosure: '*Postingan ini mengandung tautan afiliasi.',
    regulation: 'KPPU',
  },
  pt: {
    code: 'pt', nativeName: 'Português', voice: 'shimmer', platform: 'Amazon BR / TikTok Shop BR',
    persona: 'Creator brasileiro no TikTok, especialista em achar produtos incríveis',
    tone: 'Animado, divertido, usa gírias brasileiras naturalmente (amei, preciso demais, top)',
    hashtags: ['#achadinhos', '#tiktokmademebuyit', '#amazonbr', '#review', '#imperdível'],
    disclosure: '*Este post contém links de afiliados. Posso receber uma comissão por compras feitas através destes links.',
    regulation: 'CONAR',
  },
  fr: {
    code: 'fr', nativeName: 'Français', voice: 'alloy', platform: 'Amazon FR / TikTok Shop FR',
    persona: 'Créateur de contenu français sur TikTok, passionné par les bons plans',
    tone: 'Dynamique, chaleureux, utilise des expressions naturelles (coup de cœur, indispensable)',
    hashtags: ['#bonplan', '#tiktokmademebuyit', '#astuce', '#produit', '#coupdecoeur'],
    disclosure: '*Ce post contient des liens d\'affiliation. Je peux percevoir une commission pour les achats effectués via ces liens.',
    regulation: 'DGCCRF',
  },
  de: {
    code: 'de', nativeName: 'Deutsch', voice: 'echo', platform: 'Amazon DE / TikTok Shop DE',
    persona: 'Deutscher Content Creator auf TikTok, der gerne Produkte testet und empfiehlt',
    tone: 'Begeistert, natürlich, verwendet typische Ausdrücke (Must-have, Gamechanger, genial)',
    hashtags: ['#amazonfinds', '#tiktokmademebuyit', '#empfehlung', '#produkttest', '#musthave'],
    disclosure: '*Dieser Beitrag enthält Affiliate-Links. Ich kann eine Provision für über diese Links getätigte Einkäufe erhalten.',
    regulation: 'TMG',
  },
  ar: {
    code: 'ar', nativeName: 'العربية', voice: 'nova', platform: 'AliExpress ME / TikTok Shop ME',
    persona: 'صانع محتوى عربي شاب على تيك توك، يحب اكتشاف المنتجات الرائعة',
    tone: 'حماسي، طبيعي، يستخدم تعبيرات شائعة بشكل عفوي',
    hashtags: ['#تسوق', '#منتجات', '#تيكتوك', '#اقتراحات', '#عروض'],
    disclosure: '*تتضمن هذه المشاركة روابط تابعة. قد أتلقى عمولة عن المشتريات التي تتم عبر هذه الروابط.',
    regulation: 'FTC-style',
  },
  hi: {
    code: 'hi', nativeName: 'हिन्दी', voice: 'shimmer', platform: 'Amazon IN / TikTok Shop IN',
    persona: 'भारतीय TikTok क्रिएटर जो नए प्रोडक्ट्स की समीक्षा करना पसंद करता है',
    tone: 'ऊर्जावान, प्राकृतिक, आम बोलचाल की भाषा का उपयोग (जरूरी है, बेस्ट, लाजवाब)',
    hashtags: ['#amazonfinds', '#tiktokmademebuyit', '#review', '#musthave', '#bestproduct'],
    disclosure: '*इस पोस्ट में एफिलिएट लिंक शामिल हैं। इन लिंक से खरीदारी पर मुझे कमीशन मिल सकता है।',
    regulation: 'ASCI',
  },
};

async function localizeWithOpenAI(data: LocalizeRequest, apiKey: string): Promise<LocalizeResponse> {
  const langMetas = data.targetLanguages
    .map(l => LANG_INFO[l])
    .filter((l): l is LangMeta => Boolean(l));
  if (langMetas.length === 0) {
    throw new Error("지원하지 않는 언어 코드입니다.");
  }

  const systemPrompt =
    "너는 글로벌 숏폼 로컬라이징 전문가야. 한국어 콘텐츠를 각 국가 언어로 번역하는데, 단순 직역이 아니라 현지 크리에이터의 페르소나로 의역해야 해.\n\n" +
    "핵심 원칙:\n" +
    "1. 직역 금지 — 현지 TikTok/Reels 인플루언서의 톤앤매너로 자연스럽게 재작성\n" +
    "   예: '자취 삶의 질 상승템 추천!' → 영어: 'Game-changer room essentials you definitely need! 🌟' (직역이 아닌 의역)\n" +
    "2. 해시태그 — 각 국가에서 실제로 인기 있는 태그로 교체 (원본 해시태그를 그대로 번역하지 말 것)\n" +
    "3. 공정위/대가성 표기 — 각 국가의 규제에 맞는 현지어 문구를 disclosureText에 포함\n" +
    "4. 내레이션 텍스트 — TTS로 바로 읽을 수 있는 자연스러운 구어체로 재작성 (읽기용이 아닌 말하기용)\n" +
    "5. 아랍어는 RTL 방향성 고려\n\n" +
    "결과는 JSON만 반환: { \"localizations\": [{ \"language\": \"English\", \"languageCode\": \"en\", \"hook\": \"...\", \"title\": \"...\", \"caption\": \"...\", \"hashtags\": [\"...\"], \"narrationText\": \"...\", \"disclosureText\": \"...\" }] }";

  const langSpec = langMetas.map(l =>
    `${l.code}(${l.nativeName}): 페르소나=${l.persona}, 톤=${l.tone}, 추천해시태그=[${l.hashtags.join(', ')}], 공시규제=${l.regulation}`
  ).join('\n');

  const userPrompt =
    `원본 후킹: ${data.hook || ''}\n` +
    `원본 제목: ${data.title || ''}\n` +
    `원본 캡션: ${data.caption || ''}\n` +
    `원본 해시태그: ${(data.hashtags || []).join(', ')}\n` +
    `제품명: ${data.productName || ''}\n` +
    `카테고리: ${data.productCategory || ''}\n` +
    `내레이션 텍스트: ${data.narrationText || ''}\n\n` +
    `대상 언어 및 페르소나:\n${langSpec}\n\n` +
    `각 언어별로 위 페르소나와 톤에 맞춰 의역하고, 추천 해시태그를 참고하여 현지화된 해시태그를 작성해. ` +
    `disclosureText에는 각 국가의 규제에 맞는 대가성 표기 문구를 현지어로 작성해. ` +
    `narrationText는 TTS가 읽기 좋은 자연스러운 구어체로 재작성해.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 4000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content from OpenAI");

  let parsed: any;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    return localizeLocal(data);
  }
  const rawLocals = Array.isArray(parsed.localizations) ? parsed.localizations : [];

  const localizations: LocalizedContent[] = rawLocals.map((loc: any) => {
    const code = String(loc.languageCode || '').slice(0, 5);
    const info = LANG_INFO[code] || { voice: 'alloy', platform: 'TikTok Shop', hashtags: [], disclosure: '', regulation: '', persona: '', tone: '' } as LangMeta;
    return {
      language: String(loc.language || info.nativeName || code).slice(0, 30),
      languageCode: code,
      hook: String(loc.hook || '').slice(0, 200),
      title: String(loc.title || '').slice(0, 100),
      caption: String(loc.caption || '').slice(0, 1000),
      hashtags: Array.isArray(loc.hashtags) ? loc.hashtags.slice(0, 10).map((h: any) => String(h).slice(0, 50)) : info.hashtags,
      narrationText: String(loc.narrationText || '').slice(0, 500),
      ttsVoice: info.voice,
      affiliatePlatform: info.platform,
      affiliateUrl: data.affiliateUrl || '',
      disclosureText: String(loc.disclosureText || info.disclosure || '').slice(0, 300),
      disclosureRegulation: info.regulation,
      personaTone: info.tone,
      localizedHashtags: info.hashtags,
    };
  });

  return { localizations };
}

function localizeLocal(data: LocalizeResponse | LocalizeRequest): LocalizeResponse {
  const req = data as LocalizeRequest;
  const targetLangs = req.targetLanguages || [];
  const localizations: LocalizedContent[] = targetLangs.map(langCode => {
    const info = LANG_INFO[langCode] || { code: langCode, nativeName: langCode, voice: 'alloy', platform: 'TikTok Shop', hashtags: [], disclosure: '', regulation: '', persona: '', tone: '' } as LangMeta;
    return {
      language: info.nativeName,
      languageCode: info.code,
      hook: req.hook || '',
      title: req.title || '',
      caption: req.caption || '',
      hashtags: req.hashtags || [],
      narrationText: req.narrationText || req.hook || '',
      ttsVoice: info.voice,
      affiliatePlatform: info.platform,
      affiliateUrl: req.affiliateUrl || '',
      disclosureText: info.disclosure,
      disclosureRegulation: info.regulation,
      personaTone: info.tone,
      localizedHashtags: info.hashtags,
    };
  });

  return { localizations };
}
