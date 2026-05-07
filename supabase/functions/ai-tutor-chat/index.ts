import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `أنت "مساعد منصة أجيال المعرفة" - مدرس ذكي ودود يساعد الطلاب العرب.
- اشرح المفاهيم بأسلوب بسيط واضح بالعربية الفصحى.
- استخدم أمثلة من الحياة اليومية.
- إذا طلب الطالب الممارسة بالإنجليزية، صحّح النطق والقواعد بلطف.
- اقترح كلمات صعبة لينطقها ويتدرب عليها.
- اجعل ردودك قصيرة (2-4 جمل) ليسهل سماعها.`;

const GROQ_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];

async function callGroq(messages: any[], apiKey: string): Promise<string | null> {
  for (const model of GROQ_MODELS) {
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
          max_tokens: 512,
        }),
      });
      if (resp.status === 429) { console.log(`${model} rate-limited, trying next...`); continue; }
      if (!resp.ok) { console.error(`${model} error:`, resp.status); continue; }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text) { console.log("Used model:", model); return text; }
    } catch (e) { console.error(`${model} exception:`, e); }
  }
  return null;
}

async function callGemini(messages: any[], apiKey: string): Promise<string | null> {
  try {
    const contents = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents }) }
    );
    if (!resp.ok) { console.error("Gemini error:", resp.status, await resp.text()); return null; }
    const data = await resp.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { console.error("Gemini exception:", e); return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { messages, speak = true } = await req.json();
    if (!Array.isArray(messages)) return new Response(JSON.stringify({ error: "messages required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

    let text = await callGroq(messages, GROQ_API_KEY);
    if (!text) {
      console.log("All Groq models failed, trying Gemini...");
      text = await callGemini(messages, GEMINI_API_KEY);
    }
    if (!text) return new Response(JSON.stringify({ error: "كل النماذج مشغولة، حاول بعد دقيقة" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let audioBase64 = null;
    if (speak && text) {
      const { data: voiceSetting } = await supabase.from("site_settings").select("value").eq("key", "ai_tutor_voice_id").maybeSingle();
      const voiceId = voiceSetting?.value?.trim() || "EXAVITQu4vr4xnSDxMaL";
      const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
      if (ELEVENLABS_API_KEY) {
        try {
          const ttsResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            { method: "POST", headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({ text: text.slice(0, 1000), model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 } }) });
          if (ttsResp.ok) { const buf = await ttsResp.arrayBuffer(); audioBase64 = base64Encode(new Uint8Array(buf)); }
          else console.error("TTS error:", ttsResp.status, await ttsResp.text());
        } catch (e) { console.error("TTS exception:", e); }
      }
    }
    return new Response(JSON.stringify({ text, audio: audioBase64 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-tutor-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
