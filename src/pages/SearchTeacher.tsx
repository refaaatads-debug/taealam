import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { Search, Star, Filter, BookOpen, Clock, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import teacher1 from "@/assets/teacher-1.jpg";
import teacher2 from "@/assets/teacher-2.jpg";
import teacher3 from "@/assets/teacher-3.jpg";
import teacher4 from "@/assets/teacher-4.jpg";
import teacher5 from "@/assets/teacher-5.jpg";
import teacher6 from "@/assets/teacher-6.jpg";

const allTeachers = [
  { id: 1, name: "أ. سارة المحمدي", subject: "رياضيات", rating: 4.9, students: 320, price: 80, bio: "خبرة 8 سنوات في تدريس الرياضيات للمرحلة الثانوية", verified: true, available: true, img: teacher1 },
  { id: 2, name: "أ. خالد العتيبي", subject: "فيزياء", rating: 4.8, students: 280, price: 90, bio: "حاصل على ماجستير فيزياء من جامعة الملك سعود", verified: true, available: true, img: teacher2 },
  { id: 3, name: "أ. نورة الشهري", subject: "إنجليزي", rating: 4.9, students: 410, price: 70, bio: "معتمدة من IELTS مع خبرة 10 سنوات", verified: true, available: false, img: teacher3 },
  { id: 4, name: "أ. أحمد الحربي", subject: "كيمياء", rating: 4.7, students: 195, price: 85, bio: "متخصص في الكيمياء العضوية والتحليلية", verified: true, available: true, img: teacher4 },
  { id: 5, name: "أ. فاطمة العمري", subject: "عربي", rating: 4.8, students: 250, price: 65, bio: "متخصصة في النحو والصرف والبلاغة", verified: false, available: true, img: teacher5 },
  { id: 6, name: "أ. عمر السبيعي", subject: "رياضيات", rating: 4.6, students: 180, price: 75, bio: "خبير في القدرات والتحصيلي", verified: true, available: true, img: teacher6 },
];

const SearchTeacher = () => {
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("all");
  const [sort, setSort] = useState("rating");

  const filtered = allTeachers
    .filter((t) => {
      const matchSearch = t.name.includes(search) || t.subject.includes(search);
      const matchSubject = subject === "all" || t.subject === subject;
      return matchSearch && matchSubject;
    })
    .sort((a, b) => sort === "rating" ? b.rating - a.rating : a.price - b.price);

  return (
    <div className="min-h-screen flex flex-col pb-16 md:pb-0">
      <Navbar />

      <div className="gradient-hero py-10 md:py-14 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-32 h-32 rounded-full border border-primary-foreground/20 animate-float" />
        </div>
        <div className="container relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-primary-foreground mb-2">ابحث عن مدرسك المثالي</h1>
            <p className="text-primary-foreground/70 mb-5 md:mb-6 text-sm md:text-base">أكثر من 500 مدرس معتمد في أكثر من 50 مادة</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="ابحث بالاسم أو المادة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-12 pr-11 bg-card border-0 text-right rounded-xl shadow-card"
              />
            </div>
            <div className="flex gap-3">
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger className="h-12 w-full md:w-48 bg-card border-0 rounded-xl shadow-card">
                  <SelectValue placeholder="المادة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المواد</SelectItem>
                  <SelectItem value="رياضيات">رياضيات</SelectItem>
                  <SelectItem value="فيزياء">فيزياء</SelectItem>
                  <SelectItem value="كيمياء">كيمياء</SelectItem>
                  <SelectItem value="إنجليزي">إنجليزي</SelectItem>
                  <SelectItem value="عربي">عربي</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-12 w-full md:w-48 bg-card border-0 rounded-xl shadow-card">
                  <Filter className="h-4 w-4 ml-2" />
                  <SelectValue placeholder="ترتيب حسب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rating">الأعلى تقييماً</SelectItem>
                  <SelectItem value="price">الأقل سعراً</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="container py-6 md:py-8 flex-1">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <p className="text-muted-foreground font-medium text-sm md:text-base">{filtered.length} مدرس متاح</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {filtered.map((t, i) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1.5 border-0 group overflow-hidden h-full">
                <CardContent className="p-0">
                  <div className="p-4 md:p-5 pb-0">
                    <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
                      <div className="relative">
                        <img
                          src={t.img}
                          alt={t.name}
                          className="w-14 h-14 md:w-16 md:h-16 rounded-2xl object-cover shrink-0"
                          loading="lazy"
                          width={64}
                          height={64}
                        />
                        {t.available && (
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-success border-2 border-card" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <h3 className="font-bold text-foreground text-sm md:text-base truncate">{t.name}</h3>
                          {t.verified && <CheckCircle className="h-4 w-4 text-secondary fill-secondary/20 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-1">
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>{t.subject}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 font-bold text-foreground">
                            <Star className="h-3.5 w-3.5 fill-gold text-gold" />{t.rating}
                          </span>
                          <span className="text-muted-foreground">{t.students} طالب</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4 leading-relaxed">{t.bio}</p>
                  </div>
                  <div className="p-4 md:p-5 pt-0">
                    <div className="flex items-center justify-between mb-3 md:mb-4 pt-3 border-t">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {t.available ? <span className="text-success font-semibold">متاح الآن</span> : <span>غير متاح حالياً</span>}
                      </div>
                      <span className="text-base md:text-lg font-black text-primary">{t.price} <span className="text-[10px] md:text-xs text-muted-foreground font-normal">ر.س/ساعة</span></span>
                    </div>
                    <Button className="w-full gradient-cta shadow-button text-secondary-foreground rounded-xl h-10 md:h-11" asChild>
                      <Link to="/booking">احجز الآن</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
      <Footer />
      <BottomNav />
    </div>
  );
};

export default SearchTeacher;
