import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Timer } from "lucide-react";

interface CountdownTimerProps {
  expiresAt: string;
  onExpire?: () => void;
  showLabel?: boolean;
}

export default function CountdownTimer({ expiresAt, onExpire, showLabel = true }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => {
    const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    return diff;
  });

  useEffect(() => {
    if (timeLeft <= 0) {
      onExpire?.();
      return;
    }
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setTimeLeft(diff);
      if (diff <= 0) {
        onExpire?.();
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isExpired = timeLeft <= 0;

  const getColor = () => {
    if (isExpired) return "text-destructive";
    if (timeLeft < 20) return "text-destructive";
    if (timeLeft < 60) return "text-orange-500";
    return "text-secondary";
  };

  const getBgColor = () => {
    if (isExpired) return "bg-destructive/10";
    if (timeLeft < 20) return "bg-destructive/10";
    if (timeLeft < 60) return "bg-orange-500/10";
    return "bg-secondary/10";
  };

  if (isExpired) {
    return (
      <span className="text-xs text-destructive font-bold">انتهى الوقت</span>
    );
  }

  return (
    <motion.div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${getBgColor()}`}
      animate={timeLeft < 20 ? { scale: [1, 1.05, 1] } : {}}
      transition={{ repeat: Infinity, duration: 1 }}
    >
      <Timer className={`h-3.5 w-3.5 ${getColor()}`} />
      <span className={`text-sm font-black tabular-nums ${getColor()}`}>
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
      {showLabel && (
        <span className={`text-xs font-medium ${getColor()} hidden sm:inline`}>متبقي</span>
      )}
    </motion.div>
  );
}
