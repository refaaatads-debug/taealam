import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Download, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Invoice {
  id: string;
  invoice_number: string;
  hours_purchased: number;
  total_amount: number;
  vat_amount: number;
  net_amount: number;
  vat_rate: number;
  currency: string;
  zatca_status: string;
  qr_code: string | null;
  issued_at: string;
}

export default function StudentInvoices() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("invoices")
        .select("*")
        .eq("student_id", user.id)
        .order("issued_at", { ascending: false });
      setInvoices((data as Invoice[]) || []);
      setLoading(false);
    })();
  }, [user?.id]);

  const qrUrl = (payload: string) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(payload)}`;

  return (
    <div className="min-h-screen bg-background pb-20" dir="rtl">
      <Navbar />
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">فواتيري</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          تُصدر فاتورة واحدة فقط عند شراء كل باقة (متوافقة مع ZATCA). الجلسات لا تُصدر لها فواتير منفصلة — تُخصم من رصيد ساعاتك مباشرة.
        </p>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : invoices.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              لا توجد فواتير بعد. عند شراء أي باقة سيتم إصدار فاتورة ضريبية رسمية.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {invoices.map((inv) => (
              <Card key={inv.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
                  <div>
                    <CardTitle className="text-base font-mono">{inv.invoice_number}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {new Date(inv.issued_at).toLocaleString("ar-SA")}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      inv.zatca_status === "cleared"
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                        : inv.zatca_status === "failed"
                        ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                        : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                    }
                  >
                    {inv.zatca_status === "cleared"
                      ? "موثقة بهيئة الزكاة"
                      : inv.zatca_status === "failed"
                      ? "فشل التوثيق"
                      : "قيد التوثيق"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">الساعات</p>
                      <p className="font-bold">{Number(inv.hours_purchased).toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">الصافي</p>
                      <p className="font-bold">{Number(inv.net_amount).toFixed(2)} {inv.currency}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">الضريبة (15%)</p>
                      <p className="font-bold text-amber-600">{Number(inv.vat_amount).toFixed(2)} {inv.currency}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">الإجمالي</p>
                      <p className="font-bold text-primary">{Number(inv.total_amount).toFixed(2)} {inv.currency}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => setSelected(inv)}>
                      <QrCode className="h-4 w-4 ml-2" />
                      عرض الفاتورة
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>فاتورة ضريبية</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">رقم الفاتورة</p>
                <p className="font-mono font-bold">{selected.invoice_number}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(selected.issued_at).toLocaleString("ar-SA")}
                </p>
              </div>

              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">عدد الساعات</span>
                  <span className="font-bold">{Number(selected.hours_purchased).toFixed(1)} ساعة</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الصافي قبل الضريبة</span>
                  <span>{Number(selected.net_amount).toFixed(2)} {selected.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ضريبة القيمة المضافة (15%)</span>
                  <span className="text-amber-600">{Number(selected.vat_amount).toFixed(2)} {selected.currency}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-bold">الإجمالي المدفوع</span>
                  <span className="font-bold text-primary text-lg">
                    {Number(selected.total_amount).toFixed(2)} {selected.currency}
                  </span>
                </div>
              </div>

              {selected.qr_code && (
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={qrUrl(selected.qr_code)}
                    alt="ZATCA QR"
                    className="rounded-md border bg-white p-2"
                  />
                  <p className="text-xs text-muted-foreground">رمز التحقق ZATCA</p>
                </div>
              )}

              <Button className="w-full" variant="outline" onClick={() => window.print()}>
                <Download className="h-4 w-4 ml-2" />
                طباعة / حفظ PDF
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
