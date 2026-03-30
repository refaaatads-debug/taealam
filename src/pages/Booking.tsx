import { useState } from "react";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Clock, CreditCard, CheckCircle, Users, Star } from "lucide-react";

const timeSlots = ["3:00 م", "4:00 م", "5:00 م", "6:00 م", "7:00 م", "8:00 م"];
const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

const Booking = () => {
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  return (
    <div className="min-h-screen bg-muted/30">
      <Navbar />
      <div className="container py-8 max-w-3xl">
        {/* Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {["اختر الموعد", "الدفع", "تأكيد"].map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step > i + 1 ? "bg-secondary text-secondary-foreground" : step === i + 1 ? "gradient-cta text-secondary-foreground" : "bg-muted text-muted-foreground"}`}>
                {step > i + 1 ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-sm hidden sm:block ${step === i + 1 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{s}</span>
              {i < 2 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Teacher Info */}
        <Card className="border-0 shadow-card mb-6">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
              <Users className="h-7 w-7 text-accent-foreground" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">أ. سارة المحمدي</h3>
              <p className="text-sm text-muted-foreground">رياضيات • <Star className="h-3.5 w-3.5 inline fill-yellow-400 text-yellow-400" /> 4.9</p>
            </div>
            <span className="mr-auto text-lg font-bold text-secondary">80 ر.س<span className="text-xs text-muted-foreground font-normal">/ساعة</span></span>
          </CardContent>
        </Card>

        {step === 1 && (
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-secondary" />
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
                    className={`px-5 py-3 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${selectedDay === i ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {/* Time Slots */}
              <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2"><Clock className="h-4 w-4" /> الأوقات المتاحة</p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {timeSlots.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTime(t)}
                    className={`py-3 rounded-xl text-sm font-medium transition-all ${selectedTime === t ? "gradient-cta text-secondary-foreground shadow-button" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <Button
                className="w-full h-12 gradient-cta shadow-button text-secondary-foreground"
                disabled={!selectedTime}
                onClick={() => setStep(2)}
              >
                متابعة للدفع
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-secondary" />
                طريقة الدفع
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-xl text-sm">
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">اليوم</span>
                  <span className="text-foreground font-medium">{days[selectedDay]}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">الوقت</span>
                  <span className="text-foreground font-medium">{selectedTime}</span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="font-semibold text-foreground">المجموع</span>
                  <span className="font-bold text-secondary">80 ر.س</span>
                </div>
              </div>

              {["مدى", "Apple Pay", "STC Pay"].map((m) => (
                <button key={m} className="w-full p-4 rounded-xl border-2 border-border hover:border-secondary transition-colors text-right flex items-center justify-between">
                  <span className="font-medium text-foreground">{m}</span>
                  <Badge variant="outline">{m === "مدى" ? "بطاقة بنكية" : "محفظة رقمية"}</Badge>
                </button>
              ))}

              <Button className="w-full h-12 gradient-cta shadow-button text-secondary-foreground" onClick={() => setStep(3)}>
                ادفع 80 ر.س
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep(1)}>رجوع</Button>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card className="border-0 shadow-card text-center">
            <CardContent className="py-12 px-6">
              <div className="w-20 h-20 rounded-full bg-accent mx-auto mb-6 flex items-center justify-center animate-scale-in">
                <CheckCircle className="h-10 w-10 text-secondary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">تم الحجز بنجاح! 🎉</h2>
              <p className="text-muted-foreground mb-1">حصة رياضيات مع أ. سارة المحمدي</p>
              <p className="text-sm text-muted-foreground mb-6">{days[selectedDay]} • {selectedTime}</p>
              <div className="flex gap-3 justify-center">
                <Button className="gradient-cta text-secondary-foreground">الذهاب للوحة التحكم</Button>
                <Button variant="outline">حجز حصة أخرى</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Booking;
