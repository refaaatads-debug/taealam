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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, speak = true } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "تم تجاوز الحد، حاول لاحقاً" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "نفذ الرصيد، يرجى التواصل مع الإدارة" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const text = aiData?.choices?.[0]?.message?.content || "";

    let audioBase64: string | null = null;
    if (speak && text) {
      // Get voice id
      const { data: voiceSetting } = await supabase
        .from("site_settings").select("value").eq("key", "ai_tutor_voice_id").maybeSingle();
      const voiceId = voiceSetting?.value?.trim() || "EXAVITQu4vr4xnSDxMaL";

      const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
      if (ELEVENLABS_API_KEY) {
        try {
          const ttsResp = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({
                text: text.slice(0, 1000),
                model_id: "eleven_turbo_v2_5",
                voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
              }),
            }
          );
          if (ttsResp.ok) {
            const buf = await ttsResp.arrayBuffer();
            audioBase64 = base64Encode(new Uint8Array(buf));
          } else {
            console.error("TTS error:", ttsResp.status);
          }
        } catch (e) {
          console.error("TTS exception:", e);
        }
      }
    }

    return new Response(JSON.stringify({ text, audio: audioBase64 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-tutor-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
