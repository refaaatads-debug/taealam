import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Soft delete expired materials
    const { data, error } = await supabase
      .from("session_materials")
      .update({ is_deleted: true })
      .lt("expires_at", new Date().toISOString())
      .eq("is_deleted", false)
      .select("id");

    if (error) throw error;

    const count = data?.length || 0;
    console.log(`Cleaned up ${count} expired session materials`);

    return new Response(JSON.stringify({ success: true, cleaned: count }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Cleanup error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
