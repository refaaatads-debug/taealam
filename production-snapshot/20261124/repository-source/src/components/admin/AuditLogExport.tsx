import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, FileSpreadsheet, FileText, Calendar } from "lucide-react";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/auditLog";

export type AuditRow = {
  id: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  category: string;
  description: string | null;
  target_table: string | null;
  target_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

interface Props {
  rows: AuditRow[];
  /** Optional category-label map for richer export labels */
  categoryLabels?: Record<string, string>;
}

type Range = { from: string; to: string };

const HEADERS = [
  "التاريخ والوقت", "المنفذ", "الدور", "الفئة", "الإجراء",
  "الوصف", "الجدول المستهدف", "المعرف", "IP", "User-Agent",
];

function fmtDateLocal(iso: string) {
  return new Date(iso).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "medium" });
}

function escapeCSV(v: any) {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  return /["\n]/.test(s) ? `"${s}"` : s;
}

function applyRange(rows: AuditRow[], range: Range): AuditRow[] {
  const fromTs = range.from ? new Date(range.from).getTime() : null;
  // make "to" inclusive end-of-day
  const toTs = range.to ? new Date(range.to).getTime() + 24 * 3600 * 1000 - 1 : null;
  return rows.filter((r) => {
    const t = new Date(r.created_at).getTime();
    if (fromTs !== null && t < fromTs) return false;
    if (toTs !== null && t > toTs) return false;
    return true;
  });
}

function rowsToData(rows: AuditRow[], categoryLabels: Record<string, string>) {
  return rows.map((r) => [
    fmtDateLocal(r.created_at),
    r.actor_name || "—",
    r.actor_role === "admin" ? "مدير عام" : (r.actor_role || "—"),
    categoryLabels[r.category] || r.category,
    r.action,
    r.description || "",
    r.target_table || "",
    r.target_id || "",
    r.ip_address || "",
    (r.user_agent || "").slice(0, 120),
  ]);
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AuditLogExport({ rows, categoryLabels = {} }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [range, setRange] = useState<Range>({ from: monthAgo, to: today });
  const [open, setOpen] = useState(false);

  const filtered = applyRange(rows, range);
  const stamp = `${range.from || "all"}_to_${range.to || "all"}`;

  const exportCSV = async () => {
    if (filtered.length === 0) { toast.error("لا توجد عمليات في النطاق المحدد"); return; }
    const lines = [
      HEADERS.join(","),
      ...rowsToData(filtered, categoryLabels).map((row) => row.map(escapeCSV).join(",")),
    ];
    // Add UTF-8 BOM for Arabic Excel compatibility
    const csv = "\uFEFF" + lines.join("\n");
    downloadBlob(csv, `audit_log_${stamp}.csv`, "text/csv;charset=utf-8");
    toast.success(`تم تصدير ${filtered.length} عملية إلى CSV`);
    await logAdminAction({
      action: "export_audit_log",
      category: "team_management",
      description: `تصدير سجل العمليات (CSV) - ${filtered.length} سجل`,
      metadata: { format: "csv", from: range.from, to: range.to, count: filtered.length },
    });
    setOpen(false);
  };

  const exportPDF = async () => {
    if (filtered.length === 0) { toast.error("لا توجد عمليات في النطاق المحدد"); return; }
    try {
      const [{ default: jsPDF }, autoTableMod] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable: any = (autoTableMod as any).default || (autoTableMod as any);
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

      doc.setFontSize(14);
      doc.text(`Audit Log Report  (${range.from || "—"} → ${range.to || "—"})`, 40, 36);
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()}  ·  Total: ${filtered.length}`, 40, 52);

      // For PDF readability, drop user-agent column (long) — keep IP
      const head = [HEADERS.slice(0, 9)];
      const body = rowsToData(filtered, categoryLabels).map((r) => r.slice(0, 9));

      autoTable(doc, {
        head, body,
        startY: 64,
        styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 90 }, 1: { cellWidth: 80 }, 2: { cellWidth: 55 },
          3: { cellWidth: 60 }, 4: { cellWidth: 80 }, 5: { cellWidth: 180 },
          6: { cellWidth: 70 }, 7: { cellWidth: 80 }, 8: { cellWidth: 75 },
        },
      });

      doc.save(`audit_log_${stamp}.pdf`);
      toast.success(`تم تصدير ${filtered.length} عملية إلى PDF`);
      await logAdminAction({
        action: "export_audit_log",
        category: "team_management",
        description: `تصدير سجل العمليات (PDF) - ${filtered.length} سجل`,
        metadata: { format: "pdf", from: range.from, to: range.to, count: filtered.length },
      });
      setOpen(false);
    } catch (e: any) {
      toast.error(`فشل التصدير: ${e?.message || e}`);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 h-9">
          <Download className="h-3.5 w-3.5" /> تصدير
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5" /> نطاق التاريخ
        </DropdownMenuLabel>
        <div className="px-2 pb-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">من</Label>
              <Input
                type="date" className="h-8 text-xs"
                value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-[10px]">إلى</Label>
              <Input
                type="date" className="h-8 text-xs"
                value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              { lbl: "اليوم", days: 0 },
              { lbl: "7 أيام", days: 7 },
              { lbl: "30 يوم", days: 30 },
              { lbl: "90 يوم", days: 90 },
            ].map((p) => (
              <button
                key={p.lbl}
                onClick={() => setRange({
                  from: new Date(Date.now() - p.days * 86400000).toISOString().slice(0, 10),
                  to: today,
                })}
                className="text-[10px] px-2 py-0.5 rounded-full border bg-muted/30 hover:bg-muted"
              >
                {p.lbl}
              </button>
            ))}
            <button
              onClick={() => setRange({ from: "", to: "" })}
              className="text-[10px] px-2 py-0.5 rounded-full border bg-muted/30 hover:bg-muted"
            >
              الكل
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            ضمن النطاق: <span className="font-bold text-foreground">{filtered.length}</span> سجل
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportCSV} className="gap-2">
          <FileSpreadsheet className="h-4 w-4 text-success" />
          <div>
            <p className="text-xs font-bold">تصدير CSV</p>
            <p className="text-[10px] text-muted-foreground">متوافق مع Excel (UTF-8)</p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPDF} className="gap-2">
          <FileText className="h-4 w-4 text-destructive" />
          <div>
            <p className="text-xs font-bold">تصدير PDF</p>
            <p className="text-[10px] text-muted-foreground">تقرير مدقق جاهز للطباعة</p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
