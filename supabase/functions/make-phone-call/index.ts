import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

// Backwards-compatible entrypoint. Destination phones are never accepted here:
// the trusted conference handler resolves both authorized booking participants.
serve(async (req) => {
  const corsHeaders = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("{}", { status: 405, headers: corsHeaders });
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return new Response(
    JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  const rate = checkEdgeRateLimit(req, "make-phone-call", 5);
  if (!rate.allowed) return new Response(JSON.stringify({ error: "طلبات كثيرة، حاول لاحقاً" }),
    { status: 429, headers: { ...corsHeaders, "Retry-After": String(rate.retryAfterSeconds) } });
  try {
    const body = await req.json();
    const upstream = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-call`, {
      method: "POST",
      headers: { Authorization: authorization, apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
        "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: body.bookingId,
        studentId: body.studentId ?? body.student_id,
        estimatedMinutes: body.estimatedMinutes,
      }),
    });
    return new Response(upstream.body, { status: upstream.status, headers: corsHeaders });
  } catch {
    return new Response(JSON.stringify({ success: false, error: "تعذر بدء المكالمة" }),
      { status: 500, headers: corsHeaders });
  }
});
