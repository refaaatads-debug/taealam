import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify JWT locally via getClaims (avoids slow /user network call)
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.error("Auth getClaims failed:", claimsError);
      throw new Error("Authentication failed");
    }
    const userId = claimsData.claims.sub;

    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) throw new Error("Unauthorized: Admin access required");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const { action, ...params } = await req.json();

    switch (action) {
      case "list": {
        const coupons = await stripe.coupons.list({ limit: 50 });
        // Get promotion codes for each coupon
        const couponsWithCodes = await Promise.all(
          coupons.data.map(async (coupon) => {
            const promoCodes = await stripe.promotionCodes.list({
              coupon: coupon.id,
              limit: 10,
            });
            return { ...coupon, promotion_codes: promoCodes.data };
          })
        );
        return new Response(JSON.stringify({ coupons: couponsWithCodes }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create": {
        const { name, percent_off, amount_off, duration, duration_in_months, code, max_redemptions, expires_at } = params;

        // Create coupon
        const couponData: any = { name, duration: duration || "once" };
        if (percent_off) couponData.percent_off = percent_off;
        if (amount_off) {
          couponData.amount_off = Math.round(amount_off * 100); // Convert to halalas
          couponData.currency = "sar";
        }
        if (duration === "repeating" && duration_in_months) {
          couponData.duration_in_months = duration_in_months;
        }

        const coupon = await stripe.coupons.create(couponData);

        // Create promotion code
        const promoData: any = { coupon: coupon.id, code: code.toUpperCase() };
        if (max_redemptions) promoData.max_redemptions = max_redemptions;
        if (expires_at) promoData.expires_at = Math.floor(new Date(expires_at).getTime() / 1000);

        const promoCode = await stripe.promotionCodes.create(promoData);

        return new Response(JSON.stringify({ coupon, promotion_code: promoCode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "deactivate": {
        const { promotion_code_id } = params;
        const updated = await stripe.promotionCodes.update(promotion_code_id, { active: false });
        return new Response(JSON.stringify({ promotion_code: updated }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "activate": {
        const { promotion_code_id } = params;
        const updated = await stripe.promotionCodes.update(promotion_code_id, { active: true });
        return new Response(JSON.stringify({ promotion_code: updated }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete": {
        const { coupon_id } = params;
        await stripe.coupons.del(coupon_id);
        return new Response(JSON.stringify({ deleted: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
