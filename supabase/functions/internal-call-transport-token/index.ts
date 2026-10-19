import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { RtcRole, RtcTokenBuilder } from "https://esm.sh/agora-token@2.0.7?bundle";
import { getCorsHeaders } from "../_shared/cors.ts";
import { internalCallTokenDenial } from "../_shared/internal-call-token-policy.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

const json = (body: unknown, status: number, headers: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  if (!checkEdgeRateLimit(req, "internal-call-transport-token", 12).allowed) {
    return json({ error: "طلبات كثيرة، حاول لاحقاً" }, 429, cors);
  }

  try {
    const accessToken = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return json({ error: "Unauthorized" }, 401, cors);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "خدمة الاتصال غير مهيأة" }, 503, cors);

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await db.auth.getUser(accessToken);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401, cors);

    const body = await req.json().catch(() => null);
    const callId = typeof body?.callId === "string" ? body.callId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callId)) {
      return json({ error: "معرّف المكالمة غير صالح" }, 400, cors);
    }

    const { data: call, error: callError } = await db
      .from("internal_calls")
      .select("id, caller_id, callee_id, status, max_ends_at, transport_provider")
      .eq("id", callId)
      .maybeSingle();
    if (callError) throw callError;
    if (!call) return json({ error: "المكالمة غير موجودة" }, 404, cors);

    const { data: transportConfig, error: configError } = await db
      .from("internal_call_transport_config")
      .select("agora_enabled")
      .eq("singleton", true)
      .maybeSingle();
    if (configError) throw configError;
    const denial = internalCallTokenDenial(authData.user.id, call, transportConfig);
    if (denial === "not_participant") return json({ error: "غير مصرح لك بالانضمام إلى هذه المكالمة" }, 403, cors);
    if (denial === "provider_mismatch") return json({ error: "هذه المكالمة مثبتة على WebRTC" }, 409, cors);
    if (denial === "call_not_active") return json({ error: "المكالمة لم تُقبل أو انتهت" }, 409, cors);
    if (denial === "agora_not_enabled") return json({ error: "Agora غير مفعّل لهذا الحساب" }, 403, cors);
    if (denial === "call_expired") return json({ error: "انتهت مهلة المكالمة" }, 409, cors);

    if (denial) {
      return json({ error: "تعذر التحقق من صلاحية المكالمة" }, 403, cors);
    }

    const deadline = call.max_ends_at;
    if (!deadline || new Date(deadline).getTime() <= Date.now()) {
      return json({ error: "انتهت مهلة المكالمة" }, 409, cors);
    }

    const appId = Deno.env.get("AGORA_APP_ID");
    const appCertificate = Deno.env.get("AGORA_APP_CERTIFICATE");
    if (!appId || !appCertificate) return json({ error: "إعداد Agora غير مكتمل" }, 503, cors);

    const channel = `ajyal_internal_${callId.replaceAll("-", "")}`;
    const expiresAt = Math.min(Math.floor(Date.now() / 1000) + 60 * 60, Math.floor(new Date(deadline).getTime() / 1000));
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      appId,
      appCertificate,
      channel,
      authData.user.id,
      RtcRole.PUBLISHER,
      expiresAt,
      expiresAt,
    );
    return json({ provider: "agora", appId, channel, userAccount: authData.user.id, token, expiresAt }, 200, cors);
  } catch (error) {
    console.error("internal-call-transport-token error:", error);
    return json({ error: "تعذر تجهيز اتصال Agora" }, 500, cors);
  }
});
