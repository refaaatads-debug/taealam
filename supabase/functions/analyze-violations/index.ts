import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_WORDS = [
  "رقم الصفحة", "رقم السؤال", "رقم التمرين", "صفحة رقم",
  "page number", "question number", "exercise",
  "رقم الدرس", "رقم الوحدة", "رقم الفصل",
];

function regexPreCheck(text: string): { suspicious: boolean; matches: string[] } {
  const patterns = [
    /\b\d{7,15}\b/g,
    /\+?\d{1,3}[\s-]?\d{6,14}/g,
    /[\w.-]+@[\w.-]+\.\w{2,}/g,
    /(?:واتساب|واتس|whatsapp|whats\s*app)/gi,
    /(?:تلي?غرام|تلي?جرام|telegram)/gi,
    /(?:سناب|snapchat|snap\s*chat)/gi,
    /(?:انستا|انستغرام|instagram|insta)/gi,
    /(?:تواصل\s*معي|كلمني|اتصل\s*(?:بي|فيني)|رقمي|نمرتي|أضفني|ضيفني)/gi,
    /(?:contact\s*me|call\s*me|my\s*number|add\s*me|reach\s*me|dm\s*me)/gi,
    /(?:خارج\s*المنصة|برا\s*الموقع|outside\s*(?:the\s*)?platform)/gi,
  ];
  const matches: string[] = [];
  for (const p of patterns) {
    const found = text.match(p);
    if (found) matches.push(...found);
  }
  return { suspicious: matches.length > 0, matches };
}

function isLikelyFalsePositive(text: string, matches: string[]): boolean {
  const lower = text.toLowerCase();
  for (const allowed of ALLOWED_WORDS) {
    if (lower.includes(allowed.toLowerCase())) {
      if (matches.every(m => /^\d+$/.test(m))) return true;
    }
  }
  return false;
}

async function callAIWithRetry(apiKey: string, body: any, maxRetries = 2) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const start = Date.now();
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseTime = Date.now() - start;
      if (!resp.ok) {
        lastError = new Error(`AI error ${resp.status}`);
        if (resp.status === 429 || resp.status === 402) throw lastError;
        continue;
      }
      return { result: await resp.json(), retryCount: attempt, responseTime };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (lastError.message.includes("429") || lastError.message.includes("402")) throw lastError;
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await supabase.auth.getUser(token);
    const userId: string | null = user?.id || null;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, booking_id, source = "chat" } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages مطلوبة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Authorize: caller must be a participant of the booking (or admin)
    if (booking_id) {
      const { data: booking } = await adminClient
        .from("bookings").select("student_id, teacher_id").eq("id", booking_id).maybeSingle();
      const { data: adminRole } = await adminClient
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      const isParticipant = booking && (booking.student_id === userId || booking.teacher_id === userId);
      if (!isParticipant && !adminRole) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const results: Array<{
      index: number; text: string; is_violation: boolean;
      confidence: number; reason: string; detected_patterns: string[];
    }> = [];

    let aiCallCount = 0;
    let totalResponseTime = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const text = typeof msg === "string" ? msg : msg.text || msg.content || "";
      const senderId = typeof msg === "object" ? msg.sender_id || msg.user_id : null;
      if (!text.trim()) continue;

      const { suspicious, matches } = regexPreCheck(text);
      if (!suspicious) {
        results.push({ index: i, text, is_violation: false, confidence: 0, reason: "لا توجد أنماط مشبوهة", detected_patterns: [] });
        continue;
      }

      if (isLikelyFalsePositive(text, matches)) {
        results.push({ index: i, text, is_violation: false, confidence: 0.1, reason: "سياق تعليمي عادي", detected_patterns: matches });
        continue;
      }

      // AI analysis with retry
      let analysis = { is_violation: true, confidence: 0.6, reason: "كشف بالأنماط (Regex)", violation_type: "contact_sharing" };
      try {
        const aiResult = await callAIWithRetry(LOVABLE_API_KEY, {
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `أنت نظام كشف مخالفات في منصة تعليمية. حلل الرسالة لاكتشاف مشاركة معلومات اتصال خارجية.
المخالفات: أرقام هواتف، إيميلات، واتساب/تلغرام/سناب، عبارات "تواصل معي"/"رقمي"/"كلمني برا".
ليس مخالفة: "رقم الصفحة"، أرقام تعليمية، ذكر تطبيقات بسياق عام.
أجب بـ JSON: {"is_violation": bool, "confidence": 0-1, "reason": "سبب", "violation_type": "contact_sharing/platform_mention/coded_message/none"}`
            },
            { role: "user", content: `حلل:\n"${text}"\n\nأنماط regex: ${matches.join(", ")}` }
          ],
          tools: [{
            type: "function",
            function: {
              name: "analyze_violation",
              description: "Analyze message for violations",
              parameters: {
                type: "object",
                properties: {
                  is_violation: { type: "boolean" },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  reason: { type: "string" },
                  violation_type: { type: "string", enum: ["contact_sharing", "platform_mention", "coded_message", "none"] },
                },
                required: ["is_violation", "confidence", "reason", "violation_type"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "analyze_violation" } },
        });

        aiCallCount++;
        totalResponseTime += aiResult.responseTime;

        try {
          const toolCall = aiResult.result.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            analysis = JSON.parse(toolCall.function.arguments);
          }
        } catch { console.error("Failed to parse AI response"); }
      } catch (aiError) {
        console.error("AI analysis failed, using regex fallback:", aiError);
      }

      results.push({
        index: i, text, is_violation: analysis.is_violation,
        confidence: analysis.confidence, reason: analysis.reason, detected_patterns: matches,
      });

      if (analysis.is_violation && analysis.confidence >= 0.5) {
        const violatorId = senderId || userId;
        if (booking_id && violatorId) {
          await adminClient.from("violations").insert({
            booking_id, user_id: violatorId,
            detected_text: matches.join(", "),
            original_message: text,
            confidence_score: analysis.confidence,
            source, violation_type: analysis.violation_type || "contact_sharing",
          });

          const { data: existing } = await adminClient
            .from("user_warnings")
            .select("id, warning_count")
            .eq("user_id", violatorId)
            .eq("warning_type", "contact_violation")
            .single();

          if (existing) {
            const newCount = existing.warning_count + 1;
            await adminClient.from("user_warnings").update({
              warning_count: newCount,
              is_banned: newCount >= 3,
              banned_until: newCount >= 3 ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
            }).eq("id", existing.id);
          } else {
            await adminClient.from("user_warnings").insert({
              user_id: violatorId, warning_type: "contact_violation",
              description: `مخالفة مشاركة معلومات اتصال: ${analysis.reason}`, warning_count: 1,
            });
          }

          const { data: admins } = await adminClient.from("user_roles").select("user_id").eq("role", "admin");
          if (admins) {
            for (const admin of admins) {
              await adminClient.from("notifications").insert({
                user_id: admin.user_id,
                title: "⚠️ مخالفة مكتشفة",
                body: `تم اكتشاف محاولة مشاركة معلومات اتصال: "${text.slice(0, 100)}"`,
                type: "violation",
              });
            }
          }
        }
      }
    }

    // Log AI usage
    if (aiCallCount > 0) {
      await adminClient.from("ai_logs").insert({
        feature_name: "violation_analysis",
        input_summary: `${messages.length} رسالة، ${aiCallCount} تحليل AI`,
        output_summary: `${results.filter(r => r.is_violation).length} مخالفة مكتشفة`,
        status: "success",
        response_time_ms: Math.round(totalResponseTime / aiCallCount),
        quality_score: 100,
        booking_id: booking_id || null,
        user_id: userId,
      });
    }

    return new Response(JSON.stringify({
      total_messages: messages.length,
      violations_found: results.filter(r => r.is_violation).length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "خطأ" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
