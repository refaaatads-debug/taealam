import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

// Server-side admin broadcast. The browser only creates a campaign and then asks the
// server to run pages. Recipients are read with keyset paging (no 1000-row cut), each
// page is inserted idempotently, and the cursor is saved, so a closed tab or a crash
// resumes where it stopped. Admin only.
const PAGE_SIZE = 1000;
const INSERT_CHUNK = 500;
const MAX_PAGES_PER_CALL = 5;
const LOCK_SECONDS = 60;

serve(async (req) => {
  const cors = getCorsHeaders(req);
  const json = (obj: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const rate = checkEdgeRateLimit(req, "admin-broadcast", 120);
  if (!rate.allowed) return json({ error: "طلبات كثيرة، حاول لاحقاً" }, 429, { "Retry-After": String(rate.retryAfterSeconds) });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: claims, error: claimsError } = await userClient.auth.getUser(token);
    const userId = claims?.user?.id;
    if (claimsError || !userId) return json({ error: "Unauthorized" }, 401);
    const { data: adminRow } = await userClient.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!adminRow) return json({ error: "Forbidden" }, 403);

    const db = createClient(url, serviceKey);
    const payload = await req.json();

    if (payload.action === "create") {
      const title = String(payload.title ?? "").trim();
      const body = String(payload.body ?? "").trim();
      const target = String(payload.target ?? "");
      if (!title || !["all", "all_students", "all_teachers"].includes(target)) return json({ error: "Invalid broadcast" }, 400);
      const count = await countRecipients(db, target);
      if (count === 0) return json({ error: "no_recipients" }, 400);
      const { data, error } = await db.from("admin_broadcasts").insert({
        created_by: userId, title, body: body || null,
        file_url: payload.file_url ?? null, file_name: payload.file_name ?? null,
        target, total_recipients: count,
      }).select("id").single();
      if (error) throw error;
      return json({ id: data.id, total: count });
    }

    if (payload.action === "run") {
      const id = String(payload.id ?? "");
      // Take the lock atomically so two tabs cannot run the same campaign at once.
      const lockUntil = new Date(Date.now() + LOCK_SECONDS * 1000).toISOString();
      const { data: locked, error: lockError } = await db.from("admin_broadcasts")
        .update({ status: "running", locked_until: lockUntil, updated_at: new Date().toISOString() })
        .eq("id", id).in("status", ["pending", "running", "failed"])
        .or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`)
        .select("*").maybeSingle();
      if (lockError) throw lockError;
      if (!locked) {
        const { data: current } = await db.from("admin_broadcasts").select("status,sent_count,total_recipients").eq("id", id).maybeSingle();
        return json({ busy: true, ...(current ?? {}) });
      }

      let cursor: string | null = locked.last_user_id;
      let sent: number = locked.sent_count;
      let finished = false;
      try {
        for (let page = 0; page < MAX_PAGES_PER_CALL; page += 1) {
          const ids = await recipientPage(db, locked.target, cursor);
          if (ids.length === 0) { finished = true; break; }
          const { data: existing } = await db.from("notifications").select("user_id").eq("broadcast_id", id).in("user_id", ids);
          const have = new Set((existing ?? []).map((r: { user_id: string }) => r.user_id));
          const rows = ids.filter((u) => !have.has(u)).map((uid) => ({
            user_id: uid, title: locked.title, body: locked.body, type: "admin_broadcast",
            file_url: locked.file_url, file_name: locked.file_name, broadcast_id: id,
          }));
          for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
            const { error } = await db.from("notifications").insert(rows.slice(i, i + INSERT_CHUNK));
            if (error) throw error;
          }
          sent += rows.length;
          cursor = ids[ids.length - 1];
          await db.from("admin_broadcasts").update({
            last_user_id: cursor, sent_count: sent, locked_until: new Date(Date.now() + LOCK_SECONDS * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", id);
          if (ids.length < PAGE_SIZE) { finished = true; break; }
        }
      } catch (e) {
        await db.from("admin_broadcasts").update({
          status: "failed", locked_until: null, last_error: String((e as Error)?.message ?? e).slice(0, 300),
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        console.error("admin-broadcast page failed", e);
        return json({ error: "page_failed", sent, total: locked.total_recipients, resumable: true }, 500);
      }
      await db.from("admin_broadcasts").update({
        status: finished ? "done" : "running", locked_until: null, updated_at: new Date().toISOString(),
      }).eq("id", id);
      return json({ done: finished, sent, total: locked.total_recipients });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("admin-broadcast error:", e);
    return json({ error: "تعذر إرسال الإشعارات" }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function recipientPage(db: any, target: string, cursor: string | null): Promise<string[]> {
  let query = target === "all"
    ? db.from("profiles").select("user_id")
    : db.from("user_roles").select("user_id").eq("role", target === "all_students" ? "student" : "teacher");
  if (cursor) query = query.gt("user_id", cursor);
  const { data, error } = await query.order("user_id", { ascending: true }).limit(PAGE_SIZE);
  if (error) throw error;
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

// deno-lint-ignore no-explicit-any
async function countRecipients(db: any, target: string): Promise<number> {
  const query = target === "all"
    ? db.from("profiles").select("user_id", { count: "exact", head: true })
    : db.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", target === "all_students" ? "student" : "teacher");
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
