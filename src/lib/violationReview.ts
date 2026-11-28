import { supabase } from "@/integrations/supabase/client";

// Pure rule: what a warnings row looks like after one confirmed violation is added or removed.
// Detections never become sanctions on their own. Only an admin confirmation adds a warning,
// and a false positive (or an accepted appeal) takes it back. A ban is always a manual admin action.
export function nextWarningCount(current: number, delta: 1 | -1): number {
  return Math.max(0, (current || 0) + delta);
}

export function banStateAfterReversal(newCount: number, wasBanned: boolean): { is_banned: boolean; banned_until: string | null } | null {
  // Lift an automatic-style ban only when the count drops below 3. A manual ban is the admin's call.
  if (!wasBanned) return null;
  return newCount < 3 ? { is_banned: false, banned_until: null } : null;
}

const WARNING_TYPE = "contact_violation";

export async function addConfirmedWarning(userId: string, reason: string) {
  const { data: existing } = await (supabase as any).from("user_warnings")
    .select("id, warning_count").eq("user_id", userId).eq("warning_type", WARNING_TYPE).maybeSingle();
  if (existing) {
    await (supabase as any).from("user_warnings")
      .update({ warning_count: nextWarningCount(existing.warning_count, 1), description: reason }).eq("id", existing.id);
  } else {
    await (supabase as any).from("user_warnings")
      .insert({ user_id: userId, warning_type: WARNING_TYPE, description: reason, warning_count: 1 });
  }
}

export async function removeConfirmedWarning(userId: string) {
  const { data: existing } = await (supabase as any).from("user_warnings")
    .select("id, warning_count, is_banned").eq("user_id", userId).eq("warning_type", WARNING_TYPE).maybeSingle();
  if (!existing || !existing.warning_count) return;
  const n = nextWarningCount(existing.warning_count, -1);
  const ban = banStateAfterReversal(n, !!existing.is_banned);
  await (supabase as any).from("user_warnings").update({ warning_count: n, ...(ban || {}) }).eq("id", existing.id);
}
