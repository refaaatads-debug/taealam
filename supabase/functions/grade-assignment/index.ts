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
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    // Require authenticated caller
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch submission (no embed — there's no FK declared)
    const { data: sub, error: subErr } = await supabase
      .from("assignment_submissions")
      .select("*")
      .eq("id", submission_id)
      .maybeSingle();
    if (subErr) {
      console.error("Submission query error:", subErr);
      throw new Error(`DB error: ${subErr.message}`);
    }
    if (!sub) {
      console.error("Submission not found for id:", submission_id);
      return new Response(JSON.stringify({ error: "Submission not found", submission_id }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch assignment separately
    const { data: assignment } = await supabase
      .from("assignments")
      .select("*")
      .eq("id", (sub as any).assignment_id)
      .maybeSingle();

    // Authorization: caller must be the submission's student, the assignment teacher, or an admin
    const { data: adminRole } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!adminRole;
    const isTeacher = assignment?.teacher_id && assignment.teacher_id === user.id;
    const isOwnerStudent = (sub as any).student_id && (sub as any).student_id === user.id;
    if (!isAdmin && !isTeacher && !isOwnerStudent) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let subjectName = "غير محدد";
    if (assignment?.subject_id) {
      const { data: subj } = await supabase
        .from("subjects")
        .select("name")
        .eq("id", assignment.subject_id)
        .maybeSingle();
      subjectName = subj?.name || "غير محدد";
    }

    const stage = assignment?.teaching_stage || "غير محدد";
    const totalPoints = Number(assignment?.total_points || 100);
    const questions: any[] = Array.isArray(assignment?.questions) ? assignment.questions : [];
    const studentAnswers: any[] = Array.isArray((sub as any).answers) ? (sub as any).answers : [];
    const imageUrls: string[] = Array.isArray((sub as any).image_urls) ? (sub as any).image_urls : [];

    // بناء أسئلة/إجابات منظمة للمقارنة الدقيقة
    const qaPairs = questions.map((q: any, i: number) => {
      const studentAns = studentAnswers[i] ?? "(لم يجب)";
      return {
        index: i + 1,
        text: q.text || q.question || "",
        type: q.type || "text",
        max_points: Number(q.points || 0),
        correct_answer: q.correct_answer ?? q.answer ?? null,
        options: q.options || null,
        student_answer: studentAns,
      };
    });

    const systemPrompt = `أنت مُصحِّح أكاديمي خبير ومتشدد متخصص فقط في المواد العلمية والدروس المدرسية والجامعية (رياضيات، فيزياء، كيمياء، أحياء، لغات، علوم، تاريخ، جغرافيا، حاسب، دراسات إسلامية، إلخ).

قواعد التصحيح الصارمة:
1. التزم تماماً بالإجابة الصحيحة المرجعية إن وُجدت — لا تقبل المرادفات إلا إذا كانت مكافئة علمياً 100%.
2. الإجابات الجزئية: امنح درجة جزئية فقط بقدر ما هو صحيح فعلاً، وكن صارماً.
3. الإجابات الفارغة، أو "لا أعرف"، أو غير المرتبطة بالسؤال = صفر.
4. الإجابات خارج نطاق المادة العلمية أو غير الجادة (دردشة، إيموجي، كلام عام) = صفر مع ملاحظة "إجابة غير علمية وخارج نطاق المادة".
5. الأخطاء الإملائية البسيطة لا تُنقص الدرجة إن كان المعنى العلمي صحيحاً، لكن الأخطاء المفهومية تُنقص.
6. لا تُجامل ولا تُبالغ في الإطراء؛ كن موضوعياً ومحدداً.
7. اذكر السبب العلمي الدقيق لكل خصم، واذكر الإجابة الصحيحة المرجعية للطالب ليتعلم.
8. مجموع الدرجات الفرعية يجب أن يساوي ${totalPoints} كحد أقصى — لا تتجاوزه أبداً.
9. اللغة: العربية الفصحى الواضحة والمختصرة.
10. إن لم تكن متأكداً من إجابة بسبب طبيعة السؤال (مقالي مفتوح)، قيّم على أساس: الدقة العلمية، اكتمال المفاهيم، الاستشهاد، التنظيم.`;

    const userPromptText = `**معلومات الواجب:**
- المادة: ${subjectName}
- المرحلة الدراسية: ${stage}
- العنوان: ${assignment?.title || "—"}
- الوصف: ${assignment?.description || "—"}
- الدرجة الكلية: ${totalPoints}

**الأسئلة وإجابات الطالب (${qaPairs.length} سؤال):**
${JSON.stringify(qaPairs, null, 2)}

${(sub as any).text_answer ? `**إجابة نصية حرة من الطالب:**\n${(sub as any).text_answer}\n` : ""}
${imageUrls.length > 0 ? `**يوجد ${imageUrls.length} صورة مرفقة من الطالب — افحصها بصرياً.**` : ""}

**مهمتك:** صحّح كل سؤال على حدة بدقة بالغة، ثم أعطِ الدرجة النهائية وملاحظات تعليمية بنّاءة.`;

    // بناء محتوى الرسالة بصيغة multimodal لو فيه صور
    const userContent: any[] = [{ type: "text", text: userPromptText }];
    for (const url of imageUrls.slice(0, 4)) {
      if (typeof url === "string" && url.startsWith("http")) {
        userContent.push({ type: "image_url", image_url: { url } });
      }
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_grade",
            description: "تقديم تقييم دقيق وصارم للواجب",
            parameters: {
              type: "object",
              properties: {
                is_academic: {
                  type: "boolean",
                  description: "هل الإجابة ضمن نطاق المادة العلمية وجادة؟",
                },
                score: {
                  type: "number",
                  description: `الدرجة النهائية من 0 إلى ${totalPoints}. يجب أن تكون مجموع نقاط الـ breakdown.`,
                },
                feedback: {
                  type: "string",
                  description: "ملاحظات عامة موضوعية بالعربية: نقاط القوة، الأخطاء الجوهرية، نصائح للتحسين. مختصرة ومحددة.",
                },
                breakdown: {
                  type: "array",
                  description: "تقييم سؤال بسؤال — يجب أن يطابق عدد الأسئلة بالضبط.",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string", description: "نص السؤال" },
                      max_points: { type: "number", description: "الدرجة القصوى للسؤال" },
                      points: { type: "number", description: "الدرجة الممنوحة فعلياً (0 إلى max_points)" },
                      correct_answer: { type: "string", description: "الإجابة الصحيحة المرجعية" },
                      student_answer: { type: "string", description: "ملخص إجابة الطالب" },
                      comment: { type: "string", description: "السبب الدقيق للدرجة الممنوحة" },
                    },
                    required: ["question", "max_points", "points", "correct_answer", "student_answer", "comment"],
                  },
                },
              },
              required: ["is_academic", "score", "feedback", "breakdown"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_grade" } },
        reasoning: { effort: "medium" },
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

    // ضمان عدم تجاوز الدرجة الكلية + إعادة حساب من breakdown
    const breakdown = Array.isArray(result.breakdown) ? result.breakdown : [];
    const computedScore = breakdown.reduce((sum: number, b: any) => sum + Number(b.points || 0), 0);
    let finalScore = Number(result.score);
    if (Number.isNaN(finalScore) || Math.abs(finalScore - computedScore) > 0.5) {
      finalScore = computedScore; // ثقة أكبر بمجموع التفاصيل
    }
    finalScore = Math.max(0, Math.min(totalPoints, finalScore));

    let feedback = String(result.feedback || "");
    if (result.is_academic === false) {
      feedback = "⚠️ الإجابة خارج نطاق المادة العلمية أو غير جادة.\n\n" + feedback;
    }

    // Update submission with AI grade
    await supabase
      .from("assignment_submissions")
      .update({
        ai_score: finalScore,
        ai_feedback: feedback,
        ai_breakdown: breakdown,
        status: "ai_graded",
        graded_at: new Date().toISOString(),
      })
      .eq("id", submission_id);

    return new Response(JSON.stringify({
      success: true,
      score: finalScore,
      feedback,
      breakdown,
      is_academic: result.is_academic,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("grade-assignment error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
