import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ExportCSVButtonProps {
  data: Record<string, any>[];
  headers: { key: string; label: string }[];
  filename: string;
}

export default function ExportCSVButton({ data, headers, filename }: ExportCSVButtonProps) {
  const exportExcel = () => {
    if (data.length === 0) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }

    const rows = data.map(item =>
      Object.fromEntries(headers.map(h => [h.label, item[h.key] ?? ""]))
    );

    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws["!cols"] = headers.map(h => ({ wch: Math.max(h.label.length * 2, 15) }));

    // Style header row
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) {
        ws[addr].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "4F46E5" } },
          alignment: { horizontal: "center" },
        };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "البيانات");
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`تم تصدير ${data.length} سجل`);
  };

  return (
    <Button size="sm" variant="outline" className="rounded-lg gap-1.5 text-xs h-8" onClick={exportExcel}>
      <Download className="h-3.5 w-3.5" />
      تصدير Excel
    </Button>
  );
}
