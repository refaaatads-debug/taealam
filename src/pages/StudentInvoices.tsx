import { useEffect, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Download, QrCode, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";

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
  const [studentName, setStudentName] = useState<string>("");
  const [studentEmail, setStudentEmail] = useState<string>("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const pdfTemplateRef = useRef<HTMLDivElement>(null);
  const [pdfData, setPdfData] = useState<Invoice | null>(null);
  const [pdfQrDataUrl, setPdfQrDataUrl] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: inv }, { data: prof }] = await Promise.all([
        (supabase as any)
          .from("invoices")
          .select("*")
          .eq("student_id", user.id)
          .order("issued_at", { ascending: false }),
        supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
      ]);
      setInvoices((inv as Invoice[]) || []);
      setStudentName((prof as any)?.full_name || "طالب");
      setStudentEmail(user.email || "");
      setLoading(false);
    })();
  }, [user?.id]);

  const downloadPdf = async (inv: Invoice) => {
    try {
      setDownloadingId(inv.id);
      const qrPayload = inv.qr_code || inv.invoice_number;
      const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 320, margin: 1 });
      setPdfQrDataUrl(qrDataUrl);
      setPdfData(inv);
      // Wait for template render
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 60));
      const node = pdfTemplateRef.current;
      if (!node) throw new Error("template missing");
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      pdf.addImage(imgData, "PNG", (pageW - w) / 2, 20, w, h);
      pdf.save(`${inv.invoice_number}.pdf`);
      toast.success("تم تحميل الفاتورة");
    } catch (e: any) {
      toast.error("فشل توليد PDF: " + (e?.message || "حدث خطأ"));
    } finally {
      setDownloadingId(null);
      setPdfData(null);
      setPdfQrDataUrl("");
    }
  };

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
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadPdf(inv)}
                      disabled={downloadingId === inv.id}
                    >
                      {downloadingId === inv.id ? (
                        <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 ml-2" />
                      )}
                      تحميل PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSelected(inv)}>
                      <QrCode className="h-4 w-4 ml-2" />
                      عرض
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

              <Button
                className="w-full"
                onClick={() => downloadPdf(selected)}
                disabled={downloadingId === selected.id}
              >
                {downloadingId === selected.id ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 ml-2" />
                )}
                تحميل PDF
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden PDF template (rendered off-screen for html2canvas) */}
      <div
        style={{
          position: "fixed",
          top: "-10000px",
          left: "-10000px",
          width: "794px",
          background: "#ffffff",
        }}
      >
        {pdfData && (
          <div
            ref={pdfTemplateRef}
            dir="rtl"
            style={{
              width: "794px",
              padding: "48px 56px",
              fontFamily: "Cairo, system-ui, -apple-system, sans-serif",
              color: "#0f172a",
              background: "#ffffff",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #0f3460", paddingBottom: "16px", marginBottom: "24px" }}>
              <div>
                <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f3460" }}>تعلم المستقبل</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Future Learn — منصة تعليمية</div>
              </div>
              <div style={{ textAlign: "left" as const }}>
                <div style={{ fontSize: "20px", fontWeight: 700 }}>فاتورة ضريبية</div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Tax Invoice</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px", fontSize: "13px" }}>
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px" }}>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px" }}>بيانات الطالب</div>
                <div style={{ fontWeight: 700 }}>{studentName}</div>
                {studentEmail && <div style={{ fontSize: "12px", color: "#475569" }}>{studentEmail}</div>}
              </div>
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px" }}>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px" }}>تفاصيل الفاتورة</div>
                <div><span style={{ color: "#64748b" }}>رقم الفاتورة: </span><span style={{ fontWeight: 700, fontFamily: "monospace" }}>{pdfData.invoice_number}</span></div>
                <div><span style={{ color: "#64748b" }}>التاريخ: </span>{new Date(pdfData.issued_at).toLocaleString("ar-SA")}</div>
                <div><span style={{ color: "#64748b" }}>الحالة: </span>
                  {pdfData.zatca_status === "cleared" ? "موثقة" : pdfData.zatca_status === "failed" ? "فشل التوثيق" : "قيد التوثيق"}
                </div>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#0f3460", color: "#ffffff" }}>
                  <th style={{ padding: "10px", textAlign: "right" as const }}>الوصف</th>
                  <th style={{ padding: "10px", textAlign: "center" as const }}>الكمية</th>
                  <th style={{ padding: "10px", textAlign: "left" as const }}>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "10px" }}>باقة ساعات تعليمية</td>
                  <td style={{ padding: "10px", textAlign: "center" as const }}>{Number(pdfData.hours_purchased).toFixed(1)} ساعة</td>
                  <td style={{ padding: "10px", textAlign: "left" as const }}>{Number(pdfData.net_amount).toFixed(2)} {pdfData.currency}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "24px" }}>
              <div style={{ textAlign: "center" as const }}>
                {pdfQrDataUrl && (
                  <>
                    <img src={pdfQrDataUrl} style={{ width: "140px", height: "140px", border: "1px solid #e2e8f0", padding: "4px", background: "#fff" }} />
                    <div style={{ fontSize: "10px", color: "#64748b", marginTop: "6px" }}>رمز ZATCA</div>
                  </>
                )}
              </div>
              <div style={{ minWidth: "260px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <span style={{ color: "#64748b" }}>الصافي قبل الضريبة</span>
                  <span>{Number(pdfData.net_amount).toFixed(2)} {pdfData.currency}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <span style={{ color: "#64748b" }}>ضريبة القيمة المضافة ({Math.round(Number(pdfData.vat_rate || 0.15) * 100)}%)</span>
                  <span style={{ color: "#b45309" }}>{Number(pdfData.vat_amount).toFixed(2)} {pdfData.currency}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #0f3460", marginTop: "4px", fontSize: "15px", fontWeight: 800 }}>
                  <span>الإجمالي المدفوع</span>
                  <span style={{ color: "#0f3460" }}>{Number(pdfData.total_amount).toFixed(2)} {pdfData.currency}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "32px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", fontSize: "10px", color: "#94a3b8", textAlign: "center" as const }}>
              هذه فاتورة ضريبية صادرة إلكترونياً. تُحصّل ضريبة القيمة المضافة مرة واحدة عند شراء الباقة. الجلسات تُخصم من رصيد الساعات بدون فواتير إضافية.
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
