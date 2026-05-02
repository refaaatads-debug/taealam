import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { submission_id } = await req.json();
    if (!submission_id) {
      return new Response(JSON.stringify({ error: "submission_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch submission + assignment
    const { data: sub, error: subErr } = await supabase
      .from("assignment_submissions")
      .select("*, assignment:assignments(*)")
      .eq("id", submission_id)
      .single();
    if (subErr || !sub) throw new Error("Submission not found");

    const assignment = (sub as any).assignment;

    // Build prompt
    const systemPrompt = `أنت معلم خبير تقوم بتصحيح واجبات الطلاب بدقة وعدالة. قم بتقييم الإجابة وأعطِ:
1. درجة من ${assignment.total_points}
2. ملاحظات بناءة باللغة العربية
3. تحليل تفصيلي لكل سؤال (إن وجد)
أجب بصيغة JSON صحيحة فقط.`;

    const userPrompt = `الواجب: ${assignment.title}
الوصف: ${assignment.description || "—"}
الأسئلة: ${JSON.stringify(assignment.questions || [], null, 2)}
الدرجة الكلية: ${assignment.total_points}

إجابة الطالب:
- النص: ${sub.text_answer || "(لا يوجد)"}
- إجابات الأسئلة: ${JSON.stringify(sub.answers || [], null, 2)}
- صور مرفقة: ${(sub.image_urls as any[])?.length || 0}
- تسجيل صوتي: ${sub.audio_url ? "نعم" : "لا"}

قيّم وأعطِ JSON بالصيغة:
{"score": رقم, "feedback": "نص التعليق", "breakdown": [{"question": "...", "points": رقم, "comment": "..."}]}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_grade",
            description: "Submit the grade evaluation",
            parameters: {
              type: "object",
              properties: {
                score: { type: "number", description: `Score from 0 to ${assignment.total_points}` },
                feedback: { type: "string", description: "Overall feedback in Arabic" },
                breakdown: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string" },
                      points: { type: "number" },
                      comment: { type: "string" },
                    },
                    required: ["question", "points", "comment"],
                  },
                },
              },
              required: ["score", "feedback", "breakdown"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_grade" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "نفذت الأرصدة، يرجى إضافة رصيد لـ Lovable AI" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      throw new Error(`AI error: ${aiResp.status} ${t}`);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned");

    const result = JSON.parse(toolCall.function.arguments);

    // Update submission with AI grade
    await supabase
      .from("assignment_submissions")
      .update({
        ai_score: result.score,
        ai_feedback: result.feedback,
        ai_breakdown: result.breakdown,
        status: "ai_graded",
        graded_at: new Date().toISOString(),
      })
      .eq("id", submission_id);

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("grade-assignment error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
