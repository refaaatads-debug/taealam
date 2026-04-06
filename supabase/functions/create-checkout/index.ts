import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIER_PRICE_MAP: Record<string, string> = {
  basic: "price_1THIkVQYkuo9PgsE3JqR2Fco",
  standard: "price_1THIlwQYkuo9PgsEf0saZDzS",
  premium: "price_1THImqQYkuo9PgsEqj8ur9ms",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("Stripe not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { plan_id, success_url, cancel_url, promo_code } = await req.json();
    if (!plan_id) {
      return new Response(JSON.stringify({ error: "plan_id مطلوب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: plan } = await adminClient.from("subscription_plans").select("*").eq("id", plan_id).single();
    if (!plan) {
      return new Response(JSON.stringify({ error: "الباقة غير موجودة" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle FREE plans — activate directly without Stripe
    if (plan.price <= 0) {
      const endsAt = new Date();
      endsAt.setDate(endsAt.getDate() + 30);

      await adminClient.from("user_subscriptions").insert({
        user_id: user.id,
        plan_id: plan.id,
        sessions_remaining: plan.sessions_count,
        ends_at: endsAt.toISOString(),
        is_active: true,
      });

      await adminClient.from("notifications").insert({
        user_id: user.id,
        title: "تم تفعيل باقتك المجانية! 🎉",
        body: `لديك ${plan.sessions_count} حصة متاحة. استمتع بالتعلم!`,
        type: "payment",
      });

      return new Response(JSON.stringify({ free: true, activated: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceId = TIER_PRICE_MAP[plan.tier];
    if (!priceId) {
      return new Response(JSON.stringify({ error: "لا يوجد سعر مرتبط بهذه الباقة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Build checkout session options
    const sessionOptions: any = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: success_url || `${req.headers.get("origin")}/payment-success`,
      cancel_url: cancel_url || `${req.headers.get("origin")}/pricing?payment=cancelled`,
      metadata: {
        user_id: user.id,
        plan_id: plan.id,
        plan_tier: plan.tier,
        sessions_count: String(plan.sessions_count),
      },
      allow_promotion_codes: true,
    };

    // If a specific promo code was provided, look it up and apply
    if (promo_code) {
      try {
        const promoCodes = await stripe.promotionCodes.list({ code: promo_code, active: true, limit: 1 });
        if (promoCodes.data.length > 0) {
          sessionOptions.discounts = [{ promotion_code: promoCodes.data[0].id }];
          delete sessionOptions.allow_promotion_codes; // Can't use both
        }
      } catch (e) {
        console.log("Promo code lookup failed, allowing manual entry:", e);
      }
    }

    const session = await stripe.checkout.sessions.create(sessionOptions);

    // Record payment
    await adminClient.from("payment_records").insert({
      user_id: user.id,
      stripe_session_id: session.id,
      amount: Number(plan.price),
      payment_type: "subscription",
      plan_id: plan.id,
      status: "pending",
    });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Checkout error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "خطأ" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
