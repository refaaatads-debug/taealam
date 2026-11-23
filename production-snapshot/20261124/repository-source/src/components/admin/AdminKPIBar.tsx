import { ElementType } from "react";
import { cn } from "@/lib/utils";

export interface KPIItem {
  label: string;
  value: string | number;
  icon: ElementType;
  accent?: string;
  iconClass?: string;
}

interface AdminKPIBarProps {
  kpis: KPIItem[];
  className?: string;
  cols?: 2 | 3 | 4 | 5;
}

export function AdminKPIBar({ kpis, className, cols = 4 }: AdminKPIBarProps) {
  const gridCls = {
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
    5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  }[cols];

  return (
    <div className={cn("grid gap-3", gridCls, className)}>
      {kpis.map((kpi, i) => (
        <div
          key={i}
          className="bg-card border border-border/50 rounded-lg p-3.5 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground leading-tight truncate ml-1">
              {kpi.label}
            </p>
            <div
              className={cn(
                "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                kpi.accent || "bg-muted"
              )}
            >
              <kpi.icon className={cn("h-[14px] w-[14px]", kpi.iconClass)} />
            </div>
          </div>
          <p className="text-xl font-bold text-foreground tracking-tight leading-none">
            {kpi.value}
          </p>
        </div>
      ))}
    </div>
  );
}
