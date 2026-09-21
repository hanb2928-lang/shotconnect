import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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
    const { imageDataUrl, mimeType, userMaskDataUrl } = await req.json();

    if (!imageDataUrl) {
      return new Response(
        JSON.stringify({ error: "Image data is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cleanMime = mimeType || "image/jpeg";
    const sanitizedDataUrl = ensureDataUrl(imageDataUrl, cleanMime);

    const openaiKey = await resolveOpenAIKey();
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API 키가 설정되지 않았습니다. 설정에서 API 키를 입력하세요." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let editedBase64: string;
    if (userMaskDataUrl) {
      editedBase64 = await removeBackgroundWithMask(sanitizedDataUrl, userMaskDataUrl, openaiKey);
    } else {
      editedBase64 = await removeBackgroundWithOpenAI(sanitizedDataUrl, openaiKey);
    }
    const imageUrl = await uploadToStorage(editedBase64, "image/png");

    return new Response(
      JSON.stringify({ imageUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Background removal failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function uploadToStorage(b64: string, mimeType: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl) throw new Error("Storage not configured: missing SUPABASE_URL");
  const authKey = serviceRoleKey || anonKey;
  if (!authKey) throw new Error("Storage not configured: missing auth key");

  const fileName = `bg-removed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });

  const uploadResp = await fetch(`${supabaseUrl}/storage/v1/object/scans/${fileName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authKey}`,
      apikey: authKey,
      "Content-Type": mimeType,
    },
    body: blob,
  });

  if (!uploadResp.ok) {
    const errText = await uploadResp.text();
    throw new Error(`Storage upload failed: ${uploadResp.status} ${errText}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/scans/${fileName}`;
}

function ensureDataUrl(imageDataUrl: string, mimeType: string): string {
  if (!imageDataUrl) return "";
  const trimmed = imageDataUrl.trim().replace(/\s/g, "");
  if (trimmed.startsWith("data:")) return trimmed;
  return `data:${mimeType};base64,${trimmed}`;
}

async function resolveOpenAIKey(): Promise<string | null> {
  const serverKey = Deno.env.get("OPENAI_API_KEY");
  if (serverKey) return serverKey;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const dbKey = serviceRoleKey || anonKey;

  if (supabaseUrl && dbKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${supabaseUrl}/rest/v1/user_settings?select=openai_api_key&order=created_at.desc&limit=1`, {
        headers: {
          apikey: dbKey,
          Authorization: `Bearer ${dbKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const rows = await resp.json() as Array<{ openai_api_key: string | null }>;
        const dbKeyVal = rows[0]?.openai_api_key;
        if (dbKeyVal) return dbKeyVal;
      }
    } catch {
      // fall through to env var
    }
  }
  return null;
}

async function removeBackgroundWithOpenAI(
  imageDataUrl: string,
  apiKey: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: buildMultipartForm(imageDataUrl),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`OpenAI Image API error: ${response.status}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned from OpenAI");

  return b64;
}

async function removeBackgroundWithMask(
  imageDataUrl: string,
  maskDataUrl: string,
  apiKey: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: buildMaskMultipartForm(imageDataUrl, maskDataUrl),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`OpenAI Image API error: ${response.status}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned from OpenAI");

  return b64;
}

function buildMultipartForm(imageDataUrl: string): FormData {
  const formData = new FormData();

  const base64Match = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!base64Match) throw new Error("Invalid image data URL");

  const ext = base64Match[1].toLowerCase() === "png" ? "png" : "jpeg";
  const base64Data = base64Match[2];
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: `image/${ext}` });
  formData.append("image", blob, `input.${ext}`);
  formData.append("model", "gpt-image-1-mini");
  formData.append("prompt", "Remove the background from this image, leaving the subject on a fully transparent background.");
  formData.append("size", "auto");
  formData.append("quality", "low");
  formData.append("background", "transparent");

  return formData;
}

function buildMaskMultipartForm(imageDataUrl: string, maskDataUrl: string): FormData {
  const formData = new FormData();

  const base64Match = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!base64Match) throw new Error("Invalid image data URL");

  const ext = base64Match[1].toLowerCase() === "png" ? "png" : "jpeg";
  const base64Data = base64Match[2];
  const imageBinary = atob(base64Data);
  const imageBytes = new Uint8Array(imageBinary.length);
  for (let i = 0; i < imageBinary.length; i++) {
    imageBytes[i] = imageBinary.charCodeAt(i);
  }

  const imageBlob = new Blob([imageBytes], { type: `image/${ext}` });
  formData.append("image", imageBlob, `input.${ext}`);

  // Parse mask — must be PNG with transparency for OpenAI mask parameter
  const maskMatch = maskDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (maskMatch) {
    const maskBase64 = maskMatch[2];
    const maskBinary = atob(maskBase64);
    const maskBytes = new Uint8Array(maskBinary.length);
    for (let i = 0; i < maskBinary.length; i++) {
      maskBytes[i] = maskBinary.charCodeAt(i);
    }
    const maskBlob = new Blob([maskBytes], { type: "image/png" });
    formData.append("mask", maskBlob, "mask.png");
  }

  formData.append("model", "gpt-image-1-mini");
  formData.append(
    "prompt",
    "Using the provided mask, remove the masked areas (transparent regions) from the image, keeping only the unmasked subject on a fully transparent background.",
  );
  formData.append("size", "auto");
  formData.append("quality", "low");
  formData.append("background", "transparent");

  return formData;
}
