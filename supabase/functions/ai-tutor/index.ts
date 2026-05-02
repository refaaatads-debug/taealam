import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const userRequests = new Map<string, number[]>();
const RATE_LIMIT = 20;
const WINDOW_MS = 60_000;

function checkRate(userId: string): boolean {
  const now = Date.now();
  const timestamps = (userRequests.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return false;
  timestamps.push(now);
  userRequests.set(userId, timestamps);
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, conversation_id } = await req.json();
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    const userId: string | null = user?.id ?? null;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!checkRate(userId)) {
      return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات، حاول بعد دقيقة" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (conversation_id) {
      const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await adminClient.from("ai_conversations").upsert({
        id: conversation_id, user_id: userId, messages, updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const start = Date.now();

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `أنت مدرس ذكي في منصة "تعلّم" التعليمية. تساعد الطلاب في:
- شرح المواد الدراسية (رياضيات، فيزياء، كيمياء، أحياء، لغة عربية، إنجليزية)
- حل الواجبات وتصحيحها
- تلخيص الدروس
- الإجابة على الأسئلة بأسلوب مبسط ومناسب لمستوى الطالب
- تقديم أمثلة تطبيقية

أجب دائماً باللغة العربية. كن ودوداً ومشجعاً. استخدم أمثلة من الحياة اليومية.`,
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    const responseTime = Date.now() - start;

    if (!response.ok) {
      const status = response.status;
      const t = await response.text();

      // Log failure
      await adminClient.from("ai_logs").insert({
        feature_name: "ai_tutor",
        input_summary: `${messages.length} رسائل`,
        status: "failed",
        response_time_ms: responseTime,
        error_message: `HTTP ${status}: ${t.slice(0, 200)}`,
        user_id: userId,
      });

      if (status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات، حاول مرة أخرى لاحقاً" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "الرصيد غير كافٍ" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        await adminClient.from("system_logs").insert({
          level: "error", source: "ai-tutor",
          message: `AI gateway error: ${status}`,
          metadata: { body: t.substring(0, 500) }, user_id: userId,
        });
      } catch {}

      return new Response(JSON.stringify({ error: "خطأ في الاتصال بالذكاء الاصطناعي" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log success
    await adminClient.from("ai_logs").insert({
      feature_name: "ai_tutor",
      input_summary: `${messages.length} رسائل`,
      status: "success",
      response_time_ms: responseTime,
      quality_score: 80,
      user_id: userId,
    });

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
