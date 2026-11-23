import { useState, ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface AdminTableColumn<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
}

interface AdminTableProps<T extends Record<string, any>> {
  columns: AdminTableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyIcon?: ReactNode;
  emptyText?: string;
  rowKey?: (row: T) => string;
  actions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  compact?: boolean;
}

export function AdminTable<T extends Record<string, any>>({
  columns,
  data,
  loading = false,
  emptyIcon,
  emptyText = "لا توجد بيانات",
  rowKey,
  actions,
  onRowClick,
  compact = false,
}: AdminTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...data].sort((a, b) => {
    if (!sortKey) return 0;
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "ar");
    return sortDir === "asc" ? cmp : -cmp;
  });

  const allCols = actions
    ? [
        ...columns,
        {
          key: "__actions__",
          label: "إجراءات",
          sortable: false,
          className: "text-left",
        } as AdminTableColumn<T>,
      ]
    : columns;

  const cellPy = compact ? "py-2" : "py-3";

  return (
    <div className="overflow-x-auto rounded-lg border border-border/50">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="bg-muted/40 border-b border-border/50">
            {allCols.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-2.5 text-right text-[11px] font-semibold text-muted-foreground whitespace-nowrap select-none",
                  col.key !== "__actions__" && col.sortable !== false
                    ? "cursor-pointer hover:text-foreground transition-colors"
                    : "",
                  col.headerClassName
                )}
                onClick={
                  col.key !== "__actions__" && col.sortable !== false
                    ? () => handleSort(col.key)
                    : undefined
                }
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.key !== "__actions__" && col.sortable !== false && (
                    <span className="text-muted-foreground/40">
                      {sortKey === col.key ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3" />
                      )}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/30">
                {allCols.map((col) => (
                  <td key={col.key} className={cn("px-4", cellPy)}>
                    <Skeleton className="h-4 w-full max-w-[120px]" />
                  </td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={allCols.length} className="text-center py-16">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  {emptyIcon && <div className="opacity-30 mb-1">{emptyIcon}</div>}
                  <p className="text-sm">{emptyText}</p>
                </div>
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row) : i}
                className={cn(
                  "border-b border-border/30 last:border-0 transition-colors",
                  onRowClick
                    ? "cursor-pointer hover:bg-muted/30"
                    : "hover:bg-muted/15"
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("px-4 align-middle", cellPy, col.className)}
                  >
                    {col.render ? col.render(row) : (row[col.key] ?? "—")}
                  </td>
                ))}
                {actions && (
                  <td
                    className={cn("px-4 align-middle text-left", cellPy)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5 justify-end">
                      {actions(row)}
                    </div>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
