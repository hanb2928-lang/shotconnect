import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Invoke autoscale-manager which evaluates queue depth and spawns
    // the appropriate number of parallel process-queue workers
    const autoscaleUrl = `${supabaseUrl}/functions/v1/autoscale-manager`;
    const autoscaleResp = await fetch(autoscaleUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ trigger: true }),
    });

    let autoscaleResult: Record<string, unknown> = {};
    if (autoscaleResp.ok) {
      autoscaleResult = await autoscaleResp.json() as Record<string, unknown>;
    } else {
      // Fallback: if autoscale-manager fails, directly trigger one worker
      const processorUrl = `${supabaseUrl}/functions/v1/process-queue`;
      await fetch(processorUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        body: JSON.stringify({ trigger: true }),
      });
      autoscaleResult = { fallback: true, action: "direct_trigger_fallback" };
    }

    return new Response(
      JSON.stringify({ triggered: true, autoscale: autoscaleResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Trigger failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
