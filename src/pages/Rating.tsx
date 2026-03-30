import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Star, CheckCircle, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";

const Rating = () => {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="max-w-md w-full border-0 shadow-card-hover text-center">
            <CardContent className="py-14 px-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 15 }} className="w-20 h-20 rounded-2xl bg-secondary/10 mx-auto mb-6 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-secondary" />
              </motion.div>
              <h2 className="text-2xl font-black text-foreground mb-2">شكراً لتقييمك! 🎉</h2>
              <p className="text-muted-foreground mb-6">تقييمك يساعدنا في تحسين جودة التعليم</p>
              <Button className="gradient-cta shadow-button text-secondary-foreground rounded-xl" asChild>
                <Link to="/student">العودة للوحة التحكم</Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Card className="border-0 shadow-card-hover">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-black text-foreground mb-2">كيف كانت الحصة؟</h2>
            <p className="text-muted-foreground mb-6">قيّم حصتك مع أ. سارة المحمدي</p>

            <div className="flex justify-center gap-2 mb-8">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onMouseEnter={() => setHoveredStar(s)}
                  onMouseLeave={() => setHoveredStar(0)}
                  onClick={() => setRating(s)}
                  className="transition-transform hover:scale-125"
                >
                  <Star className={`h-10 w-10 transition-colors ${s <= (hoveredStar || rating) ? "fill-gold text-gold" : "text-muted-foreground/30"}`} />
                </button>
              ))}
            </div>

            <textarea
              placeholder="اكتب ملاحظاتك (اختياري)..."
              className="w-full p-4 rounded-xl bg-muted/30 border border-border/50 text-right text-sm resize-none h-24 mb-4 focus:outline-none focus:border-secondary"
            />

            <Button
              className="w-full h-12 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold"
              disabled={rating === 0}
              onClick={() => setSubmitted(true)}
            >
              إرسال التقييم
            </Button>
            <Button variant="ghost" className="w-full mt-2 rounded-xl text-muted-foreground" asChild>
              <Link to="/student">تخطي</Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Rating;
