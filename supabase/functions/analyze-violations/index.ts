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

// Quick regex pre-filter
function regexPreCheck(text: string): { suspicious: boolean; matches: string[] } {
  const patterns = [
    /\b\d{7,15}\b/g,                          // Phone numbers
    /\+?\d{1,3}[\s-]?\d{6,14}/g,              // International phones
    /[\w.-]+@[\w.-]+\.\w{2,}/g,               // Emails
    /(?:واتساب|واتس|whatsapp|whats\s*app)/gi, // WhatsApp
    /(?:تلي?غرام|تلي?جرام|telegram)/gi,       // Telegram
    /(?:سناب|snapchat|snap\s*chat)/gi,         // Snapchat
    /(?:انستا|انستغرام|instagram|insta)/gi,    // Instagram
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

// Check if matches are false positives
function isLikelyFalsePositive(text: string, matches: string[]): boolean {
  const lower = text.toLowerCase();
  for (const allowed of ALLOWED_WORDS) {
    if (lower.includes(allowed.toLowerCase())) {
      // If ALL matches are just numbers near allowed context words
      const onlyNumbers = matches.every(m => /^\d+$/.test(m));
      if (onlyNumbers) return true;
    }
  }
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    let userId: string | null = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const { messages, booking_id, source = "chat" } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages مطلوبة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: Array<{
      index: number;
      text: string;
      is_violation: boolean;
      confidence: number;
      reason: string;
      detected_patterns: string[];
    }> = [];

    // Process each message
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const text = typeof msg === "string" ? msg : msg.text || msg.content || "";
      const senderId = typeof msg === "object" ? msg.sender_id || msg.user_id : null;

      if (!text.trim()) continue;

      // Step 1: Regex pre-check
      const { suspicious, matches } = regexPreCheck(text);

      if (!suspicious) {
        results.push({
          index: i, text, is_violation: false,
          confidence: 0, reason: "لا توجد أنماط مشبوهة", detected_patterns: [],
        });
        continue;
      }

      // Step 2: Check false positives
      if (isLikelyFalsePositive(text, matches)) {
        results.push({
          index: i, text, is_violation: false,
          confidence: 0.1, reason: "سياق تعليمي عادي", detected_patterns: matches,
        });
        continue;
      }

      // Step 3: AI analysis for context understanding
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `أنت نظام كشف مخالفات في منصة تعليمية. مهمتك تحليل رسائل المحادثة لاكتشاف محاولات مشاركة معلومات اتصال خارجية.

أنواع المخالفات:
1. مشاركة أرقام هواتف (بأي صيغة)
2. مشاركة إيميلات
3. ذكر واتساب/تلغرام/سناب أو أي وسيلة تواصل خارجية
4. عبارات مثل "تواصل معي"، "رقمي"، "كلمني برا"
5. محاولات مموهة لمشاركة أرقام (مثل تقسيم الرقم على عدة رسائل)

ما ليس مخالفة:
- "رقم الصفحة 5"، "السؤال رقم 3"
- أرقام تعليمية (معادلات، إحصائيات)
- ذكر تطبيقات بسياق عام غير شخصي

أجب بـ JSON فقط:
{"is_violation": true/false, "confidence": 0.0-1.0, "reason": "سبب قصير", "violation_type": "contact_sharing/platform_mention/coded_message/none"}`
            },
            { role: "user", content: `حلل هذه الرسالة:\n"${text}"\n\nالأنماط المكتشفة بالـ regex: ${matches.join(", ")}` }
          ],
          tools: [{
            type: "function",
            function: {
              name: "analyze_violation",
              description: "Analyze message for contact sharing violations",
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
        }),
      });

      if (!aiResponse.ok) {
        // Fallback to regex-only if AI fails
        console.error("AI analysis failed:", aiResponse.status);
        results.push({
          index: i, text, is_violation: true,
          confidence: 0.6, reason: "كشف بالأنماط (Regex)", detected_patterns: matches,
        });

        if (booking_id && senderId) {
          await adminClient.from("violations").insert({
            booking_id, user_id: senderId,
            detected_text: matches.join(", "),
            original_message: text,
            confidence_score: 0.6,
            source, violation_type: "contact_sharing",
          });
        }
        continue;
      }

      const aiData = await aiResponse.json();
      let analysis = { is_violation: true, confidence: 0.7, reason: "AI analysis", violation_type: "contact_sharing" };

      try {
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          analysis = JSON.parse(toolCall.function.arguments);
        }
      } catch {
        console.error("Failed to parse AI response");
      }

      results.push({
        index: i, text,
        is_violation: analysis.is_violation,
        confidence: analysis.confidence,
        reason: analysis.reason,
        detected_patterns: matches,
      });

      // Record violation if confirmed
      if (analysis.is_violation && analysis.confidence >= 0.5) {
        const violatorId = senderId || userId;
        if (booking_id && violatorId) {
          await adminClient.from("violations").insert({
            booking_id,
            user_id: violatorId,
            detected_text: matches.join(", "),
            original_message: text,
            confidence_score: analysis.confidence,
            source,
            violation_type: analysis.violation_type || "contact_sharing",
          });

          // Update warnings count
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
              user_id: violatorId,
              warning_type: "contact_violation",
              description: `مخالفة مشاركة معلومات اتصال: ${analysis.reason}`,
              warning_count: 1,
            });
          }

          // Send notification to admin
          const { data: admins } = await adminClient
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin");

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

    const violationCount = results.filter(r => r.is_violation).length;

    return new Response(JSON.stringify({
      total_messages: messages.length,
      violations_found: violationCount,
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
