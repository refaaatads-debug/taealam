import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Send, Loader2, Users, GraduationCap, User, Paperclip, X, FileText, Image } from "lucide-react";
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
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUsers();
    fetchSentHistory();
  }, []);

  const fetchSentHistory = async () => {
    // Get distinct admin broadcasts grouped by title+body+created_at (within 1 min)
    const { data } = await supabase
      .from("notifications")
      .select("title, body, type, file_url, file_name, created_at, user_id")
      .eq("type", "admin_broadcast")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!data || data.length === 0) return;

    // Group by title+body+truncated timestamp (same minute = same broadcast)
    const groups = new Map<string, { title: string; body: string; count: number; date: string; hasFile: boolean }>();
    for (const n of data) {
      const key = `${n.title}||${n.body}||${n.created_at?.slice(0, 16)}`;
      if (!groups.has(key)) {
        groups.set(key, {
          title: n.title,
          body: n.body || "",
          count: 0,
          date: new Date(n.created_at).toLocaleString("ar-SA"),
          hasFile: !!n.file_url,
        });
      }
      groups.get(key)!.count++;
    }
    setSentHistory(Array.from(groups.values()));
  };

  const fetchUsers = async () => {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").order("full_name").limit(500),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const roleMap = new Map((roles ?? []).map(r => [r.user_id, r.role]));
    setUsers((profiles ?? []).map(p => ({ ...p, role: roleMap.get(p.user_id) || "student" })));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(selected.type)) {
      toast.error("يُسمح فقط بالصور (PNG, JPG) وملفات PDF");
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      toast.error("الحد الأقصى لحجم الملف 5 ميجا");
      return;
    }
    setFile(selected);
  };

  const uploadFile = async (): Promise<{ url: string; name: string } | null> => {
    if (!file) return null;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `notifications/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("site-assets").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("site-assets").getPublicUrl(path);
      return { url: urlData.publicUrl, name: file.name };
    } catch (e: any) {
      toast.error("فشل رفع الملف: " + (e.message || "خطأ"));
      return null;
    } finally {
      setUploading(false);
    }
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

      // Upload file if exists
      let fileData: { url: string; name: string } | null = null;
      if (file) {
        fileData = await uploadFile();
        if (!fileData) {
          setSending(false);
          return;
        }
      }

      const notifications = targetUsers.map(uid => ({
        user_id: uid,
        title: title.trim(),
        body: body.trim(),
        type: "admin_broadcast",
        file_url: fileData?.url || null,
        file_name: fileData?.name || null,
      }));

      // Insert in batches of 100
      for (let i = 0; i < notifications.length; i += 100) {
        const batch = notifications.slice(i, i + 100);
        const { error } = await supabase.from("notifications").insert(batch as any);
        if (error) throw error;
      }

      setSentHistory(prev => [{
        title: title.trim(),
        body: body.trim(),
        target: targetType === "all" ? "جميع المستخدمين" : targetType === "all_students" ? "جميع الطلاب" : targetType === "all_teachers" ? "جميع المعلمين" : users.find(u => u.user_id === specificUserId)?.full_name || "مستخدم",
        count: targetUsers.length,
        date: new Date().toLocaleString("ar-SA"),
        hasFile: !!fileData,
      }, ...prev]);

      toast.success(`تم إرسال الإشعار إلى ${targetUsers.length} مستخدم`);
      setTitle("");
      setBody("");
      setFile(null);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setSending(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isImage = file?.type.startsWith("image/");

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
                  <SelectItem value="all">
                    <span className="flex items-center gap-2"><Users className="h-4 w-4" /> جميع المستخدمين</span>
                  </SelectItem>
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

            {/* File attachment */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">مرفق (اختياري)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              {file ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {isImage ? <Image className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full rounded-xl border-dashed gap-2 text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                  إرفاق صورة أو ملف PDF
                </Button>
              )}
            </div>

            <Button
              onClick={sendNotification}
              disabled={loading || uploading || !title.trim() || !body.trim()}
              className="w-full gradient-cta text-secondary-foreground rounded-xl shadow-button gap-2"
            >
              {loading || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {uploading ? "جاري رفع الملف..." : "إرسال الإشعار"}
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
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-primary">📤 {h.target} • {h.count} مستخدم</p>
                    {h.hasFile && <span className="text-[10px] text-muted-foreground">📎 مرفق</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}