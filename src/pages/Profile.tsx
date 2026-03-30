import { useState } from "react";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Users, Camera, Bell, Lock, Globe } from "lucide-react";

const Profile = () => {
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="min-h-screen bg-muted/30">
      <Navbar />
      <div className="container py-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-foreground mb-8">الملف الشخصي</h1>

        {/* Avatar */}
        <Card className="border-0 shadow-card mb-6">
          <CardContent className="p-6 flex flex-col items-center">
            <div className="relative mb-4">
              <div className="w-24 h-24 rounded-full bg-accent flex items-center justify-center">
                <Users className="h-12 w-12 text-accent-foreground" />
              </div>
              <button className="absolute bottom-0 left-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground">
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <h2 className="font-bold text-lg text-foreground">أحمد محمد</h2>
            <p className="text-sm text-muted-foreground">ahmed@example.com</p>
          </CardContent>
        </Card>

        {/* Personal Info */}
        <Card className="border-0 shadow-card mb-6">
          <CardHeader>
            <CardTitle className="text-lg">البيانات الشخصية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>الاسم الأول</Label>
                <Input defaultValue="أحمد" className="mt-1.5 text-right" />
              </div>
              <div>
                <Label>الاسم الأخير</Label>
                <Input defaultValue="محمد" className="mt-1.5 text-right" />
              </div>
            </div>
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input defaultValue="ahmed@example.com" className="mt-1.5 text-right" />
            </div>
            <div>
              <Label>رقم الجوال</Label>
              <Input defaultValue="050 123 4567" className="mt-1.5 text-right" dir="ltr" />
            </div>
            <Button className="gradient-cta shadow-button text-secondary-foreground">حفظ التغييرات</Button>
          </CardContent>
        </Card>

        {/* Settings */}
        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">إعدادات الحساب</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">الإشعارات</p>
                  <p className="text-xs text-muted-foreground">تلقي إشعارات الحصص والتحديثات</p>
                </div>
              </div>
              <Switch checked={notifications} onCheckedChange={setNotifications} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">اللغة</p>
                  <p className="text-xs text-muted-foreground">العربية</p>
                </div>
              </div>
              <Button variant="outline" size="sm">تغيير</Button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">كلمة المرور</p>
                  <p className="text-xs text-muted-foreground">آخر تغيير منذ 30 يوم</p>
                </div>
              </div>
              <Button variant="outline" size="sm">تغيير</Button>
            </div>
            <div className="pt-4 border-t">
              <Button variant="destructive" className="w-full">حذف الحساب</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
