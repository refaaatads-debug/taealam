import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { file_url, file_type, subject_id, teaching_stage } = await req.json();
    if (!file_url) {
      return new Response(JSON.stringify({ error: "file_url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    const { data: { user } } = authHeader
      ? await createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        }).auth.getUser()
      : { data: { user: null } };
    if (!user) throw new Error("Not authenticated");

    const isImage = (file_type || "").startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(file_url);
    const isPdf = (file_type || "").includes("pdf") || /\.pdf$/i.test(file_url);
    const isWord = (file_type || "").includes("word") || /\.(docx?|odt)$/i.test(file_url);

    let userContent: any[];
    const instruction = `أنت مساعد متخصص في استخراج الأسئلة الأكاديمية من المستندات. مهمتك:
1. استخرج جميع الأسئلة الموجودة في المستند بدقة كاملة دون حذف أو إضافة.
2. حدد نوع كل سؤال: اختيار من متعدد (multiple_choice) / صح وخطأ (true_false) / نص مفتوح (text).
3. لأسئلة الاختيار من متعدد: استخرج جميع الخيارات.
4. حدد الإجابة الصحيحة إن كانت ظاهرة في المستند.
5. أعطِ شرحاً مختصراً للإجابة إن أمكن استنتاجه.
6. اقترح صعوبة كل سؤال (easy/medium/hard) ودرجة مناسبة.
7. تجاهل أي محتوى غير علمي/أكاديمي.
8. كن دقيقاً في النص العربي ولا تُحرّفه.`;

    if (isImage) {
      userContent = [
        { type: "text", text: instruction + "\n\nالصورة المرفقة تحتوي على أسئلة. استخرجها." },
        { type: "image_url", image_url: { url: file_url } },
      ];
    } else if (isPdf || isWord) {
      // For PDF/Word: download and let AI process via document URL or extracted text
      // Gemini supports PDF directly via file_url in some configs, but safer to fetch text
      const fileResp = await fetch(file_url);
      if (!fileResp.ok) throw new Error("تعذر تحميل الملف");
      const buf = await fileResp.arrayBuffer();

      if (isPdf) {
        // Send PDF as base64 inline data to Gemini (supports PDFs natively)
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        userContent = [
          { type: "text", text: instruction + "\n\nالملف PDF مرفق. استخرج جميع الأسئلة منه." },
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
        ];
      } else {
        // Word: extract text crudely (fallback) — Gemini cannot read .docx directly
        // Convert bytes to string and strip XML tags as a basic extraction
        const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
        const cleaned = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 50000);
        userContent = [
          { type: "text", text: instruction + "\n\nنص مستخرج من ملف Word:\n" + cleaned },
        ];
      }
    } else {
      throw new Error("نوع الملف غير مدعوم. ادعم: PDF أو Word أو صورة.");
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
          { role: "system", content: "أنت مستخرج أسئلة دقيق من مستندات تعليمية." },
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_questions",
            description: "استخراج قائمة الأسئلة من المستند",
            parameters: {
              type: "object",
              properties: {
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question_text: { type: "string" },
                      question_type: { type: "string", enum: ["multiple_choice", "true_false", "text"] },
                      options: { type: "array", items: { type: "string" } },
                      correct_answer: { type: "string" },
                      explanation: { type: "string" },
                      difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                      points: { type: "number" },
                    },
                    required: ["question_text", "question_type", "points"],
                  },
                },
              },
              required: ["questions"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_questions" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "نفذت الأرصدة" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      throw new Error(`AI error: ${aiResp.status} ${t}`);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("لم يتم استخراج أسئلة");

    const result = JSON.parse(toolCall.function.arguments);
    const questions = Array.isArray(result.questions) ? result.questions : [];

    // Insert into question_bank
    const rows = questions.map((q: any) => ({
      teacher_id: user.id,
      question_text: String(q.question_text || "").trim(),
      question_type: q.question_type || "text",
      options: Array.isArray(q.options) ? q.options : [],
      correct_answer: q.correct_answer || null,
      explanation: q.explanation || null,
      difficulty: q.difficulty || "medium",
      points: Number(q.points) || 10,
      teaching_stage: teaching_stage || null,
      subject_id: subject_id || null,
      is_public: false,
    })).filter((r: any) => r.question_text.length > 0);

    let inserted: any[] = [];
    if (rows.length > 0) {
      const { data, error } = await supabase.from("question_bank").insert(rows).select();
      if (error) throw error;
      inserted = data || [];
    }

    return new Response(JSON.stringify({
      success: true,
      count: inserted.length,
      questions: inserted,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-questions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
