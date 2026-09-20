import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getAllowedOrigin, getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const rate = checkEdgeRateLimit(req, "create-session-checkout", 10);
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: "طلبات كثيرة، حاول لاحقاً" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSeconds) },
    });
  }

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

    const { booking_id } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "بيانات ناقصة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Fetch booking from DB to get the real price — never trust client amount
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: booking, error: bookingError } = await adminClient.from("bookings")
      .select("id, price, student_id, teacher_id, status")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: "الحجز غير موجود" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user owns this booking
    if (booking.student_id !== user.id) {
      return new Response(JSON.stringify({ error: "غير مصرح بالدفع لهذا الحجز" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Don't allow paying for already confirmed bookings
    if (booking.status === "confirmed" || booking.status === "completed") {
      return new Response(JSON.stringify({ error: "الحجز مؤكد بالفعل" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amount = booking.price || 0;
    if (amount <= 0) {
      return new Response(JSON.stringify({ error: "سعر الحجز غير صالح" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get teacher name for description
    const { data: teacherProfile } = await adminClient.from("profiles")
      .select("full_name")
      .eq("user_id", booking.teacher_id)
      .single();

    const description = `حصة مع ${teacherProfile?.full_name || "معلم"}`;

    // Check for existing Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const appOrigin = getAllowedOrigin(req.headers.get("origin"));
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "sar",
            product_data: {
              name: "حجز حصة خصوصية",
              description,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${appOrigin}/payment-success?booking=${booking_id}`,
      cancel_url: `${appOrigin}/booking?payment=cancelled`,
      metadata: {
        user_id: user.id,
        booking_id,
        payment_type: "session",
      },
    });

    // Record payment with the server-side amount
    await adminClient.from("payment_records").insert({
      user_id: user.id,
      booking_id,
      stripe_session_id: session.id,
      amount,
      payment_type: "session",
      status: "pending",
    });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Session checkout error:", e);
    return new Response(JSON.stringify({ error: "تعذر إنشاء جلسة الدفع" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
