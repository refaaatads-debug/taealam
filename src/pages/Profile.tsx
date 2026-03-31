import { useState } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Users, Camera, Bell, Lock, Globe, Shield, LogOut, ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";

const Profile = () => {
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="min-h-screen bg-muted/30 pb-16 md:pb-0">
      <Navbar />
      <div className="container py-8 max-w-2xl">
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-black text-foreground mb-8">الملف الشخصي</motion.h1>

        {/* Avatar */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="border-0 shadow-card mb-6 overflow-hidden">
            <div className="h-20 gradient-hero" />
            <CardContent className="p-6 flex flex-col items-center -mt-10">
              <div className="relative mb-4">
                <div className="w-20 h-20 rounded-2xl gradient-hero flex items-center justify-center border-4 border-card">
                  <Users className="h-10 w-10 text-primary-foreground/80" />
                </div>
                <button className="absolute bottom-0 left-0 w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-secondary-foreground shadow-button">
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <h2 className="font-black text-lg text-foreground">أحمد محمد</h2>
              <p className="text-sm text-muted-foreground">ahmed@example.com</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Personal Info */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-0 shadow-card mb-6">
            <CardHeader>
              <CardTitle className="text-lg font-bold">البيانات الشخصية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-bold text-muted-foreground">الاسم الأول</Label>
                  <Input defaultValue="أحمد" className="mt-1.5 text-right rounded-xl bg-muted/30 border-border/50" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-muted-foreground">الاسم الأخير</Label>
                  <Input defaultValue="محمد" className="mt-1.5 text-right rounded-xl bg-muted/30 border-border/50" />
                </div>
              </div>
              <div>
                <Label className="text-xs font-bold text-muted-foreground">البريد الإلكتروني</Label>
                <Input defaultValue="ahmed@example.com" className="mt-1.5 text-right rounded-xl bg-muted/30 border-border/50" />
              </div>
              <div>
                <Label className="text-xs font-bold text-muted-foreground">رقم الجوال</Label>
                <Input defaultValue="050 123 4567" className="mt-1.5 text-right rounded-xl bg-muted/30 border-border/50" dir="ltr" />
              </div>
              <Button className="gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold">حفظ التغييرات</Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Settings */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg font-bold">إعدادات الحساب</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {[
                { icon: Bell, title: "الإشعارات", desc: "تلقي إشعارات الحصص والتحديثات", toggle: true },
                { icon: Globe, title: "اللغة", desc: "العربية", action: "تغيير" },
                { icon: Lock, title: "كلمة المرور", desc: "آخر تغيير منذ 30 يوم", action: "تغيير" },
                { icon: Shield, title: "الخصوصية", desc: "إدارة إعدادات الخصوصية", action: "إدارة" },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                      <item.icon className="h-4.5 w-4.5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                  {item.toggle ? (
                    <Switch checked={notifications} onCheckedChange={setNotifications} />
                  ) : (
                    <Button variant="ghost" size="sm" className="rounded-lg text-xs text-muted-foreground">
                      {item.action} <ChevronLeft className="h-3 w-3 mr-1" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="pt-4 mt-2 border-t space-y-2">
                <Button variant="outline" className="w-full rounded-xl gap-2 text-muted-foreground">
                  <LogOut className="h-4 w-4" /> تسجيل الخروج
                </Button>
                <Button variant="ghost" className="w-full rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10">حذف الحساب</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Profile;
