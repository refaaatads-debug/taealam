import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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
      // Check if user already used free trial via profile flag
      const { data: profile } = await adminClient
        .from("profiles")
        .select("free_trial_used")
        .eq("user_id", user.id)
        .single();

      if (profile?.free_trial_used === true) {
        return new Response(JSON.stringify({ free: true, eligible: false, error: "لقد استخدمت الباقة المجانية من قبل. يمكنك الاشتراك في باقة مدفوعة." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const endsAt = new Date();
      endsAt.setDate(endsAt.getDate() + 30);

      const sessionDuration = plan.session_duration_minutes || 45;
      const totalMinutes = plan.sessions_count * sessionDuration;
      await adminClient.from("user_subscriptions").insert({
        user_id: user.id,
        plan_id: plan.id,
        sessions_remaining: plan.sessions_count,
        total_hours: totalMinutes / 60,
        remaining_minutes: totalMinutes,
        ends_at: endsAt.toISOString(),
        is_active: true,
      });

      // Mark free trial as used
      await adminClient.from("profiles").update({ free_trial_used: true }).eq("user_id", user.id);

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

    // Check for existing Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Build checkout session options - use DYNAMIC pricing from database
    // (price_data ensures the price always matches what admin sets in DB)
    const unitAmount = Math.round(Number(plan.price) * 100);
    const sessionOptions: any = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{
        price_data: {
          currency: "sar",
          product_data: {
            name: plan.name_ar || `باقة ${plan.tier}`,
            metadata: { plan_id: plan.id, tier: plan.tier },
          },
          unit_amount: unitAmount,
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
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
          delete sessionOptions.allow_promotion_codes;
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
