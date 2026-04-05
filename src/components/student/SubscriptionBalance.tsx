import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, Clock, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

interface Props {
  subscription: any;
  stripeSubscription: any;
}

export default function SubscriptionBalance({ subscription, stripeSubscription }: Props) {
  if (!subscription && !stripeSubscription?.subscribed) return null;

  const sessionsRemaining = subscription?.sessions_remaining ?? 0;
  const hoursRemaining = Math.round(sessionsRemaining * 0.75 * 10) / 10; // 45 min per session
  const tierName = stripeSubscription?.tier === "premium" ? "احترافية" : stripeSubscription?.tier === "standard" ? "متقدمة" : stripeSubscription?.tier === "basic" ? "أساسية" : (subscription as any)?.subscription_plans?.name_ar || "نشط";

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-0 shadow-card overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 font-bold">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            رصيد الباقة
            <Badge className="mr-auto bg-secondary/10 text-secondary border-0 text-xs">{tierName}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-muted/50 rounded-xl p-4 text-center">
              <Clock className="h-5 w-5 text-secondary mx-auto mb-2" />
              <p className="text-2xl font-black text-foreground">{sessionsRemaining}</p>
              <p className="text-xs text-muted-foreground">حصة متبقية</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-4 text-center">
              <Zap className="h-5 w-5 text-gold mx-auto mb-2" />
              <p className="text-2xl font-black text-foreground">{hoursRemaining}</p>
              <p className="text-xs text-muted-foreground">ساعة متبقية</p>
            </div>
          </div>
          {stripeSubscription?.subscription_end && (
            <p className="text-xs text-muted-foreground text-center mb-3">
              تنتهي الباقة: {new Date(stripeSubscription.subscription_end).toLocaleDateString("ar-SA")}
            </p>
          )}
          {sessionsRemaining <= 2 && (
            <Button className="w-full gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
              <Link to="/pricing">تجديد الباقة <Zap className="mr-1 h-4 w-4" /></Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
