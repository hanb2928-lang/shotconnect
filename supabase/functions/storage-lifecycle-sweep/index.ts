import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SweepResult {
  classified: Record<string, number>;
  deleted: number;
  errors: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth check: require the project's anon key as the apikey header.
  // This prevents random internet callers from triggering storage sweeps,
  // while remaining callable from the client (single-tenant, no auth).
  const apiKey = req.headers.get("apikey") ?? "";
  const expectedKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!expectedKey || apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const result: SweepResult = {
      classified: {},
      deleted: 0,
      errors: [],
    };

    // 1. Classify all objects into tiers (hot → warm → cold → expired)
    const { data: classifyData, error: classifyError } = await adminClient.rpc(
      "classify_storage_tiers",
    );

    if (classifyError) {
      result.errors.push(`classify_storage_tiers: ${classifyError.message}`);
    } else if (classifyData) {
      for (const row of classifyData) {
        result.classified[row.tier] = Number(row.count);
      }
    }

    // 2. Get expired objects and delete them from storage
    const { data: expiredObjects, error: fetchError } = await adminClient.rpc(
      "get_expired_objects",
      { p_limit: 50 },
    );

    if (fetchError) {
      result.errors.push(`get_expired_objects: ${fetchError.message}`);
    } else if (expiredObjects && expiredObjects.length > 0) {
      // Group expired objects by bucket for batch deletion
      const byBucket: Record<string, Array<{ id: string; path: string }>> = {};

      for (const obj of expiredObjects) {
        const bucket = obj.bucket;
        const path = obj.object_path;
        if (!byBucket[bucket]) byBucket[bucket] = [];
        byBucket[bucket].push({ id: obj.id, path });
      }

      // Delete from storage and mark as deleted in DB
      for (const [bucket, objs] of Object.entries(byBucket)) {
        // Check which objects have delete_on_expire = true
        const { data: policyData } = await adminClient
          .from("storage_lifecycle_policy")
          .select("delete_on_expire")
          .eq("object_type", expiredObjects.find((o: any) => o.bucket === bucket)?.object_type)
          .maybeSingle();

        const shouldDelete = policyData?.delete_on_expire ?? true;

        if (shouldDelete) {
          const paths = objs.map((o) => o.path);
          const { error: storageError } = await adminClient.storage
            .from(bucket)
            .remove(paths);

          if (storageError) {
            result.errors.push(`storage.remove(${bucket}): ${storageError.message}`);
          } else {
            result.deleted += paths.length;
            // Only mark as deleted in DB when storage deletion succeeded.
            // Marking objects deleted when the storage object still exists
            // creates orphaned files that never get cleaned up.
            for (const obj of objs) {
              const { error: markError } = await adminClient.rpc("mark_object_deleted", {
                p_id: obj.id,
              });
              if (markError) {
                result.errors.push(`mark_object_deleted(${obj.id}): ${markError.message}`);
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
