import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, subject, action, elapsed_minutes } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let systemPrompt = "";
    let userPrompt = "";

    // قاعدة صارمة مشتركة: لا تخمين، لا اختلاق، الاعتماد فقط على الرسائل الفعلية للجلسة
    const STRICT_RULES = `قواعد صارمة يجب الالتزام بها بدون استثناء:
- اعتمد فقط على الرسائل الفعلية المُرفقة من الجلسة. ممنوع التخمين أو الافتراض أو إضافة معلومات من خارج المحادثة.
- إذا لم تكن البيانات كافية لاستنتاج شيء، أعد قيمة فارغة ("" أو [] أو null) ولا تختلق محتوى.
- لا تذكر مواضيع أو أسئلة أو أحداث لم تظهر صراحةً في الرسائل المُرفقة.
- اقتبس أو ارجع للنص الفعلي من رسائل الجلسة عند الإمكان.
- لا تتحدث عن أي شيء خارج إطار الجلسة (لا تخمين هوية الطالب/المعلم، لا توقعات، لا معلومات عامة غير مرتبطة بما قيل).`;

    const hasMessages = Array.isArray(messages) && messages.length > 0;

    if (action === "analyze_chat") {
      systemPrompt = `أنت مساعد ذكي للمعلم أثناء الحصة المباشرة في منصة "تعلّم". مهمتك تحليل رسائل الدردشة الفعلية فقط وتقديم اقتراحات مبنية على ما قيل حرفياً.

${STRICT_RULES}

أجب بصيغة JSON فقط:
{
  "student_understanding": "high" | "medium" | "low" | "unknown",
  "suggestions": ["اقتراح مبني على نص فعلي من الجلسة"],
  "key_question": "سؤال فعلي طرحه الطالب (انسخه حرفياً) أو null",
  "engagement_level": "active" | "passive" | "confused" | "unknown",
  "evidence": "اقتباس قصير من الرسائل يدعم التحليل، أو null"
}`;
      if (!hasMessages) {
        return new Response(JSON.stringify({ student_understanding: "unknown", suggestions: [], key_question: null, engagement_level: "unknown", evidence: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const recentMessages = messages.slice(-10);
      userPrompt = `المادة: ${subject || "غير محددة"}\nالوقت المنقضي: ${elapsed_minutes || 0} دقيقة\n\nآخر رسائل الدردشة (المصدر الوحيد للحقائق):\n${recentMessages.map((m: any) => `${m.sender}: ${m.text}`).join("\n")}`;
    } else if (action === "help_explain") {
      systemPrompt = `أنت مساعد تعليمي للمعلم. المعلم يطلب مساعدة في شرح ما يدور فعلياً في الجلسة الحالية. اعتمد فقط على الموضوع الذي يناقشه المعلم والطالب في الرسائل المُرفقة.

${STRICT_RULES}
- إذا لم يتضح الموضوع من الرسائل، أعد explanation فارغ ووضّح أنه لا يوجد سياق كافٍ.

أجب بصيغة JSON:
{
  "topic_detected": "الموضوع المستخرج من الرسائل أو null",
  "explanation": "شرح مرتبط مباشرة بما قيل في الجلسة",
  "example": "مثال يخدم الموضوع المُستخرج فقط",
  "question": "سؤال تفاعلي للطالب مبني على ما قيل"
}`;
      if (!hasMessages) {
        return new Response(JSON.stringify({ topic_detected: null, explanation: "لا توجد رسائل كافية في الجلسة لاستخراج الموضوع.", example: "", question: "" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const recentMessages = messages.slice(-10);
      userPrompt = `المادة: ${subject || "غير محددة"}\n\nسياق المحادثة الفعلي (المصدر الوحيد):\n${recentMessages.map((m: any) => `${m.sender}: ${m.text}`).join("\n")}`;
    } else if (action === "mini_summary") {
      systemPrompt = `أنت مساعد ذكي. لخص ما حدث فعلياً في الجلسة حتى الآن بناءً على الرسائل المُرفقة فقط، في 3 نقاط قصيرة بالعربية. كل نقطة يجب أن تستند إلى رسالة فعلية.

${STRICT_RULES}

أجب بصيغة JSON:
{
  "summary_points": ["نقطة مبنية على رسالة فعلية", "..."],
  "student_score": 1-10,
  "recommendation": "توصية مرتبطة بما لوحظ فعلياً",
  "evidence_quotes": ["اقتباس قصير 1", "اقتباس قصير 2"]
}`;
      if (!hasMessages) {
        return new Response(JSON.stringify({ summary_points: [], student_score: 0, recommendation: "لا توجد رسائل كافية للتلخيص.", evidence_quotes: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userPrompt = `المادة: ${subject || "غير محددة"}\nالوقت: ${elapsed_minutes || 0} دقيقة\n\nجميع رسائل الجلسة (المصدر الوحيد):\n${messages.map((m: any) => `${m.sender}: ${m.text}`).join("\n")}`;
    } else if (action === "silence_suggestion") {
      systemPrompt = `أنت مساعد ذكي للمعلم. لاحظنا عدم تفاعل الطالب لمدة دقيقتين. اقترح سؤالاً تفاعلياً مرتبطاً بآخر ما تم نقاشه فعلياً في الجلسة (إن توفّر سياق)، وإلا اقترح سؤالاً عاماً عن المادة.

${STRICT_RULES}

أجب بصيغة JSON:
{
  "based_on_context": true | false,
  "suggested_question": "سؤال تفاعلي",
  "ice_breaker": "عبارة لكسر الجمود"
}`;
      const recentMessages = (messages || []).slice(-6);
      userPrompt = `المادة: ${subject || "غير محددة"}\nالوقت: ${elapsed_minutes || 0} دقيقة\n\nآخر رسائل الجلسة (إن وجدت):\n${recentMessages.map((m: any) => `${m.sender}: ${m.text}`).join("\n") || "لا توجد رسائل"}`;
    } else {
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    // Parse JSON from response
    let parsed: any = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = { raw: content };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("live-ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
