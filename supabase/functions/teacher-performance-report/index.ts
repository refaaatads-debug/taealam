import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { teacher_name, total_hours, total_sessions, cancelled_sessions, students_count, avg_rating, total_reviews, sessions } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sessionsText = (sessions || []).map((s: any) =>
      `- ${s.student} | ${s.subject} | ${new Date(s.date).toLocaleDateString("ar-SA")} | ${s.duration} دقيقة | ${s.status === "completed" ? "مكتملة" : s.status === "cancelled" ? "ملغاة" : "أخرى"}`
    ).join("\n");

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
            content: `أنت محلل أداء تعليمي محترف. قم بإنشاء تقرير أداء شامل ومفصل عن معلم. التقرير يجب أن يتضمن:

1. **ملخص الأداء العام** - تقييم شامل في 3-4 جمل
2. **تحليل الإنتاجية** - معدل الحصص اليومي/الأسبوعي وتوزيع الساعات
3. **تحليل معدل الإلغاء** - نسبة الإلغاء وتأثيرها
4. **تحليل التنوع** - تنوع الطلاب والمواد
5. **تحليل التقييمات** - مستوى رضا الطلاب
6. **نقاط القوة** - 3-4 نقاط
7. **فرص التحسين** - 2-3 توصيات عملية
8. **التوصيات الإدارية** - توصيات للإدارة بخصوص هذا المعلم

اكتب التقرير بالعربية بأسلوب مهني وموضوعي. استخدم إيموجي مناسبة لتسهيل القراءة.`,
          },
          {
            role: "user",
            content: `بيانات المعلم:
- الاسم: ${teacher_name}
- إجمالي الساعات الفعلية: ${total_hours} ساعة
- الحصص المكتملة: ${total_sessions}
- الحصص الملغاة: ${cancelled_sessions}
- عدد الطلاب: ${students_count}
- متوسط التقييم: ${avg_rating}/5 (${total_reviews} مراجعة)

تفاصيل آخر الحصص:
${sessionsText || "لا توجد حصص مسجلة"}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) throw new Error("AI generation failed");
    const aiData = await aiResponse.json();
    const report = aiData.choices?.[0]?.message?.content || "تعذر إنشاء التقرير";

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Teacher performance report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
