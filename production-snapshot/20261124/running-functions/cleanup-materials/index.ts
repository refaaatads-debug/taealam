import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    } catch {
      // Cron calls send no body.
    }

    const RECORDING_PATH = /^\/storage\/v1\/object\/(?:sign|public|authenticated)\/session-recordings\/([0-9a-f-]{36}\/[0-9a-f-]{36}_[0-9]+\.webm)$/i;
    const pathOf = (value: string | null): string | null => {
      if (!value) return null;
      try {
        const m = RECORDING_PATH.exec(new URL(value).pathname);
        return m ? m[1] : null;
      } catch {
        return null;
      }
    };

    const nowIso = new Date().toISOString();
    const retentionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1) Expired materials (expires_at is session end + 7 days).
    const { data: expiredMaterials, error: matError } = await supabase
      .from("session_materials")
      .select("id, recording_url")
      .lt("expires_at", nowIso)
      .eq("is_deleted", false);
    if (matError) throw matError;

    // 2) Recordings stored on sessions older than the 7 day window.
    const { data: oldSessions, error: sesError } = await supabase
      .from("sessions")
      .select("id, recording_url")
      .not("recording_url", "is", null)
      .lt("ended_at", retentionCutoff);
    if (sesError) throw sesError;

    const paths = new Set<string>();
    for (const m of expiredMaterials || []) {
      const path = pathOf(m.recording_url);
      if (path) paths.add(path);
    }
    for (const s of oldSessions || []) {
      const path = pathOf(s.recording_url);
      if (path) paths.add(path);
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        success: true,
        dry_run: true,
        materials: expiredMaterials?.length || 0,
        recording_files: paths.size,
        sessions_with_old_recording: oldSessions?.length || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Delete the files first; a failed removal keeps the DB row so the next run retries.
    const removedPaths = new Set<string>();
    const list = Array.from(paths);
    for (let i = 0; i < list.length; i += 50) {
      const chunk = list.slice(i, i + 50);
      const { error: removeError } = await supabase.storage.from("session-recordings").remove(chunk);
      if (removeError) {
        console.error("Recording removal failed:", removeError.message);
        continue;
      }
      chunk.forEach((path) => removedPaths.add(path));
    }

    const doneMaterialIds: string[] = [];
    for (const m of expiredMaterials || []) {
      const path = pathOf(m.recording_url);
      if (!path || removedPaths.has(path)) doneMaterialIds.push(m.id);
    }
    if (doneMaterialIds.length) {
      const { error } = await supabase
        .from("session_materials")
        .update({ is_deleted: true, recording_url: null })
        .in("id", doneMaterialIds);
      if (error) throw error;
    }

    const doneSessionIds = (oldSessions || [])
      .filter((s) => {
        const path = pathOf(s.recording_url);
        return !path || removedPaths.has(path);
      })
      .map((s) => s.id);
    if (doneSessionIds.length) {
      const { error } = await supabase.from("sessions").update({ recording_url: null }).in("id", doneSessionIds);
      if (error) throw error;
    }

    console.log(`Retention: ${doneMaterialIds.length} materials, ${removedPaths.size} recording files, ${doneSessionIds.length} sessions cleared`);

    return new Response(JSON.stringify({
      success: true,
      cleaned: doneMaterialIds.length,
      recording_files_removed: removedPaths.size,
      sessions_cleared: doneSessionIds.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Cleanup error:", err);
    return new Response(JSON.stringify({ error: "تعذر تنظيف المواد المنتهية" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
