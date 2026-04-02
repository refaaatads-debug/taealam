import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { Search, Star, Filter, BookOpen, Clock, CheckCircle, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface TeacherResult {
  id: string;
  user_id: string;
  bio: string | null;
  hourly_rate: number;
  avg_rating: number;
  total_sessions: number;
  total_reviews: number;
  is_verified: boolean;
  years_experience: number;
  available_from: string | null;
  available_to: string | null;
  profile?: { full_name: string; avatar_url: string | null };
  subjects: string[];
}

const SearchTeacher = () => {
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("all");
  const [sort, setSort] = useState("rating");
  const [teachers, setTeachers] = useState<TeacherResult[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeachers();
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    const { data } = await supabase.from("subjects").select("id, name").order("name");
    if (data) setSubjects(data);
  };

  const fetchTeachers = async () => {
    setLoading(true);
    // Fetch approved teachers
    const { data: teacherProfiles } = await supabase
      .from("teacher_profiles")
      .select("*")
      .eq("is_approved", true)
      .order("avg_rating", { ascending: false });

    if (!teacherProfiles) { setLoading(false); return; }

    // Fetch profiles for those teachers
    const userIds = teacherProfiles.map(t => t.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", userIds);
    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));

    // Fetch teacher subjects
    const teacherIds = teacherProfiles.map(t => t.id);
    const { data: teacherSubjects } = await supabase
      .from("teacher_subjects")
      .select("teacher_id, subjects(name)")
      .in("teacher_id", teacherIds);

    const subjectMap = new Map<string, string[]>();
    (teacherSubjects ?? []).forEach((ts: any) => {
      const existing = subjectMap.get(ts.teacher_id) || [];
      if (ts.subjects?.name) existing.push(ts.subjects.name);
      subjectMap.set(ts.teacher_id, existing);
    });

    const result: TeacherResult[] = teacherProfiles.map(t => ({
      ...t,
      avg_rating: Number(t.avg_rating) || 0,
      total_sessions: t.total_sessions || 0,
      total_reviews: t.total_reviews || 0,
      is_verified: t.is_verified || false,
      years_experience: t.years_experience || 0,
      profile: profileMap.get(t.user_id) || { full_name: "معلم", avatar_url: null },
      subjects: subjectMap.get(t.id) || [],
    }));

    setTeachers(result);
    setLoading(false);
  };

  const filtered = teachers
    .filter((t) => {
      const name = t.profile?.full_name || "";
      const matchSearch = name.includes(search) || t.subjects.some(s => s.includes(search));
      const matchSubject = subject === "all" || t.subjects.includes(subject);
      return matchSearch && matchSubject;
    })
    .sort((a, b) => sort === "rating" ? b.avg_rating - a.avg_rating : a.hourly_rate - b.hourly_rate);

  const isAvailableNow = (t: TeacherResult) => {
    if (!t.available_from || !t.available_to) return false;
    const now = new Date();
    const h = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
    return h >= t.available_from && h <= t.available_to;
  };

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
            <p className="text-primary-foreground/70 mb-5 md:mb-6 text-sm md:text-base">أكثر من {teachers.length} مدرس معتمد</p>
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
                  {subjects.map(s => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
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

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-card">
                <CardContent className="p-5 space-y-3">
                  <div className="flex gap-3">
                    <Skeleton className="w-16 h-16 rounded-2xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg font-bold text-foreground mb-1">لا يوجد مدرسين</p>
            <p className="text-sm text-muted-foreground">جرب تغيير معايير البحث</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {filtered.map((t, i) => {
              const available = isAvailableNow(t);
              return (
                <motion.div key={t.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1.5 border-0 group overflow-hidden h-full">
                    <CardContent className="p-0">
                      <div className="p-4 md:p-5 pb-0">
                        <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
                          <div className="relative">
                            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl gradient-hero flex items-center justify-center shrink-0">
                              <Users className="h-7 w-7 text-primary-foreground/70" />
                            </div>
                            {available && (
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-card" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <h3 className="font-bold text-foreground text-sm md:text-base truncate">{t.profile?.full_name}</h3>
                              {t.is_verified && <CheckCircle className="h-4 w-4 text-secondary fill-secondary/20 shrink-0" />}
                            </div>
                            <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-1">
                              <BookOpen className="h-3.5 w-3.5" />
                              <span>{t.subjects.join("، ") || "عام"}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="flex items-center gap-1 font-bold text-foreground">
                                <Star className="h-3.5 w-3.5 fill-gold text-gold" />{t.avg_rating.toFixed(1)}
                              </span>
                              <span className="text-muted-foreground">{t.total_sessions} حصة</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4 leading-relaxed line-clamp-2">{t.bio || `مدرس خبرة ${t.years_experience} سنوات`}</p>
                      </div>
                      <div className="p-4 md:p-5 pt-0">
                        <div className="flex items-center justify-between mb-3 md:mb-4 pt-3 border-t">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {available ? <span className="text-green-600 font-semibold">متاح الآن</span> : <span>خبرة {t.years_experience} سنوات</span>}
                          </div>
                          <span className="text-base md:text-lg font-black text-primary">{t.hourly_rate} <span className="text-[10px] md:text-xs text-muted-foreground font-normal">ر.س/ساعة</span></span>
                        </div>
                        <Button className="w-full gradient-cta shadow-button text-secondary-foreground rounded-xl h-10 md:h-11" asChild>
                          <Link to="/booking">اطلب حصة</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
      <BottomNav />
    </div>
  );
};

export default SearchTeacher;
