import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const rate = checkEdgeRateLimit(req, "admin-wallet-action", 10);
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: "طلبات كثيرة، حاول لاحقاً" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSeconds) },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");
    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData.user) throw new Error("Unauthorized");

    // Verify admin
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden — admin only");

    const { action, userId, amount, note = "", operationId } = await req.json();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof userId !== "string" || !uuid.test(userId)
      || typeof operationId !== "string" || !uuid.test(operationId)
      || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0
      || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
      || !["credit", "debit"].includes(action)
      || typeof note !== "string" || note.length > 1000) {
      return new Response(JSON.stringify({
        success: false, error: "بيانات العملية غير صالحة. حدّث الصفحة ثم أعد المحاولة.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data, error } = await supabase.rpc("apply_admin_wallet_operation", {
      _operation_id: operationId,
      _actor_id: userData.user.id,
      _user_id: userId,
      _action: action,
      _amount: amount,
      _note: note,
    });
    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-wallet-action failed", {
      code: typeof err === "object" && err !== null && "code" in err ? err.code : "unknown",
    });
    return new Response(JSON.stringify({ success: false, error: "تعذر تنفيذ العملية المالية" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
