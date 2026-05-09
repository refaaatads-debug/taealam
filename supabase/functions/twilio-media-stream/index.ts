// Twilio Media Streams WebSocket → ElevenLabs Realtime STT → AI/Regex violation detection
  // Receives μ-law 8kHz base64 audio chunks from Twilio, streams them to ElevenLabs,
  // scans transcripts for personal info, logs to violations + call_transcripts.
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "";
  const ELEVENLABS_API_KEY_BACKUP = Deno.env.get("ELEVENLABS_API_KEY_BACKUP") || "";

  // جلب توكن ElevenLabs مع fallback تلقائي للمفتاح الاحتياطي
  async function getElevenLabsToken(): Promise<string | null> {
    for (const key of [ELEVENLABS_API_KEY, ELEVENLABS_API_KEY_BACKUP].filter(Boolean)) {
      try {
        const tokenRes = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
          method: "POST",
          headers: { "xi-api-key": key },
        });
        if (tokenRes.ok) {
          const { token } = await tokenRes.json();
          if (key === ELEVENLABS_API_KEY_BACKUP) console.warn("ElevenLabs: using BACKUP key");
          return token;
        }
        console.warn(`ElevenLabs token failed with key ending ...${key.slice(-6)}: ${tokenRes.status}`);
      } catch (e) {
        console.error("ElevenLabs token exception:", e);
      }
    }
    return null;
  }

  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

  // Regex patterns for personal info (Arabic + English)
  const PHONE_RE = /(\+?\d[\d\s\-]{6,}\d)/g;
  const EMAIL_RE = /[\w.\-]+@[\w\-]+\.[\w.\-]+/gi;
  const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const SOCIAL_RE = /(واتساب|واتس آب|واتس|whatsapp|telegram|تيليجرام|سناب|snap|انستجرام|instagram|insta|تويتر|twitter|فيسبوك|facebook|fb|تيك\s*توك|tiktok|ايميل|بريدي|رقمي|تواصل|اتصل|كلمني|راسلني|دي ام|dm)/gi;

  function detectViolations(text: string): { type: string; matched: string } | null {
    if (PHONE_RE.test(text)) { PHONE_RE.lastIndex = 0; return { type: "phone_number", matched: text.match(PHONE_RE)?.[0] || "" }; }
    if (EMAIL_RE.test(text)) { EMAIL_RE.lastIndex = 0; return { type: "email", matched: text.match(EMAIL_RE)?.[0] || "" }; }
    if (URL_RE.test(text)) { URL_RE.lastIndex = 0; return { type: "external_link", matched: text.match(URL_RE)?.[0] || "" }; }
    if (SOCIAL_RE.test(text)) { SOCIAL_RE.lastIndex = 0; return { type: "social_media_attempt", matched: text.match(SOCIAL_RE)?.[0] || "" }; }
    return null;
  }

  async function aiCheckViolation(text: string): Promise<{ violation: boolean; type?: string; reason?: string }> {
    if (!LOVABLE_API_KEY) return { violation: false };
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: 'أنت محلل امتثال. حدد إن كان النص يحتوي محاولة تبادل بيانات تواصل خارجية (هاتف، إيميل، حساب سوشيال، رابط) بين معلم وطالب. أجب بـ JSON فقط: {"violation":true|false,"type":"phone_number|email|social_media_attempt|external_link|none","reason":"..."}' },
            { role: "user", content: text },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!r.ok) return { violation: false };
      const j = await r.json();
      const content = j.choices?.[0]?.message?.content || "{}";
      return JSON.parse(content);
    } catch { return { violation: false }; }
  }

  async function endTwilioCall(callSid: string) {
    try {
      const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Zeina" language="arb">تم رصد محاولة تبادل بيانات شخصية. سيتم إنهاء المكالمة فوراً وفقاً لسياسة المنصة.</Say><Hangup/></Response>`;
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ Twiml: twiml }),
      });
    } catch (e) {
      console.error("endTwilioCall failed:", e);
    }
  }

  Deno.serve((req) => {
    const upgrade = req.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const { socket: twilioWS, response } = Deno.upgradeWebSocket(req);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    let callSid = "";
    let callLogId: string | null = null;
    let teacherId: string | null = null;
    let studentId: string | null = null;
    let elevenWS: WebSocket | null = null;
    let violationCount = 0;
    let warned = false;
    let elevenReady = false;
    let pendingAudio: string[] = [];

    const setupElevenLabs = async () => {
      try {
        // Get realtime token — primary key with automatic fallback to backup
        const token = await getElevenLabsToken();
        if (!token) {
          console.error("ElevenLabs: both keys failed, cannot setup STT");
          return;
        }

        const elevenURL = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=ulaw_8000&commit_strategy=vad&language_code=ara&token=${token}`;
        elevenWS = new WebSocket(elevenURL);

        elevenWS.onopen = () => {
          console.log("ElevenLabs WS connected");
          elevenReady = true;
          for (const chunk of pendingAudio) {
            elevenWS?.send(JSON.stringify({ type: "audio", audio_base64: chunk }));
          }
          pendingAudio = [];
        };

        elevenWS.onmessage = async (event) => {
          try {
            const msg = JSON.parse(event.data);
            const text = msg?.committed_transcript_event?.text || msg?.text;
            if (!text || typeof text !== "string" || text.trim().length < 2) return;
            console.log("Transcript:", text);
            let violation = detectViolations(text);
            if (!violation && text.length > 10) {
              const ai = await aiCheckViolation(text);
              if (ai.violation && ai.type && ai.type !== "none") {
                violation = { type: ai.type, matched: ai.reason || text };
              }
            }
            await supabase.from("call_transcripts").insert({
              call_log_id: callLogId,
              twilio_call_sid: callSid,
              speaker: "unknown",
              text,
              is_violation: !!violation,
              violation_type: violation?.type || null,
            });
            if (violation) {
              violationCount++;
              await supabase.from("violations").insert({
                user_id: teacherId || studentId || "00000000-0000-0000-0000-000000000000",
                source: "phone_call",
                violation_type: violation.type,
                detected_text: violation.matched,
                original_message: text,
                confidence_score: 0.85,
              });
              const violator = teacherId || studentId;
              if (violator) {
                const { data: existing } = await supabase
                  .from("user_warnings")
                  .select("warning_count")
                  .eq("user_id", violator)
                  .eq("warning_type", "phone_call_violation")
                  .maybeSingle();
                const newCount = (existing?.warning_count || 0) + 1;
                await supabase.from("user_warnings").upsert({
                  user_id: violator,
                  warning_type: "phone_call_violation",
                  warning_count: newCount,
                  description: `محاولة تبادل ${violation.type} في المكالمة الهاتفية`,
                  is_banned: newCount >= 5,
                  banned_until: newCount >= 5 ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() : null,
                }, { onConflict: "user_id,warning_type" });
              }
              if (!warned) {
                warned = true;
                console.log("First violation — warning the call");
              } else {
                console.log("Second violation — terminating call");
                await endTwilioCall(callSid);
              }
            }
          } catch (e) {
            console.error("ElevenLabs message error:", e);
          }
        };

        elevenWS.onerror = (e) => console.error("ElevenLabs WS error:", e);
        elevenWS.onclose = () => { console.log("ElevenLabs WS closed"); elevenReady = false; };
      } catch (e) {
        console.error("setupElevenLabs failed:", e);
      }
    };

    twilioWS.onopen = () => console.log("Twilio WS connected");

    twilioWS.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        const ev = data.event;
        if (ev === "start") {
          callSid = data.start?.callSid || "";
          const params = data.start?.customParameters || {};
          callLogId = params.callLogId || null;
          teacherId = params.teacherId || null;
          studentId = params.studentId || null;
          console.log("Stream started:", { callSid, callLogId, teacherId, studentId });
          await setupElevenLabs();
        } else if (ev === "media") {
          const payload = data.media?.payload;
          if (!payload) return;
          if (elevenReady && elevenWS?.readyState === WebSocket.OPEN) {
            elevenWS.send(JSON.stringify({ type: "audio", audio_base64: payload }));
          } else {
            if (pendingAudio.length < 500) pendingAudio.push(payload);
          }
        } else if (ev === "stop") {
          console.log("Stream stopped");
          if (elevenWS?.readyState === WebSocket.OPEN) {
            elevenWS.send(JSON.stringify({ type: "commit" }));
            setTimeout(() => elevenWS?.close(), 2000);
          }
        }
      } catch (e) {
        console.error("Twilio message error:", e);
      }
    };

    twilioWS.onclose = () => {
      console.log("Twilio WS closed");
      elevenWS?.close();
    };

    twilioWS.onerror = (e) => console.error("Twilio WS error:", e);

    return response;
  });
  