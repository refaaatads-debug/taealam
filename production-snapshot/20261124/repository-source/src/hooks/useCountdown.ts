import { useState, useEffect } from "react";

export function useCountdown(targetSeconds: number) {
  const [timeLeft, setTimeLeft] = useState(targetSeconds);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  return { hours, minutes, seconds, isExpired: timeLeft <= 0 };
}
