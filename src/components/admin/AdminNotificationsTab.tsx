import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Send, Loader2, Users, GraduationCap, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AdminNotificationsTab() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState<"all" | "all_students" | "all_teachers" | "specific">("all_students");
  const [specificUserId, setSpecificUserId] = useState("");
  const [loading, setSending] = useState(false);
  const [users, setUsers] = useState<{ user_id: string; full_name: string; role: string }[]>([]);
  const [sentHistory, setSentHistory] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").order("full_name").limit(500),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const roleMap = new Map((roles ?? []).map(r => [r.user_id, r.role]));
    setUsers((profiles ?? []).map(p => ({ ...p, role: roleMap.get(p.user_id) || "student" })));
  };

  const sendNotification = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("يرجى كتابة العنوان والمحتوى");
      return;
    }

    setSending(true);
    try {
      let targetUsers: string[] = [];

      if (targetType === "specific") {
        if (!specificUserId) {
          toast.error("يرجى اختيار المستخدم");
          setSending(false);
          return;
        }
        targetUsers = [specificUserId];
      } else if (targetType === "all") {
        const { data: allProfiles } = await supabase.from("profiles").select("user_id");
        targetUsers = (allProfiles ?? []).map(p => p.user_id);
      } else {
        const targetRole = targetType === "all_students" ? "student" : "teacher";
        const { data: roleData } = await supabase.from("user_roles").select("user_id").eq("role", targetRole);
        targetUsers = (roleData ?? []).map(r => r.user_id);
      }

      if (targetUsers.length === 0) {
        toast.error("لا يوجد مستخدمين في هذه الفئة");
        setSending(false);
        return;
      }

      const notifications = targetUsers.map(uid => ({
        user_id: uid,
        title: title.trim(),
        body: body.trim(),
        type: "admin_broadcast",
      }));

      // Insert in batches of 100
      for (let i = 0; i < notifications.length; i += 100) {
        const batch = notifications.slice(i, i + 100);
        await supabase.from("notifications").insert(batch);
      }

      setSentHistory(prev => [{
        title: title.trim(),
        body: body.trim(),
        target: targetType === "all" ? "جميع المستخدمين" : targetType === "all_students" ? "جميع الطلاب" : targetType === "all_teachers" ? "جميع المعلمين" : users.find(u => u.user_id === specificUserId)?.full_name || "مستخدم",
        count: targetUsers.length,
        date: new Date().toLocaleString("ar-SA"),
      }, ...prev]);

      toast.success(`تم إرسال الإشعار إلى ${targetUsers.length} مستخدم`);
      setTitle("");
      setBody("");
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setSending(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            إرسال إشعارات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">الفئة المستهدفة</label>
              <Select value={targetType} onValueChange={(v: any) => setTargetType(v)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_students">
                    <span className="flex items-center gap-2"><Users className="h-4 w-4" /> جميع الطلاب</span>
                  </SelectItem>
                  <SelectItem value="all_teachers">
                    <span className="flex items-center gap-2"><GraduationCap className="h-4 w-4" /> جميع المعلمين</span>
                  </SelectItem>
                  <SelectItem value="specific">
                    <span className="flex items-center gap-2"><User className="h-4 w-4" /> مستخدم محدد</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {targetType === "specific" && (
              <div className="space-y-2">
                <Input
                  placeholder="ابحث بالاسم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl"
                />
                <Select value={specificUserId} onValueChange={setSpecificUserId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="اختر المستخدم" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredUsers.slice(0, 50).map(u => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.full_name} ({u.role === "teacher" ? "معلم" : u.role === "admin" ? "مسؤول" : "طالب"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">عنوان الإشعار</label>
              <Input
                placeholder="عنوان الإشعار..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">محتوى الإشعار</label>
              <Textarea
                placeholder="اكتب محتوى الإشعار..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[100px] rounded-xl resize-none"
              />
            </div>

            <Button
              onClick={sendNotification}
              disabled={loading || !title.trim() || !body.trim()}
              className="w-full gradient-cta text-secondary-foreground rounded-xl shadow-button gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              إرسال الإشعار
            </Button>
          </div>
        </CardContent>
      </Card>

      {sentHistory.length > 0 && (
        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="text-base font-bold">سجل الإشعارات المرسلة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sentHistory.map((h, i) => (
                <div key={i} className="p-3 rounded-xl bg-muted/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-sm text-foreground">{h.title}</p>
                    <span className="text-[10px] text-muted-foreground">{h.date}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{h.body}</p>
                  <p className="text-[10px] text-primary">📤 {h.target} • {h.count} مستخدم</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
