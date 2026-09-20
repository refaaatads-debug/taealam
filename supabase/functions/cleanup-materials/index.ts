import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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
    return new Response(JSON.stringify({ error: "تعذر تنظيف المواد المنتهية" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
