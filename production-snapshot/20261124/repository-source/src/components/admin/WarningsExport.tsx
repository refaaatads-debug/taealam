import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, Calendar } from "lucide-react";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/auditLog";

export type WarningExportRow = {
  id: string;
  user_name?: string;
  user_role?: string;
  warning_type: string;
  warning_count: number;
  is_banned: boolean;
  banned_until: string | null;
  description: string | null;
  created_at: string;
};

interface Props {
  rows: WarningExportRow[];
  typeLabels: Record<string, string>;
}

const HEADERS = [
  "التاريخ", "المستخدم", "الدور", "نوع التحذير", "العداد",
  "محظور", "نهاية الحظر", "الوصف",
];

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" }) : "—";

function escapeCSV(v: any) {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  return /["\n,]/.test(s) ? `"${s}"` : s;
}

function inRange(iso: string, from: string, to: string) {
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 86400000 - 1) return false;
  return true;
}

function rowsToData(rows: WarningExportRow[], typeLabels: Record<string, string>) {
  return rows.map((r) => [
    fmt(r.created_at),
    r.user_name || "—",
    r.user_role === "teacher" ? "معلم" : "طالب",
    typeLabels[r.warning_type] || r.warning_type,
    `${r.warning_count}/3`,
    r.is_banned ? "نعم" : "لا",
    fmt(r.banned_until),
    r.description || "",
  ]);
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function WarningsExport({ rows, typeLabels }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [open, setOpen] = useState(false);

  const filtered = rows.filter((r) => inRange(r.created_at, from, to));
  const stamp = `${from || "all"}_${to || "all"}`;

  const exportCSV = async () => {
    if (filtered.length === 0) { toast.error("لا توجد تحذيرات في النطاق المحدد"); return; }
    const lines = [
      HEADERS.join(","),
      ...rowsToData(filtered, typeLabels).map((row) => row.map(escapeCSV).join(",")),
    ];
    downloadBlob("\uFEFF" + lines.join("\n"), `user_warnings_${stamp}.csv`, "text/csv;charset=utf-8");
    toast.success(`تم تصدير ${filtered.length} تحذير`);
    await logAdminAction({
      action: "export_warnings", category: "violations",
      description: `تصدير سجل التحذيرات (CSV) - ${filtered.length} سجل`,
      metadata: { format: "csv", from, to, count: filtered.length },
    });
    setOpen(false);
  };

  const exportPDF = async () => {
    if (filtered.length === 0) { toast.error("لا توجد تحذيرات في النطاق المحدد"); return; }
    try {
      const [{ default: jsPDF }, autoTableMod] = await Promise.all([
        import("jspdf"), import("jspdf-autotable"),
      ]);
      const autoTable: any = (autoTableMod as any).default || (autoTableMod as any);
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text(`User Warnings Report  (${from || "—"} → ${to || "—"})`, 40, 36);
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()} · Total: ${filtered.length}`, 40, 52);

      autoTable(doc, {
        head: [HEADERS],
        body: rowsToData(filtered, typeLabels),
        startY: 64,
        styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [185, 28, 28], textColor: 255 },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        columnStyles: {
          0: { cellWidth: 90 }, 1: { cellWidth: 90 }, 2: { cellWidth: 50 },
          3: { cellWidth: 100 }, 4: { cellWidth: 50 }, 5: { cellWidth: 50 },
          6: { cellWidth: 90 }, 7: { cellWidth: 240 },
        },
      });
      doc.save(`user_warnings_${stamp}.pdf`);
      toast.success(`تم تصدير ${filtered.length} تحذير`);
      await logAdminAction({
        action: "export_warnings", category: "violations",
        description: `تصدير سجل التحذيرات (PDF) - ${filtered.length} سجل`,
        metadata: { format: "pdf", from, to, count: filtered.length },
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
              <Input type="date" className="h-8 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-[10px]">إلى</Label>
              <Input type="date" className="h-8 text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
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
                onClick={() => {
                  setFrom(new Date(Date.now() - p.days * 86400000).toISOString().slice(0, 10));
                  setTo(today);
                }}
                className="text-[10px] px-2 py-0.5 rounded-full border bg-muted/30 hover:bg-muted"
              >
                {p.lbl}
              </button>
            ))}
            <button
              onClick={() => { setFrom(""); setTo(""); }}
              className="text-[10px] px-2 py-0.5 rounded-full border bg-muted/30 hover:bg-muted"
            >الكل</button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            ضمن النطاق: <span className="font-bold text-foreground">{filtered.length}</span> تحذير
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
            <p className="text-[10px] text-muted-foreground">تقرير جاهز للطباعة</p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
