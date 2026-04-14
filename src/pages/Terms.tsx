import { motion } from "framer-motion";
import { FileText, Users, Shield, CreditCard, BookOpen, AlertTriangle, Settings, RefreshCw } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const sections = [
  { icon: BookOpen, title: "التعريفات", items: ["\"المنصة\": النظام الإلكتروني", "\"المستخدم\": الطالب أو المعلم", "\"الجلسة\": درس مباشر بين الطرفين"] },
  { icon: Users, title: "أهلية الاستخدام", content: "يجب أن يكون المستخدم بعمر قانوني أو تحت إشراف ولي الأمر." },
  { icon: Shield, title: "الحسابات", items: ["المستخدم مسؤول عن بياناته", "يمنع مشاركة الحساب", "يحق للمنصة تعليق الحساب عند الاشتباه"] },
  { icon: AlertTriangle, title: "استخدام الخدمة", content: "يُمنع:", items: ["إساءة استخدام المنصة", "إرسال محتوى غير لائق", "التحايل على نظام الدفع"] },
  { icon: BookOpen, title: "الجلسات التعليمية", items: ["تعتمد على الاتصال المباشر", "يتم احتساب الوقت بالدقيقة", "الجودة تعتمد على الإنترنت لدى المستخدم"] },
  { icon: CreditCard, title: "المدفوعات", items: ["جميع المدفوعات تتم عبر المنصة", "الأسعار تخضع لإدارة المنصة", "لا يُسمح بالدفع خارج المنصة"] },
  { icon: Settings, title: "المسؤولية", content: "المنصة:", items: ["لا تتحمل مسؤولية سوء استخدام الخدمة", "لا تضمن نتائج تعليمية محددة"] },
  { icon: RefreshCw, title: "التعديلات", content: "يحق للمنصة:", items: ["تعديل الشروط في أي وقت", "تحديث السياسات"] },
];

const Terms = () => (
  <div className="min-h-screen bg-background" dir="rtl">
    <Navbar />
    <main className="container py-16 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <FileText className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">الشروط والأحكام</h1>
        <p className="text-muted-foreground">آخر تحديث: أبريل 2026</p>
      </motion.div>

      <div className="space-y-6">
        {sections.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card rounded-2xl border shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <s.icon className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-foreground">{i + 1}. {s.title}</h2>
            </div>
            {s.content && <p className="text-sm text-muted-foreground leading-relaxed mb-2">{s.content}</p>}
            {s.items && (
              <ul className="space-y-1.5 mr-4">
                {s.items.map((item, ii) => (
                  <li key={ii} className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        ))}
      </div>
    </main>
    <Footer />
  </div>
);

export default Terms;
