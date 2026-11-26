import { supabase } from "@/integrations/supabase/client";

export type PromotionMode = "online" | "in_person";

/**
 * Returns the teacher user ids that are promoted right now for one list, in display order.
 * Never throws: if the table is missing or the request fails, nothing is promoted and the
 * normal ordering is used.
 */
export async function fetchPromotedTeacherIds(mode: PromotionMode): Promise<string[]> {
  try {
    const { data, error } = await (supabase as any)
      .from("teacher_promotions")
      .select("teacher_id, display_order, starts_at, ends_at, is_active")
      .eq("mode", mode)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .limit(10);
    if (error || !data) return [];
    const now = Date.now();
    return (data as any[])
      .filter((r) => new Date(r.starts_at).getTime() <= now && (!r.ends_at || new Date(r.ends_at).getTime() > now))
      .map((r) => String(r.teacher_id));
  } catch {
    return [];
  }
}

/** Promoted teachers first (in promotion order), everyone else keeps their current order. */
export function promotedFirst<T>(items: T[], getId: (item: T) => string, promotedIds: string[]): T[] {
  if (!promotedIds.length) return items;
  const rank = new Map(promotedIds.map((id, i) => [id, i]));
  const promoted = items.filter((x) => rank.has(getId(x))).sort((a, b) => rank.get(getId(a))! - rank.get(getId(b))!);
  const rest = items.filter((x) => !rank.has(getId(x)));
  return [...promoted, ...rest];
}
