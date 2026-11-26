import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileBarChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import FinancialExportButton from "./FinancialExportButton";
import type { Col } from "@/lib/financialExports";

type ReportKey = "payments" | "sessions" | "new_users" | "teacher_payments" | "withdrawals";

interface ReportDef {
  label: string;
  table: string;
  select: string;
  dateColumn: string;
  headers: Col[];
}

const REPORTS: Record<ReportKey, ReportDef> = {
  payments: {
    label: "المدفوعات (الإيرادات)", table: "payment_records", select: "created_at, amount, currency, status, payment_type, user_id", dateColumn: "created_at",
    headers: [{ key: "created_at", label: "التاريخ" }, { key: "amount", label: "المبلغ" }, { key: "currency", label: "العملة" }, { key: "status", label: "الحالة" }, { key: "payment_type", label: "النوع" }, { key: "user_id", label: "معرّف المستخدم" }],
  },
  sessions: {
    label: "الحصص والأرباح", table: "sessions", select: "created_at, duration_minutes, gross_amount, platform_fee, vat_amount, teacher_earning, net_amount", dateColumn: "created_at",
    headers: [{ key: "created_at", label: "التاريخ" }, { key: "duration_minutes", label: "المدة (دقيقة)" }, { key: "gross_amount", label: "الإجمالي" }, { key: "platform_fee", label: "عمولة المنصة" }, { key: "vat_amount", label: "الضريبة" }, { key: "teacher_earning", label: "ربح المعلم" }, { key: "net_amount", label: "الصافي" }],
  },
  new_users: {
    label: "المستخدمون الجدد", table: "profiles", select: "created_at, full_name, phone", dateColumn: "created_at",
    headers: [{ key: "created_at", label: "تاريخ التسجيل" }, { key: "full_name", label: "الاسم" }, { key: "phone", label: "الهاتف" }],
  },
  teacher_payments: {
    label: "مدفوعات المعلمين", table: "teacher_payments", select: "created_at, amount, payment_method, notes, teacher_id", dateColumn: "created_at",
    headers: [{ key: "created_at", label: "التاريخ" }, { key: "amount", label: "المبلغ" }, { key: "payment_method", label: "طريقة الدفع" }, { key: "notes", label: "ملاحظات" }, { key: "teacher_id", label: "معرّف المعلم" }],
  },
  withdrawals: {
    label: "طلبات السحب", table: "withdrawal_requests", select: "created_at, amount, vat_amount, net_amount, status, paid_at, teacher_id", dateColumn: "created_at",
    headers: [{ key: "created_at", label: "التاريخ" }, { key: "amount", label: "المبلغ" }, { key: "vat_amount", label: "الضريبة" }, { key: "net_amount", label: "الصافي" }, { key: "status", label: "الحالة" }, { key: "paid_at", label: "تاريخ الدفع" }, { key: "teacher_id", label: "معرّف المعلم" }],
  },
};

const MAX_ROWS = 20000;

const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

export default function ReportsCenterTab() {
  const [key, setKey] = useState<ReportKey>("payments");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState<ReportKey | null>(null);
  const [loading, setLoading] = useState(false);
  const def = REPORTS[key];

  const generate = async () => {
    if (from > to) return toast.error("تاريخ البداية بعد تاريخ النهاية");
    setLoading(true);
    const startIso = new Date(`${from}T00:00:00`).toISOString();
    const endIso = new Date(`${to}T23:59:59.999`).toISOString();
    const out: any[] = [];
    for (let p = 0; p < MAX_ROWS / 1000; p++) {
      const { data, error } = await (supabase as any).from(def.table).select(def.select)
        .gte(def.dateColumn, startIso).lte(def.dateColumn, endIso)
        .order(def.dateColumn, { ascending: true }).range(p * 1000, p * 1000 + 999);
      if (error) { toast.error("تعذر تحميل التقرير"); setLoading(false); return; }
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    setRows(out.map((r) => ({
      ...r,
      created_at: r.created_at ? new Date(r.created_at).toLocaleString("ar-SA") : "",
      paid_at: r.paid_at ? new Date(r.paid_at).toLocaleString("ar-SA") : r.paid_at,
    })));
    setLoaded(key);
    setLoading(false);
    if (out.length >= MAX_ROWS) toast.message(`تم عرض أول ${MAX_ROWS} سجل فقط، قلّل الفترة`);
  };

  const total = loaded === "payments" || loaded === "teacher_payments" || loaded === "withdrawals"
    ? rows.reduce((s, r) => s + Number(r.amount || 0), 0) : null;

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileBarChart className="h-5 w-5 text-primary" />مركز التقارير</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">التقرير
              <select className="mt-1 block h-10 rounded-md border bg-background px-3" value={key} onChange={(e) => { setKey(e.target.value as ReportKey); setRows([]); setLoaded(null); }}>
                {(Object.keys(REPORTS) as ReportKey[]).map((k) => <option key={k} value={k}>{REPORTS[k].label}</option>)}
              </select>
            </label>
            <label className="text-sm">من<Input type="date" className="mt-1 w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="text-sm">إلى<Input type="date" className="mt-1 w-40" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <Button onClick={generate} disabled={loading}>{loading ? "جارٍ التحميل..." : "إنشاء التقرير"}</Button>
            {loaded === key && (
              <FinancialExportButton title={def.label} filename={`report_${key}_${from}_${to}`} headers={def.headers} rows={rows} />
            )}
          </div>
          {loaded === key && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {rows.length} سجل{total !== null ? ` · المجموع ${total.toLocaleString("ar-SA")}` : ""}
              </p>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50"><tr>{def.headers.map((h) => <th key={h.key} className="p-2 text-right font-bold">{h.label}</th>)}</tr></thead>
                  <tbody>
                    {rows.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-t">{def.headers.map((h) => <td key={h.key} className="p-2">{String(r[h.key] ?? "")}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 20 && <p className="text-xs text-muted-foreground">المعاينة أول 20 سجلاً. الملف المصدَّر يحوي كل السجلات.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
