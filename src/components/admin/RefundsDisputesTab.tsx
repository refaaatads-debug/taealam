import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { safeErrorMessage } from "@/lib/safeErrorMessage";

const STATUS: Record<string, string> = { open: "مفتوحة", in_review: "قيد المراجعة", approved: "مقبولة", rejected: "مرفوضة", closed: "مغلقة" };
const TYPE: Record<string, string> = { refund: "استرداد", dispute: "نزاع" };

interface CaseRow {
  id: string; case_type: string; status: string; user_id: string | null; amount: number | null;
  currency: string; reason: string | null; admin_notes: string | null; created_at: string;
}

interface UserOpt { user_id: string; full_name: string | null; phone: string | null }

export default function RefundsDisputesTab() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [missing, setMissing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [caseType, setCaseType] = useState("refund");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<UserOpt | null>(null);
  const [options, setOptions] = useState<UserOpt[]>([]);
  const [names, setNames] = useState<Record<string, UserOpt>>({});
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any).from("refund_dispute_cases").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) { setMissing(true); return; }
    setMissing(false);
    setRows(data ?? []);
    const ids = Array.from(new Set((data ?? []).map((r: CaseRow) => r.user_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name, phone").in("user_id", ids);
      setNames(Object.fromEntries((profs ?? []).map((u: any) => [u.user_id, u])));
    }
  }, []);

  useEffect(() => {
    const q = query.replace(/[%,()*\\]/g, " ").trim();
    if (picked || q.length < 2) { setOptions([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, phone")
        .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8);
      setOptions((data ?? []) as UserOpt[]);
    }, 250);
    return () => clearTimeout(t);
  }, [query, picked]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const amt = amount ? Number(amount) : null;
    if (amt !== null && (!Number.isFinite(amt) || amt < 0)) return toast.error("المبلغ غير صحيح");
    const { error } = await (supabase as any).from("refund_dispute_cases").insert({
      case_type: caseType, user_id: picked?.user_id ?? null, amount: amt, reason: reason.trim() || null, created_by: user?.id ?? null,
    });
    if (error) return toast.error(safeErrorMessage(error));
    setPicked(null); setQuery(""); setAmount(""); setReason("");
    toast.success("تم تسجيل الحالة");
    load();
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).from("refund_dispute_cases").update({
      status, updated_at: new Date().toISOString(),
      resolved_at: ["approved", "rejected", "closed"].includes(status) ? new Date().toISOString() : null,
    }).eq("id", id);
    if (error) return toast.error(safeErrorMessage(error));
    load();
  };

  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const openCount = rows.filter((r) => r.status === "open" || r.status === "in_review").length;

  if (missing) return <Card><CardContent className="p-6 text-sm text-muted-foreground" dir="rtl">ميزة الاسترداد والنزاعات غير مفعّلة بعد.</CardContent></Card>;

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Undo2 className="h-5 w-5 text-primary" />الاسترداد والنزاعات ({openCount} مفتوحة)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">سجل متابعة فقط. لا يحرّك أي أموال، والاسترداد الفعلي يتم يدويًا.</p>
          <div className="flex flex-wrap items-end gap-2">
            <select className="h-10 rounded-md border bg-background px-3" value={caseType} onChange={(e) => setCaseType(e.target.value)}>
              <option value="refund">استرداد</option><option value="dispute">نزاع</option>
            </select>
            <div className="relative">
              {picked ? (
                <button type="button" className="flex h-10 w-72 items-center justify-between rounded-md border bg-background px-3 text-sm" onClick={() => { setPicked(null); setQuery(""); }}>
                  <span>{picked.full_name ?? "بدون اسم"} {picked.phone ? `· ${picked.phone}` : ""}</span><span className="text-muted-foreground">✕</span>
                </button>
              ) : (
                <Input className="w-72" placeholder="ابحث بالاسم أو رقم الهاتف (اختياري)" value={query} onChange={(e) => setQuery(e.target.value)} />
              )}
              {!picked && options.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-56 w-72 overflow-auto rounded-md border bg-background shadow-lg">
                  {options.map((o) => (
                    <li key={o.user_id}><button type="button" className="w-full p-2 text-right text-sm hover:bg-muted" onClick={() => { setPicked(o); setOptions([]); }}>
                      {o.full_name ?? "بدون اسم"} <span className="text-muted-foreground">{o.phone ? `· ${o.phone}` : ""}</span>
                    </button></li>
                  ))}
                </ul>
              )}
            </div>
            <Input className="w-28" type="number" min="0" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input className="w-64" placeholder="السبب" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button onClick={add}>تسجيل</Button>
          </div>
          <select className="h-10 rounded-md border bg-background px-3" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">كل الحالات</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>{["التاريخ", "النوع", "المستخدم", "المبلغ", "السبب", "الحالة"].map((h) => <th key={h} className="p-2 text-right font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">لا توجد حالات</td></tr>}
                {shown.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{new Date(r.created_at).toLocaleDateString("ar-SA")}</td>
                    <td className="p-2">{TYPE[r.case_type] ?? r.case_type}</td>
                    <td className="p-2">{r.user_id ? `${names[r.user_id]?.full_name ?? "-"}${names[r.user_id]?.phone ? ` · ${names[r.user_id].phone}` : ""}` : "-"}</td>
                    <td className="p-2">{r.amount != null ? `${r.amount} ${r.currency}` : "-"}</td>
                    <td className="p-2">{r.reason ?? "-"}</td>
                    <td className="p-2">
                      <select className="h-8 rounded-md border bg-background px-2" value={r.status} onChange={(e) => setStatus(r.id, e.target.value)}>
                        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
