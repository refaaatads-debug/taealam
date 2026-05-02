import { useCallback, useRef } from "react";

// Distinct sound for each event type — using mixkit free library
const SOUND_MAP: Record<string, { url: string; volume: number }> = {
  // Sessions / bookings
  session: { url: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3", volume: 0.7 },
  pre_session: { url: "https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3", volume: 0.7 },
  session_started: { url: "https://assets.mixkit.co/active_storage/sfx/2872/2872-preview.mp3", volume: 0.7 },
  session_ended: { url: "https://assets.mixkit.co/active_storage/sfx/2873/2873-preview.mp3", volume: 0.6 },
  session_request: { url: "https://assets.mixkit.co/active_storage/sfx/1862/1862-preview.mp3", volume: 0.8 },
  session_rejected: { url: "https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3", volume: 0.5 },
  session_cancelled: { url: "https://assets.mixkit.co/active_storage/sfx/2964/2964-preview.mp3", volume: 0.6 },
  booking: { url: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3", volume: 0.6 },
  booking_confirmed: { url: "https://assets.mixkit.co/active_storage/sfx/1822/1822-preview.mp3", volume: 0.6 },

  // Payments / financial
  payment: { url: "https://assets.mixkit.co/active_storage/sfx/888/888-preview.mp3", volume: 0.7 },
  payment_success: { url: "https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3", volume: 0.7 },
  withdrawal: { url: "https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3", volume: 0.7 },
  withdrawal_approved: { url: "https://assets.mixkit.co/active_storage/sfx/890/890-preview.mp3", volume: 0.7 },
  earnings: { url: "https://assets.mixkit.co/active_storage/sfx/216/216-preview.mp3", volume: 0.6 },

  // Chat / messaging
  message: { url: "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3", volume: 0.5 },
  voice_message: { url: "https://assets.mixkit.co/active_storage/sfx/1518/1518-preview.mp3", volume: 0.5 },
  support_message: { url: "https://assets.mixkit.co/active_storage/sfx/2356/2356-preview.mp3", volume: 0.6 },

  // Reports / reviews
  session_report: { url: "https://assets.mixkit.co/active_storage/sfx/1112/1112-preview.mp3", volume: 0.5 },
  review: { url: "https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3", volume: 0.6 },
  rating: { url: "https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3", volume: 0.6 },

  // Warnings / errors / violations
  warning: { url: "https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3", volume: 0.6 },
  violation: { url: "https://assets.mixkit.co/active_storage/sfx/2961/2961-preview.mp3", volume: 0.7 },
  ai_error: { url: "https://assets.mixkit.co/active_storage/sfx/2962/2962-preview.mp3", volume: 0.6 },
  error: { url: "https://assets.mixkit.co/active_storage/sfx/2963/2963-preview.mp3", volume: 0.6 },

  // Instant / urgent
  instant_session: { url: "https://assets.mixkit.co/active_storage/sfx/1862/1862-preview.mp3", volume: 0.85 },
  first_impression: { url: "https://assets.mixkit.co/active_storage/sfx/1813/1813-preview.mp3", volume: 0.6 },

  // Assignments / homework
  assignment: { url: "https://assets.mixkit.co/active_storage/sfx/1862/1862-preview.mp3", volume: 0.7 },
  assignment_new: { url: "https://assets.mixkit.co/active_storage/sfx/1862/1862-preview.mp3", volume: 0.75 },
  assignment_submitted: { url: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3", volume: 0.7 },
  submission: { url: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3", volume: 0.7 },
  assignment_graded: { url: "https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3", volume: 0.7 },

  // Info / general
  info: { url: "https://assets.mixkit.co/active_storage/sfx/235/235-preview.mp3", volume: 0.5 },
  general: { url: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3", volume: 0.55 },
};

export function useNotificationSound() {
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());

  const play = useCallback((type?: string | null) => {
    try {
      const key = type && SOUND_MAP[type] ? type : "general";
      const config = SOUND_MAP[key];

      let audio = audioCache.current.get(key);
      if (!audio) {
        audio = new Audio(config.url);
        audio.volume = config.volume;
        audio.preload = "auto";
        audioCache.current.set(key, audio);
      }
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {
      // Ignore audio errors
    }
  }, []);

  return { play };
}
