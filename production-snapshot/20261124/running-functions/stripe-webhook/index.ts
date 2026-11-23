import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";

serve(async (req) => {
  let adminClient: ReturnType<typeof createClient> | null = null;
  let claimedEventId: string | null = null;

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

    adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: claimError } = await adminClient
      .from("stripe_webhook_events")
      .insert({ event_id: event.id, event_type: event.type, status: "processing" });

    if (claimError) {
      if (claimError.code === "23505") {
        const { data: existingEvent } = await adminClient
          .from("stripe_webhook_events")
          .select("status")
          .eq("event_id", event.id)
          .maybeSingle();

        if (existingEvent?.status === "failed") {
          const { data: retriedEvent, error: retryClaimError } = await adminClient
            .from("stripe_webhook_events")
            .update({ status: "processing", error_message: null, received_at: new Date().toISOString() })
            .eq("event_id", event.id)
            .eq("status", "failed")
            .select("event_id")
            .maybeSingle();
          if (retryClaimError) throw retryClaimError;
          if (!retriedEvent) {
            return new Response(JSON.stringify({ received: true, duplicate: true }), {
              headers: { "Content-Type": "application/json" },
            });
          }
          claimedEventId = event.id;
        } else {
          return new Response(JSON.stringify({ received: true, duplicate: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      if (claimError.code !== "23505") throw claimError;
    }
    if (!claimedEventId) claimedEventId = event.id;

    // Stripe may retry the same event. Do not grant a booking or subscription twice.
    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      const { data: completedPayment } = await adminClient
        .from("payment_records")
        .select("id")
        .eq("stripe_session_id", checkoutSession.id)
        .eq("status", "completed")
        .maybeSingle();

      if (completedPayment) {
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const { data: processedInvoice } = await adminClient
        .from("invoices")
        .select("id")
        .eq("stripe_session_id", invoice.id)
        .maybeSingle();

      if (processedInvoice) {
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid") {
        return new Response(JSON.stringify({ received: true, ignored: "payment_not_paid" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const userId = session.metadata?.user_id;
      const planId = session.metadata?.plan_id;
      const bookingId = session.metadata?.booking_id;
      const sessionsCount = parseInt(session.metadata?.sessions_count ?? "0");
      const paymentType = session.metadata?.payment_type || session.metadata?.type;

      if (
        !userId ||
        (paymentType !== "session" && paymentType !== "subscription" && paymentType !== "wallet_topup") ||
        (paymentType === "session" && !bookingId) ||
        (paymentType === "subscription" && (!planId || !Number.isInteger(sessionsCount) || sessionsCount <= 0))
      ) {
        console.error("Invalid checkout metadata", { sessionId: session.id, paymentType });
        throw new Error("Invalid checkout metadata");
      }

      if (paymentType === "wallet_topup") {
        const amount = Number(session.metadata?.amount || 0);
        const paidAmount = Number(session.amount_total || 0) / 100;
        if (
          session.mode !== "payment" ||
          (session.currency || "").toLowerCase() !== "sar" ||
          !Number.isFinite(amount) ||
          amount < 10 ||
          amount > 5000 ||
          Math.round(amount * 100) !== Math.round(paidAmount * 100)
        ) {
          console.error("Wallet payment mismatch", { sessionId: session.id, amount, paidAmount });
          throw new Error("Wallet payment mismatch");
        }

        const { error: creditError } = await adminClient.rpc("credit_wallet_balance", {
          _user_id: userId,
          _amount: amount,
          _stripe_session_id: session.id,
          _description: `شحن محفظة (${amount} ريال)`,
        });
        if (creditError && creditError.code !== "23505") throw creditError;

        await adminClient.from("notifications").insert({
          user_id: userId,
          title: "تم شحن محفظتك بنجاح",
          body: `تمت إضافة ${amount} ريال إلى محفظتك.`,
          type: "payment",
        });
      }

      // Handle session booking payment
      if (paymentType === "session" && bookingId) {
        if (session.mode !== "payment" || (session.currency || "").toLowerCase() !== "sar") {
          throw new Error("Invalid booking payment session");
        }

        // SECURITY: Verify amount paid matches booking price
        const { data: booking } = await adminClient.from("bookings")
          .select("price, teacher_id, scheduled_at, student_id")
          .eq("id", bookingId)
          .single();

        if (!booking) {
          console.error("Booking not found:", bookingId);
          throw new Error("Booking not found");
        }

        // Verify the user owns this booking
        if (booking.student_id !== userId) {
          console.error("User does not own booking:", { userId, bookingId });
          throw new Error("Unauthorized booking payment");
        }

        // Verify amount paid matches expected price
        const expectedAmount = Math.round((booking.price || 0) * 100);
        const paidAmount = session.amount_total || 0;
        if (expectedAmount <= 0 || paidAmount !== expectedAmount) {
          console.error("Amount mismatch:", { expected: expectedAmount, paid: paidAmount });
          await adminClient.from("system_logs").insert({
            level: "error", source: "stripe-webhook",
            message: `Amount mismatch: expected ${expectedAmount}, paid ${paidAmount}`,
            metadata: { booking_id: bookingId, user_id: userId },
          });
          throw new Error("Amount mismatch");
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
      if (paymentType === "subscription" && planId) {
        if (session.mode !== "subscription" || (session.currency || "").toLowerCase() !== "sar") {
          throw new Error("Invalid subscription payment session");
        }

        const { data: planForPayment } = await adminClient
          .from("subscription_plans")
          .select("price, sessions_count")
          .eq("id", planId)
          .single();

        const expectedSubtotal = Math.round(Number(planForPayment?.price || 0) * 100);
        if (
          !planForPayment ||
          expectedSubtotal <= 0 ||
          session.amount_subtotal !== expectedSubtotal ||
          sessionsCount !== Number(planForPayment.sessions_count)
        ) {
          console.error("Subscription payment mismatch", {
            sessionId: session.id,
            planId,
            expectedSubtotal,
            amountSubtotal: session.amount_subtotal,
            sessionsCount,
          });
          throw new Error("Subscription payment mismatch");
        }

        await adminClient.from("payment_records")
          .update({ status: "completed", stripe_payment_intent: session.payment_intent as string || session.subscription as string })
          .eq("stripe_session_id", session.id);

        await adminClient.from("user_subscriptions")
          .update({ is_active: false })
          .eq("user_id", userId)
          .eq("is_active", true);

        const endsAt = new Date();
        endsAt.setDate(endsAt.getDate() + 30);

        const { data: planData } = await adminClient
          .from("subscription_plans").select("session_duration_minutes").eq("id", planId).single();
        const sessionDuration = planData?.session_duration_minutes || 45;
        const totalMinutes = sessionsCount * sessionDuration;
        const { data: insertedSub } = await adminClient.from("user_subscriptions").insert({
          user_id: userId,
          plan_id: planId,
          sessions_remaining: sessionsCount,
          total_hours: totalMinutes / 60,
          remaining_minutes: totalMinutes,
          ends_at: endsAt.toISOString(),
          is_active: true,
        }).select("id").single();

        // Issue ONE invoice per package purchase (ZATCA-compliant)
        try {
          const totalAmount = (session.amount_total || 0) / 100;
          const vatRate = 0.15;
          const netAmount = +(totalAmount / (1 + vatRate)).toFixed(2);
          const vatAmount = +(totalAmount - netAmount).toFixed(2);
          const hoursPurchased = +(totalMinutes / 60).toFixed(2);

          const { data: paymentRec } = await adminClient.from("payment_records")
            .select("id").eq("stripe_session_id", session.id).maybeSingle();

          const { data: invRow } = await adminClient.from("invoices").insert({
            student_id: userId,
            plan_id: planId,
            subscription_id: insertedSub?.id ?? null,
            payment_record_id: paymentRec?.id ?? null,
            stripe_session_id: session.id,
            hours_purchased: hoursPurchased,
            total_amount: totalAmount,
            vat_rate: vatRate,
            vat_amount: vatAmount,
            net_amount: netAmount,
            currency: (session.currency || "sar").toUpperCase(),
            zatca_status: "pending",
          }).select("id, invoice_number").single();

          // Build a simple QR payload (placeholder until ZATCA submission flow runs)
          if (invRow?.id) {
            const qrPayload = JSON.stringify({
              invoice: invRow.invoice_number,
              total: totalAmount,
              vat: vatAmount,
              issued_at: new Date().toISOString(),
            });
            await adminClient.from("invoices")
              .update({ qr_code: btoa(unescape(encodeURIComponent(qrPayload))) })
              .eq("id", invRow.id);
          }
        } catch (e) {
          console.error("Failed to issue invoice:", e);
          await adminClient.from("system_logs").insert({
            level: "error", source: "stripe-webhook",
            message: "Failed to issue invoice on package purchase",
            metadata: { session_id: session.id, user_id: userId, error: String(e) },
          });
        }

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

          const { data: planData2 } = await adminClient
            .from("subscription_plans").select("session_duration_minutes").eq("id", planId).single();
          const sessionDuration2 = planData2?.session_duration_minutes || 45;
          const totalMinutes2 = sessionsCount * sessionDuration2;
          const { data: insertedSub2 } = await adminClient.from("user_subscriptions").insert({
            user_id: userId,
            plan_id: planId,
            sessions_remaining: sessionsCount,
            total_hours: totalMinutes2 / 60,
            remaining_minutes: totalMinutes2,
            ends_at: endsAt.toISOString(),
            is_active: true,
          }).select("id").single();

          // Issue ONE invoice for the renewal cycle
          try {
            const totalAmount2 = (invoice.amount_paid || 0) / 100;
            const vatRate = 0.15;
            const netAmount2 = +(totalAmount2 / (1 + vatRate)).toFixed(2);
            const vatAmount2 = +(totalAmount2 - netAmount2).toFixed(2);
            const hoursPurchased2 = +(totalMinutes2 / 60).toFixed(2);

            const { data: invRow2 } = await adminClient.from("invoices").insert({
              student_id: userId,
              plan_id: planId,
              subscription_id: insertedSub2?.id ?? null,
              stripe_session_id: invoice.id,
              hours_purchased: hoursPurchased2,
              total_amount: totalAmount2,
              vat_rate: vatRate,
              vat_amount: vatAmount2,
              net_amount: netAmount2,
              currency: (invoice.currency || "sar").toUpperCase(),
              zatca_status: "pending",
              metadata: { source: "subscription_renewal", stripe_invoice_id: invoice.id },
            }).select("id, invoice_number").single();

            if (invRow2?.id) {
              const qrPayload = JSON.stringify({
                invoice: invRow2.invoice_number,
                total: totalAmount2,
                vat: vatAmount2,
                issued_at: new Date().toISOString(),
              });
              await adminClient.from("invoices")
                .update({ qr_code: btoa(unescape(encodeURIComponent(qrPayload))) })
                .eq("id", invRow2.id);
            }
          } catch (e) {
            console.error("Failed to issue renewal invoice:", e);
          }

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

    await adminClient
      .from("stripe_webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), error_message: null })
      .eq("event_id", claimedEventId);

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    if (adminClient && claimedEventId) {
      await adminClient
        .from("stripe_webhook_events")
        .update({ status: "failed", error_message: String(e).slice(0, 500) })
        .eq("event_id", claimedEventId);
    }
    return new Response(JSON.stringify({ error: "Webhook error" }), { status: 400 });
  }
});
