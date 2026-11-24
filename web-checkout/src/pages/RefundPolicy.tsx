import { motion } from "framer-motion";
import { RotateCcw, CheckCircle, XCircle, MessageSquare, Clock, Gift } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const RefundPolicy = () => (
  <div className="min-h-screen bg-background" dir="rtl">
    <Navbar />
    <main className="container py-16 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <RotateCcw className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">سياسة الاسترجاع</h1>
        <p className="text-muted-foreground">آخر تحديث: أبريل 2026</p>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-card rounded-2xl border shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-secondary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">الحالات المؤهلة</h2>
          </div>
          <ul className="space-y-2">
            {["غياب المعلم", "فشل الاتصال بسبب المنصة", "خطأ تقني يمنع إكمال الجلسة"].map((item, i) => (
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
            <h2 className="text-lg font-bold text-foreground">الحالات غير المؤهلة</h2>
          </div>
          <ul className="space-y-2">
            {["تأخر الطالب", "ضعف الإنترنت لدى المستخدم", "انتهاء الجلسة بشكل طبيعي"].map((item, i) => (
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
            <h2 className="text-lg font-bold text-foreground">طريقة الاسترجاع</h2>
          </div>
          <div className="flex flex-col gap-3 mr-4">
            {["يتم تقديم طلب عبر الدعم", "يتم مراجعة الجلسة", "يتم إعادة المبلغ إلى رصيد المستخدم"].map((step, i) => (
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
            <h2 className="text-lg font-bold text-foreground">مدة الاسترجاع</h2>
          </div>
          <p className="text-sm text-muted-foreground">من <span className="font-bold text-foreground">3 إلى 7</span> أيام عمل</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-card rounded-2xl border shadow-sm p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center">
              <Gift className="h-4 w-4 text-secondary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">التعويضات</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-2">في بعض الحالات:</p>
          <ul className="space-y-1.5 mr-4">
            <li className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary/40 shrink-0" />يتم تعويض المستخدم بجلسة بديلة
            </li>
            <li className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary/40 shrink-0" />أو رصيد إضافي
            </li>
          </ul>
        </motion.div>
      </div>
    </main>
    <Footer />
  </div>
);

export default RefundPolicy;
