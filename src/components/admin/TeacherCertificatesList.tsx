import { useState } from "react";
import { Award, ExternalLink, FileCheck2, FileText, Image as ImageIcon, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface TeacherCertificate {
  id: string;
  name: string;
  file_url: string;
  file_name?: string | null;
  created_at?: string | null;
}

interface Props {
  certificates: TeacherCertificate[];
  compact?: boolean;
}

const isImageFile = (certificate: TeacherCertificate) => {
  const value = `${certificate.file_name || ""} ${certificate.file_url}`.toLowerCase();
  return /\.(png|jpe?g|webp|gif|avif)(\?|$)/.test(value);
};

const isPdfFile = (certificate: TeacherCertificate) => {
  const value = `${certificate.file_name || ""} ${certificate.file_url}`.toLowerCase();
  return /\.pdf(\?|$)/.test(value);
};

const certificateDate = (value?: string | null) => value
  ? new Date(value).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })
  : "تاريخ غير محدد";

export default function TeacherCertificatesList({ certificates, compact = false }: Props) {
  const [selected, setSelected] = useState<TeacherCertificate | null>(null);

  return (
    <>
      <CardShell compact={compact}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Award className="h-4.5 w-4.5" /></span>
            <div><h3 className="text-sm font-black text-slate-800">الشهادات المرفوعة</h3><p className="text-[10px] text-slate-400">المستندات التي قدمها المعلم للمراجعة</p></div>
          </div>
          <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50/60 text-[10px] text-amber-700">{certificates.length} شهادة</Badge>
        </div>

        {certificates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center"><FileCheck2 className="mx-auto mb-2 h-6 w-6 text-slate-300" /><p className="text-xs font-bold text-slate-500">لم يرفع المعلم شهادات بعد</p><p className="mt-1 text-[10px] text-slate-400">ستظهر المستندات هنا عند رفعها</p></div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {certificates.map((certificate) => (
              <div key={certificate.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 transition-colors hover:border-amber-200 hover:bg-amber-50/30">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-amber-600 shadow-sm">{isImageFile(certificate) ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-700" title={certificate.name}>{certificate.name}</p><p className="mt-0.5 truncate text-[10px] text-slate-400">{certificate.file_name || "ملف الشهادة"} · {certificateDate(certificate.created_at)}</p></div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => setSelected(certificate)} className="h-7 gap-1 rounded-lg border-amber-200 px-2 text-[10px] text-amber-700 hover:bg-amber-50"><Maximize2 className="h-3 w-3" /> عرض</Button>
                  <a href={certificate.file_url} target="_blank" rel="noopener noreferrer" aria-label={`فتح ${certificate.name}`}><Button type="button" size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-slate-400 hover:bg-white hover:text-[#174477]"><ExternalLink className="h-3.5 w-3.5" /></Button></a>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardShell>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="flex h-[min(88vh,800px)] w-[min(96vw,1000px)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0" dir="rtl">
          <DialogHeader className="flex shrink-0 flex-row items-center justify-between border-b border-slate-100 bg-white px-5 py-4"><DialogTitle className="flex min-w-0 items-center gap-2 text-sm font-black text-slate-800"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Award className="h-4 w-4" /></span><span className="truncate">{selected?.name || "عرض الشهادة"}</span></DialogTitle><Button type="button" variant="ghost" size="icon" onClick={() => setSelected(null)} className="h-8 w-8 rounded-lg"><X className="h-4 w-4" /></Button></DialogHeader>
          {selected && <div className="min-h-0 flex-1 bg-slate-100 p-3 sm:p-5">{isImageFile(selected) ? <div className="flex h-full items-center justify-center overflow-auto"><img src={selected.file_url} alt={selected.name} className="max-h-full max-w-full rounded-xl bg-white object-contain shadow-lg" /></div> : isPdfFile(selected) ? <iframe src={selected.file_url} title={selected.name} className="h-full w-full rounded-xl border border-slate-200 bg-white" /> : <div className="flex h-full flex-col items-center justify-center text-center"><FileText className="mb-3 h-12 w-12 text-slate-400" /><p className="text-sm font-bold text-slate-700">هذا النوع من الملفات يفتح في تبويب مستقل</p><a href={selected.file_url} target="_blank" rel="noopener noreferrer" className="mt-4"><Button type="button" className="gap-2 rounded-xl bg-[#174477]"><ExternalLink className="h-4 w-4" /> فتح الملف</Button></a></div>}</div>}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CardShell({ children, compact }: { children: React.ReactNode; compact: boolean }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_35px_-30px_rgba(15,42,78,0.8)] ${compact ? "" : ""}`}>{children}</section>;
}
