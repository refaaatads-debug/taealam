import { useCallback, useRef } from "react";

// Distinct pleasant chime for notifications
const NOTIFICATION_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3";

export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
        audioRef.current.volume = 0.6;
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Browser may block autoplay — ignore silently
      });
    } catch {
      // Ignore audio errors
    }
  }, []);

  return { play };
}
