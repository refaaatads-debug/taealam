import { motion } from "framer-motion";
import { RotateCcw, CheckCircle, XCircle, MessageSquare, Clock } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PublicPageHeader from "@/components/PublicPageHeader";

const RefundPolicy = () => (
  <div className="min-h-screen bg-background text-[#102f50]" dir="rtl">
    <Navbar />
    <PublicPageHeader icon={RotateCcw} eyebrow="وضوح ومرونة" title="سياسة الاسترداد" description="متى نراجع طلبات استرداد رسوم الحصص؟" />
    <main className="container max-w-4xl py-14">

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-card rounded-2xl border shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-secondary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">متى نراجع الطلب؟</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            نراجع الطلب عند وجود خلل تقني موثّق من المنصة منع إتمام الحصة، ونفحص سجل الحجز والاستخدام. تقديم الطلب لا يعني الموافقة تلقائياً.
          </p>
          <ul className="space-y-2">
            {["تعذّر إتمام الحصة بسبب خلل تقني في المنصة", "وجود بلاغ أو سجل يدعم تعذّر إكمال الحصة"].map((item, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-secondary shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl border shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-4 w-4 text-destructive" />
            </div>
            <h2 className="text-lg font-bold text-foreground">ما لا يُسترد</h2>
          </div>
          <ul className="space-y-2">
            {["قيمة الحصص التي حُجزت أو نُفذت", "قيمة الاشتراك بعد حجز حصص منه", "المشكلات الناتجة عن اتصال المستخدم أو تأخره"].map((item, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                <XCircle className="h-3.5 w-3.5 text-destructive/60 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>

      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-card rounded-2xl border shadow-sm p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">طريقة مراجعة الطلب</h2>
          </div>
          <div className="flex flex-col gap-3 mr-4">
            {["تواصل مع الدعم وأرسل تفاصيل الحجز والخلل", "يتحقق الفريق من البلاغ وسجل الحجز والاستخدام", "يُبلّغك الفريق بالنتيجة والمعالجة المناسبة بعد المراجعة"].map((step, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                {step}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl border shadow-sm p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">مدة المراجعة</h2>
          </div>
          <p className="text-sm text-muted-foreground">تختلف مدة المراجعة بحسب تفاصيل البلاغ وسجلات الحجز؛ لا توجد مدة ثابتة أو موافقة تلقائية.</p>
        </motion.div>
      </div>
    </main>
    <Footer />
  </div>
);

export default RefundPolicy;
