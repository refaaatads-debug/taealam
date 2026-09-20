import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const rate = checkEdgeRateLimit(req, "wallet-topup-verify", 10);
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
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData.user) throw new Error("Unauthorized");

    const { sessionId } = await req.json();
    if (!sessionId) throw new Error("Missing session id");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return new Response(
        JSON.stringify({ success: false, status: session.payment_status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.mode !== "payment" || (session.currency || "").toLowerCase() !== "sar") {
      return new Response(
        JSON.stringify({ success: false, error: "جلسة شحن غير صالحة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.metadata?.user_id !== userData.user.id) {
      return new Response(
        JSON.stringify({ success: false, error: "غير مصرح بعملية الشحن هذه" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.metadata?.type !== "wallet_topup") {
      return new Response(
        JSON.stringify({ success: false, error: "جلسة شحن غير صالحة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Idempotency: check if already credited
    const { data: existing } = await supabase
      .from("wallet_transactions")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (existing) {
      const { data: w } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      return new Response(
        JSON.stringify({ success: true, alreadyCredited: true, balance: w?.balance }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const amount = Number(session.metadata?.amount || 0);
    const paidAmount = Number(session.amount_total || 0) / 100;
    const currency = (session.currency || "").toLowerCase();
    if (
      !Number.isFinite(amount) ||
      amount < 10 ||
      amount > 5000 ||
      !Number.isFinite(paidAmount) ||
      Math.round(amount * 100) !== Math.round(paidAmount * 100) ||
      currency !== "sar"
    ) {
      console.error("Wallet top-up amount mismatch:", {
        sessionId,
        metadataAmount: amount,
        paidAmount,
        currency,
      });
      return new Response(
        JSON.stringify({ success: false, error: "قيمة عملية الشحن غير صالحة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: newBalance, error: creditError } = await supabase.rpc("credit_wallet_balance", {
      _user_id: userData.user.id,
      _amount: amount,
      _stripe_session_id: sessionId,
      _description: `شحن محفظة (${amount} ريال)`,
    });

    if (creditError) {
      if (creditError.code === "23505") {
        const { data: w } = await supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        return new Response(
          JSON.stringify({ success: true, alreadyCredited: true, balance: w?.balance }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw creditError;
    }

    return new Response(
      JSON.stringify({ success: true, balance: newBalance, credited: amount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Wallet top-up verification error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "تعذر التحقق من عملية الشحن" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
