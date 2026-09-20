import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

const PRODUCT_TIER_MAP: Record<string, string> = {
  "prod_UFoN4vXiVUs4cn": "basic",
  "prod_UFoOUgLN4I5JkQ": "standard",
  "prod_UFoP1Xw9o8OasG": "premium",
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const rate = checkEdgeRateLimit(req, "check-subscription", 20);
  if (!rate.allowed) {
    return new Response(JSON.stringify({ subscribed: false, error: "طلبات كثيرة، حاول لاحقاً" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSeconds) },
    });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ subscribed: false, error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) {
      return new Response(JSON.stringify({ subscribed: false, error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
      timeout: 8000,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    let customers;
    try {
      customers = await stripe.customers.list({ email: user.email, limit: 1 });
    } finally {
      clearTimeout(timeoutId);
    }

    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    let tier = null;
    let subscriptionEnd = null;
    let productId = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      productId = subscription.items.data[0].price.product as string;
      tier = PRODUCT_TIER_MAP[productId] || null;
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      tier,
      product_id: productId,
      subscription_end: subscriptionEnd,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes("abort") || errorMessage.includes("timeout");
    console.error("check-subscription error:", error);
    return new Response(JSON.stringify({
      error: isTimeout ? "انتهت مهلة الطلب، حاول مرة أخرى" : "تعذر التحقق من الاشتراك",
      subscribed: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: isTimeout ? 504 : 500,
    });
  }
});
