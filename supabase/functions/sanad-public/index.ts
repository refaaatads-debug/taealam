import { getGeminiModel, getProviderApiKey } from "../_shared/ai-models.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

const SYSTEM_PROMPT = `أنت "سند"، المساعد الودود في منصة أجيال المعرفة التعليمية.

مهمتك مساعدة الزائر غير المسجل على فهم المنصة واتخاذ الخطوة المناسبة، من دون الوصول إلى أي حساب أو بيانات شخصية.

معلومات مؤكدة عن المنصة:
- أجيال المعرفة منصة عربية للحصص الخصوصية المباشرة بين الطلاب والمعلمين.
- يستطيع الطالب البحث عن مدرس حسب المادة والمستوى، ثم اختيار الموعد المناسب وحجز الحصة.
- الحصص مباشرة وتدعم التواصل بالصوت أو الفيديو وأدوات تعليمية تساعد على التفاعل.
- توجد باقات تعليمية، وواجبات ومتابعة للتقدم، ودعم من فريق المنصة عند الحاجة.
- يمكن للمعلم التقدم للانضمام إلى المنصة، وبعد مراجعة الطلب والموافقة يمكنه التدريس.
- خيارات الدفع والحساب والحجوزات تظهر للمستخدم بعد إنشاء حساب وتسجيل الدخول.

قواعدك:
- تحدث بالعربية بأسلوب ودود ومساند، وكن مختصراً وواضحاً في 2 إلى 4 جمل.
- عرّف نفسك باسم سند عند الحاجة، ولا تقل إنك موظف بشري.
- لا تطلب كلمة مرور أو رمز تحقق أو بيانات بطاقة أو أي معلومة حساسة.
- لا تدّعِ أنك ترى حساب الزائر أو رصيده أو حجوزه، ولا تخترع أسعاراً أو مواعيد أو روابط.
- إذا احتاج السؤال إلى بيانات حساب أو إجراء خاص، وجّه الزائر إلى إنشاء حساب أو التواصل مع الدعم.
- إذا كان السؤال خارج المنصة، اعتذر بلطف وأعده إلى التعلم أو طريقة استخدام المنصة.
- استخدم Markdown البسيط عند الحاجة، ولا تستخدم HTML.`;

const json = (payload: unknown, status: number, req: Request) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });

function normalizeMessages(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .filter((message): message is { role: string; content: string } => (
      !!message &&
      typeof message === "object" &&
      ["user", "assistant"].includes((message as { role?: unknown }).role as string) &&
      typeof (message as { content?: unknown }).content === "string"
    ))
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 1200),
    }))
    .filter((message) => message.content.length > 0);
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const rate = checkEdgeRateLimit(req, "sanad-public", 12);
  if (!rate.allowed) {
    return json({ error: "طلبات كثيرة، حاول بعد قليل." }, 429, req);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const messages = normalizeMessages(body?.messages);
    if (!messages.length) return json({ error: "messages array required" }, 400, req);

    const geminiApiKey = await getProviderApiKey("gemini", "GEMINI_API_KEY");
    const geminiModel = await getGeminiModel(geminiApiKey);
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${geminiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: geminiModel,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 450,
        temperature: 0.65,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("sanad-public AI error:", response.status, errorText.slice(0, 300));
      if (response.status === 429) return json({ error: "المساعد مشغول حالياً، حاول بعد قليل." }, 429, req);
      return json({ error: "تعذر معالجة الطلب حالياً" }, 503, req);
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return json({ error: "لم تصل إجابة من المساعد" }, 503, req);
    }

    return json({ reply: reply.trim().slice(0, 3000) }, 200, req);
  } catch (error) {
    console.error("sanad-public fatal:", error);
    return json({ error: "تعذر معالجة الطلب حالياً" }, 500, req);
  }
});