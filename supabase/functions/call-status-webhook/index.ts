import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PRICE_PER_MINUTE = 0.30;

async function getCallPricePerMinute(supabase: any): Promise<number> {
  try {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "call_price_per_minute")
      .maybeSingle();
    const v = parseFloat(data?.value);
    return isNaN(v) || v < 0 ? DEFAULT_PRICE_PER_MINUTE : v;
  } catch {
    return DEFAULT_PRICE_PER_MINUTE;
  }
}

// Twilio sends application/x-www-form-urlencoded
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const PRICE_PER_MINUTE = await getCallPricePerMinute(supabase);

    // Parse Twilio form payload
    const formData = await req.formData();
    const callSid = formData.get("CallSid")?.toString();
    const callStatus = formData.get("CallStatus")?.toString(); // queued|ringing|in-progress|completed|busy|failed|no-answer|canceled
    const callDuration = Number(formData.get("CallDuration") || 0); // seconds (only on completed)

    console.log("Twilio webhook:", { callSid, callStatus, callDuration });

    if (!callSid) {
      return new Response("Missing CallSid", { status: 400, headers: corsHeaders });
    }

    // Find the matching call log
    const { data: callLog, error: fetchErr } = await supabase
      .from("call_logs")
      .select("*")
      .eq("twilio_call_sid", callSid)
      .maybeSingle();

    if (fetchErr || !callLog) {
      console.error("Call log not found:", callSid, fetchErr);
      return new Response("Call log not found", { status: 404, headers: corsHeaders });
    }

    // Map Twilio status → our internal status
    const statusMap: Record<string, string> = {
      "queued": "initiated",
      "ringing": "ringing",
      "in-progress": "in_progress",
      "completed": "completed",
      "busy": "failed",
      "failed": "failed",
      "no-answer": "failed",
      "canceled": "canceled",
    };
    const newStatus = statusMap[callStatus || ""] || callStatus || "unknown";

    const updates: Record<string, unknown> = { status: newStatus };

    // Final call → calculate actual duration & refund difference
    if (callStatus === "completed" && callDuration > 0) {
      const actualMinutes = callDuration / 60;
      const actualCost = Math.round(actualMinutes * PRICE_PER_MINUTE * 100) / 100;
      const estimatedCost = Number(callLog.cost || 0);
      const refund = Math.max(0, Math.round((estimatedCost - actualCost) * 100) / 100);

      updates.duration_minutes = Math.round(actualMinutes * 100) / 100;
      updates.cost = actualCost;
      updates.ended_at = new Date().toISOString();

      if (refund > 0) {
        try {
          await supabase.rpc("credit_wallet_balance", {
            _user_id: callLog.teacher_id,
            _amount: refund,
            _stripe_session_id: `refund_${callSid}`,
            _description: `استرداد فرق مكالمة (${callDuration}ث فعلي مقابل ${callLog.estimated_minutes}د مقدّرة)`,
          });
          console.log(`Refunded ${refund} SAR to teacher ${callLog.teacher_id}`);
        } catch (refundErr) {
          console.error("Refund failed:", refundErr);
        }
      }
    } else if (["busy", "failed", "no-answer", "canceled"].includes(callStatus || "")) {
      // Call never connected — full refund
      const fullRefund = Number(callLog.cost || 0);
      updates.duration_minutes = 0;
      updates.cost = 0;
      updates.ended_at = new Date().toISOString();
      updates.error_message = `Call ${callStatus}`;

      if (fullRefund > 0) {
        try {
          await supabase.rpc("credit_wallet_balance", {
            _user_id: callLog.teacher_id,
            _amount: fullRefund,
            _stripe_session_id: `refund_${callSid}`,
            _description: `استرداد كامل - مكالمة لم تتم (${callStatus})`,
          });
          console.log(`Full refund ${fullRefund} SAR for failed call`);
        } catch (refundErr) {
          console.error("Full refund failed:", refundErr);
        }
      }
    }

    await supabase.from("call_logs").update(updates).eq("id", callLog.id);

    // Twilio expects empty TwiML or 200 OK
    return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.error("call-status-webhook error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
