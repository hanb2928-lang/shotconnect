import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { buildFittingPromptWithRules } from "../_shared/rendering-engine.ts";

const ALLOWED_ORIGINS = [
  "https://shotconnect.app",
  "https://www.shotconnect.app",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_BODY_BYTES = 20 * 1024 * 1024;
const ALLOWED_URL_HOSTS = ["supabase.co", "supabase.in", "supabase.net"];

interface VirtualFittingRequest {
  productImage: string;
  modelImage: string;
  bodyType?: string;
  pose?: string;
  mood?: string;
  sceneStyle?: string;
  customPrompt?: string;
  idempotencyKey?: string;
  userId?: string;
  facetSparkle?: number;
  fabricDetail?: number;
  blendStrength?: number;
  smartFit?: boolean;
}

function getRequestOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? req.headers.get("Referer") ?? "";
  return origin;
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((allowed) => origin.startsWith(allowed));
}

function getCorsHeadersForRequest(req: Request): Record<string, string> {
  const origin = getRequestOrigin(req);
  if (isAllowedOrigin(origin)) {
    return { ...corsHeaders, "Access-Control-Allow-Origin": origin };
  }
  return { ...corsHeaders, "Access-Control-Allow-Origin": "null" };
}

function isUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return false;
    if (parsed.hostname.endsWith(".169.254.169.254")) return false;
    if (parsed.hostname.startsWith("169.254.")) return false;
    if (parsed.hostname.startsWith("10.")) return false;
    if (parsed.hostname.startsWith("172.16.") || parsed.hostname.startsWith("172.17.") || parsed.hostname.startsWith("172.18.") || parsed.hostname.startsWith("172.19.") || parsed.hostname.startsWith("172.20.") || parsed.hostname.startsWith("172.21.") || parsed.hostname.startsWith("172.22.") || parsed.hostname.startsWith("172.23.") || parsed.hostname.startsWith("172.24.") || parsed.hostname.startsWith("172.25.") || parsed.hostname.startsWith("172.26.") || parsed.hostname.startsWith("172.27.") || parsed.hostname.startsWith("172.28.") || parsed.hostname.startsWith("172.29.") || parsed.hostname.startsWith("172.30.") || parsed.hostname.startsWith("172.31.")) return false;
    if (parsed.hostname.startsWith("192.168.")) return false;
    return ALLOWED_URL_HOSTS.some((h) => parsed.hostname.endsWith(h));
  } catch {
    return false;
  }
}

function sanitizeCustomPrompt(prompt: string): string {
  const MAX_PROMPT_LEN = 500;
  let trimmed = prompt.trim().slice(0, MAX_PROMPT_LEN);
  trimmed = trimmed.replace(/```/g, " ").replace(/\bignore\b/gi, " ").replace(/\bsystem\b/gi, " ");
  return trimmed;
}

Deno.serve(async (req: Request) => {
  const respCors = getCorsHeadersForRequest(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: respCors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...respCors, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "인증이 필요합니다." }),
        { status: 401, headers: { ...respCors, "Content-Type": "application/json" } },
      );
    }

    const contentLength = req.headers.get("Content-Length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({ error: "요청 크기가 너무 큽니다. 이미지를 압축 후 다시 시도해주세요." }),
        { status: 413, headers: { ...respCors, "Content-Type": "application/json" } },
      );
    }

    const rawText = await req.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({ error: "요청 크기가 너무 큽니다. 이미지를 압축 후 다시 시도해주세요." }),
        { status: 413, headers: { ...respCors, "Content-Type": "application/json" } },
      );
    }

    const body: VirtualFittingRequest = JSON.parse(rawText);

    if (!body.productImage || !body.modelImage) {
      return new Response(
        JSON.stringify({ error: "제품 사진과 모델 사진이 모두 필요합니다." }),
        { status: 400, headers: { ...respCors, "Content-Type": "application/json" } },
      );
    }

    const userNamespace = body.userId ?? "anonymous";

    if (body.idempotencyKey?.trim()) {
      const cacheKey = `virtual-fitting:${userNamespace}:${encodeURIComponent(body.idempotencyKey.trim())}`;
      const cached = await checkFittingCache(cacheKey);
      if (cached) {
        return new Response(
          JSON.stringify({ ...cached, cached: true }),
          { status: 200, headers: { ...respCors, "Content-Type": "application/json" } },
        );
      }
    }

    const openaiKey = await resolveOpenAIKey();
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "AI 가상 피팅을 위한 API 키가 설정되지 않았습니다. 관리자에게 문의해주세요." }),
        { status: 503, headers: { ...respCors, "Content-Type": "application/json" } },
      );
    }

    const sanitizedCustomPrompt = body.customPrompt ? sanitizeCustomPrompt(body.customPrompt) : undefined;

    const prompt = buildFittingPromptWithRules(
      "",
      body.bodyType,
      body.pose,
      body.mood,
      body.sceneStyle,
      sanitizedCustomPrompt,
      { facetSparkle: body.facetSparkle, fabricDetail: body.fabricDetail, blendStrength: body.blendStrength, smartFit: body.smartFit },
    );

    const productDataUrl = await resolveImageDataUrl(body.productImage, "image/jpeg");
    const modelDataUrl = await resolveImageDataUrl(body.modelImage, "image/jpeg");

    const resultBase64 = await callImageEdit(productDataUrl, modelDataUrl, prompt, openaiKey);

    const fittingResult = { image: resultBase64, mimeType: "image/png" };

    if (body.idempotencyKey?.trim()) {
      const cacheKey = `virtual-fitting:${userNamespace}:${encodeURIComponent(body.idempotencyKey.trim())}`;
      storeFittingCache(cacheKey, fittingResult).catch(() => {});
    }

    return new Response(
      JSON.stringify(fittingResult),
      { status: 200, headers: { ...respCors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "가상 피팅 생성 중 오류가 발생했습니다." }),
      { status: 500, headers: { ...respCors, "Content-Type": "application/json" } },
    );
  }
});

async function callImageEdit(
  productDataUrl: string,
  modelDataUrl: string,
  prompt: string,
  apiKey: string,
): Promise<string> {
  const formData = new FormData();

  const productBlob = dataUrlToBlob(productDataUrl);
  const modelBlob = dataUrlToBlob(modelDataUrl);

  formData.append("image[]", modelBlob, "model.jpeg");
  formData.append("image[]", productBlob, "product.jpeg");
  formData.append("model", "gpt-image-1");
  formData.append("prompt", prompt);
  formData.append("size", "1024x1024");
  formData.append("quality", "medium");
  formData.append("output_format", "png");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Image Edit API error: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("가상 피팅 이미지를 생성하지 못했습니다.");

  return b64;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const ext = match[1].toLowerCase() === "png" ? "png" : match[1].toLowerCase() === "webp" ? "webp" : "jpeg";
  const base64Data = match[2];
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: `image/${ext}` });
}

function ensureDataUrl(image: string, mimeType: string): string {
  if (!image) return "";
  const trimmed = image.trim().replace(/\s/g, "");
  if (trimmed.startsWith("data:")) return trimmed;
  return `data:${mimeType};base64,${trimmed}`;
}

async function resolveImageDataUrl(image: string, mimeType: string): Promise<string> {
  if (!image) return "";
  const trimmed = image.trim();
  if (trimmed.startsWith("data:")) return trimmed.replace(/\s/g, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    if (!isUrlAllowed(trimmed)) {
      throw new Error("지원하지 않는 이미지 URL입니다.");
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const resp = await fetch(trimmed, { signal: controller.signal });
      if (!resp.ok) throw new Error(`이미지를 불러올 수 없습니다 (${resp.status})`);
      const blob = await resp.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      const detectedMime = blob.type || mimeType;
      return `data:${detectedMime};base64,${base64}`;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return `data:${mimeType};base64,${trimmed.replace(/\s/g, "")}`;
}

async function resolveOpenAIKey(): Promise<string | null> {
  const serverKey = Deno.env.get("OPENAI_API_KEY");
  if (serverKey) return serverKey;
  return null;
}

async function checkFittingCache(cacheKey: string): Promise<Record<string, unknown> | null> {
  const sUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const sKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!sUrl || !sKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `${sUrl}/rest/v1/ai_content_cache?select=result&cache_key=eq.${encodeURIComponent(cacheKey)}`,
      {
        headers: { apikey: sKey, Authorization: `Bearer ${sKey}` },
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
    if (!resp.ok) return null;
    const rows = await resp.json() as Array<{ result: Record<string, unknown> | null }>;
    if (!rows[0]?.result) return null;
    return rows[0].result;
  } catch {
    return null;
  }
}

async function storeFittingCache(cacheKey: string, result: Record<string, unknown>): Promise<void> {
  const sUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const sKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!sUrl || !sKey) return;
  try {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await fetch(`${sUrl}/rest/v1/ai_content_cache`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: sKey,
        Authorization: `Bearer ${sKey}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        task_type: "virtual-fitting",
        input_hash: cacheKey,
        result,
        model_used: "gpt-image-1",
        expires_at: expiresAt,
      }),
    });
  } catch {
    // cache write failure is non-fatal
  }
}
