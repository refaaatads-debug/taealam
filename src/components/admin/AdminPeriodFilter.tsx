import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

export type AdminPeriod = "today" | "week" | "month" | "all";

const OPTIONS: { value: AdminPeriod; label: string }[] = [
  { value: "today", label: "اليوم" },
  { value: "week", label: "الأسبوع" },
  { value: "month", label: "الشهر" },
  { value: "all", label: "الكل" },
];

export function getPeriodStart(period: AdminPeriod): Date | null {
  const now = new Date();
  if (period === "today") {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return d;
  }
  if (period === "week") {
    const d = new Date(now); d.setDate(d.getDate() - 7); return d;
  }
  if (period === "month") {
    const d = new Date(now); d.setMonth(d.getMonth() - 1); return d;
  }
  return null;
}

interface Props {
  value: AdminPeriod;
  onChange: (v: AdminPeriod) => void;
}

export default function AdminPeriodFilter({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-muted/50 border border-border/50 rounded-xl shadow-sm">
      <Calendar className="h-4 w-4 text-muted-foreground mr-2" />
      {OPTIONS.map(opt => (
        <Button
          key={opt.value}
          size="sm"
          variant="ghost"
          onClick={() => onChange(opt.value)}
          className={`h-8 px-3 text-xs font-semibold rounded-lg transition-all ${
            value === opt.value
              ? "bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md hover:opacity-95"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
