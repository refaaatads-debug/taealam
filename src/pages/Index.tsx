import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  GraduationCap, BookOpen, Users, Star, Video, Brain,
  ChevronLeft, Quote, Search, CalendarCheck
} from "lucide-react";

const services = [
  { icon: Video, title: "حصص مباشرة", desc: "تعلم وجهاً لوجه مع أفضل المدرسين عبر الفيديو" },
  { icon: Brain, title: "توصيات ذكية", desc: "الذكاء الاصطناعي يقترح المدرس المثالي لك" },
  { icon: BookOpen, title: "مواد متنوعة", desc: "رياضيات، علوم، لغات، وأكثر من 50 مادة" },
  { icon: CalendarCheck, title: "حجز مرن", desc: "اختر الموعد المناسب لك بخطوات بسيطة" },
];

const teachers = [
  { name: "أ. سارة المحمدي", subject: "رياضيات", rating: 4.9, students: 320, color: "bg-accent" },
  { name: "أ. خالد العتيبي", subject: "فيزياء", rating: 4.8, students: 280, color: "bg-muted" },
  { name: "أ. نورة الشهري", subject: "إنجليزي", rating: 4.9, students: 410, color: "bg-accent" },
  { name: "أ. أحمد الحربي", subject: "كيمياء", rating: 4.7, students: 195, color: "bg-muted" },
];

const testimonials = [
  { name: "محمد السالم", text: "المنصة غيرت مستوى ابني تماماً. المدرسين ممتازين والحجز سهل جداً.", role: "ولي أمر" },
  { name: "هند الرشيد", text: "أفضل تجربة تعليمية أونلاين. الحصص تفاعلية والمتابعة ممتازة.", role: "طالبة جامعية" },
  { name: "عبدالله القحطاني", text: "كمدرس، المنصة وفرت لي بيئة احترافية وعدد طلاب ممتاز.", role: "معلم" },
];

const Index = () => (
  <div className="min-h-screen flex flex-col">
    <Navbar />

    {/* Hero */}
    <section className="gradient-hero text-primary-foreground relative overflow-hidden">
      <div className="container py-20 md:py-28 relative z-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-primary-foreground/15 rounded-full px-4 py-1.5 text-sm mb-6 animate-fade-in">
            <GraduationCap className="h-4 w-4" />
            <span>أكثر من 10,000 طالب يثقون بنا</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            تعلّم مع أفضل <br />
            <span className="opacity-80">المدرسين في الوطن العربي</span>
          </h1>
          <p className="text-lg md:text-xl opacity-85 mb-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
            حصص خصوصية مباشرة، مدرسين معتمدين، وتجربة تعليمية مصممة لنجاحك.
          </p>
          <div className="flex flex-wrap gap-4 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <Button size="lg" className="gradient-cta shadow-button text-secondary-foreground text-base px-8" asChild>
              <Link to="/search">
                <Search className="ml-2 h-5 w-5" />
                ابحث عن مدرسك
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 text-base" asChild>
              <Link to="/login">
                احجز الآن
                <ChevronLeft className="mr-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
      {/* Decorative circles */}
      <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-primary-foreground/5 animate-float" />
      <div className="absolute bottom-10 left-1/3 w-40 h-40 rounded-full bg-primary-foreground/5 animate-float" style={{ animationDelay: "1s" }} />
    </section>

    {/* Services */}
    <section className="py-20 bg-background">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">لماذا تعلّم؟</h2>
          <p className="text-muted-foreground text-lg">كل ما تحتاجه لتجربة تعليمية متكاملة</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((s, i) => (
            <Card key={i} className="group shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 border-0">
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <s.icon className="h-7 w-7 text-accent-foreground" />
                </div>
                <h3 className="font-bold text-lg mb-2 text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>

    {/* Featured Teachers */}
    <section className="py-20 bg-muted/50">
      <div className="container">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-2">مدرسون مميزون</h2>
            <p className="text-muted-foreground">نخبة من أفضل المعلمين المعتمدين</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/search">عرض الكل <ChevronLeft className="mr-1 h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {teachers.map((t, i) => (
            <Card key={i} className="shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 border-0 overflow-hidden">
              <div className={`${t.color} h-24 flex items-center justify-center`}>
                <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center">
                  <Users className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardContent className="p-5 text-center">
                <h3 className="font-bold text-foreground mb-1">{t.name}</h3>
                <p className="text-sm text-secondary font-medium mb-3">{t.subject}</p>
                <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {t.rating}
                  </span>
                  <span>{t.students} طالب</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>

    {/* Testimonials */}
    <section className="py-20 bg-background">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">ماذا يقول مستخدمونا؟</h2>
          <p className="text-muted-foreground text-lg">آراء حقيقية من طلاب ومعلمين وأولياء أمور</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <Card key={i} className="shadow-card border-0">
              <CardContent className="p-6">
                <Quote className="h-8 w-8 text-secondary/40 mb-4" />
                <p className="text-foreground mb-4 leading-relaxed">{t.text}</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                    <span className="text-sm font-bold text-accent-foreground">{t.name[0]}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="gradient-hero text-primary-foreground py-16">
      <div className="container text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">ابدأ رحلتك التعليمية الآن</h2>
        <p className="text-lg opacity-85 mb-8 max-w-lg mx-auto">سجّل مجاناً واحصل على أول حصة بخصم 50%</p>
        <Button size="lg" className="gradient-cta shadow-button text-secondary-foreground text-lg px-10" asChild>
          <Link to="/login">احجز الآن</Link>
        </Button>
      </div>
    </section>

    <Footer />
  </div>
);

export default Index;
