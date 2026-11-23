// Unwired pilot transport. Audio capture/playback remains a separate reviewed step.
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';

export type GeminiPilotTicket = {
  allowed: true; provider: 'gemini'; model: 'gemini-3.8-live'; token: string;
  expiresAt: string; newSessionExpiresAt: string; maxSeconds: 300;
};
export function validateGeminiPilotTicket(ticket: GeminiPilotTicket, now = Date.now()) {
  if (ticket.allowed !== true || ticket.provider !== 'gemini' || ticket.model !== 'gemini-3.8-live' ||
      !ticket.token?.startsWith('auth_tokens/') || ticket.maxSeconds !== 300 ||
      !Number.isFinite(Date.parse(ticket.expiresAt)) || !Number.isFinite(Date.parse(ticket.newSessionExpiresAt)) ||
      Date.parse(ticket.expiresAt) <= now || Date.parse(ticket.expiresAt) > now + 300_000 ||
      Date.parse(ticket.newSessionExpiresAt) <= now || Date.parse(ticket.newSessionExpiresAt) > now + 60_000) {
    throw Error('invalid_pilot_ticket');
  }
}

export async function connectGeminiPilot(ticket: GeminiPilotTicket, callbacks: {
  onmessage: (message: LiveServerMessage) => void;
  onclose: () => void;
  onerror: () => void;
}) {
  validateGeminiPilotTicket(ticket);
  let stopped = false;
  let session: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | undefined;
  const stop = () => { if (stopped) return; stopped = true; clearTimeout(timer); session?.close(); };
  // UX guard only. Security relies on the reservation + provider token constraint.
  const timer = setTimeout(stop, Math.max(0, Date.parse(ticket.expiresAt) - Date.now()));
  const ai = new GoogleGenAI({ apiKey: ticket.token, httpOptions: { apiVersion: 'v1beta' } });
  try {
    session = await ai.live.connect({
      model: ticket.model,
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onmessage: message => { if (!stopped && Date.now() < Date.parse(ticket.expiresAt)) callbacks.onmessage(message); },
        onclose: () => { stop(); callbacks.onclose(); },
        onerror: () => { stop(); callbacks.onerror(); },
      },
    });
    if (stopped) session.close();
  } catch (error) { stop(); throw error; }
  return {
    // Mono signed 16-bit little-endian PCM, 16kHz, base64. Never send MediaRecorder WebM bytes here.
    sendPcm16: (base64: string) => {
      if (stopped || Date.now() >= Date.parse(ticket.expiresAt)) { stop(); return; }
      session?.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
    },
    stop,
  };
}
