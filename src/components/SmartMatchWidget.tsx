import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Star, Sparkles, ChevronLeft, Loader2, Award } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

interface MatchedTeacher {
  id: string;
  name: string;
  subject: string;
  rating: number;
  hourly_rate: number;
  match_score: number;
  match_reason: string;
  total_sessions: number;
  is_verified: boolean;
}

export default function SmartMatchWidget() {
  const [subject, setSubject] = useState("");
  const [teachers, setTeachers] = useState<MatchedTeacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from("subjects").select("id, name").then(({ data }) => {
      if (data) setSubjects(data);
    });
  }, []);

  const findMatch = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("smart-matching", {
        body: { subject: subject || undefined },
      });
      if (error) throw error;
      setTeachers(data.teachers || []);
    } catch {
      // Fallback to static data if no teachers in DB yet
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-card overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
            <Brain className="h-4 w-4 text-secondary" />
          </div>
          ترشيح AI ذكي
          <Sparkles className="h-4 w-4 text-gold mr-auto" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="rounded-xl bg-muted/30 border-border/50 flex-1">
              <SelectValue placeholder="اختر المادة" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={findMatch} disabled={loading} className="gradient-cta text-secondary-foreground rounded-xl shadow-button">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          </Button>
        </div>

        <AnimatePresence mode="wait">
          {teachers.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              {teachers.map((t, i) => (
                <motion.div key={t.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="p-4 rounded-2xl bg-accent/50 border border-accent">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center">
                        <span className="text-xs font-black text-primary-foreground">{i + 1}</span>
                      </div>
                      <div>
                        <p className="font-bold text-sm text-foreground">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.subject} • <Star className="h-3 w-3 inline fill-gold text-gold" /> {t.rating}</p>
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-1">
                        <Award className="h-3 w-3 text-gold" />
                        <span className="text-[10px] font-bold text-gold">{t.match_score}%</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-accent-foreground bg-accent rounded-lg px-2 py-1 inline-block mb-2">
                    <Sparkles className="h-3 w-3 inline ml-1" />{t.match_reason}
                  </p>
                  <Button size="sm" variant="outline" className="w-full text-xs rounded-xl mt-1" asChild>
                    <Link to="/booking">احجز حصة <ChevronLeft className="h-3 w-3 mr-1" /></Link>
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
