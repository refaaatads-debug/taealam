import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

interface ExportCSVButtonProps {
  data: Record<string, any>[];
  headers: { key: string; label: string }[];
  filename: string;
}

export default function ExportCSVButton({ data, headers, filename }: ExportCSVButtonProps) {
  const exportCSV = () => {
    if (data.length === 0) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }

    const BOM = "\uFEFF";
    const headerRow = headers.map(h => h.label).join(",");
    const rows = data.map(item =>
      headers.map(h => {
        let val = item[h.key] ?? "";
        if (typeof val === "string") val = `"${val.replace(/"/g, '""')}"`;
        return val;
      }).join(",")
    );

    const csv = BOM + headerRow + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`تم تصدير ${data.length} سجل`);
  };

  return (
    <Button size="sm" variant="outline" className="rounded-lg gap-1.5 text-xs h-8" onClick={exportCSV}>
      <Download className="h-3.5 w-3.5" />
      تصدير CSV
    </Button>
  );
}
