import { supabase } from "@/integrations/supabase/client";

export type AuditCategory =
  | "team_management"
  | "teachers"
  | "withdrawals"
  | "support"
  | "violations"
  | "bookings"
  | "users"
  | "payments"
  | "earnings"
  | "wallets"
  | "plans"
  | "coupons"
  | "settings"
  | "notifications"
  | "general";

export interface LogActionInput {
  action: string;
  category?: AuditCategory;
  description?: string;
  target_table?: string;
  target_id?: string;
  before?: any;
  after?: any;
  metadata?: Record<string, any>;
}

// Cache the public IP for the session to avoid hammering the lookup endpoint
let _cachedIp: string | null = null;
let _ipPromise: Promise<string | null> | null = null;

async function getPublicIp(): Promise<string | null> {
  if (_cachedIp) return _cachedIp;
  if (_ipPromise) return _ipPromise;
  _ipPromise = (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return null;
      const data = await res.json();
      _cachedIp = data?.ip || null;
      return _cachedIp;
    } catch {
      return null;
    }
  })();
  return _ipPromise;
}

/**
 * تسجيل أي إجراء إداري في سجل العمليات.
 * يخزّن المنفذ، الإجراء، الجهة المتأثرة، التاريخ والوقت، عنوان IP و user-agent تلقائياً.
 */
export async function logAdminAction(input: LogActionInput) {
  try {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
    const ip = await getPublicIp();

    const { error } = await (supabase as any).rpc("log_admin_action", {
      _action: input.action,
      _category: input.category || "general",
      _description: input.description ?? null,
      _target_table: input.target_table ?? null,
      _target_id: input.target_id ?? null,
      _before: input.before ?? null,
      _after: input.after ?? null,
      _metadata: input.metadata ?? {},
      _ip_address: ip,
      _user_agent: userAgent,
    });
    if (error) console.warn("[audit] log failed:", error.message);
  } catch (e) {
    console.warn("[audit] log exception:", e);
  }
}
