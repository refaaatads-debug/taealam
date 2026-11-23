import { motion } from "framer-motion";
import { HelpCircle, ChevronDown, Search, BookOpen, CreditCard, Users, Settings, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const faqData = [
  {
    category: "عام",
    icon: BookOpen,
    items: [
      {
        q: "ما هي المنصة؟",
        a: "المنصة هي نظام تعليمي إلكتروني يربط بين الطلاب والمعلمين لتقديم دروس مباشرة (واحد لواحد) عبر الإنترنت باستخدام تقنيات الاتصال الحديثة."
      },
      {
        q: "كيف يمكنني إنشاء حساب؟",
        a: "يمكنك إنشاء حساب باستخدام البريد الإلكتروني أو تسجيل الدخول عبر حسابات خارجية مثل Google."
      },
      {
        q: "هل التسجيل مجاني؟",
        a: "نعم، إنشاء الحساب مجاني بالكامل، ويتم الدفع فقط عند حجز الجلسات."
      },
    ]
  },
  {
    category: "المعلمين",
    icon: Users,
    items: [
      {
        q: "كيف أختار المعلم المناسب؟",
        a: "يمكنك تصفح قائمة المعلمين، اختيار المادة، تحديد التقييمات، واختيار الوقت المناسب."
      },
      {
        q: "كيف يتم تقييم المعلم؟",
        a: "بعد انتهاء الجلسة، يمكن للطالب تقييم المعلم بناءً على جودة الشرح والتفاعل."
      },
    ]
  },
  {
    category: "الدفع",
    icon: CreditCard,
    items: [
      {
        q: "كيف يتم الدفع؟",
        a: "يتم الدفع من خلال رصيد داخل المنصة أو وسائل الدفع الإلكتروني عند توفرها."
      },
      {
        q: "هل يمكنني تغيير موعد الجلسة؟",
        a: "نعم، يمكن تعديل أو إلغاء الجلسة قبل وقت محدد وفق سياسة الإلغاء."
      },
    ]
  },
  {
    category: "الدعم التقني",
    icon: Settings,
    items: [
      {
        q: "ماذا لو واجهت مشكلة تقنية أثناء الجلسة؟",
        a: "في حال حدوث مشكلة، يتم تسجيل الجلسة ويمكنك التواصل مع الدعم ويتم تعويضك حسب الحالة."
      },
      {
        q: "هل يتم تسجيل الجلسات؟",
        a: "قد يتم تسجيل الجلسات لأغراض تحسين الجودة، حل النزاعات، والتدريب."
      },
    ]
  },
];

const FAQ = () => {
  const [search, setSearch] = useState("");

  const filtered = faqData.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      item.q.includes(search) || item.a.includes(search)
    ),
  })).filter(cat => cat.items.length > 0);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />
      <main className="container py-16 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <HelpCircle className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">الأسئلة الشائعة</h1>
          <p className="text-muted-foreground max-w-lg mx-auto">إجابات سريعة على أكثر الأسئلة شيوعاً حول منصة تعلّم</p>
        </motion.div>

        <div className="relative mb-10 max-w-md mx-auto">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث في الأسئلة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 rounded-xl"
          />
        </div>

        <div className="space-y-8">
          {filtered.map((cat, ci) => (
            <motion.div key={cat.category} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.1 }}>
              <div className="flex items-center gap-2 mb-3">
                <cat.icon className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">{cat.category}</h2>
              </div>
              <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
                <Accordion type="single" collapsible>
                  {cat.items.map((item, i) => (
                    <AccordionItem key={i} value={`${ci}-${i}`} className="border-b last:border-b-0">
                      <AccordionTrigger className="px-5 text-right hover:no-underline hover:bg-muted/30">
                        <span className="text-sm font-medium">{item.q}</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-5 text-muted-foreground text-sm leading-relaxed">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>لم يتم العثور على نتائج</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default FAQ;
