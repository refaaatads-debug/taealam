import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const { action, userId, amount, note } = await req.json();
    if (!userId || !amount || amount <= 0) throw new Error("بيانات غير صالحة");
    if (!["credit", "debit"].includes(action)) throw new Error("نوع العملية غير صحيح");

    let newBalance: number | null = null;

    if (action === "credit") {
      const { data, error } = await supabase.rpc("credit_wallet_balance", {
        _user_id: userId,
        _amount: amount,
        _stripe_session_id: `admin_${userData.user.id}_${Date.now()}`,
        _description: `شحن يدوي من الإدارة${note ? ` - ${note}` : ""}`,
      });
      if (error) throw error;
      newBalance = data as number;
    } else {
      const { data, error } = await supabase.rpc("deduct_wallet_balance", {
        _user_id: userId,
        _amount: amount,
        _reference_id: null,
        _description: `استرداد/خصم يدوي من الإدارة${note ? ` - ${note}` : ""}`,
      });
      if (error) throw error;
      newBalance = data as number;
    }

    // Audit log
    await supabase.from("system_logs").insert({
      level: "info",
      source: "admin_wallet_action",
      message: `Admin ${action} ${amount} SAR for user ${userId}`,
      user_id: userData.user.id,
      metadata: { action, target_user: userId, amount, note, new_balance: newBalance },
    });

    return new Response(JSON.stringify({ success: true, newBalance }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.error("admin-wallet-action error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
