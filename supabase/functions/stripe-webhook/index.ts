import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

serve(async (req) => {
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("Stripe not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });
    const signature = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    const body = await req.text();
    let event: Stripe.Event;

    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      event = JSON.parse(body) as Stripe.Event;
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const planId = session.metadata?.plan_id;
      const bookingId = session.metadata?.booking_id;
      const sessionsCount = parseInt(session.metadata?.sessions_count ?? "0");

      // Handle session booking payment
      if (userId && bookingId) {
        // Update booking status to confirmed
        await adminClient.from("bookings")
          .update({ status: "confirmed", session_status: "confirmed" })
          .eq("id", bookingId);

        // Update payment record
        await adminClient.from("payment_records")
          .update({ status: "completed", stripe_payment_intent: session.payment_intent as string })
          .eq("stripe_session_id", session.id);

        // Notify student
        await adminClient.from("notifications").insert({
          user_id: userId,
          title: "تم تأكيد حجزك! ✅",
          body: "تم الدفع بنجاح وتم تأكيد حصتك. يمكنك الآن الانضمام للحصة في الموعد المحدد.",
          type: "booking",
        });

        // Notify teacher
        const { data: booking } = await adminClient.from("bookings")
          .select("teacher_id, scheduled_at")
          .eq("id", bookingId)
          .single();

        if (booking?.teacher_id) {
          await adminClient.from("notifications").insert({
            user_id: booking.teacher_id,
            title: "حجز جديد مؤكد! 📚",
            body: `لديك حصة جديدة مؤكدة بتاريخ ${new Date(booking.scheduled_at).toLocaleDateString("ar-SA")}`,
            type: "booking",
          });
        }

        await adminClient.from("system_logs").insert({
          level: "info",
          source: "stripe-webhook",
          message: `Booking ${bookingId} confirmed for user ${userId}`,
          metadata: { session_id: session.id, booking_id: bookingId, amount: session.amount_total },
          user_id: userId,
        });
      }

      // Handle subscription payment
      if (userId && planId) {
        await adminClient.from("payment_records")
          .update({ status: "completed", stripe_payment_intent: session.payment_intent as string })
          .eq("stripe_session_id", session.id);

        const endsAt = new Date();
        endsAt.setDate(endsAt.getDate() + 30);

        await adminClient.from("user_subscriptions").insert({
          user_id: userId,
          plan_id: planId,
          sessions_remaining: sessionsCount,
          ends_at: endsAt.toISOString(),
          is_active: true,
        });

        await adminClient.from("notifications").insert({
          user_id: userId,
          title: "تم تفعيل اشتراكك! 🎉",
          body: `تم تفعيل باقتك بنجاح. لديك ${sessionsCount} حصة متاحة.`,
          type: "payment",
        });

        await adminClient.from("system_logs").insert({
          level: "info",
          source: "stripe-webhook",
          message: `Payment completed for user ${userId}`,
          metadata: { session_id: session.id, plan_id: planId, amount: session.amount_total },
          user_id: userId,
        });
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await adminClient.from("payment_records")
        .update({ status: "expired" })
        .eq("stripe_session_id", session.id);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(JSON.stringify({ error: "Webhook error" }), { status: 400 });
  }
});
