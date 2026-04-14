import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

serve(async (req) => {
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("Stripe not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // SECURITY: Always require webhook secret and signature
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is not configured");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), { status: 500 });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), { status: 400 });
    }

    const body = await req.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
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
        // SECURITY: Verify amount paid matches booking price
        const { data: booking } = await adminClient.from("bookings")
          .select("price, teacher_id, scheduled_at, student_id")
          .eq("id", bookingId)
          .single();

        if (!booking) {
          console.error("Booking not found:", bookingId);
          return new Response(JSON.stringify({ error: "Booking not found" }), { status: 400 });
        }

        // Verify the user owns this booking
        if (booking.student_id !== userId) {
          console.error("User does not own booking:", { userId, bookingId });
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
        }

        // Verify amount paid matches expected price
        const expectedAmount = Math.round((booking.price || 0) * 100);
        const paidAmount = session.amount_total || 0;
        if (expectedAmount > 0 && paidAmount < expectedAmount) {
          console.error("Amount mismatch:", { expected: expectedAmount, paid: paidAmount });
          await adminClient.from("system_logs").insert({
            level: "error", source: "stripe-webhook",
            message: `Amount mismatch: expected ${expectedAmount}, paid ${paidAmount}`,
            metadata: { booking_id: bookingId, user_id: userId },
          });
          return new Response(JSON.stringify({ error: "Amount mismatch" }), { status: 400 });
        }

        await adminClient.from("bookings")
          .update({ status: "confirmed", session_status: "confirmed" })
          .eq("id", bookingId);

        await adminClient.from("payment_records")
          .update({ status: "completed", stripe_payment_intent: session.payment_intent as string })
          .eq("stripe_session_id", session.id);

        await adminClient.from("notifications").insert({
          user_id: userId,
          title: "تم تأكيد حجزك! ✅",
          body: "تم الدفع بنجاح وتم تأكيد حصتك.",
          type: "booking",
        });

        if (booking.teacher_id) {
          await adminClient.from("notifications").insert({
            user_id: booking.teacher_id,
            title: "حجز جديد مؤكد! 📚",
            body: `لديك حصة جديدة مؤكدة بتاريخ ${new Date(booking.scheduled_at).toLocaleDateString("ar-SA")}`,
            type: "booking",
          });
        }
      }

      // Handle subscription payment
      if (userId && planId) {
        await adminClient.from("payment_records")
          .update({ status: "completed", stripe_payment_intent: session.payment_intent as string || session.subscription as string })
          .eq("stripe_session_id", session.id);

        await adminClient.from("user_subscriptions")
          .update({ is_active: false })
          .eq("user_id", userId)
          .eq("is_active", true);

        const endsAt = new Date();
        endsAt.setDate(endsAt.getDate() + 30);

        const totalHours = sessionsCount;
        await adminClient.from("user_subscriptions").insert({
          user_id: userId,
          plan_id: planId,
          sessions_remaining: sessionsCount,
          total_hours: totalHours,
          remaining_minutes: totalHours * 60,
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
          message: `Subscription activated for user ${userId}`,
          metadata: { session_id: session.id, plan_id: planId, sessions_count: sessionsCount },
          user_id: userId,
        });
      }
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as any;
      if (invoice.billing_reason === "subscription_cycle" && invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const userId = subscription.metadata?.user_id;
        const planId = subscription.metadata?.plan_id;
        const sessionsCount = parseInt(subscription.metadata?.sessions_count ?? "0");

        if (userId && planId && sessionsCount > 0) {
          await adminClient.from("user_subscriptions")
            .update({ is_active: false })
            .eq("user_id", userId)
            .eq("is_active", true);

          const endsAt = new Date();
          endsAt.setDate(endsAt.getDate() + 30);

          const totalHours = sessionsCount;
          await adminClient.from("user_subscriptions").insert({
            user_id: userId,
            plan_id: planId,
            sessions_remaining: sessionsCount,
            total_hours: totalHours,
            remaining_minutes: totalHours * 60,
            ends_at: endsAt.toISOString(),
            is_active: true,
          });

          await adminClient.from("notifications").insert({
            user_id: userId,
            title: "تم تجديد اشتراكك! 🔄",
            body: `تم تجديد باقتك تلقائياً. لديك ${sessionsCount} حصة جديدة.`,
            type: "payment",
          });
        }
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await adminClient.from("payment_records")
        .update({ status: "expired" })
        .eq("stripe_session_id", session.id);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.user_id;
      if (userId) {
        await adminClient.from("user_subscriptions")
          .update({ is_active: false })
          .eq("user_id", userId)
          .eq("is_active", true);

        await adminClient.from("notifications").insert({
          user_id: userId,
          title: "انتهت باقتك 📋",
          body: "انتهى اشتراكك. يمكنك تجديد الباقة للاستمرار في التعلم.",
          type: "subscription_expired",
        });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(JSON.stringify({ error: "Webhook error" }), { status: 400 });
  }
});
