import * as XLSX from "xlsx";
import { toast } from "sonner";

export type Col = { key: string; label: string };

export function exportExcel(filename: string, headers: Col[], rows: any[]) {
  if (!rows.length) { toast.info("لا توجد بيانات للتصدير"); return; }
  const data = rows.map(r => Object.fromEntries(headers.map(h => [h.label, r[h.key] ?? ""])));
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = headers.map(h => ({ wch: Math.max(h.label.length * 2, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast.success(`تم تصدير ${rows.length} سجل (Excel)`);
}

export async function exportPDF(title: string, filename: string, headers: Col[], rows: any[]) {
  if (!rows.length) { toast.info("لا توجد بيانات للتصدير"); return; }
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"), import("jspdf-autotable"),
  ]);
  const autoTable: any = (autoTableMod as any).default || (autoTableMod as any);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(title, 40, 36);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}  ·  Total: ${rows.length}`, 40, 52);
  autoTable(doc, {
    head: [headers.map(h => h.label)],
    body: rows.map(r => headers.map(h => {
      const v = r[h.key];
      return v == null ? "" : String(v);
    })),
    startY: 64,
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  doc.save(`${filename}_${new Date().toISOString().slice(0,10)}.pdf`);
  toast.success(`تم تصدير ${rows.length} سجل (PDF)`);
}

export function inDateRange(iso: string, from: string, to: string) {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 86400000 - 1) return false;
  return true;
}
