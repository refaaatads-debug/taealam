import { useCallback } from "react";

// Short, gentle Web Audio tones — no external dependencies, no long preview files
function playTone(
  frequencies: number[],
  durations: number[],
  volume = 0.15,
  type: OscillatorType = "sine"
): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    let t = ctx.currentTime;
    frequencies.forEach((freq, i) => {
      const dur = (durations[i] || 200) / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
      t += dur * 0.8;
    });
    setTimeout(() => ctx.close(), 3000);
  } catch {}
}

// Each event type maps to a distinct but gentle tone pattern
function soundFor(type: string | null | undefined): void {
  switch (type) {
    // Booking flow — medium positive chime
    case "booking":
    case "booking_request":
    case "session_request":
    case "instant_session":
      playTone([587, 784], [140, 180], 0.14, "triangle"); break;

    // Booking accepted — bright double chime
    case "booking_confirmed":
    case "session_started":
    case "session":
      playTone([523, 659, 784], [100, 100, 160], 0.13, "triangle"); break;

    // Rejection / cancellation — soft descending
    case "booking_rejected":
    case "session_rejected":
    case "booking_cancelled":
    case "session_cancelled":
      playTone([440, 370], [150, 200], 0.10, "sine"); break;

    // Payment / earnings — pleasant ding
    case "payment":
    case "payment_success":
    case "withdrawal_approved":
    case "earnings":
      playTone([659, 784, 1047], [90, 90, 180], 0.12, "triangle"); break;

    // Withdrawal pending
    case "withdrawal":
      playTone([523, 440], [130, 180], 0.10, "sine"); break;

    // Chat / message — soft pop
    case "message":
    case "voice_message":
    case "support_message":
      playTone([880, 1047], [80, 100], 0.09, "sine"); break;

    // Review / rating — warm chime
    case "review":
    case "rating":
    case "session_report":
    case "session_completed":
      playTone([523, 659], [120, 160], 0.11, "triangle"); break;

    // Assignments
    case "assignment":
    case "assignment_new":
    case "assignment_submitted":
    case "submission":
      playTone([587, 740], [110, 160], 0.12, "triangle"); break;

    case "assignment_graded":
      playTone([659, 784, 880], [90, 90, 160], 0.12, "triangle"); break;

    // Warnings / errors — subtle low tone
    case "warning":
    case "violation":
    case "ai_error":
    case "error":
      playTone([330, 277], [160, 220], 0.10, "sine"); break;

    // Session reminder
    case "pre_session":
    case "session_reminder":
      playTone([523, 587, 523], [100, 100, 150], 0.12, "triangle"); break;

    // Session ended
    case "session_ended":
      playTone([523, 440], [130, 200], 0.10, "sine"); break;

    // First impression / info
    case "first_impression":
    case "info":
      playTone([784, 1047], [100, 160], 0.10, "triangle"); break;

    // Default: single soft ding
    default:
      playTone([659, 784], [100, 160], 0.10, "triangle"); break;
  }
}

export function useNotificationSound() {
  const play = useCallback((type?: string | null) => {
    soundFor(type);
  }, []);
  return { play };
}
