// AI Support Assistant — uses Lovable AI Gateway with tool calling.
// Each tool runs against Supabase using the caller's JWT, so RLS prevents
// the AI from ever seeing data that doesn't belong to the user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

// ─── Tool definitions exposed to the model ──────────────────────────────
const tools = [
  {
    type: "function",
    function: {
      name: "get_my_subscription",
      description:
        "يجلب الباقة الحالية للطالب: اسم الباقة، الدقائق المتبقية، عدد الحصص المتبقية، تاريخ الانتهاء. للطلاب فقط.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_upcoming_sessions",
      description:
        "يجلب الحصص القادمة للمستخدم (طالب أو معلم) خلال الـ 30 يومًا القادمة مع التاريخ، المادة، الطرف الآخر، ورابط الحصة.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "عدد الحصص (افتراضي 10)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_past_sessions",
      description:
        "يجلب آخر الحصص المكتملة (للطالب أو المعلم) لعرض السجل والإحصائيات.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "عدد الحصص (افتراضي 10)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_assignments",
      description:
        "يجلب الواجبات: للطالب يعرض الواجبات المطلوبة منه ودرجاته، وللمعلم يعرض الواجبات التي أنشأها مع عدد التسليمات.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "submitted", "graded", "all"],
            description: "تصفية حسب الحالة",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_teacher_earnings",
      description:
        "يجلب أرباح المعلم الحالية، الرصيد، الأرباح هذا الشهر والأشهر السابقة. للمعلمين فقط.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "create_support_ticket",
      description:
        "ينشئ تذكرة دعم بشري عند: (1) طلب المستخدم صراحةً التحدث لموظف، (2) فشلك في حل المشكلة بعد محاولتين، (3) مشاكل مالية حساسة (استرداد، خطأ في الفوترة)، (4) مشاكل تقنية تستلزم تدخل بشري. اذكر ملخصًا واضحًا للمشكلة في summary لكي يفهم الموظف السياق فورًا.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "عنوان مختصر (≤60 حرف)" },
          category: {
            type: "string",
            enum: ["technical", "payment", "session", "account", "other"],
          },
          summary: {
            type: "string",
            description: "ملخص مفصّل (3-5 أسطر) للمشكلة وما تمت محاولته وما يحتاجه الموظف لحلها.",
          },
        },
        required: ["subject", "category", "summary"],
        additionalProperties: false,
      },
    },
  },
];

// ─── Tool implementations ───────────────────────────────────────────────
async function runTool(
  name: string,
  args: any,
  ctx: { supabase: any; userId: string; role: string },
): Promise<any> {
  const { supabase, userId, role } = ctx;

  switch (name) {
    case "get_my_subscription": {
      if (role !== "student") return { error: "هذه الأداة للطلاب فقط." };
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select(
          "id, remaining_minutes, sessions_remaining, ends_at, is_active, plan:subscription_plans(name_ar, price, sessions_count)",
        )
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("ends_at", { ascending: false });
      if (error) return { error: error.message };
      if (!data?.length) return { active: false, message: "لا يوجد اشتراك فعّال." };
      return { active: true, subscriptions: data };
    }

    case "get_upcoming_sessions": {
      const limit = Math.min(args?.limit ?? 10, 25);
      const col = role === "teacher" ? "teacher_id" : "student_id";
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, scheduled_at, duration_minutes, status, session_status, meeting_link, subject:subjects(name), student_id, teacher_id",
        )
        .eq(col, userId)
        .gte("scheduled_at", new Date().toISOString())
        .in("status", ["pending", "confirmed"])
        .order("scheduled_at", { ascending: true })
        .limit(limit);
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, sessions: data ?? [] };
    }

    case "get_past_sessions": {
      const limit = Math.min(args?.limit ?? 10, 25);
      const col = role === "teacher" ? "teacher_id" : "student_id";
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, scheduled_at, duration_minutes, status, subject:subjects(name)",
        )
        .eq(col, userId)
        .eq("status", "completed")
        .order("scheduled_at", { ascending: false })
        .limit(limit);
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, sessions: data ?? [] };
    }

    case "get_my_assignments": {
      const status = args?.status ?? "all";
      if (role === "teacher") {
        const q = supabase
          .from("assignments")
          .select("id, title, due_date, status, total_points, created_at")
          .eq("teacher_id", userId)
          .order("created_at", { ascending: false })
          .limit(15);
        if (status !== "all") q.eq("status", status);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { role: "teacher", assignments: data ?? [] };
      }
      // student
      const { data, error } = await supabase
        .from("assignments")
        .select(
          "id, title, due_date, total_points, status, submission:assignment_submissions(status, final_score, ai_score, teacher_score, submitted_at)",
        )
        .eq("student_id", userId)
        .order("due_date", { ascending: false })
        .limit(15);
      if (error) return { error: error.message };
      return { role: "student", assignments: data ?? [] };
    }

    case "get_teacher_earnings": {
      if (role !== "teacher") return { error: "هذه الأداة للمعلمين فقط." };
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
      const category = ["technical","payment","session","account","other"].includes(args?.category) ? args.category : "other";
      const summary = String(args?.summary || "لم يُوفّر ملخص.").slice(0, 4000);

      const { data: ticket, error } = await supabase
        .from("support_tickets")
        .insert({ user_id: userId, subject, category, status: "open" })
        .select("id")
        .single();
      if (error || !ticket) return { error: error?.message || "تعذّر إنشاء التذكرة" };

      // Seed first message with AI summary so support staff have context immediately
      const intro =
        `🤖 **تذكرة محوّلة من المساعد الذكي**\n\n` +
        `**التصنيف:** ${category}\n\n` +
        `**ملخص المشكلة:**\n${summary}\n\n` +
        `_(تمت إحالة المستخدم لفريق الدعم البشري بعد محادثة مع المساعد الذكي.)_`;
      await supabase.from("support_messages").insert({
        ticket_id: ticket.id,
        sender_id: userId,
        content: intro,
        is_admin: false,
      });

      // Notify admins via service role (bypass RLS) — best effort, do not fail if unavailable
      try {
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (serviceKey) {
          const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
          const { data: admins } = await admin
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin");
          if (admins?.length) {
            await admin.from("notifications").insert(
              admins.map((a: any) => ({
                user_id: a.user_id,
                type: "support_ticket",
                title: "🆘 تذكرة دعم جديدة (AI)",
                body: `تذكرة محوّلة من المساعد الذكي: ${subject}`,
                link: `/admin/support?ticket=${ticket.id}`,
              })),
            );
          }
        }
      } catch (e) {
        console.error("admin notify failed:", e);
      }

      return {
        success: true,
        ticket_id: ticket.id,
        category,
        subject,
        message: "تم إنشاء تذكرة دعم بشري. سيتواصل معك فريق الدعم خلال وقت قصير.",
      };
    }
  }
  return { error: `Unknown tool: ${name}` };
}

// ─── System prompt by role ──────────────────────────────────────────────
function systemPrompt(role: string, fullName: string) {
  const base = `أنت "مساعد منصة أجيال المعرفة"، مساعد دعم ذكي يجيب باللغة العربية الواضحة المختصرة.

# هويتك
- المستخدم الحالي: ${fullName || "مستخدم"} (دور: ${role}).
- لا تكشف أبداً بيانات أي مستخدم آخر، ولا تخترع أرقامًا أو تواريخ.
- إذا لم تتوفر معلومة عبر الأدوات، قل ذلك بصراحة واقترح إنشاء تذكرة دعم.

# قواعد الردود
1. استخدم الأدوات المتاحة لجلب البيانات الحقيقية قبل الإجابة على أي سؤال يخص حساب المستخدم.
2. اذكر أرقامًا محددة (دقائق متبقية، تاريخ، مبلغ) كلما توفرت.
3. لا تكتب أكواد أو روابط مزيفة. إذا احتجت رابط حصة استخدمه كما يأتي من \`get_upcoming_sessions\`.
4. إذا تكررت المشكلة أو طلب المستخدم موظف بشري، استخدم \`create_support_ticket\` فورًا.
5. اعتذر بلطف عن أي طلب يتجاوز صلاحياتك (تعديل بيانات، إلغاء حصة، تحويل مالي) ووجّه المستخدم للقسم الصحيح.

# تنسيق
- استخدم Markdown قصير: قوائم نقطية، **bold** عند الحاجة.
- لا تطل بدون داعٍ.`;

  if (role === "teacher") {
    return base + `

# نطاقك للمعلم
يمكنك الإجابة عن: الأرباح والرصيد، الحصص القادمة والسابقة، الواجبات والتسليمات، التقييمات.
لا تجب عن أسئلة الباقات/الاشتراكات (هذه للطلاب).`;
  }
  return base + `

# نطاقك للطالب
يمكنك الإجابة عن: الباقة والدقائق المتبقية، الحصص القادمة والسابقة، الواجبات والدرجات، روابط الحصص، اقتراح ترقية الباقة.
لا تجب عن أسئلة الأرباح (هذه للمعلمين).`;
}

// ─── Main handler ───────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Verify user
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // Get role + name
    const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
    ]);
    const role = (roleRow?.role as string) || "student";
    const fullName = (profileRow?.full_name as string) || "";

    const body = await req.json().catch(() => ({}));
    const messages: any[] = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return json({ error: "messages array required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    // Conversation loop with tool calling (max 5 hops to avoid runaway)
    const convo: any[] = [
      { role: "system", content: systemPrompt(role, fullName) },
      ...messages,
    ];

    let createdTicket: { id: string; subject: string; category: string } | null = null;

    for (let hop = 0; hop < 5; hop++) {
      const aiResp = await fetch(LOVABLE_AI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, messages: convo, tools }),
      });

      if (aiResp.status === 429) return json({ error: "تم تجاوز الحد، حاول لاحقًا." }, 429);
      if (aiResp.status === 402) return json({ error: "نفد الرصيد، يرجى تعبئته." }, 402);
      if (!aiResp.ok) {
        console.error("AI gateway error:", aiResp.status, await aiResp.text());
        return json({ error: "AI gateway error" }, 500);
      }

      const data = await aiResp.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) return json({ error: "Empty AI response" }, 500);

      // No tool calls → final answer
      if (!msg.tool_calls?.length) {
        return json({
          role: "assistant",
          content: msg.content || "",
          ticket: createdTicket,
        });
      }

      // Execute tools and append results
      convo.push(msg);
      for (const tc of msg.tool_calls) {
        let parsedArgs: any = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || "{}");
        } catch { /* ignore */ }
        const result = await runTool(tc.function.name, parsedArgs, {
          supabase,
          userId,
          role,
        });
        if (tc.function.name === "create_support_ticket" && result?.success) {
          createdTicket = {
            id: result.ticket_id,
            subject: result.subject,
            category: result.category,
          };
        }
        convo.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    return json({ role: "assistant", content: "تعذّر إنهاء المعالجة. يرجى المحاولة مجددًا.", ticket: createdTicket });
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
