import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportExcel, exportPDF, type Col } from "@/lib/financialExports";

interface Props {
  title: string;
  filename: string;
  headers: Col[];
  rows: any[];
  disabled?: boolean;
}

export default function FinancialExportButton({ title, filename, headers, rows, disabled }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled || rows.length === 0} className="gap-1">
          <Download className="h-4 w-4" /> تصدير
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportExcel(filename, headers, rows)} className="gap-2">
          <FileSpreadsheet className="h-4 w-4 text-success" />
          <span>Excel (.xlsx)</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportPDF(title, filename, headers, rows)} className="gap-2">
          <FileText className="h-4 w-4 text-destructive" />
          <span>PDF</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
