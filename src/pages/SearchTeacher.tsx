import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Search, Star, Users, Filter, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

const allTeachers = [
  { id: 1, name: "أ. سارة المحمدي", subject: "رياضيات", rating: 4.9, students: 320, price: 80, bio: "خبرة 8 سنوات في تدريس الرياضيات للمرحلة الثانوية" },
  { id: 2, name: "أ. خالد العتيبي", subject: "فيزياء", rating: 4.8, students: 280, price: 90, bio: "حاصل على ماجستير فيزياء من جامعة الملك سعود" },
  { id: 3, name: "أ. نورة الشهري", subject: "إنجليزي", rating: 4.9, students: 410, price: 70, bio: "معتمدة من IELTS مع خبرة 10 سنوات" },
  { id: 4, name: "أ. أحمد الحربي", subject: "كيمياء", rating: 4.7, students: 195, price: 85, bio: "متخصص في الكيمياء العضوية والتحليلية" },
  { id: 5, name: "أ. فاطمة العمري", subject: "عربي", rating: 4.8, students: 250, price: 65, bio: "متخصصة في النحو والصرف والبلاغة" },
  { id: 6, name: "أ. عمر السبيعي", subject: "رياضيات", rating: 4.6, students: 180, price: 75, bio: "خبير في القدرات والتحصيلي" },
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
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="bg-primary py-12">
        <div className="container">
          <h1 className="text-3xl font-bold text-primary-foreground mb-6">ابحث عن مدرسك المثالي</h1>
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="ابحث بالاسم أو المادة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-12 pr-10 bg-card border-0 text-right"
              />
            </div>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger className="h-12 w-full md:w-48 bg-card border-0">
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
              <SelectTrigger className="h-12 w-full md:w-48 bg-card border-0">
                <Filter className="h-4 w-4 ml-2" />
                <SelectValue placeholder="ترتيب حسب" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rating">الأعلى تقييماً</SelectItem>
                <SelectItem value="price">الأقل سعراً</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="container py-8 flex-1">
        <p className="text-muted-foreground mb-6">{filtered.length} مدرس متاح</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((t) => (
            <Card key={t.id} className="shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 border-0 group">
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center shrink-0">
                    <Users className="h-7 w-7 text-accent-foreground" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{t.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>{t.subject}</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">{t.bio}</p>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="flex items-center gap-1 text-foreground">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      {t.rating}
                    </span>
                    <span className="text-muted-foreground">{t.students} طالب</span>
                  </div>
                  <span className="text-lg font-bold text-secondary">{t.price} ر.س<span className="text-xs text-muted-foreground font-normal">/ساعة</span></span>
                </div>
                <Button className="w-full gradient-cta shadow-button text-secondary-foreground" asChild>
                  <Link to="/booking">احجز الآن</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default SearchTeacher;
