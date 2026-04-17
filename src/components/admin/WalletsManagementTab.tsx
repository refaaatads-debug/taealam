import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Wallet, Phone, Plus, Minus, Search, Loader2, RefreshCw } from "lucide-react";

interface WalletRow {
  user_id: string;
  balance: number;
  updated_at: string;
  full_name?: string;
  phone?: string;
}

interface CallLog {
  id: string;
  teacher_id: string;
  student_phone: string | null;
  duration_minutes: number | null;
  estimated_minutes: number | null;
  cost: number | null;
  status: string;
  created_at: string;
  ended_at: string | null;
  error_message: string | null;
  twilio_call_sid: string | null;
  teacher_name?: string;
}

export default function WalletsManagementTab() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [callSearch, setCallSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletRow | null>(null);
  const [action, setAction] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [callPrice, setCallPrice] = useState<string>("0.30");
  const [savingPrice, setSavingPrice] = useState(false);

  useEffect(() => {
    supabase.from("site_settings").select("value").eq("key", "call_price_per_minute").maybeSingle()
      .then(({ data }) => {
        if (data?.value) setCallPrice(String(data.value));
      });
  }, []);

  const saveCallPrice = async () => {
    const v = parseFloat(callPrice);
    if (isNaN(v) || v < 0) {
      toast.error("أدخل سعراً صحيحاً");
      return;
    }
    setSavingPrice(true);
    const { error } = await supabase.from("site_settings").upsert({
      key: "call_price_per_minute",
      value: String(v),
      label_ar: "سعر الدقيقة للمكالمة الهاتفية (ر.س)",
      category: "pricing",
      type: "number",
    }, { onConflict: "key" });
    setSavingPrice(false);
    if (error) toast.error("تعذر الحفظ: " + error.message);
    else toast.success(`تم تحديث سعر الدقيقة إلى ${v} ر.س`);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [{ data: walletsRaw }, { data: callsRaw }] = await Promise.all([
        supabase.from("wallets").select("user_id, balance, updated_at").order("balance", { ascending: false }),
        supabase.from("call_logs").select("*").order("created_at", { ascending: false }).limit(200),
      ]);

      const userIds = [
        ...new Set([
          ...(walletsRaw ?? []).map((w) => w.user_id),
          ...(callsRaw ?? []).map((c) => c.teacher_id),
        ]),
      ];

      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name, phone").in("user_id", userIds)
        : { data: [] };

      const nameMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

      setWallets(
        (walletsRaw ?? []).map((w) => ({
          ...w,
          balance: Number(w.balance),
          full_name: nameMap.get(w.user_id)?.full_name,
          phone: nameMap.get(w.user_id)?.phone,
        }))
      );
      setCalls(
        (callsRaw ?? []).map((c: CallLog) => ({
          ...c,
          teacher_name: nameMap.get(c.teacher_id)?.full_name,
        }))
      );
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openAction = (w: WalletRow, act: "credit" | "debit") => {
    setSelectedWallet(w);
    setAction(act);
    setAmount("");
    setNote("");
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedWallet) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("أدخل مبلغًا صحيحًا");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-wallet-action", {
        body: { action, userId: selectedWallet.user_id, amount: amt, note },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "فشل");
      toast.success(action === "credit" ? "تم الشحن بنجاح" : "تم الخصم بنجاح", {
        description: `الرصيد الجديد: ${Number(data.newBalance).toFixed(2)} ريال`,
      });
      setDialogOpen(false);
      fetchAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطأ";
      toast.error("فشلت العملية", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredWallets = wallets.filter(
    (w) =>
      !search ||
      w.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      w.phone?.includes(search)
  );

  const filteredCalls = calls
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter(
      (c) =>
        !callSearch ||
        c.teacher_name?.toLowerCase().includes(callSearch.toLowerCase()) ||
        c.student_phone?.includes(callSearch)
    );

  const totals = {
    walletCount: wallets.length,
    totalBalance: wallets.reduce((s, w) => s + w.balance, 0),
    totalCalls: calls.length,
    totalCost: calls.reduce((s, c) => s + Number(c.cost || 0), 0),
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      completed: { variant: "default", label: "مكتملة" },
      initiated: { variant: "secondary", label: "بدأت" },
      ringing: { variant: "secondary", label: "ترن" },
      in_progress: { variant: "secondary", label: "جارية" },
      failed: { variant: "destructive", label: "فشلت" },
      canceled: { variant: "outline", label: "ملغاة" },
    };
    const cfg = map[status] || { variant: "outline" as const, label: status };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Call price control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-primary" /> سعر الدقيقة للمكالمات الهاتفية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="call-price" className="text-xs text-muted-foreground">السعر الحالي (ر.س / دقيقة)</Label>
              <Input
                id="call-price"
                type="number"
                step="0.01"
                min="0"
                value={callPrice}
                onChange={(e) => setCallPrice(e.target.value)}
                className="w-40 rounded-xl"
              />
            </div>
            <Button onClick={saveCallPrice} disabled={savingPrice} className="rounded-xl">
              {savingPrice ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : null}
              حفظ السعر
            </Button>
            <p className="text-xs text-muted-foreground">يُطبَّق تلقائياً على جميع المكالمات الجديدة.</p>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-8 w-8 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">عدد المحافظ</p>
              <p className="text-xl font-bold">{totals.walletCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-8 w-8 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الأرصدة</p>
              <p className="text-xl font-bold">{totals.totalBalance.toFixed(2)} ر.س</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Phone className="h-8 w-8 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المكالمات</p>
              <p className="text-xl font-bold">{totals.totalCalls}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Phone className="h-8 w-8 text-accent-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">تكلفة المكالمات</p>
              <p className="text-xl font-bold">{totals.totalCost.toFixed(2)} ر.س</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4 ml-2" /> تحديث
        </Button>
      </div>

      <Tabs defaultValue="wallets">
        <TabsList>
          <TabsTrigger value="wallets">
            <Wallet className="h-4 w-4 ml-2" /> المحافظ
          </TabsTrigger>
          <TabsTrigger value="calls">
            <Phone className="h-4 w-4 ml-2" /> سجل المكالمات
          </TabsTrigger>
        </TabsList>

        {/* Wallets */}
        <TabsContent value="wallets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" /> بحث
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="بحث بالاسم أو الجوال..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">المستخدم</TableHead>
                    <TableHead className="text-right">الجوال</TableHead>
                    <TableHead className="text-right">الرصيد</TableHead>
                    <TableHead className="text-right">آخر تحديث</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWallets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        لا توجد محافظ
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredWallets.map((w) => (
                      <TableRow key={w.user_id}>
                        <TableCell className="font-medium">{w.full_name || "—"}</TableCell>
                        <TableCell dir="ltr" className="text-right">{w.phone || "—"}</TableCell>
                        <TableCell>
                          <strong className={w.balance > 0 ? "text-primary" : "text-muted-foreground"}>
                            {w.balance.toFixed(2)} ر.س
                          </strong>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(w.updated_at).toLocaleDateString("ar-SA")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => openAction(w, "credit")}>
                              <Plus className="h-3 w-3 ml-1" /> شحن
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAction(w, "debit")}
                              disabled={w.balance <= 0}
                            >
                              <Minus className="h-3 w-3 ml-1" /> خصم
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Calls */}
        <TabsContent value="calls" className="space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-col md:flex-row gap-3">
              <Input
                placeholder="بحث بالمعلم أو الرقم..."
                value={callSearch}
                onChange={(e) => setCallSearch(e.target.value)}
              />
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">كل الحالات</option>
                <option value="completed">مكتملة</option>
                <option value="failed">فشلت</option>
                <option value="canceled">ملغاة</option>
                <option value="initiated">بدأت</option>
                <option value="in_progress">جارية</option>
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">المعلم</TableHead>
                    <TableHead className="text-right">رقم الطالب</TableHead>
                    <TableHead className="text-right">المدة المقدّرة</TableHead>
                    <TableHead className="text-right">المدة الفعلية</TableHead>
                    <TableHead className="text-right">التكلفة</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCalls.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        لا توجد مكالمات
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCalls.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.teacher_name || "—"}</TableCell>
                        <TableCell dir="ltr" className="text-right text-xs">
                          {c.student_phone || "—"}
                        </TableCell>
                        <TableCell>{c.estimated_minutes ?? 0} د</TableCell>
                        <TableCell>
                          {c.duration_minutes ? `${Number(c.duration_minutes).toFixed(2)} د` : "—"}
                        </TableCell>
                        <TableCell>
                          <strong>{Number(c.cost || 0).toFixed(2)} ر.س</strong>
                        </TableCell>
                        <TableCell>{statusBadge(c.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(c.created_at).toLocaleString("ar-SA")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {action === "credit" ? "شحن رصيد يدوي" : "خصم / استرداد رصيد"}
            </DialogTitle>
            <DialogDescription>
              {selectedWallet?.full_name} — الرصيد الحالي:{" "}
              <strong>{selectedWallet?.balance.toFixed(2)} ر.س</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>المبلغ (ر.س)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>ملاحظة (اختياري)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="سبب العملية..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              تأكيد {action === "credit" ? "الشحن" : "الخصم"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
