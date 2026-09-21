import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProductMeta {
  productName: string;
  description: string;
  price: string;
  originPrice: string;
  discountRate: string;
  currency: string;
  image: string;
  imageBase64: string;
  imageMimeType: string;
  url: string;
  platform: string;
  availability: string;
  brand: string;
  searchUrl: string;
  productId: string;
  extractionMethod: string;
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
    const body = await req.json();
    const url: string = body.url;
    const captureOnly: boolean = body.captureOnly === true;
    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const platform = detectPlatform(url);
    const productId = extractProductId(url, platform);
    const searchUrl = buildSearchUrl(url, platform, productId);
    const brandFromUrl = extractBrandFromUrl(url, platform);

    // captureOnly mode: skip full crawl, just fetch page and grab images as base64
    if (captureOnly) {
      const imagesBase64 = await captureImagesFromPage(url, 3);
      return new Response(
        JSON.stringify({
          productMeta: {
            productName: "",
            description: "",
            price: "",
            originPrice: "",
            discountRate: "",
            currency: "KRW",
            image: "",
            imageBase64: imagesBase64[0]?.base64 || "",
            imageMimeType: imagesBase64[0]?.mimeType || "",
            imagesBase64,
            url,
            platform,
            availability: "",
            brand: brandFromUrl,
            searchUrl,
            productId,
            extractionMethod: "capture_only",
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let meta: ProductMeta;
    try {
      meta = await fetchAndParse(url);
      meta.searchUrl = searchUrl;
      meta.productId = productId;
      meta.extractionMethod = "crawl";
    } catch {
      meta = {
        productName: "",
        description: "",
        price: "",
        originPrice: "",
        discountRate: "",
        currency: "KRW",
        image: "",
        imageBase64: "",
        imageMimeType: "",
        url,
        platform,
        availability: "",
        brand: brandFromUrl,
        searchUrl,
        productId,
        extractionMethod: "failed",
      };
    }

    // Server-side image capture: fetch og:image URL and convert to base64
    // This bypasses browser CORS restrictions entirely
    if (meta.image) {
      const absoluteImageUrl = resolveUrl(meta.image, url);
      try {
        const imgResult = await captureImageAsBase64(absoluteImageUrl);
        if (imgResult) {
          meta.imageBase64 = imgResult.base64;
          meta.imageMimeType = imgResult.mimeType;
        }
      } catch {
        // image capture failed — not critical
      }
    }

    // If og:image capture failed, try capturing from page directly
    if (!meta.imageBase64) {
      try {
        const imagesBase64 = await captureImagesFromPage(url, 1);
        if (imagesBase64.length > 0) {
          meta.imageBase64 = imagesBase64[0].base64;
          meta.imageMimeType = imagesBase64[0].mimeType;
        }
      } catch {
        // page image capture failed
      }
    }

    if (!meta.productName && !meta.description) {
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (openaiKey) {
        try {
          meta = await enrichWithAI(url, meta, openaiKey);
          if (meta.extractionMethod === "failed") {
            meta.extractionMethod = "ai_inferred";
          }
        } catch {
          // keep basic meta
        }
      }
    }

    return new Response(
      JSON.stringify({ productMeta: meta }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Extraction failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("coupang.com")) return "Coupang";
  if (u.includes("brand.naver.com")) return "BrandConnect";
  if (u.includes("smartstore.naver.com")) return "NaverShopping";
  if (u.includes("11st.co.kr")) return "11st";
  if (u.includes("gmarket.com")) return "Gmarket";
  if (u.includes("aliexpress.com")) return "AliExpress";
  if (u.includes("amazon.com")) return "Amazon";
  if (u.includes("toss.to")) return "Toss";
  if (u.includes("shopee.")) return "Shopee";
  return "Unknown";
}

function extractProductId(url: string, platform: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const segments = path.split("/").filter(Boolean);

    switch (platform) {
      case "Coupang": {
        const vpIdx = segments.findIndex((s) => s === "vp");
        if (vpIdx >= 0 && segments[vpIdx + 1]) return segments[vpIdx + 1];
        const productsIdx = segments.findIndex((s) => s === "products");
        if (productsIdx >= 0 && segments[productsIdx + 1]) return segments[productsIdx + 1];
        break;
      }
      case "NaverShopping":
      case "BrandConnect": {
        const productsIdx = segments.findIndex((s) => s === "products");
        if (productsIdx >= 0 && segments[productsIdx + 1]) return segments[productsIdx + 1];
        break;
      }
      case "AliExpress": {
        const itemIdx = segments.findIndex((s) => s.startsWith("item"));
        if (itemIdx >= 0 && segments[itemIdx + 1]) return segments[itemIdx + 1];
        break;
      }
      case "Amazon": {
        const dpIdx = segments.findIndex((s) => s === "dp");
        if (dpIdx >= 0 && segments[dpIdx + 1]) return segments[dpIdx + 1];
        const gpIdx = segments.findIndex((s) => s === "gp" && segments[gpIdx + 1] === "product");
        if (gpIdx >= 0 && segments[gpIdx + 2]) return segments[gpIdx + 2];
        break;
      }
    }

    for (const seg of segments) {
      if (/^\d{6,}$/.test(seg)) return seg;
    }

    return "";
  } catch {
    return "";
  }
}

function buildSearchUrl(url: string, platform: string, productId: string): string {
  try {
    const parsed = new URL(url);
    switch (platform) {
      case "Coupang":
        return `https://www.coupang.com/np/search?q=${productId || ""}`;
      case "NaverShopping":
      case "BrandConnect":
        return `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(parsed.hostname + " " + (productId || ""))}`;
      case "AliExpress":
        return `https://www.aliexpress.com/wholesale?SearchText=${productId || ""}`;
      case "Amazon":
        return `https://www.amazon.com/s?k=${productId || ""}`;
      case "11st":
        return `https://search.11st.co.kr/Search.tmall?kwd=${productId || ""}`;
      case "Gmarket":
        return `https://browse.gmarket.co.kr/search?keyword=${productId || ""}`;
      default:
        return `https://www.google.com/search?q=${encodeURIComponent(parsed.hostname + " " + (productId || ""))}`;
    }
  } catch {
    return "";
  }
}

function extractBrandFromUrl(url: string, platform: string): string {
  try {
    const parsed = new URL(url);
    if (platform === "Coupang") return "Coupang";
    if (platform === "NaverShopping" || platform === "BrandConnect") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments[0] === "brands") return segments[1] || "Naver";
      return parsed.hostname.replace("smartstore.", "").replace("brand.", "").split(".")[0];
    }
    if (platform === "AliExpress") return "AliExpress";
    if (platform === "Amazon") return "Amazon";
    return parsed.hostname.split(".")[0];
  } catch {
    return "";
  }
}

function isSafeFetchUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return false;
    if (host.startsWith("10.") || host.startsWith("192.168.")) return false;
    if (host.startsWith("172.")) {
      const octet = parseInt(host.split(".")[1], 10);
      if (octet >= 16 && octet <= 31) return false;
    }
    if (host.startsWith("169.254.")) return false;
    if (host === "metadata.google.internal") return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchAndParse(url: string): Promise<ProductMeta> {
  if (!isSafeFetchUrl(url)) {
    throw new Error("URL not allowed");
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SnapConnectBot/1.0; +https://snapconnect.app/bot)",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    },
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const meta = parseHtml(html, url);
  return meta;
}

function parseHtml(html: string, url: string): ProductMeta {
  const platform = detectPlatform(url);

  const getMeta = (property: string): string => {
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
      new RegExp(`<meta[^>]+name=["']${property.replace("og:", "")}["'][^>]+content=["']([^"']+)["']`, "i"),
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m?.[1]) return decodeEntities(m[1].trim());
    }
    return "";
  };

  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleTag?.[1]?.trim() ? decodeEntities(titleTag[1].trim()) : "";

  let productName = getMeta("og:title") || title || "";
  productName = cleanTitle(productName, platform);

  const description = getMeta("og:description") || getMeta("description") || "";
  const image = getMeta("og:image") || "";
  const siteName = getMeta("og:site_name") || "";

  let price = extractPrice(html, platform);
  let originPrice = extractOriginPrice(html, platform);
  let discountRate = extractDiscountRate(html, platform);
  let currency = "KRW";
  let availability = extractAvailability(html);
  let brand = extractBrand(html, siteName);

  if (price && price.includes("$")) currency = "USD";
  if (price && price.includes("¥")) currency = "JPY";

  return {
    productName,
    description: description.slice(0, 500),
    price,
    originPrice,
    discountRate,
    currency,
    image,
    imageBase64: "",
    imageMimeType: "",
    url,
    platform,
    availability,
    brand,
    searchUrl: "",
    productId: "",
    extractionMethod: "crawl",
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanTitle(title: string, platform: string): string {
  let clean = title;
  if (platform === "Coupang") {
    clean = clean.replace(/\s*[-:|]\s*쿠팡.*$/i, "").replace(/\s*쿠팡\s*$/i, "");
  } else if (platform === "NaverShopping" || platform === "BrandConnect") {
    clean = clean.replace(/\s*[-:|]\s*네이버.*$/i, "").replace(/\s*네이버\s*$/i, "");
  }
  clean = clean.replace(/\s*\|\s*네이버쇼핑\s*$/i, "");
  clean = clean.replace(/\s*[-:|]\s*11번가\s*$/i, "");
  clean = clean.replace(/\s*[-:|]\s*G마켓\s*$/i, "");
  return clean.trim().slice(0, 200);
}

function extractPrice(html: string, platform: string): string {
  const pricePatterns: RegExp[] = [];

  if (platform === "Coupang") {
    pricePatterns.push(
      /"salePrice"\s*:\s*(\d+)/i,
      /"price"\s*:\s*(\d+)/i,
      /class=["'][^"']*price[^"']*["'][^>]*>.*?(\d[\d,]+)\s*원/si,
    );
  } else if (platform === "NaverShopping" || platform === "BrandConnect") {
    pricePatterns.push(
      /"salePrice"\s*:\s*(\d+)/i,
      /"lowPrice"\s*:\s*(\d+)/i,
      /class=["'][^"']*price[^"']*["'][^>]*>.*?(\d[\d,]+)\s*원/si,
    );
  }

  pricePatterns.push(
    /<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i,
    /"price"\s*:\s*"?(\d[\d,]*)"?/i,
    /(\d[\d,]+)\s*원/,
  );

  for (const p of pricePatterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const raw = m[1].replace(/,/g, "");
      const num = parseInt(raw, 10);
      if (num > 0) return formatPrice(num);
    }
  }
  return "";
}

function formatPrice(num: number): string {
  return num.toLocaleString("ko-KR") + "원";
}

function extractOriginPrice(html: string, platform: string): string {
  const patterns: RegExp[] = [];
  if (platform === "Coupang") {
    patterns.push(
      /"originalPrice"\s*:\s*(\d+)/i,
      /"originPrice"\s*:\s*(\d+)/i,
      /class=["'][^"']*original[^"']*["'][^>]*>.*?(\d[\d,]+)\s*원/si,
    );
  }
  patterns.push(
    /<meta[^>]+property=["']og:price:original_amount["'][^>]+content=["']([^"']+)["']/i,
    /"originalPrice"\s*:\s*"?(\d[\d,]*)"?/i,
    /"originPrice"\s*:\s*"?(\d[\d,]*)"?/i,
    /"listPrice"\s*:\s*"?(\d[\d,]*)"?/i,
  );
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const raw = m[1].replace(/,/g, "");
      const num = parseInt(raw, 10);
      if (num > 0) return formatPrice(num);
    }
  }
  return "";
}

function extractDiscountRate(html: string, platform: string): string {
  const patterns: RegExp[] = [];
  if (platform === "Coupang") {
    patterns.push(
      /"discountRate"\s*:\s*(\d+)/i,
      /"discount"\s*:\s*(\d+)/i,
    );
  }
  patterns.push(
    /<meta[^>]+property=["']og:price:discount["'][^>]+content=["']([^"']+)["']/i,
    /"discountRate"\s*:\s*"?(\d+)"?/i,
    /"discountPercent"\s*:\s*"?(\d+)"?/i,
    /(\d+)\s*%\s*할인/i,
  );
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const num = parseInt(m[1], 10);
      if (num > 0 && num < 100) return num + "%";
    }
  }
  return "";
}

function extractAvailability(html: string): string {
  const m = html.match(/<meta[^>]+property=["']og:availability["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/"availability"\s*:\s*"([^"]+)"/i);
  return m?.[1] || "";
}

function extractBrand(html: string, siteName: string): string {
  const m = html.match(/<meta[^>]+property=["']og:brand["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/"brand"\s*:\s*"([^"]+)"/i)
    || html.match(/"brandName"\s*:\s*"([^"]+)"/i);
  return m?.[1] || siteName || "";
}

function resolveUrl(imageUrl: string, baseUrl: string): string {
  try {
    return new URL(imageUrl, baseUrl).href;
  } catch {
    return imageUrl;
  }
}

async function captureImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SnapConnectBot/1.0; +https://snapconnect.app/bot)",
        "Accept": "image/*,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const mimeType = contentType.split(";")[0].trim();

    if (!mimeType.startsWith("image/")) return null;

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes.length > 4 * 1024 * 1024) return null;

    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
    }
    const base64 = btoa(binary);

    return { base64, mimeType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function captureImagesFromPage(pageUrl: string, maxImages: number): Promise<Array<{ base64: string; mimeType: string }>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SnapConnectBot/1.0; +https://snapconnect.app/bot)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) return [];

    const html = await response.text();
    const imageUrls = extractImageUrls(html, pageUrl);

    const results: Array<{ base64: string; mimeType: string }> = [];
    for (const imgUrl of imageUrls) {
      if (results.length >= maxImages) break;
      const captured = await captureImageAsBase64(imgUrl);
      if (captured) results.push(captured);
    }
    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const addUrl = (raw: string) => {
    const resolved = resolveUrl(raw.trim(), baseUrl);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      urls.push(resolved);
    }
  };

  // og:image
  const ogMatches = html.matchAll(/<meta[^>]+property=["']og:image[^"']*['"][^>]+content=["']([^"']+)["']/gi);
  for (const m of ogMatches) if (m[1]) addUrl(m[1]);

  // twitter:image
  const twMatches = html.matchAll(/<meta[^>]+name=["']twitter:image[^"']*['"][^>]+content=["']([^"']+)["']/gi);
  for (const m of twMatches) if (m[1]) addUrl(m[1]);

  // <img> src tags (filter out tiny icons/spacers)
  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const m of imgMatches) {
    const src = m[1];
    if (src && !src.includes("data:") && !src.includes("sprite") && !src.includes("icon") && !src.includes("logo") && !src.includes("blank")) {
      addUrl(src);
    }
  }

  return urls.slice(0, 10);
}

async function enrichWithAI(url: string, basic: ProductMeta, apiKey: string): Promise<ProductMeta> {
  const systemPrompt =
    "You are a product information extractor. Given a shopping URL, infer the most likely product name, category, price range, and key selling points. " +
    "Use the URL structure (path segments, query params, product IDs) as clues. For example, a URL containing 'wireless-earbuds' likely refers to wireless earbuds. " +
    "Return ONLY valid JSON with fields: productName, description, price, brand. " +
    "All text in Korean. If you cannot determine a field, leave it empty.";

  const userPrompt = `URL: ${url}\nPlatform: ${basic.platform}\nProduct ID: ${basic.productId}\nExtracted title: ${basic.productName}\nReturn product metadata as JSON.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

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
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) return basic;
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return basic;

    let parsed: Record<string, unknown>;
    try {
      let t = content.trim();
      if (t.startsWith("```")) t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
      parsed = JSON.parse(t);
    } catch {
      return basic;
    }

    return {
      ...basic,
      productName: basic.productName || String(parsed.productName || ""),
      description: basic.description || String(parsed.description || ""),
      price: basic.price || String(parsed.price || ""),
      brand: basic.brand || String(parsed.brand || ""),
      imageBase64: basic.imageBase64 || "",
      imageMimeType: basic.imageMimeType || "",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
