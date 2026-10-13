const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function resolveRunwayKey(): Promise<string | null> {
  const serverKey = Deno.env.get("RUNWAY_API_KEY") ?? null;
  if (serverKey) return serverKey;

  if (supabaseUrl && serviceRoleKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/user_settings?select=runway_api_key&order=updated_at.desc&limit=1`,
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
        const rows = await resp.json() as Array<{ runway_api_key: string | null }>;
        if (rows.length > 0 && rows[0].runway_api_key) {
          return rows[0].runway_api_key;
        }
      }
    } catch {
      // ignore — return null
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const runwayKey = await resolveRunwayKey();
    if (!runwayKey) {
      return new Response(
        JSON.stringify({ error: "Runway API 키가 설정되지 않았습니다.", credits: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const endpoints = [
      "https://api.dev.runwayml.com/v1/credits",
      "https://api.dev.runwayml.com/v1/account/credits",
      "https://api.dev.runwayml.com/v1/user",
      "https://api.dev.runwayml.com/v1/organization/credits",
    ];

    let lastError = "";
    for (const url of endpoints) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${runwayKey}`,
            "X-Runway-Version": "2024-11-06",
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const data = await resp.json();
          const credits = typeof data.credits === "number"
            ? data.credits
            : typeof data.balance === "number"
              ? data.balance
              : typeof data.remaining === "number"
                ? data.remaining
                : typeof data.available_credits === "number"
                  ? data.available_credits
                  : null;
          if (credits !== null) {
            return new Response(
              JSON.stringify({ credits, raw: data }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          lastError = `${url}: 응답에서 크레딧 필드를 찾을 수 없음`;
        } else {
          const errText = await resp.text().catch(() => "");
          lastError = `${url}: ${resp.status}`;
          if (resp.status !== 404) {
            return new Response(
              JSON.stringify({
                error: `Runway 크레딧 조회 실패 (${resp.status})`,
                credits: null,
                detail: errText.slice(0, 200),
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
          lastError = `${url}: 시간 초과`;
        } else {
          lastError = `${url}: ${String(fetchErr)}`;
        }
      }
    }

    return new Response(
      JSON.stringify({
        error: "Runway 크레딧 조회 엔드포인트를 찾을 수 없습니다.",
        credits: null,
        detail: lastError,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "크레딧 조회 중 오류가 발생했습니다.", credits: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
