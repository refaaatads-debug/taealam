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

/**
 * تسجيل أي إجراء إداري في سجل العمليات.
 * يخزّن المنفذ، الإجراء، الجهة المتأثرة، التاريخ والوقت تلقائياً.
 */
export async function logAdminAction(input: LogActionInput) {
  try {
    const { error } = await (supabase as any).rpc("log_admin_action", {
      _action: input.action,
      _category: input.category || "general",
      _description: input.description ?? null,
      _target_table: input.target_table ?? null,
      _target_id: input.target_id ?? null,
      _before: input.before ?? null,
      _after: input.after ?? null,
      _metadata: input.metadata ?? {},
    });
    if (error) console.warn("[audit] log failed:", error.message);
  } catch (e) {
    console.warn("[audit] log exception:", e);
  }
}
