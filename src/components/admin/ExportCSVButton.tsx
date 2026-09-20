import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import writeExcelFile from "write-excel-file/browser";

interface ExportCSVButtonProps {
  data: Record<string, any>[];
  headers: { key: string; label: string }[];
  filename: string;
}

export default function ExportCSVButton({ data, headers, filename }: ExportCSVButtonProps) {
  const exportExcel = async () => {
    if (data.length === 0) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }

    try {
      const normalizeValue = (value: unknown) => (
        value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date
          ? value ?? ""
          : String(value)
      );
      const sheetData = [
        headers.map((header) => ({
          value: header.label,
          fontWeight: "bold" as const,
          textColor: "#FFFFFF",
          backgroundColor: "#4F46E5",
          align: "center" as const,
        })),
        ...data.map((item) => headers.map((header) => normalizeValue(item[header.key]))),
      ];

      await writeExcelFile(sheetData, {
        columns: headers.map((header) => ({ width: Math.max(header.label.length * 2, 15) })),
      }).toFile(`${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`تم تصدير ${data.length} سجل`);
    } catch {
      toast.error("تعذر تصدير ملف Excel");
    }
  };

  return (
    <Button size="sm" variant="outline" className="rounded-lg gap-1.5 text-xs h-8" onClick={exportExcel}>
      <Download className="h-3.5 w-3.5" />
      تصدير Excel
    </Button>
  );
}
