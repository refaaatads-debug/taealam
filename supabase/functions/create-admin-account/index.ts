import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // التحقق من أن المنادي أدمن أو يملك صلاحية manage_admins
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const [{ data: roleRow }, { data: permRow }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      admin.from("user_permissions").select("permission").eq("user_id", user.id).eq("permission", "manage_admins").maybeSingle(),
    ]);

    const isAdmin = !!roleRow;
    const canManageAdmins = !!permRow;
    if (!isAdmin && !canManageAdmins) {
      return new Response(JSON.stringify({ error: "Forbidden: requires admin or manage_admins" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, password, full_name, permissions, make_full_admin } = body || {};

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "بريد إلكتروني غير صالح" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return new Response(JSON.stringify({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // قاعدة صارمة: فقط المدير العام يمكنه إنشاء مدير عام آخر أو منح صلاحية manage_admins
    if (make_full_admin && !isAdmin) {
      return new Response(JSON.stringify({ error: "فقط المدير العام يمكنه إنشاء مدير عام آخر" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (Array.isArray(permissions) && permissions.includes("manage_admins") && !isAdmin) {
      return new Response(JSON.stringify({ error: "فقط المدير العام يمكنه منح صلاحية إدارة الفريق" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // التقاط IP و User-Agent تلقائياً للسجل
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || req.headers.get("x-real-ip")
      || null;
    const userAgent = req.headers.get("user-agent") || null;

    // 1) إنشاء الحساب
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || email.split("@")[0] },
    });
    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ error: createErr?.message || "فشل إنشاء الحساب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const newUserId = created.user.id;

    // 2) ضمان وجود profile
    await admin.from("profiles").upsert(
      { user_id: newUserId, full_name: full_name || email.split("@")[0] },
      { onConflict: "user_id" }
    );

    // 3) تعيين الدور
    if (make_full_admin) {
      await admin.from("user_roles").upsert(
        { user_id: newUserId, role: "admin" } as any,
        { onConflict: "user_id" }
      );
    }

    // 4) تعيين الصلاحيات
    if (Array.isArray(permissions) && permissions.length > 0) {
      const rows = permissions.map((p: string) => ({
        user_id: newUserId,
        permission: p,
        granted_by: user.id,
      }));
      await (admin as any).from("user_permissions").upsert(rows, { onConflict: "user_id,permission" });
    }

    // 5) تسجيل العملية مع IP و User-Agent
    await admin.from("admin_audit_log").insert({
      actor_id: user.id,
      actor_name: (await admin.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()).data?.full_name || "أدمن",
      actor_role: isAdmin ? "admin" : "admin_manager",
      action: "create_admin_account",
      category: "team_management",
      description: `إنشاء حساب إداري جديد لـ ${email}${make_full_admin ? " (مدير عام)" : ""}`,
      target_table: "auth.users",
      target_id: newUserId,
      after_data: { email, full_name, make_full_admin: !!make_full_admin, permissions: permissions || [] },
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
