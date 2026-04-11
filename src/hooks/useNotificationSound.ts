import { useCallback, useRef } from "react";

// Different sounds for different notification types
const SOUND_MAP: Record<string, { url: string; volume: number }> = {
  // Session/booking related
  session: { url: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3", volume: 0.7 },
  pre_session: { url: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3", volume: 0.7 },
  booking: { url: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3", volume: 0.6 },
  session_rejected: { url: "https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3", volume: 0.5 },
  
  // Payment/financial
  payment: { url: "https://assets.mixkit.co/active_storage/sfx/888/888-preview.mp3", volume: 0.6 },
  withdrawal: { url: "https://assets.mixkit.co/active_storage/sfx/888/888-preview.mp3", volume: 0.6 },
  
  // Messages/chat
  message: { url: "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3", volume: 0.4 },
  
  // Reports
  session_report: { url: "https://assets.mixkit.co/active_storage/sfx/2356/2356-preview.mp3", volume: 0.5 },
  
  // Warnings/errors
  ai_error: { url: "https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3", volume: 0.6 },
  warning: { url: "https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3", volume: 0.5 },
  
  // Instant session join request
  instant_session: { url: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3", volume: 0.8 },
  
  // Default
  general: { url: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3", volume: 0.6 },
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
