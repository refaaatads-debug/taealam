import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getAllowedOrigin, getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const rate = checkEdgeRateLimit(req, "wallet-topup", 5);
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: "طلبات كثيرة، حاول لاحقاً" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSeconds) },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "غير مصرح" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData.user?.email) {
        return new Response(JSON.stringify({ error: "غير مصرح" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

    const { amount } = await req.json();
    const topupAmount = Number(amount);
    if (!topupAmount || topupAmount < 10 || topupAmount > 5000) {
      return new Response(
        JSON.stringify({ error: "المبلغ يجب أن يكون بين 10 و 5000 ريال" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: userData.user.email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const origin = getAllowedOrigin(req.headers.get("origin"));

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : userData.user.email,
      line_items: [
        {
          price_data: {
            currency: "sar",
            product_data: { name: `شحن محفظة المعلم — ${topupAmount} ريال` },
            unit_amount: Math.round(topupAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/teacher/wallet?topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/teacher/wallet?topup=cancelled`,
      metadata: {
        type: "wallet_topup",
        payment_type: "wallet_topup",
        user_id: userData.user.id,
        amount: String(topupAmount),
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Wallet top-up error:", err);
    return new Response(
      JSON.stringify({ error: "تعذر إنشاء عملية شحن المحفظة" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
