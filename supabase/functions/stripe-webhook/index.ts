import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

serve(async (req) => {
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("Stripe not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
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
      }

      // Handle subscription payment
      if (userId && planId) {
        await adminClient.from("payment_records")
          .update({ status: "completed", stripe_payment_intent: session.payment_intent as string || session.subscription as string })
          .eq("stripe_session_id", session.id);

        // Deactivate any previous active subscriptions
        await adminClient.from("user_subscriptions")
          .update({ is_active: false })
          .eq("user_id", userId)
          .eq("is_active", true);

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
          message: `Subscription activated for user ${userId}`,
          metadata: { session_id: session.id, plan_id: planId, sessions_count: sessionsCount },
          user_id: userId,
        });
      }
    }

    // Handle subscription renewal
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as any;
      if (invoice.billing_reason === "subscription_cycle" && invoice.subscription) {
        // Get subscription details from Stripe
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const userId = subscription.metadata?.user_id;
        const planId = subscription.metadata?.plan_id;
        const sessionsCount = parseInt(subscription.metadata?.sessions_count ?? "0");

        if (userId && planId && sessionsCount > 0) {
          // Deactivate old
          await adminClient.from("user_subscriptions")
            .update({ is_active: false })
            .eq("user_id", userId)
            .eq("is_active", true);

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

    // Handle subscription cancellation
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
