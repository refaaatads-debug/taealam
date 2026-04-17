import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Wallet, Clock, Zap, AlertTriangle, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

interface Props {
  subscription: any;
  stripeSubscription: any;
}

export default function SubscriptionBalance({ subscription, stripeSubscription }: Props) {
  const hasSubscription = subscription || stripeSubscription?.subscribed;

  const remainingMinutes = subscription?.remaining_minutes ?? 0;
  const totalMinutes = subscription?.total_hours ? subscription.total_hours * 60 : 0;
  const usedMinutes = Math.max(totalMinutes - remainingMinutes, 0);
  const percentUsed = totalMinutes > 0 ? Math.min((usedMinutes / totalMinutes) * 100, 100) : 0;
  const isExpired = hasSubscription && remainingMinutes <= 0;

  const tierName = stripeSubscription?.tier === "premium" ? "احترافية" : stripeSubscription?.tier === "standard" ? "متقدمة" : stripeSubscription?.tier === "basic" ? "أساسية" : (subscription as any)?.subscription_plans?.name_ar || "نشط";

  const formatMin = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    if (h > 0) return `${h} س ${m} د`;
    return `${m} د`;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-0 shadow-card overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 font-bold flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            رصيد الباقة
            <Link to="/subscription-details" className="text-xs font-semibold text-primary hover:text-primary/80 hover:underline flex items-center gap-1">
              <FileText className="h-3 w-3" />
              تقرير تفصيلي
            </Link>
            {hasSubscription && !isExpired && (
              <Link to="/subscription-details">
                <Badge className="mr-auto bg-secondary/10 text-secondary border-0 text-xs cursor-pointer hover:bg-secondary/20">{tierName} ←</Badge>
              </Link>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isExpired ? (
            <div className="text-center py-6">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-3" />
              <p className="text-lg font-black text-destructive mb-1">انتهت باقتك!</p>
              <p className="text-sm text-muted-foreground mb-4">اشترك من جديد لمواصلة التعلم</p>
              <div className="bg-muted/50 rounded-xl p-3 mb-4">
                <p className="text-xs text-muted-foreground">استخدمت: <span className="font-bold text-foreground">{formatMin(usedMinutes)}</span> من أصل <span className="font-bold text-foreground">{formatMin(totalMinutes)}</span></p>
              </div>
              <Button className="w-full gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                <Link to="/pricing">اشترك الآن <Zap className="mr-1 h-4 w-4" /></Link>
              </Button>
            </div>
          ) : hasSubscription ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-secondary/5 rounded-xl p-4 text-center border border-secondary/10">
                  <Clock className="h-5 w-5 text-secondary mx-auto mb-2" />
                  <p className="text-2xl font-black text-foreground">{formatMin(remainingMinutes)}</p>
                  <p className="text-xs text-muted-foreground">متبقية</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <Zap className="h-5 w-5 text-gold mx-auto mb-2" />
                  <p className="text-2xl font-black text-foreground">{formatMin(usedMinutes)}</p>
                  <p className="text-xs text-muted-foreground">مستخدمة</p>
                </div>
              </div>
              {totalMinutes > 0 && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>الاستخدام</span>
                    <span>{Math.round(percentUsed)}%</span>
                  </div>
                  <Progress value={percentUsed} className="h-2" />
                </div>
              )}
              {stripeSubscription?.subscription_end && (
                <p className="text-xs text-muted-foreground text-center mb-3">
                  تنتهي الباقة: {new Date(stripeSubscription.subscription_end).toLocaleDateString("ar-SA")}
                </p>
              )}
              {remainingMinutes <= 60 && remainingMinutes > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-3">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold text-center">⚠️ رصيدك على وشك الانتهاء!</p>
                </div>
              )}
              {remainingMinutes <= 60 && (
                <Button className="w-full gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                  <Link to="/pricing">تجديد الباقة <Zap className="mr-1 h-4 w-4" /></Link>
                </Button>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <Wallet className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">لا توجد باقة نشطة حالياً</p>
              <Button className="w-full gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                <Link to="/pricing">اشترك الآن <Zap className="mr-1 h-4 w-4" /></Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
