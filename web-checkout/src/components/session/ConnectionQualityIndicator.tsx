import { Wifi, WifiOff, AlertTriangle } from "lucide-react";
import type { ConnectionQuality } from "@/hooks/useConnectionQuality";

interface Props {
  quality: ConnectionQuality;
  compact?: boolean;
}

const LEVEL_META: Record<ConnectionQuality["level"], { color: string; label: string; bars: number }> = {
  excellent: { color: "text-success", label: "ممتاز", bars: 4 },
  good: { color: "text-success", label: "جيد", bars: 3 },
  fair: { color: "text-warning", label: "متوسط", bars: 2 },
  poor: { color: "text-destructive", label: "ضعيف", bars: 1 },
  disconnected: { color: "text-destructive", label: "منقطع", bars: 0 },
};

export const ConnectionQualityIndicator = ({ quality, compact }: Props) => {
  const meta = LEVEL_META[quality.level];
  const Icon = quality.level === "disconnected" ? WifiOff : quality.level === "poor" ? AlertTriangle : Wifi;

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1 ${meta.color}`} title={`${meta.label} - RTT: ${quality.rtt || 0}ms`}>
        <Icon className="h-4 w-4" />
        <span className="text-xs font-bold">{meta.label}</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-card/80 backdrop-blur border ${meta.color}`}>
      <Icon className="h-3.5 w-3.5" />
      <span>{meta.label}</span>
      {quality.rtt != null && quality.level !== "disconnected" && (
        <span className="text-muted-foreground">· {quality.rtt}ms</span>
      )}
    </div>
  );
};

export default ConnectionQualityIndicator;
