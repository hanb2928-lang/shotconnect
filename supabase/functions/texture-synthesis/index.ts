import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface TextureSynthesisRequest {
  modelImageUrl: string;
  textureSourceUrl: string;
  productName?: string;
  productCategory?: string;
  synthesisMode?: "uv-remap" | "projection" | "hybrid";
  outputFormat?: "png" | "webp";
  idempotencyKey?: string;
  // Set by process-queue worker so we can update progress on the job row
  jobId?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body: TextureSynthesisRequest = await req.json();

    if (!body.modelImageUrl || !body.textureSourceUrl) {
      return new Response(
        JSON.stringify({ error: "3D 모델 이미지와 텍스처 소스 이미지가 모두 필요합니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Idempotency: check cache before making paid API call
    if (body.idempotencyKey?.trim()) {
      const cached = await checkTextureCache(body.idempotencyKey.trim());
      if (cached) {
        return new Response(
          JSON.stringify({ ...cached, cached: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const openaiKey = await resolveOpenAIKey();
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "AI 텍스처 합성을 위한 API 키가 설정되지 않았습니다." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mode = body.synthesisMode ?? "hybrid";
    const productName = body.productName ?? "제품";
    const category = body.productCategory ?? "general";
    const outputFormat = body.outputFormat ?? "png";
    const jobId = body.jobId;

    // Stage 1: Download model image
    await updateJobProgress(jobId, 0.1);
    const prompt = buildTexturePrompt(productName, category, mode);

    const formData = new FormData();
    const modelBlob = await fetchAsBlob(body.modelImageUrl);
    formData.append("image", modelBlob, "model.png");

    // Stage 2: Download texture source
    await updateJobProgress(jobId, 0.25);
    const textureBlob = await fetchAsBlob(body.textureSourceUrl);
    formData.append("image", textureBlob, "texture.png");

    formData.append("model", "gpt-image-1");
    formData.append("prompt", prompt);
    formData.append("size", "1024x1024");
    formData.append("quality", "high");
    formData.append("output_format", outputFormat);
    formData.append("n", "1");

    // Stage 3: AI synthesis in progress
    await updateJobProgress(jobId, 0.4);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      return new Response(
        JSON.stringify({ error: `텍스처 합성 실패: ${response.status} — ${errText.slice(0, 300)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Stage 4: Parsing result
    await updateJobProgress(jobId, 0.75);

    const data = await response.json();
    const imageB64 = data?.data?.[0]?.b64_json;
    if (!imageB64) {
      return new Response(
        JSON.stringify({ error: "텍스처 합성 결과를 받지 못했습니다." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Stage 5: Uploading result to storage
    await updateJobProgress(jobId, 0.9);
    const resultUrl = await uploadTextureResult(imageB64, outputFormat);

    // Cache the result
    if (body.idempotencyKey?.trim()) {
      await storeTextureCache(body.idempotencyKey.trim(), resultUrl);
    }

    // Stage 6: Done
    await updateJobProgress(jobId, 1.0);

    return new Response(
      JSON.stringify({
        success: true,
        resultUrl,
        mode,
        outputFormat,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function updateJobProgress(jobId: string | undefined, progress: number): Promise<void> {
  if (!jobId || !supabaseUrl || !serviceRoleKey) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    await fetch(
      `${supabaseUrl}/rest/v1/render_jobs?id=eq.${encodeURIComponent(jobId)}&status=neq.done`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ progress }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
  } catch {
    // non-fatal — progress updates are best-effort
  }
}

function buildTexturePrompt(productName: string, category: string, mode: string): string {
  const modeDesc = mode === "uv-remap"
    ? "UV remap the source texture onto the 3D model surface with accurate spatial mapping"
    : mode === "projection"
    ? "Project the source texture onto the 3D model with screen-space directional mapping"
    : "Hybrid texture synthesis: combine UV-accurate surface mapping with projection-based detail enhancement";

  return `Professional 3D texture synthesis for ${productName} (${category}).
${modeDesc}.
Preserve the 3D model's geometric shape, lighting, and shadow structure.
Apply the source texture's material properties (color, pattern, roughness, reflectivity) onto the model surface.
Maintain realistic surface curvature, occlusion, and specular highlights consistent with the original 3D geometry.
The result must look like a professionally rendered product visualization with high-quality PBR materials.
Do not alter the model's silhouette or proportions. Focus only on surface texture replacement.`;
}

async function resolveOpenAIKey(): Promise<string | null> {
  const directKey = Deno.env.get("OPENAI_API_KEY");
  if (directKey?.trim()) return directKey.trim();

  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/rpc/get_secret`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_name: "OPENAI_API_KEY" }),
      },
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return typeof data === "string" && data.trim() ? data.trim() : null;
  } catch {
    return null;
  }
}

async function fetchAsBlob(url: string): Promise<Blob> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`이미지 다운로드 실패: ${resp.status}`);
  return await resp.blob();
}

async function uploadTextureResult(b64: string, format: string): Promise<string> {
  if (!supabaseUrl || !serviceRoleKey) return `data:image/${format};base64,${b64}`;

  try {
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const fileName = `texture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${format}`;
    const uploadResp = await fetch(
      `${supabaseUrl}/storage/v1/object/renders/${fileName}`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": `image/${format}`,
        },
        body: bytes,
      },
    );

    if (!uploadResp.ok) return `data:image/${format};base64,${b64}`;
    return `${supabaseUrl}/storage/v1/object/public/renders/${fileName}`;
  } catch {
    return `data:image/${format};base64,${b64}`;
  }
}

async function checkTextureCache(idempotencyKey: string): Promise<{ success: boolean; resultUrl: string; mode: string; outputFormat: string } | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/ai_content_cache?cache_key=eq.${encodeURIComponent(idempotencyKey)}&select=result_data&limit=1`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    if (!resp.ok) return null;
    const rows = await resp.json() as Array<{ result_data: { success: boolean; resultUrl: string; mode: string; outputFormat: string } }>;
    if (rows.length === 0) return null;
    return rows[0].result_data;
  } catch {
    return null;
  }
}

async function storeTextureCache(idempotencyKey: string, resultUrl: string): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const data = { success: true, resultUrl, mode: "hybrid", outputFormat: "png" };
    await fetch(`${supabaseUrl}/rest/v1/ai_content_cache`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        cache_key: idempotencyKey,
        cache_type: "texture-synthesis",
        content_hash: idempotencyKey,
        result_data: data,
      }),
    });
  } catch {
    // non-fatal
  }
}
