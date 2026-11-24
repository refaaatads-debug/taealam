import { motion } from "framer-motion";
import { Shield, Database, Eye, Share2, Lock, UserCheck, Cookie } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const sections = [
  {
    icon: Eye,
    title: "مقدمة",
    content: "نلتزم بحماية خصوصية المستخدمين وضمان سرية البيانات وفق أفضل الممارسات التقنية والقانونية."
  },
  {
    icon: Database,
    title: "البيانات التي نقوم بجمعها",
    content: null,
    lists: [
      { label: "بيانات التسجيل", items: ["الاسم", "البريد الإلكتروني", "رقم الهاتف (إن وجد)"] },
      { label: "بيانات الاستخدام", items: ["سجل الجلسات", "مدة الاتصال", "التفاعل داخل المنصة"] },
      { label: "بيانات تقنية", items: ["عنوان IP", "نوع الجهاز والمتصفح", "ملفات تعريف الارتباط (Cookies)"] },
    ]
  },
  {
    icon: Eye,
    title: "كيفية استخدام البيانات",
    content: null,
    items: ["تشغيل المنصة بكفاءة", "تحسين تجربة المستخدم", "تحليل الأداء", "إرسال إشعارات وتنبيهات"]
  },
  {
    icon: Share2,
    title: "مشاركة البيانات",
    content: "لا نقوم ببيع بيانات المستخدمين، وقد نشارك البيانات فقط في الحالات التالية:",
    items: ["الامتثال للقوانين", "حماية حقوق المنصة", "مزودي خدمات (مثل الاستضافة والدفع)"]
  },
  {
    icon: Lock,
    title: "حماية البيانات",
    content: null,
    items: ["تشفير البيانات", "أنظمة حماية متقدمة", "سياسات وصول محدودة"]
  },
  {
    icon: UserCheck,
    title: "حقوق المستخدم",
    content: null,
    items: ["طلب تعديل بياناتك", "طلب حذف الحساب", "طلب نسخة من بياناتك"]
  },
  {
    icon: Cookie,
    title: "ملفات تعريف الارتباط (Cookies)",
    content: "نستخدم الكوكيز لتحسين:",
    items: ["الأداء", "التصفح", "تخصيص التجربة"]
  },
];

const PrivacyPolicy = () => (
  <div className="min-h-screen bg-background" dir="rtl">
    <Navbar />
    <main className="container py-16 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">سياسة الخصوصية</h1>
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
              <h2 className="text-lg font-bold text-foreground">{s.title}</h2>
            </div>
            {s.content && <p className="text-sm text-muted-foreground leading-relaxed mb-2">{s.content}</p>}
            {s.lists && s.lists.map((list, li) => (
              <div key={li} className="mb-3">
                <p className="text-sm font-medium text-foreground mb-1">{list.label}:</p>
                <ul className="space-y-1 mr-4">
                  {list.items.map((item, ii) => (
                    <li key={ii} className="text-sm text-muted-foreground flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {s.items && (
              <ul className="space-y-1 mr-4">
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

export default PrivacyPolicy;
