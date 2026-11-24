import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, Loader2, ShieldCheck, AlertTriangle, Clock } from "lucide-react";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface InvoiceLike {
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
  student_name?: string;
  student_email?: string;
}

interface ZatcaLogRow {
  id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  created_at: string;
  metadata: any;
}

interface Props {
  invoice: InvoiceLike | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const statusBadge = (s: string) => {
  if (s === "cleared") return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30" variant="outline">معتمدة</Badge>;
  if (s === "rejected" || s === "failed") return <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/30" variant="outline">مرفوضة</Badge>;
  return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30" variant="outline">قيد المعالجة</Badge>;
};

export default function InvoiceDetailDialog({ invoice, open, onOpenChange }: Props) {
  const [qrUrl, setQrUrl] = useState<string>("");
  const [zatcaLog, setZatcaLog] = useState<ZatcaLogRow[]>([]);
  const [downloading, setDownloading] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [pdfQr, setPdfQr] = useState<string>("");
  const [pdfReady, setPdfReady] = useState(false);

  useEffect(() => {
    if (!invoice || !open) return;
    (async () => {
      try {
        const payload = invoice.qr_code || invoice.invoice_number;
        const url = await QRCode.toDataURL(payload, { width: 240, margin: 1 });
        setQrUrl(url);
        const { data } = await supabase
          .from("invoice_zatca_log" as any)
          .select("id, from_status, to_status, reason, created_at, metadata")
          .eq("invoice_id", invoice.id)
          .order("created_at", { ascending: false });
        setZatcaLog((data as any[]) || []);
      } catch (e: any) {
        console.warn(e);
      }
    })();
  }, [invoice?.id, open]);

  const downloadPdf = async () => {
    if (!invoice) return;
    try {
      setDownloading(true);
      const url = await QRCode.toDataURL(invoice.qr_code || invoice.invoice_number, { width: 320, margin: 1 });
      setPdfQr(url);
      setPdfReady(true);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 80));
      const node = pdfRef.current;
      if (!node) throw new Error("template missing");
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pageW - w) / 2, 20, w, h);
      pdf.save(`${invoice.invoice_number}.pdf`);
      toast.success("تم تحميل الفاتورة");
    } catch (e: any) {
      toast.error("فشل توليد PDF: " + (e?.message || ""));
    } finally {
      setDownloading(false);
      setPdfReady(false);
      setPdfQr("");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              تفاصيل الفاتورة
            </DialogTitle>
          </DialogHeader>

          {invoice && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">رقم الفاتورة</div>
                  <div className="font-mono text-lg font-bold">{invoice.invoice_number}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(invoice.issued_at).toLocaleString("ar-SA")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(invoice.zatca_status)}
                  <Button size="sm" onClick={downloadPdf} disabled={downloading}>
                    {downloading ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Download className="h-4 w-4 ml-2" />}
                    تحميل PDF
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Student */}
              <div className="rounded-lg border p-3 bg-card">
                <div className="text-xs text-muted-foreground mb-1">بيانات الطالب</div>
                <div className="font-semibold">{invoice.student_name || "—"}</div>
                <div className="text-xs text-muted-foreground">{invoice.student_email || "—"}</div>
              </div>

              {/* Breakdown + QR */}
              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-2 rounded-lg border p-4 space-y-2 bg-card">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">عدد الساعات</span>
                    <span className="font-bold">{Number(invoice.hours_purchased).toFixed(1)} ساعة</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">الصافي قبل الضريبة</span>
                    <span>{Number(invoice.net_amount).toFixed(2)} {invoice.currency}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      ضريبة القيمة المضافة ({Math.round(Number(invoice.vat_rate || 0.15) * 100)}%)
                    </span>
                    <span className="text-amber-600 font-medium">
                      {Number(invoice.vat_amount).toFixed(2)} {invoice.currency}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-base font-bold pt-1">
                    <span>الإجمالي المدفوع</span>
                    <span className="text-primary">
                      {Number(invoice.total_amount).toFixed(2)} {invoice.currency}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border p-3 bg-card flex flex-col items-center justify-center">
                  {qrUrl ? (
                    <img src={qrUrl} alt="QR" className="w-36 h-36" />
                  ) : (
                    <div className="w-36 h-36 bg-muted animate-pulse rounded" />
                  )}
                  <div className="text-[10px] text-muted-foreground mt-2">رمز ZATCA</div>
                </div>
              </div>

              {/* ZATCA log */}
              <div className="rounded-lg border bg-card">
                <div className="px-3 py-2 border-b flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-primary" />
                  سجل تدقيق ZATCA
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {zatcaLog.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      لا توجد سجلات
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {zatcaLog.map((l) => (
                        <li key={l.id} className="p-3 text-sm flex items-start gap-3">
                          <div className="pt-1">
                            {l.to_status === "cleared" ? (
                              <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            ) : l.to_status === "rejected" || l.to_status === "failed" ? (
                              <AlertTriangle className="h-4 w-4 text-rose-600" />
                            ) : (
                              <Clock className="h-4 w-4 text-amber-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {l.from_status && (
                                <>
                                  <Badge variant="outline" className="text-xs">{l.from_status}</Badge>
                                  <span className="text-muted-foreground">→</span>
                                </>
                              )}
                              {statusBadge(l.to_status)}
                              <span className="text-xs text-muted-foreground">
                                {new Date(l.created_at).toLocaleString("ar-SA")}
                              </span>
                            </div>
                            {l.reason && (
                              <div className="text-xs text-muted-foreground mt-1">{l.reason}</div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden PDF template */}
      <div style={{ position: "fixed", top: "-10000px", left: "-10000px", width: "794px", background: "#ffffff" }}>
        {pdfReady && invoice && (
          <div
            ref={pdfRef}
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
                <div style={{ fontWeight: 700 }}>{invoice.student_name || "—"}</div>
                {invoice.student_email && <div style={{ fontSize: "12px", color: "#475569" }}>{invoice.student_email}</div>}
              </div>
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px" }}>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px" }}>تفاصيل الفاتورة</div>
                <div><span style={{ color: "#64748b" }}>رقم الفاتورة: </span><span style={{ fontWeight: 700, fontFamily: "monospace" }}>{invoice.invoice_number}</span></div>
                <div><span style={{ color: "#64748b" }}>التاريخ: </span>{new Date(invoice.issued_at).toLocaleString("ar-SA")}</div>
                <div><span style={{ color: "#64748b" }}>الحالة: </span>
                  {invoice.zatca_status === "cleared" ? "موثقة" : invoice.zatca_status === "rejected" || invoice.zatca_status === "failed" ? "فشل التوثيق" : "قيد التوثيق"}
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
                  <td style={{ padding: "10px", textAlign: "center" as const }}>{Number(invoice.hours_purchased).toFixed(1)} ساعة</td>
                  <td style={{ padding: "10px", textAlign: "left" as const }}>{Number(invoice.net_amount).toFixed(2)} {invoice.currency}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "24px" }}>
              <div style={{ textAlign: "center" as const }}>
                {pdfQr && (
                  <>
                    <img src={pdfQr} style={{ width: "140px", height: "140px", border: "1px solid #e2e8f0", padding: "4px", background: "#fff" }} />
                    <div style={{ fontSize: "10px", color: "#64748b", marginTop: "6px" }}>رمز ZATCA</div>
                  </>
                )}
              </div>
              <div style={{ minWidth: "260px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <span style={{ color: "#64748b" }}>الصافي قبل الضريبة</span>
                  <span>{Number(invoice.net_amount).toFixed(2)} {invoice.currency}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <span style={{ color: "#64748b" }}>ضريبة القيمة المضافة ({Math.round(Number(invoice.vat_rate || 0.15) * 100)}%)</span>
                  <span style={{ color: "#b45309" }}>{Number(invoice.vat_amount).toFixed(2)} {invoice.currency}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #0f3460", marginTop: "4px", fontSize: "15px", fontWeight: 800 }}>
                  <span>الإجمالي المدفوع</span>
                  <span style={{ color: "#0f3460" }}>{Number(invoice.total_amount).toFixed(2)} {invoice.currency}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "32px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", fontSize: "10px", color: "#94a3b8", textAlign: "center" as const }}>
              هذه فاتورة ضريبية صادرة إلكترونياً. تُحصّل ضريبة القيمة المضافة مرة واحدة عند شراء الباقة. الجلسات تُخصم من رصيد الساعات بدون فواتير إضافية.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
