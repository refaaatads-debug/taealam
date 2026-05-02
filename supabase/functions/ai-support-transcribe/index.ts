// Transcribe audio uploads (webm/wav/mp3) to text using ElevenLabs Scribe v2.
// Used by the AI Support Assistant voice-to-text input.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) return json({ error: "ELEVENLABS_API_KEY not configured" }, 500);

    const incoming = await req.formData();
    const file = incoming.get("audio");
    if (!(file instanceof File) && !(file instanceof Blob)) {
      return json({ error: "audio file required" }, 400);
    }

    const fd = new FormData();
    fd.append("file", file as Blob, "audio.webm");
    fd.append("model_id", "scribe_v2");
    fd.append("language_code", "ara");

    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: fd,
    });

    if (!r.ok) {
      const err = await r.text();
      console.error("ElevenLabs error:", r.status, err);
      return json({ error: "Transcription failed" }, 500);
    }

    const data = await r.json();
    return json({ text: (data.text || "").trim() });
  } catch (e: any) {
    console.error("transcribe fatal:", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
