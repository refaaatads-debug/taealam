// Transcribe audio uploads (webm/wav/mp3) to text using ElevenLabs Scribe v2.
// Used by the AI Support Assistant voice-to-text input.
import { getProviderApiKey } from "../_shared/ai-models.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

// محاولة بالمفتاح الأساسي، وإذا انتهى الاشتراك (401/402/429) ينتقل للاحتياطي
async function elevenLabsFetch(
  url: string,
  options: RequestInit,
  primaryKey: string,
  backupKey: string
): Promise<Response> {
  const resp = await fetch(url, {
    ...options,
    headers: { ...(options.headers as Record<string, string>), "xi-api-key": primaryKey },
  });
  if ((resp.status === 401 || resp.status === 402 || resp.status === 429) && backupKey) {
    console.warn(`ElevenLabs primary key failed (${resp.status}), switching to backup key...`);
    return fetch(url, {
      ...options,
      headers: { ...(options.headers as Record<string, string>), "xi-api-key": backupKey },
    });
  }
  return resp;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const rate = checkEdgeRateLimit(req, "ai-support-transcribe", 10);
  if (!rate.allowed) return json({ error: "طلبات كثيرة، حاول لاحقاً" }, 429, req);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, req);
    }

    const primaryKey = await getProviderApiKey("elevenlabs", "ELEVENLABS_API_KEY");
    const backupKey = await getProviderApiKey("elevenlabs_backup", "ELEVENLABS_API_KEY_BACKUP");
    if (!primaryKey && !backupKey) return json({ error: "الخدمة غير متاحة حالياً" }, 500, req);

    const incoming = await req.formData();
    const file = incoming.get("audio");
    if (!(file instanceof File) && !(file instanceof Blob)) {
      return json({ error: "audio file required" }, 400, req);
    }

    const fd = new FormData();
    fd.append("file", file as Blob, "audio.webm");
    fd.append("model_id", "scribe_v2");
    fd.append("language_code", "ara");

    const r = await elevenLabsFetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      { method: "POST", body: fd },
      primaryKey,
      backupKey
    );

    if (!r.ok) {
      const err = await r.text();
      console.error("ElevenLabs error:", r.status, err);
      return json({ error: "تعذر تحويل التسجيل إلى نص" }, 500, req);
    }

    const data = await r.json();
    return json({ text: (data.text || "").trim() }, 200, req);
  } catch (e: any) {
    console.error("transcribe fatal:", e);
    return json({ error: "تعذر تحويل التسجيل إلى نص" }, 500, req);
  }
});

function json(payload: unknown, status = 200, req: Request) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
