import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Star, Sparkles, Crown } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const tierIcons: Record<string, typeof Star> = { basic: Star, standard: Sparkles, premium: Crown };
const tierColors: Record<string, string> = {
  basic: "border-border",
  standard: "border-secondary shadow-card-hover",
  premium: "border-gold shadow-card-hover",
};

const Pricing = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("subscription_plans").select("*").order("price").then(({ data }) => {
      if (data) setPlans(data);
    });
  }, []);

  const handleSubscribe = async (plan: any) => {
    if (!user) {
      navigate("/login");
      return;
    }
    const endsAt = new Date();
    endsAt.setMonth(endsAt.getMonth() + 1);

    const { error } = await supabase.from("user_subscriptions").insert({
      user_id: user.id,
      plan_id: plan.id,
      sessions_remaining: plan.sessions_count,
      ends_at: endsAt.toISOString(),
    });

    if (error) {
      toast.error("حدث خطأ أثناء الاشتراك");
    } else {
      toast.success(`تم الاشتراك في باقة ${plan.name_ar} بنجاح!`);
      navigate("/student");
    }
  };

  return (
    <div className="min-h-screen flex flex-col pb-16 md:pb-0">
      <Navbar />
      <div className="container py-12 max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-black text-foreground mb-3">اختر باقتك</h1>
          <p className="text-muted-foreground text-lg">خطط مرنة تناسب احتياجاتك التعليمية</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan, i) => {
            const Icon = tierIcons[plan.tier] || Star;
            const isPopular = plan.tier === "standard";
            return (
              <motion.div key={plan.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}>
                <Card className={`relative border-2 ${tierColors[plan.tier] || ""} overflow-hidden`}>
                  {isPopular && (
                    <div className="absolute top-0 left-0 right-0 h-1 gradient-cta" />
                  )}
                  {isPopular && (
                    <Badge className="absolute top-3 left-3 gradient-cta text-secondary-foreground border-0">الأكثر طلباً</Badge>
                  )}
                  <CardContent className="p-6 text-center">
                    <div className={`w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center ${plan.tier === "premium" ? "bg-gold/10" : "bg-secondary/10"}`}>
                      <Icon className={`h-7 w-7 ${plan.tier === "premium" ? "text-gold" : "text-secondary"}`} />
                    </div>
                    <h3 className="text-xl font-black text-foreground mb-1">{plan.name_ar}</h3>
                    <div className="mb-4">
                      <span className="text-3xl font-black text-foreground">{plan.price}</span>
                      <span className="text-muted-foreground text-sm mr-1">ر.س / شهرياً</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-5">{plan.sessions_count} حصة شهرياً</p>

                    <div className="space-y-2.5 mb-6 text-right">
                      {(plan.features as string[])?.map((f: string, j: number) => (
                        <div key={j} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-secondary shrink-0" />
                          <span className="text-foreground">{f}</span>
                        </div>
                      ))}
                    </div>

                    <Button
                      onClick={() => handleSubscribe(plan)}
                      className={`w-full h-12 rounded-xl font-bold ${isPopular ? "gradient-cta text-secondary-foreground shadow-button" : ""}`}
                      variant={isPopular ? "default" : "outline"}
                    >
                      اشترك الآن
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
      <Footer />
      <BottomNav />
    </div>
  );
};

export default Pricing;
