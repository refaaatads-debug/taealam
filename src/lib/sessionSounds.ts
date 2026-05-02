/**
 * Lightweight notification sounds for live sessions.
 * Uses WebAudio to synthesize tones — no asset files needed, instant playback.
 */

let _ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!_ctx) _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
    return _ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, durationMs: number, when = 0, type: OscillatorType = "sine", gainVal = 0.15) {
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainVal, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + durationMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.05);
}

/** Two ascending notes — when peer joins. */
export function playJoinSound() {
  tone(523.25, 150, 0);     // C5
  tone(783.99, 200, 0.12);  // G5
}

/** One soft descending note — when peer leaves. */
export function playLeaveSound() {
  tone(440, 180, 0, "sine", 0.12);
  tone(349.23, 220, 0.12, "sine", 0.1);
}

/** Bright double chime — hand raised. */
export function playHandRaiseSound() {
  tone(880, 120, 0, "triangle", 0.18);
  tone(1318.5, 160, 0.1, "triangle", 0.16);
}
