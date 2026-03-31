import { useState } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Clock, CreditCard, CheckCircle, Users, Star, ArrowRight, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";

const timeSlots = ["3:00 م", "4:00 م", "5:00 م", "6:00 م", "7:00 م", "8:00 م"];
const days = [
  { label: "الأحد", date: "24" },
  { label: "الاثنين", date: "25" },
  { label: "الثلاثاء", date: "26" },
  { label: "الأربعاء", date: "27" },
  { label: "الخميس", date: "28" },
];

const Booking = () => {
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  return (
    <div className="min-h-screen bg-muted/30">
      <Navbar />
      <div className="container py-8 max-w-3xl">
        {/* Steps */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {["اختر الموعد", "الدفع", "تأكيد"].map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: step >= i + 1 ? 1 : 0.8 }} className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black transition-all duration-300 ${step > i + 1 ? "bg-secondary text-secondary-foreground" : step === i + 1 ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground"}`}>
                {step > i + 1 ? <CheckCircle className="h-4.5 w-4.5" /> : i + 1}
              </motion.div>
              <span className={`text-sm hidden sm:block mx-1 ${step === i + 1 ? "font-bold text-foreground" : "text-muted-foreground"}`}>{s}</span>
              {i < 2 && <div className={`w-10 h-0.5 rounded-full transition-colors ${step > i + 1 ? "bg-secondary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* Teacher Info */}
        <Card className="border-0 shadow-card mb-6 overflow-hidden">
          <div className="h-2 gradient-cta" />
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center">
              <Users className="h-7 w-7 text-primary-foreground/80" />
            </div>
            <div className="flex-1">
              <h3 className="font-black text-foreground">أ. سارة المحمدي</h3>
              <p className="text-sm text-muted-foreground">رياضيات • <Star className="h-3.5 w-3.5 inline fill-gold text-gold" /> 4.9 • <Shield className="h-3.5 w-3.5 inline text-secondary" /> معتمد</p>
            </div>
            <span className="text-xl font-black text-primary">80 <span className="text-xs text-muted-foreground font-normal">ر.س/ساعة</span></span>
          </CardContent>
        </Card>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Card className="border-0 shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 font-bold">
                    <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                      <CalendarCheck className="h-4 w-4 text-secondary" />
                    </div>
                    اختر الموعد المناسب
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Days */}
                  <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                    {days.map((d, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedDay(i)}
                        className={`flex flex-col items-center px-5 py-3 rounded-2xl text-sm font-medium whitespace-nowrap transition-all duration-200 min-w-[80px] ${selectedDay === i ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                      >
                        <span className="text-xs opacity-80">{d.label}</span>
                        <span className="text-lg font-black">{d.date}</span>
                      </button>
                    ))}
                  </div>
                  {/* Time Slots */}
                  <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2 font-medium"><Clock className="h-4 w-4" /> الأوقات المتاحة</p>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {timeSlots.map((t) => (
                      <button
                        key={t}
                        onClick={() => setSelectedTime(t)}
                        className={`py-3.5 rounded-xl text-sm font-bold transition-all duration-200 ${selectedTime === t ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <Button
                    className="w-full h-12 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold text-base"
                    disabled={!selectedTime}
                    onClick={() => setStep(2)}
                  >
                    متابعة للدفع
                    <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Card className="border-0 shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 font-bold">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CreditCard className="h-4 w-4 text-primary" />
                    </div>
                    طريقة الدفع
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted/50 p-5 rounded-2xl text-sm">
                    <div className="flex justify-between mb-2">
                      <span className="text-muted-foreground">اليوم</span>
                      <span className="text-foreground font-bold">{days[selectedDay].label}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-muted-foreground">الوقت</span>
                      <span className="text-foreground font-bold">{selectedTime}</span>
                    </div>
                    <div className="flex justify-between border-t pt-3 mt-3">
                      <span className="font-bold text-foreground">المجموع</span>
                      <span className="font-black text-primary text-lg">80 ر.س</span>
                    </div>
                  </div>

                  {[
                    { name: "مدى", type: "بطاقة بنكية", icon: "💳" },
                    { name: "Apple Pay", type: "محفظة رقمية", icon: "" },
                    { name: "STC Pay", type: "محفظة رقمية", icon: "📱" },
                  ].map((m) => (
                    <button key={m.name} className="w-full p-4 rounded-2xl border-2 border-border hover:border-secondary transition-all duration-200 text-right flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{m.icon}</span>
                        <span className="font-bold text-foreground">{m.name}</span>
                      </div>
                      <Badge variant="outline" className="rounded-lg">{m.type}</Badge>
                    </button>
                  ))}

                  <Button className="w-full h-12 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold text-base" onClick={() => setStep(3)}>
                    ادفع 80 ر.س
                  </Button>
                  <Button variant="ghost" className="w-full rounded-xl" onClick={() => setStep(1)}>رجوع</Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <Card className="border-0 shadow-card text-center">
                <CardContent className="py-14 px-6">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 15 }} className="w-20 h-20 rounded-2xl bg-secondary/10 mx-auto mb-6 flex items-center justify-center">
                    <CheckCircle className="h-10 w-10 text-secondary" />
                  </motion.div>
                  <h2 className="text-2xl font-black text-foreground mb-2">تم الحجز بنجاح! 🎉</h2>
                  <p className="text-muted-foreground mb-1">حصة رياضيات مع أ. سارة المحمدي</p>
                  <p className="text-sm text-muted-foreground mb-1">{days[selectedDay].label} • {selectedTime}</p>
                  <p className="text-xs text-muted-foreground mb-8">ستصلك رسالة تأكيد على جوالك</p>
                  <div className="flex gap-3 justify-center">
                    <Button className="gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                      <Link to="/student">الذهاب للوحة التحكم</Link>
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => { setStep(1); setSelectedTime(null); }}>حجز حصة أخرى</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Booking;
