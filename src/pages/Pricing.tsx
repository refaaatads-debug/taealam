import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle, Star, Sparkles, Crown, X, Shield, Zap, Gift, Users, ArrowLeft, CreditCard, Tag } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";

const tierIcons: Record<string, typeof Star> = { free: Gift, basic: Star, standard: Sparkles, premium: Crown };

const comparisonFeatures = [
  { label: "حصص شهرية", key: "sessions" },
  { label: "مدرس ذكي AI", key: "ai_tutor" },
  { label: "تسجيل الحصص", key: "recording" },
  { label: "أولوية الحجز", key: "priority" },
  { label: "تقارير مفصلة", key: "reports" },
  { label: "دعم فني", key: "support" },
];

const Pricing = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoCode, setPromoCode] = useState("");
  const [showPromo, setShowPromo] = useState(false);
  const [freeTrialUsed, setFreeTrialUsed] = useState(false);

  useEffect(() => {
    const loadPricingData = async () => {
      setLoading(true);
      const plansPromise = supabase.from("subscription_plans").select("*").order("price");
      const profilePromise = user?.id
        ? supabase.from("profiles").select("free_trial_used").eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const [{ data: plansData }, { data: profileData }] = await Promise.all([plansPromise, profilePromise]);

      if (plansData) setPlans(plansData);
      setFreeTrialUsed(Boolean(profileData?.free_trial_used));
      setLoading(false);
    };

    loadPricingData();
  }, [user?.id]);

  const handleSubscribe = async (plan: any) => {
    if (!user) { navigate("/login"); return; }

    // Check profile completeness for students
    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name, phone, teaching_stage")
      .eq("user_id", user.id)
      .maybeSingle();
    const profileComplete = !!(profileData?.full_name && profileData?.phone && (profileData as any)?.teaching_stage);
    if (!profileComplete) {
      toast.error("يجب استكمال بياناتك أولاً قبل الاشتراك");
      navigate(`/complete-profile?redirect=${encodeURIComponent("/pricing")}`);
      return;
    }

    if (plan.price <= 0 && freeTrialUsed) {
      toast.error("لقد استخدمت الباقة المجانية من قبل. يمكنك الاشتراك في باقة مدفوعة.");
      return;
    }

    setCheckoutLoading(plan.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          plan_id: plan.id,
          success_url: `${window.location.origin}/payment-success`,
          cancel_url: `${window.location.origin}/pricing?payment=cancelled`,
          promo_code: promoCode.trim() || undefined,
        },
      });

      if (error) {
        let msg = "حدث خطأ أثناء إنشاء جلسة الدفع";
        try {
          const ctx = (error as any)?.context;
          if (ctx instanceof Response) {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          } else if (typeof error === "object" && (error as any)?.message) {
            msg = (error as any).message;
          }
        } catch {
          // fallback
        }
        toast.error(msg);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.free && data?.activated) {
        toast.success("تم تفعيل باقتك المجانية بنجاح! 🎉");
        setFreeTrialUsed(true);
        navigate("/student");
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("لم يتم إنشاء رابط الدفع");
      }
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء إنشاء جلسة الدفع");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const getFeatureValue = (plan: any, key: string) => {
    switch (key) {
      case "sessions": return `${plan.sessions_count} حصة`;
      case "ai_tutor": return plan.has_ai_tutor;
      case "recording": return plan.has_recording;
      case "priority": return plan.has_priority_booking;
      case "reports": return plan.tier !== "basic";
      case "support": return plan.tier === "basic" ? "شات" : plan.tier === "standard" ? "شات + إيميل" : "شات + إيميل + أولوية";
      default: return false;
    }
  };

  return (
    <div className="min-h-screen flex flex-col pb-16 md:pb-0">
      <Navbar />

      {/* Hero */}
      <div className="gradient-hero py-12 md:py-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-16 right-20 w-40 h-40 rounded-full border border-primary-foreground/20 animate-float" />
          <div className="absolute bottom-10 left-16 w-24 h-24 rounded-full border border-primary-foreground/10" />
        </div>
        <div className="container max-w-5xl relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Badge className="mb-4 bg-primary-foreground/10 text-primary-foreground border-0 text-sm px-4 py-1.5">
              <Gift className="h-3.5 w-3.5 ml-1.5" /> وفّر حتى 40%
            </Badge>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-primary-foreground mb-3">اختر الباقة المناسبة لك</h1>
            <p className="text-primary-foreground/70 text-base md:text-lg max-w-lg mx-auto">خطط مرنة تناسب جميع المستويات، ابدأ واطوّر مسيرتك التعليمية</p>
          </motion.div>
        </div>
      </div>

      <div className="container max-w-5xl py-10 md:py-14">
        {/* Trust Badges */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-wrap justify-center gap-6 mb-10">
          {[
            { icon: Shield, text: "ضمان استرداد 7 أيام" },
            { icon: Zap, text: "تفعيل فوري" },
            { icon: Users, text: "+500 طالب نشط" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
              <item.icon className="h-4 w-4 text-secondary" />
              <span>{item.text}</span>
            </div>
          ))}
        </motion.div>

        {/* Promo Code Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex justify-center mb-8">
          {!showPromo ? (
            <Button variant="ghost" size="sm" className="text-sm text-muted-foreground gap-2" onClick={() => setShowPromo(true)}>
              <Tag className="h-4 w-4" /> هل لديك كود خصم؟
            </Button>
          ) : (
            <div className="flex items-center gap-2 bg-muted/50 rounded-xl p-2 border border-border">
              <Tag className="h-4 w-4 text-secondary mr-1" />
              <Input
                value={promoCode}
                onChange={e => setPromoCode(e.target.value.toUpperCase())}
                placeholder="أدخل كود الخصم..."
                className="h-9 w-48 rounded-lg border-0 bg-background text-sm"
                dir="ltr"
              />
              {promoCode && (
                <Badge className="bg-secondary/10 text-secondary border-0 text-xs">سيُطبّق عند الدفع</Badge>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowPromo(false); setPromoCode(""); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </motion.div>

        {/* Plans Grid */}
        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 mb-16">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-card">
                <CardContent className="p-6 space-y-4">
                  <Skeleton className="w-14 h-14 rounded-2xl mx-auto" />
                  <Skeleton className="h-6 w-24 mx-auto" />
                  <Skeleton className="h-10 w-20 mx-auto" />
                  <Skeleton className="h-3 w-32 mx-auto" />
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className="h-4 w-full" />
                  ))}
                  <Skeleton className="h-12 w-full rounded-xl" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 mb-16">
          {plans.map((plan, i) => {
            const Icon = tierIcons[plan.tier] || Star;
            const isPopular = plan.tier === "standard";
            const isPremium = plan.tier === "premium";
            const isFree = plan.price <= 0;
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.12 }}
                className="group"
              >
                <Card className={`relative border-2 overflow-hidden transition-all duration-300 h-full
                  group-hover:-translate-y-2 group-hover:shadow-card-hover
                  ${isPopular ? "border-secondary shadow-card-hover scale-[1.02]" : isPremium ? "border-gold/50" : "border-border"}
                `}>
                  {isPopular && (
                    <div className="absolute top-0 left-0 right-0">
                      <div className="gradient-cta h-1.5" />
                      <div className="flex justify-center -mt-0">
                        <Badge className="gradient-cta text-secondary-foreground border-0 rounded-t-none rounded-b-xl text-xs font-black px-5 py-1 shadow-button">
                          ⚡ الأكثر طلباً
                        </Badge>
                      </div>
                    </div>
                  )}

                  {isPremium && (
                    <div className="absolute inset-0 bg-gradient-to-b from-gold/5 to-transparent pointer-events-none" />
                  )}

                  <CardContent className={`p-6 md:p-8 text-center relative ${isPopular ? "pt-10" : ""}`}>
                    <div className={`w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center transition-transform duration-300 group-hover:scale-110
                      ${isPremium ? "bg-gold/10" : isPopular ? "bg-secondary/10" : "bg-muted"}
                    `}>
                      <Icon className={`h-8 w-8 ${isPremium ? "text-gold" : isPopular ? "text-secondary" : "text-muted-foreground"}`} />
                    </div>

                    <h3 className="text-xl font-black text-foreground mb-2">{plan.name_ar}</h3>
                    <div className="mb-1">
                      {isFree ? (
                        <span className="text-4xl md:text-5xl font-black text-secondary">مجاناً</span>
                      ) : (
                        <>
                          <span className="text-4xl md:text-5xl font-black text-foreground">{plan.price}</span>
                          <span className="text-muted-foreground text-sm mr-1">ر.س</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-6">شهرياً • {plan.sessions_count} حصة</p>

                    {isPremium && (
                      <Badge variant="outline" className="mb-5 border-gold/30 text-gold bg-gold/5 text-xs">
                        وفّر 40% مقارنة بالحصص المفردة
                      </Badge>
                    )}
                    {isPopular && (
                      <Badge variant="outline" className="mb-5 border-secondary/30 text-secondary bg-secondary/5 text-xs">
                        الأفضل قيمة مقابل السعر
                      </Badge>
                    )}

                    <div className="space-y-3 mb-7 text-right">
                      <div className="flex items-center gap-2.5 text-sm">
                        <CheckCircle className="h-4.5 w-4.5 text-secondary shrink-0" />
                        <span className="text-foreground font-semibold">{plan.sessions_count} حصة شهرياً</span>
                      </div>
                      {(plan.features as string[])?.map((f: string, j: number) => (
                        <div key={j} className="flex items-center gap-2.5 text-sm">
                          <CheckCircle className="h-4.5 w-4.5 text-secondary shrink-0" />
                          <span className="text-foreground">{f}</span>
                        </div>
                      ))}
                      {plan.has_ai_tutor && (
                        <div className="flex items-center gap-2.5 text-sm">
                          <Sparkles className={`h-4.5 w-4.5 shrink-0 ${isPremium ? "text-gold" : "text-secondary"}`} />
                          <span className="text-foreground font-semibold">مدرس ذكي AI</span>
                        </div>
                      )}
                      {plan.has_recording && (
                        <div className="flex items-center gap-2.5 text-sm">
                          <CheckCircle className="h-4.5 w-4.5 text-secondary shrink-0" />
                          <span className="text-foreground">تسجيل الحصص</span>
                        </div>
                      )}
                      {plan.has_priority_booking && (
                        <div className="flex items-center gap-2.5 text-sm">
                          <CheckCircle className="h-4.5 w-4.5 text-secondary shrink-0" />
                          <span className="text-foreground">أولوية الحجز</span>
                        </div>
                      )}
                    </div>

                    <Button
                      onClick={() => handleSubscribe(plan)}
                      disabled={checkoutLoading === plan.id}
                      className={`w-full h-12 rounded-xl font-bold text-base transition-all duration-300
                        ${isPopular
                          ? "gradient-cta text-secondary-foreground shadow-button hover:shadow-card-hover hover:scale-[1.02]"
                          : isPremium
                            ? "bg-gold/10 text-gold border-2 border-gold/30 hover:bg-gold/20 hover:scale-[1.02]"
                            : "hover:scale-[1.02]"
                        }
                      `}
                      variant={isPopular ? "default" : "outline"}
                    >
                      {checkoutLoading === plan.id ? (
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          {isFree ? "فعّل الباقة المجانية" : "اشترك الآن"}
                          <ArrowLeft className="h-4 w-4 mr-2 transition-transform group-hover:-translate-x-1" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
        )}

        {/* Comparison Table */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <h2 className="text-2xl font-black text-foreground text-center mb-2">مقارنة تفصيلية</h2>
          <p className="text-muted-foreground text-center mb-8">قارن بين جميع المميزات واختر ما يناسبك</p>
          <Card className="border-0 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-right p-4 font-bold text-foreground w-1/4">الميزة</th>
                    {plans.map(plan => (
                      <th key={plan.id} className="p-4 text-center">
                        <div className="font-black text-foreground">{plan.name_ar}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{plan.price <= 0 ? "مجاناً" : `${plan.price} ر.س/شهر`}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((feature, idx) => (
                    <tr key={feature.key} className={`border-b last:border-0 transition-colors hover:bg-muted/20 ${idx % 2 === 0 ? "bg-muted/5" : ""}`}>
                      <td className="p-4 font-semibold text-foreground">{feature.label}</td>
                      {plans.map(plan => {
                        const value = getFeatureValue(plan, feature.key);
                        return (
                          <td key={plan.id} className="p-4 text-center">
                            {typeof value === "boolean" ? (
                              value ? <CheckCircle className="h-5 w-5 text-secondary mx-auto" /> : <X className="h-5 w-5 text-muted-foreground/30 mx-auto" />
                            ) : (
                              <span className="font-bold text-foreground">{value}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>

        {/* FAQ */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-16">
          <h2 className="text-2xl font-black text-foreground text-center mb-8">أسئلة شائعة</h2>
          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {[
              { q: "هل يمكنني تغيير الباقة لاحقاً؟", a: "نعم، يمكنك ترقية أو تخفيض باقتك في أي وقت. سيتم حساب الفرق تلقائياً." },
              { q: "هل هناك ضمان استرداد؟", a: "نعم، نقدم ضمان استرداد كامل خلال أول 7 أيام من الاشتراك." },
              { q: "ماذا يحدث عند انتهاء الحصص؟", a: "سيتم إشعارك عند اقتراب نفاد الحصص ويمكنك تجديد الباقة أو الترقية." },
              { q: "هل يمكنني استخدام كود خصم؟", a: "نعم، أدخل كود الخصم في حقل البروموكود قبل الاشتراك وسيُطبّق الخصم تلقائياً." },
            ].map((item, i) => (
              <Card key={i} className="border-0 shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-0.5 group">
                <CardContent className="p-5">
                  <h4 className="font-bold text-foreground mb-2 group-hover:text-primary transition-colors">{item.q}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>

        {/* Payment Methods */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="mt-12 text-center">
          <p className="text-sm text-muted-foreground mb-3">طرق الدفع المدعومة</p>
          <div className="flex flex-wrap justify-center gap-3">
            {["Visa", "Mastercard", "مدى", "Apple Pay"].map((method) => (
              <div key={method} className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-lg px-3 py-2 text-xs font-semibold text-foreground">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                {method}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Bottom CTA */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="mt-10 text-center">
          <Card className="border-0 shadow-card overflow-hidden">
            <div className="gradient-hero p-8 md:p-12">
              <h3 className="text-2xl font-black text-primary-foreground mb-3">مستعد لبدء رحلتك التعليمية؟</h3>
              <p className="text-primary-foreground/70 mb-6 max-w-md mx-auto">اختر الباقة المناسبة وابدأ التعلم مع أفضل المدرسين</p>
              <Button className="bg-card text-foreground hover:bg-card/90 rounded-xl h-12 px-8 font-bold shadow-button text-base" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                اختر باقتك الآن
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>

      <Footer />
      <BottomNav />
    </div>
  );
};

export default Pricing;
