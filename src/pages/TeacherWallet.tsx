import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Wallet, Plus, Phone, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface CallLog {
  id: string;
  student_phone: string | null;
  duration_minutes: number;
  estimated_minutes: number;
  cost: number;
  status: string;
  created_at: string;
}

export default function TeacherWallet() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [balance, setBalance] = useState(0);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupAmount, setTopupAmount] = useState("50");
  const [topingUp, setTopingUp] = useState(false);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: w }, { data: l }] = await Promise.all([
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("call_logs").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setBalance(Number(w?.balance || 0));
    setLogs((l as CallLog[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  // Verify topup on return from Stripe
  useEffect(() => {
    const sessionId = params.get("session_id");
    const status = params.get("topup");
    if (status === "success" && sessionId && user) {
      (async () => {
        toast.loading("جارٍ تأكيد الشحن...", { id: "verify-topup" });
        const { data, error } = await supabase.functions.invoke("wallet-topup-verify", {
          body: { sessionId },
        });
        if (error || !data?.success) {
          toast.error("تعذّر تأكيد الشحن", { id: "verify-topup" });
        } else {
          toast.success(data.alreadyCredited ? "تم الشحن مسبقاً" : `تم شحن ${data.credited} ريال ✅`, {
            id: "verify-topup",
          });
          await loadData();
        }
        setParams({}, { replace: true });
      })();
    } else if (status === "cancelled") {
      toast.info("تم إلغاء الشحن");
      setParams({}, { replace: true });
    }
  }, [params, user?.id]);

  const handleTopup = async () => {
    const amount = Number(topupAmount);
    if (!amount || amount < 10) {
      toast.error("الحد الأدنى للشحن 10 ريال");
      return;
    }
    setTopingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke("wallet-topup", {
        body: { amount },
      });
      if (error || !data?.url) throw new Error(data?.error || "فشل");
      window.location.href = data.url;
    } catch (err) {
      toast.error("تعذّر فتح الدفع", {
        description: err instanceof Error ? err.message : "حاول لاحقاً",
      });
      setTopingUp(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20" dir="rtl">
      <Navbar />
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate("/teacher")} className="mb-4">
          <ArrowLeft className="h-4 w-4 ml-1" /> العودة للوحة التحكم
        </Button>

        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                رصيد المحفظة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-primary">
                {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : `${balance.toFixed(2)} ريال`}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                سعر الدقيقة للمكالمات الهاتفية: <strong>0.30 ريال</strong>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                شحن الرصيد
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                {[20, 50, 100, 200].map((v) => (
                  <Button
                    key={v}
                    variant={topupAmount === String(v) ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTopupAmount(String(v))}
                  >
                    {v}
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                placeholder="المبلغ بالريال"
                min={10}
                max={5000}
              />
              <Button onClick={handleTopup} disabled={topingUp} className="w-full">
                {topingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : "شحن عبر Stripe"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              سجل المكالمات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            ) : logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد مكالمات بعد</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الرقم</TableHead>
                    <TableHead>المدة المقدّرة</TableHead>
                    <TableHead>التكلفة</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">
                        {new Date(log.created_at).toLocaleString("ar-SA")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.student_phone || "—"}</TableCell>
                      <TableCell>{log.estimated_minutes} د</TableCell>
                      <TableCell>{Number(log.cost).toFixed(2)} ريال</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.status === "completed" || log.status === "initiated"
                              ? "default"
                              : log.status === "failed"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {log.status === "initiated" ? "تم البدء" : log.status === "failed" ? "فشل" : log.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
