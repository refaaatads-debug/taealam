import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { Flame, Trophy, TrendingUp } from "lucide-react";

interface LevelData {
  name: string;
  name_ar: string;
  icon: string;
  color: string;
  min_points: number;
  max_points: number;
}

export default function GamificationCard() {
  const { user } = useAuth();
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [level, setLevel] = useState<LevelData | null>(null);
  const [nextLevel, setNextLevel] = useState<LevelData | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const { data: pointsData } = await supabase
        .from("student_points")
        .select("total_points, streak_days")
        .eq("user_id", user.id)
        .single();

      const currentPoints = pointsData?.total_points || 0;
      const currentStreak = pointsData?.streak_days || 0;
      setPoints(currentPoints);
      setStreak(currentStreak);

      const { data: levels } = await supabase
        .from("student_levels")
        .select("*")
        .order("min_points");

      if (levels) {
        const current = levels.find(
          (l) => currentPoints >= l.min_points && currentPoints <= l.max_points
        );
        const next = levels.find((l) => l.min_points > currentPoints);
        setLevel(current || null);
        setNextLevel(next || null);
      }
    };

    fetchData();
  }, [user]);

  const progress = level && nextLevel
    ? ((points - level.min_points) / (nextLevel.min_points - level.min_points)) * 100
    : 0;

  return (
    <Card className="border-0 shadow-card overflow-hidden">
      <CardContent className="p-5">
        {/* Level Badge */}
        <div className="text-center mb-4">
          <span className="text-4xl">{level?.icon || "🥉"}</span>
          <p className="text-lg font-black text-foreground mt-1">{level?.name_ar || "برونزي"}</p>
          <p className="text-xs text-muted-foreground">المستوى الحالي</p>
        </div>

        {/* Points */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-gold" />
            <span className="text-sm font-bold text-foreground">{points.toLocaleString()} نقطة</span>
          </div>
          {nextLevel && (
            <span className="text-xs text-muted-foreground">
              {nextLevel.min_points - points} نقطة للـ{nextLevel.name_ar}
            </span>
          )}
        </div>

        {/* Progress */}
        <div className="h-3 bg-muted rounded-full overflow-hidden mb-4">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="h-full gradient-cta rounded-full"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-destructive/5 rounded-xl p-3 text-center">
            <Flame className="h-5 w-5 text-destructive mx-auto mb-1" />
            <p className="text-xl font-black text-foreground">{streak}</p>
            <p className="text-[10px] text-muted-foreground">أيام متتالية</p>
          </div>
          <div className="bg-secondary/5 rounded-xl p-3 text-center">
            <TrendingUp className="h-5 w-5 text-secondary mx-auto mb-1" />
            <p className="text-xl font-black text-foreground">{points >= 50 ? "+50" : "0"}</p>
            <p className="text-[10px] text-muted-foreground">نقاط اليوم</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
