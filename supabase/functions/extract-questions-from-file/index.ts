import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { strFromU8, unzipSync } from "https://esm.sh/fflate@0.8.2";
import { getGeminiModel, getProviderApiKey } from "../_shared/ai-models.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(""));
}

function extractDocxText(bytes: Uint8Array): string {
  const documentXml = unzipSync(bytes)["word/document.xml"];
  if (!documentXml) throw new Error("تعذر قراءة نص ملف DOCX. احفظه مجدداً بصيغة DOCX ثم حاول.");

  return strFromU8(documentXml)
    .replace(/<w:tab\b[^>]*\/>/gi, " ")
    .replace(/<\/w:(?:p|tr)>/gi, "\n")
    .replace(/<\/w:tc>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, value) => String.fromCodePoint(parseInt(value, 16)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function jsonResponse(body: unknown, status: number, corsHeaders: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const rate = checkEdgeRateLimit(req, "extract-questions-from-file", 10);
  if (!rate.allowed) return new Response(JSON.stringify({ error: "طلبات كثيرة، حاول لاحقاً" }), {
    status: 429,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSeconds) },
  });

  try {
    const { file_path, file_type, file_name, subject_id, teaching_stage } = await req.json();
    if (!file_path) {
      return new Response(JSON.stringify({ error: "file_path required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const normalizedPath = String(file_path).replace(/^\/+/, "");
    if (
      !normalizedPath.startsWith(`${user.id}/bank-imports/`) ||
      normalizedPath.split("/").some((segment: string) => segment === "..")
    ) {
      return jsonResponse({ error: "لا تملك صلاحية قراءة هذا الملف." }, 403, corsHeaders);
    }

    const GEMINI_API_KEY = await getProviderApiKey("gemini", "GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
    const geminiModel = await getGeminiModel(GEMINI_API_KEY);

    const extension = String(file_name || "").split(".").pop()?.toLowerCase() || "";
    const isPdf = extension === "pdf" || file_type === "application/pdf";
    const isDocx = extension === "docx" || file_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const imageMime = file_type === "image/jpeg" || file_type === "image/png" || file_type === "image/webp"
      ? file_type
      : ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, string>)[extension];
    const isImage = Boolean(imageMime);
    if (!isPdf && !isDocx && !isImage) {
      return jsonResponse({ error: "نوع الملف غير مدعوم. استخدم PDF أو DOCX أو صورة JPG/PNG/WEBP." }, 415, corsHeaders);
    }

    const { data: storedFile, error: fileError } = await supabase.storage
      .from("assignment-files")
      .download(normalizedPath);
    if (fileError || !storedFile) {
      console.error("Question import file download failed:", fileError);
      return jsonResponse({ error: "تعذر تحميل الملف من التخزين. أعد رفعه ثم حاول مرة أخرى." }, 400, corsHeaders);
    }
    const fileBytes = new Uint8Array(await storedFile.arrayBuffer());
    if (fileBytes.byteLength === 0) {
      return jsonResponse({ error: "الملف فارغ." }, 400, corsHeaders);
    }
    if (fileBytes.byteLength > MAX_FILE_BYTES) {
      return jsonResponse({ error: "حجم الملف يتجاوز 10 ميجابايت. قلّل حجمه ثم حاول مرة أخرى." }, 413, corsHeaders);
    }

    const instruction = `أنت مساعد متخصص في استخراج الأسئلة الأكاديمية من المستندات. مهمتك:
1. استخرج جميع الأسئلة الموجودة في المستند بدقة كاملة دون حذف أو إضافة.
2. حدد نوع كل سؤال: اختيار من متعدد (multiple_choice) / صح وخطأ (true_false) / نص مفتوح (text).
3. لأسئلة الاختيار من متعدد: استخرج جميع الخيارات.
4. حدد الإجابة الصحيحة إن كانت ظاهرة في المستند.
5. أعطِ شرحاً مختصراً للإجابة إن أمكن استنتاجه.
6. اقترح صعوبة كل سؤال (easy/medium/hard) ودرجة مناسبة.
7. تجاهل أي محتوى غير علمي/أكاديمي.
8. كن دقيقاً في النص العربي ولا تُحرّفه.`;

    const parts: Record<string, unknown>[] = [
      { text: instruction + "\n\nاستخرج الأسئلة من الملف المرفق." },
    ];
    if (isDocx) {
      const text = extractDocxText(fileBytes).slice(0, 50000);
      if (!text) return jsonResponse({ error: "لم أجد نصاً قابلاً للقراءة في ملف DOCX." }, 422, corsHeaders);
      parts.push({ text: `\n\nنص ملف DOCX:\n${text}` });
    } else {
      parts.push({
        inlineData: {
          mimeType: isPdf ? "application/pdf" : imageMime,
          data: toBase64(fileBytes),
        },
      });
    }

    const aiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        tools: [{
          functionDeclarations: [{
            name: "extract_questions",
            description: "استخراج قائمة الأسئلة من المستند",
            parameters: {
              type: "OBJECT",
              properties: {
                questions: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      question_text: { type: "STRING" },
                      question_type: { type: "STRING", enum: ["multiple_choice", "true_false", "text"] },
                      options: { type: "ARRAY", items: { type: "STRING" } },
                      correct_answer: { type: "STRING" },
                      explanation: { type: "STRING" },
                      difficulty: { type: "STRING", enum: ["easy", "medium", "hard"] },
                      points: { type: "NUMBER" },
                    },
                    required: ["question_text", "question_type", "points"],
                  },
                },
              },
              required: ["questions"],
            },
          }],
        }],
        toolConfig: {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: ["extract_questions"],
          },
        },
      }),
    });

    if (aiResp.status === 429) {
      return jsonResponse({ error: "وصلت خدمة الذكاء الاصطناعي إلى حد الطلبات مؤقتاً. انتظر قليلاً ثم حاول." }, 429, corsHeaders);
    }
    if (aiResp.status === 402) {
      return jsonResponse({ error: "رصيد خدمة الذكاء الاصطناعي غير كافٍ حالياً. تواصل مع الإدارة." }, 402, corsHeaders);
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("Gemini extraction request failed:", aiResp.status, t);
      const errorMessage = aiResp.status === 401 || aiResp.status === 403
        ? "إعدادات خدمة الذكاء الاصطناعي غير صالحة. تواصل مع الإدارة."
        : aiResp.status === 400
          ? "تعذر على الذكاء الاصطناعي قراءة هذا الملف. تأكد أن الملف سليم ومن الأنواع المدعومة."
          : "خدمة الذكاء الاصطناعي لم تتمكن من معالجة الملف الآن. حاول مرة أخرى بعد قليل.";
      return jsonResponse({ error: errorMessage }, 502, corsHeaders);
    }

    const aiData = await aiResp.json();
    const functionCall = aiData.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.functionCall?.name === "extract_questions",
    )?.functionCall;
    if (!functionCall) {
      return jsonResponse({ error: "لم أجد أسئلة واضحة في الملف. جرّب ملفاً أوضح أو أضف الأسئلة يدوياً." }, 422, corsHeaders);
    }

    const questions = Array.isArray(functionCall.args?.questions) ? functionCall.args.questions : [];

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
    if (rows.length === 0) {
      return jsonResponse({ error: "لم أجد أسئلة قابلة للحفظ في الملف. جرّب ملفاً أوضح." }, 422, corsHeaders);
    }
    const { data, error } = await supabase.from("question_bank").insert(rows).select();
    if (error) throw error;
    inserted = data || [];

    return new Response(JSON.stringify({
      success: true,
      count: inserted.length,
      questions: inserted,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-questions error:", e);
    const message = e instanceof Error ? e.message : "";
    const userMessage = message === "GEMINI_API_KEY missing"
      ? "خدمة الذكاء الاصطناعي غير مهيأة. تواصل مع الإدارة."
      : message.startsWith("تعذر قراءة نص ملف DOCX")
        ? message
        : "حدث خطأ أثناء قراءة الملف أو حفظ الأسئلة. جرّب ملفاً أصغر أو تواصل مع الدعم.";
    return jsonResponse({ error: userMessage }, 500, corsHeaders);
  }
});
