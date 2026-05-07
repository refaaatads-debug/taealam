import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];

function formatDate(iso: string): string {
  if (!iso) return "غير محدد";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ar-SA", {
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "Asia/Riyadh",
    });
  } catch { return iso; }
}

const tools = [
  {
    type: "function",
    function: {
      name: "get_my_subscription",
      description: "اجلب بيانات اشتراك الطالب الحالية. استخدم فقط عند السؤال صراحة عن الباقة او الدقائق المتبقية او الحصص المتبقية او تاريخ الانتهاء.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_upcoming_sessions",
      description: "اجلب الحصص القادمة. استخدم فقط عند السؤال عن الحصص القادمة او المواعيد.",
      parameters: { type: "object", properties: { limit: { type: "number" } }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_past_sessions",
      description: "اجلب الحصص السابقة. استخدم فقط عند السؤال عن سجل الحصص السابقة.",
      parameters: { type: "object", properties: { limit: { type: "number" } }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_assignments",
      description: "اجلب الواجبات. استخدم فقط عند السؤال عن الواجبات او الدرجات.",
      parameters: {
        type: "object",
        properties: { status: { type: "string", enum: ["pending", "submitted", "graded", "all"] } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_teacher_earnings",
      description: "اجلب ارباح المعلم. استخدم فقط عند سؤال المعلم عن ارباحه او رصيده.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "create_support_ticket",
      description: "انشئ تذكرة دعم بشري. استخدم فقط عند طلب المستخدم صراحة موظف بشري، او الفشل في الحل مرتين، او مشاكل مالية.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string" },
          category: { type: "string", enum: ["technical", "payment", "session", "account", "other"] },
          summary: { type: "string" },
        },
        required: ["subject", "category", "summary"],
        additionalProperties: false,
      },
    },
  },
];

async function runTool(name: string, args: any, ctx: { supabase: any; userId: string; role: string }): Promise<any> {
  const { supabase, userId, role } = ctx;
  switch (name) {
    case "get_my_subscription": {
      if (role !== "student") return { error: "هذه الاداة للطلاب فقط." };
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("id, remaining_minutes, sessions_remaining, ends_at, is_active, plan:subscription_plans(name_ar, sessions_count)")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("ends_at", { ascending: false });
      if (error) return { error: error.message };
      if (!data?.length) return { active: false, message: "لا يوجد اشتراك فعال حاليا." };
      const formatted = data.map((s: any) => ({
        plan_name: s.plan?.name_ar,
        remaining_minutes: s.remaining_minutes,
        sessions_remaining: s.sessions_remaining,
        ends_at: formatDate(s.ends_at),
        is_active: s.is_active,
      }));
      return { active: true, subscriptions: formatted };
    }
    case "get_upcoming_sessions": {
      const limit = Math.min(args?.limit ?? 5, 10);
      const col = role === "teacher" ? "teacher_id" : "student_id";
      const { data, error } = await supabase
        .from("bookings")
        .select("id, scheduled_at, duration_minutes, status, meeting_link, subject:subjects(name)")
        .eq(col, userId)
        .gte("scheduled_at", new Date().toISOString())
        .in("status", ["pending", "confirmed"])
        .order("scheduled_at", { ascending: true })
        .limit(limit);
      if (error) return { error: error.message };
      if (!data?.length) return { count: 0, message: "لا توجد حصص قادمة مجدولة حاليا." };
      const formatted = data.map((s: any) => ({
        subject: s.subject?.name || "غير محدد",
        scheduled_at: formatDate(s.scheduled_at),
        duration_minutes: s.duration_minutes,
        status: s.status,
        meeting_link: s.meeting_link || null,
      }));
      return { count: formatted.length, sessions: formatted };
    }
    case "get_past_sessions": {
      const limit = Math.min(args?.limit ?? 5, 10);
      const col = role === "teacher" ? "teacher_id" : "student_id";
      const { data, error } = await supabase
        .from("bookings")
        .select("id, scheduled_at, duration_minutes, subject:subjects(name)")
        .eq(col, userId)
        .eq("status", "completed")
        .order("scheduled_at", { ascending: false })
        .limit(limit);
      if (error) return { error: error.message };
      if (!data?.length) return { count: 0, message: "لا توجد حصص سابقة مكتملة." };
      const formatted = data.map((s: any) => ({
        subject: s.subject?.name || "غير محدد",
        scheduled_at: formatDate(s.scheduled_at),
        duration_minutes: s.duration_minutes,
      }));
      return { count: formatted.length, sessions: formatted };
    }
    case "get_my_assignments": {
      const status = args?.status ?? "all";
      if (role === "teacher") {
        const q = supabase
          .from("assignments")
          .select("id, title, due_date, status, total_points")
          .eq("teacher_id", userId)
          .order("due_date", { ascending: false })
          .limit(10);
        if (status !== "all") q.eq("status", status);
        const { data, error } = await q;
        if (error) return { error: error.message };
        if (!data?.length) return { role: "teacher", message: "لا توجد واجبات.", assignments: [] };
        return { role: "teacher", assignments: data.map((a: any) => ({ ...a, due_date: formatDate(a.due_date) })) };
      }
      const { data, error } = await supabase
        .from("assignments")
        .select("id, title, due_date, total_points, status, submission:assignment_submissions(status, final_score, submitted_at)")
        .eq("student_id", userId)
        .order("due_date", { ascending: false })
        .limit(10);
      if (error) return { error: error.message };
      if (!data?.length) return { role: "student", message: "لا توجد واجبات.", assignments: [] };
      return { role: "student", assignments: data.map((a: any) => ({ ...a, due_date: formatDate(a.due_date) })) };
    }
    case "get_teacher_earnings": {
      if (role !== "teacher") return { error: "هذه الاداة للمعلمين فقط." };
      const { data: profile } = await supabase
        .from("teacher_profiles")
        .select("balance, hourly_rate, total_sessions")
        .eq("user_id", userId)
        .maybeSingle();
      const { data: earnings, error } = await supabase
        .from("teacher_earnings")
        .select("month, amount, hours, status")
        .eq("teacher_id", userId)
        .order("month", { ascending: false })
        .limit(6);
      if (error) return { error: error.message };
      return { profile: profile ?? null, recent_months: earnings ?? [] };
    }
    case "create_support_ticket": {
      const subject = String(args?.subject || "").slice(0, 80) || "طلب دعم";
      const category = ["technical", "payment", "session", "account", "other"].includes(args?.category)
        ? args.category : "other";
      const summary = String(args?.summary || "").slice(0, 4000);
      const { data: ticket, error } = await supabase
        .from("support_tickets")
        .insert({ user_id: userId, subject, category, status: "open" })
        .select("id")
        .single();
      if (error || !ticket) return { error: error?.message || "تعذر انشاء التذكرة" };
      const intro = "تذكرة محولة من المساعد الذكي\n\nالتصنيف: " + category + "\n\nالملخص:\n" + summary;
      await supabase.from("support_messages").insert({
        ticket_id: ticket.id, sender_id: userId, content: intro, is_admin: false,
      });
      try {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
        if (admins?.length) {
          await admin.from("notifications").insert(
            admins.map((a: any) => ({
              user_id: a.user_id, type: "support_ticket",
              title: "تذكرة دعم جديدة (AI)", body: subject,
              link: "/admin/support?ticket=" + ticket.id,
            }))
          );
        }
      } catch (e) { console.error("admin notify failed:", e); }
      return { success: true, ticket_id: ticket.id, message: "تم انشاء تذكرة دعم. سيتواصل معك فريق الدعم قريبا." };
    }
  }
  return { error: "Unknown tool: " + name };
}

function buildSystemPrompt(role: string, fullName: string): string {
  const teacherExtra = role === "teacher"
    ? '\n- "ارباحي" او "رصيدي" -> get_teacher_earnings'
    : "";
  return (
    'انت "مساعد منصة اجيال المعرفة" -- مساعد دعم ذكي يتحدث العربية بشكل طبيعي ودود.\n\n' +
    "## هويتك\n" +
    "- المستخدم: " + (fullName || "مستخدم") + " | الدور: " + (role === "teacher" ? "معلم" : "طالب") + "\n\n" +
    "## قواعد صارمة لا تنتهكها ابدا\n" +
    "1. لا تستخدم الادوات الا عند الحاجة الفعلية: التحيات (مرحبا، كيف الحال، شكرا) = رد مباشر بدون اي اداة\n" +
    "2. لا تخترع بيانات ابدا: اذا اعادت الاداة لا توجد حصص فقل ذلك -- لا تضع ارقام وهمية او روابط مزيفة مثل example.com\n" +
    "3. استخدم Markdown فقط: **غامق**، - قائمة -- لا HTML ابدا (لا تكتب <b> او <br>)\n" +
    "4. ردود قصيرة ومفيدة: 2-4 جمل للاسئلة العامة، قائمة مرتبة للبيانات\n" +
    "5. التحيات والاحاديث العامة: رد بشكل طبيعي ودود بدون استدعاء اي اداة\n\n" +
    "## متى تستخدم الادوات\n" +
    '- "كم دقائقي؟" او "باقتي" -> get_my_subscription\n' +
    '- "حصصي القادمة" او "موعد حصتي" -> get_upcoming_sessions\n' +
    '- "حصصي السابقة" -> get_past_sessions\n' +
    '- "واجباتي" او "درجاتي" -> get_my_assignments' +
    teacherExtra + "\n" +
    "- فشلت في الحل مرتين او طلب موظف بشري -> create_support_ticket\n\n" +
    "## تنسيق البيانات\n" +
    '- الدقائق: اكتب مثلا "720 دقيقة (نحو 12 ساعة)"\n' +
    "- التواريخ: استخدم الصيغة المنسقة التي تاتي من الاداة\n" +
    "- الروابط: اعرضها فقط اذا جاءت من الاداة -- لا تضع روابط وهمية ابدا"
  );
}

async function callGroqChain(messages: any[], apiKey: string): Promise<any> {
  let lastErr: any;
  for (const model of GROQ_MODELS) {
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, tools, tool_choice: "auto", max_tokens: 1024 }),
      });
      if (resp.status === 429) { console.log(model + " rate-limited, trying next..."); lastErr = new Error(model + " rate limited"); continue; }
      if (!resp.ok) { const t = await resp.text(); console.error(model + " error:", resp.status, t.slice(0, 200)); lastErr = new Error(model + ": " + resp.status); continue; }
      const data = await resp.json();
      console.log("Used model:", model);
      return data;
    } catch (e) { console.error(model + " exception:", e); lastErr = e; }
  }
  throw lastErr || new Error("All Groq models failed");
}

async function callGeminiFallback(messages: any[], sysPrompt: string, apiKey: string): Promise<string> {
  const contents = messages
    .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  if (!contents.length) contents.push({ role: "user", parts: [{ text: "مرحبا" }] });
  const resp = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_instruction: { parts: [{ text: sysPrompt }] }, contents }) }
  );
  if (!resp.ok) throw new Error("Gemini " + resp.status);
  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "عذرا، لم اتمكن من الاجابة حاليا.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
    ]);
    const role = (roleRow?.role as string) || "student";
    const fullName = (profileRow?.full_name as string) || "";

    const body = await req.json().catch(() => ({}));
    const messages: any[] = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return json({ error: "messages array required" }, 400);

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
    const sysPrompt = buildSystemPrompt(role, fullName);

    const convo: any[] = [{ role: "system", content: sysPrompt }, ...messages];
    let createdTicket: any = null;

    for (let hop = 0; hop < 5; hop++) {
      let aiData: any;
      try {
        aiData = await callGroqChain(convo, GROQ_API_KEY);
      } catch (groqErr) {
        console.error("All Groq failed, trying Gemini:", groqErr);
        try {
          const text = await callGeminiFallback(messages, sysPrompt, GEMINI_API_KEY);
          return json({ role: "assistant", content: text, ticket: createdTicket });
        } catch (geminiErr) {
          console.error("Gemini fallback failed:", geminiErr);
          return json({ error: "كل نماذج الذكاء الاصطناعي مشغولة حاليا، حاول بعد دقيقة." }, 503);
        }
      }

      const msg = aiData.choices?.[0]?.message;
      if (!msg) return json({ error: "Empty AI response" }, 500);

      if (!msg.tool_calls?.length) {
        return json({ role: "assistant", content: msg.content || "", ticket: createdTicket });
      }

      convo.push(msg);
      for (const tc of msg.tool_calls) {
        let parsedArgs: any = {};
        try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
        const result = await runTool(tc.function.name, parsedArgs, { supabase, userId, role });
        if (tc.function.name === "create_support_ticket" && result?.success) {
          createdTicket = { id: result.ticket_id };
        }
        convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    }

    return json({ role: "assistant", content: "تعذر انهاء المعالجة. يرجى المحاولة مجددا.", ticket: createdTicket });
  } catch (e: any) {
    console.error("ai-support fatal:", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
