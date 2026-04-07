import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Users, Search, Trash2, Eye, Edit, BookOpen, Clock, Star,
  GraduationCap, Award, Package, Save, X, Phone, User, Calendar,
  Shield, DollarSign, AlertTriangle
} from "lucide-react";
import ExportCSVButton from "./ExportCSVButton";
import StatusFilter from "./StatusFilter";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  level: string | null;
  referral_code: string | null;
  free_trial_used: boolean | null;
  created_at: string;
  updated_at: string;
}

interface UserDetail extends UserProfile {
  role: string;
  // Student data
  points?: number;
  streak?: number;
  badges?: { name_ar: string; icon: string | null }[];
  subscriptions?: { plan_name: string; sessions_remaining: number; is_active: boolean; ends_at: string }[];
  bookingsAsStudent?: number;
  // Teacher data
  teacherProfile?: {
    id: string;
    bio: string | null;
    hourly_rate: number;
    years_experience: number | null;
    avg_rating: number;
    total_reviews: number;
    total_sessions: number;
    is_approved: boolean;
    is_verified: boolean;
    available_days: string[] | null;
    available_from: string | null;
    available_to: string | null;
  };
  subjects?: string[];
  bookingsAsTeacher?: number;
  // Warnings
  warnings?: { warning_type: string; description: string | null; created_at: string; warning_count: number }[];
}

export default function UserManagementTab() {
  const { user: currentUser } = useAuth();
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userRolesMap, setUserRolesMap] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ full_name: "", phone: "", level: "" });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const [usersRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setAllUsers(usersRes.data ?? []);
    const rMap = new Map((rolesRes.data ?? []).map(r => [r.user_id, r.role]));
    setUserRolesMap(rMap);
    setLoading(false);
  };

  const fetchUserDetail = async (profile: UserProfile) => {
    setDetailLoading(true);
    const role = userRolesMap.get(profile.user_id) || "student";
    const detail: UserDetail = { ...profile, role };

    try {
      // Parallel fetches based on role
      const promises: Promise<any>[] = [
        supabase.from("student_points").select("total_points, streak_days").eq("user_id", profile.user_id).maybeSingle(),
        supabase.from("student_badges").select("badge_id, badges(name_ar, icon)").eq("user_id", profile.user_id),
        supabase.from("user_subscriptions").select("sessions_remaining, is_active, ends_at, subscription_plans(name_ar)").eq("user_id", profile.user_id).order("created_at", { ascending: false }),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("student_id", profile.user_id),
        (supabase as any).from("user_warnings").select("warning_type, description, created_at, warning_count").eq("user_id", profile.user_id).order("created_at", { ascending: false }),
      ];

      if (role === "teacher") {
        promises.push(
          supabase.from("teacher_profiles").select("*").eq("user_id", profile.user_id).maybeSingle(),
          supabase.from("bookings").select("id", { count: "exact", head: true }).eq("teacher_id", profile.user_id),
        );
      }

      const results = await Promise.all(promises);
      const [pointsRes, badgesRes, subsRes, studentBookingsRes, warningsRes] = results;

      detail.points = pointsRes.data?.total_points || 0;
      detail.streak = pointsRes.data?.streak_days || 0;
      detail.badges = (badgesRes.data ?? []).map((b: any) => ({
        name_ar: b.badges?.name_ar || "",
        icon: b.badges?.icon || null,
      }));
      detail.subscriptions = (subsRes.data ?? []).map((s: any) => ({
        plan_name: s.subscription_plans?.name_ar || "—",
        sessions_remaining: s.sessions_remaining,
        is_active: s.is_active,
        ends_at: s.ends_at,
      }));
      detail.bookingsAsStudent = studentBookingsRes.count ?? 0;
      detail.warnings = warningsRes.data ?? [];

      if (role === "teacher" && results[5]) {
        const tpRes = results[5];
        if (tpRes.data) {
          detail.teacherProfile = tpRes.data;
          // Fetch subjects
          const { data: tsData } = await supabase
            .from("teacher_subjects")
            .select("subjects(name)")
            .eq("teacher_id", tpRes.data.id);
          detail.subjects = (tsData ?? []).map((s: any) => s.subjects?.name || "");
        }
        detail.bookingsAsTeacher = results[6]?.count ?? 0;
      }

      setSelectedUser(detail);
      setEditData({
        full_name: detail.full_name || "",
        phone: detail.phone || "",
        level: detail.level || "bronze",
      });
    } catch (e) {
      console.error(e);
      toast.error("حدث خطأ في تحميل البيانات");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveUserEdit = async () => {
    if (!selectedUser) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editData.full_name,
        phone: editData.phone,
        level: editData.level,
      })
      .eq("user_id", selectedUser.user_id);

    if (error) {
      toast.error("حدث خطأ في الحفظ");
      return;
    }
    toast.success("تم تحديث بيانات المستخدم");
    setAllUsers(prev => prev.map(u =>
      u.user_id === selectedUser.user_id
        ? { ...u, full_name: editData.full_name, phone: editData.phone, level: editData.level }
        : u
    ));
    setSelectedUser(prev => prev ? { ...prev, full_name: editData.full_name, phone: editData.phone, level: editData.level } : null);
    setEditMode(false);
  };

  const changeUserRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", userId);
    if (error) { toast.error("حدث خطأ في تغيير الدور"); return; }
    setUserRolesMap(prev => new Map(prev).set(userId, newRole));
    if (newRole === "teacher") {
      await supabase.from("teacher_profiles").upsert({ user_id: userId, hourly_rate: 0, is_approved: true }, { onConflict: "user_id" });
    }
    if (selectedUser?.user_id === userId) {
      setSelectedUser(prev => prev ? { ...prev, role: newRole } : null);
    }
    toast.success("تم تغيير الدور بنجاح");
  };

  const deleteUser = async (userId: string) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("teacher_profiles").delete().eq("user_id", userId);
    await supabase.from("profiles").delete().eq("user_id", userId);
    setAllUsers(prev => prev.filter(u => u.user_id !== userId));
    if (selectedUser?.user_id === userId) setSelectedUser(null);
    toast.success("تم حذف بيانات المستخدم");
  };

  const roleLabel = (r: string) => {
    switch (r) {
      case "admin": return "مسؤول";
      case "teacher": return "معلم";
      case "parent": return "ولي أمر";
      default: return "طالب";
    }
  };

  const filteredUsers = allUsers.filter(u => {
    const matchSearch = u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.phone?.includes(searchQuery);
    const role = userRolesMap.get(u.user_id) || "student";
    const matchRole = roleFilter === "all" || role === roleFilter;
    return matchSearch && matchRole;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Card className="border-0 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              إدارة المستخدمين ({filteredUsers.length})
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-56">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو الرقم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10 rounded-xl h-8 text-xs"
                />
              </div>
              <StatusFilter
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  { value: "student", label: "طالب" },
                  { value: "teacher", label: "معلم" },
                  { value: "admin", label: "مسؤول" },
                  { value: "parent", label: "ولي أمر" },
                ]}
                placeholder="جميع الأدوار"
              />
              <ExportCSVButton
                data={filteredUsers.map(u => ({
                  name: u.full_name || "",
                  phone: u.phone || "",
                  role: roleLabel(userRolesMap.get(u.user_id) || "student"),
                  level: u.level || "bronze",
                  date: new Date(u.created_at).toLocaleDateString("ar-SA"),
                }))}
                headers={[
                  { key: "name", label: "الاسم" },
                  { key: "phone", label: "الهاتف" },
                  { key: "role", label: "الدور" },
                  { key: "level", label: "المستوى" },
                  { key: "date", label: "التسجيل" },
                ]}
                filename="المستخدمين"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-right pb-3 font-medium">الاسم</th>
                  <th className="text-right pb-3 font-medium">الهاتف</th>
                  <th className="text-right pb-3 font-medium">الدور</th>
                  <th className="text-right pb-3 font-medium">المستوى</th>
                  <th className="text-right pb-3 font-medium">التسجيل</th>
                  <th className="text-right pb-3 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredUsers.map((u) => {
                  const userRole = userRolesMap.get(u.user_id) || "student";
                  const isCurrentUser = u.user_id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="py-3 font-medium text-foreground">{u.full_name || "—"}</td>
                      <td className="py-3 text-muted-foreground" dir="ltr">{u.phone || "—"}</td>
                      <td className="py-3">
                        <Badge variant={userRole === "admin" ? "default" : userRole === "teacher" ? "secondary" : "outline"} className="text-xs">
                          {roleLabel(userRole)}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-xs">{u.level || "bronze"}</Badge>
                      </td>
                      <td className="py-3 text-muted-foreground text-xs">{new Date(u.created_at).toLocaleDateString("ar-SA")}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => fetchUserDetail(u)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!isCurrentUser && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                if (window.confirm(`هل أنت متأكد من حذف بيانات ${u.full_name}؟`)) {
                                  deleteUser(u.user_id);
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* User Detail Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => { if (!open) { setSelectedUser(null); setEditMode(false); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          {detailLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : selectedUser && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    بيانات المستخدم
                  </span>
                  <div className="flex items-center gap-2">
                    {!editMode ? (
                      <Button size="sm" variant="outline" className="rounded-lg text-xs h-8 gap-1" onClick={() => setEditMode(true)}>
                        <Edit className="h-3.5 w-3.5" /> تعديل
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" className="rounded-lg text-xs h-8 gap-1" onClick={saveUserEdit}>
                          <Save className="h-3.5 w-3.5" /> حفظ
                        </Button>
                        <Button size="sm" variant="ghost" className="rounded-lg text-xs h-8 gap-1" onClick={() => setEditMode(false)}>
                          <X className="h-3.5 w-3.5" /> إلغاء
                        </Button>
                      </>
                    )}
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5 mt-2">
                {/* Basic Info */}
                <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                  <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                    <User className="h-4 w-4 text-primary" /> المعلومات الأساسية
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">الاسم</Label>
                      {editMode ? (
                        <Input value={editData.full_name} onChange={e => setEditData(p => ({ ...p, full_name: e.target.value }))} className="h-9 rounded-lg text-sm mt-1" />
                      ) : (
                        <p className="text-sm font-medium text-foreground mt-1">{selectedUser.full_name || "—"}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">الهاتف</Label>
                      {editMode ? (
                        <Input value={editData.phone} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} className="h-9 rounded-lg text-sm mt-1" dir="ltr" />
                      ) : (
                        <p className="text-sm font-medium text-foreground mt-1" dir="ltr">{selectedUser.phone || "—"}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">الدور</Label>
                      <div className="mt-1">
                        <Select
                          value={selectedUser.role}
                          onValueChange={(val) => changeUserRole(selectedUser.user_id, val)}
                          disabled={selectedUser.user_id === currentUser?.id}
                        >
                          <SelectTrigger className="h-9 w-full text-sm rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="student">طالب</SelectItem>
                            <SelectItem value="teacher">معلم</SelectItem>
                            <SelectItem value="parent">ولي أمر</SelectItem>
                            <SelectItem value="admin">مسؤول</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">المستوى</Label>
                      {editMode ? (
                        <Select value={editData.level} onValueChange={val => setEditData(p => ({ ...p, level: val }))}>
                          <SelectTrigger className="h-9 w-full text-sm rounded-lg mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bronze">برونزي</SelectItem>
                            <SelectItem value="silver">فضي</SelectItem>
                            <SelectItem value="gold">ذهبي</SelectItem>
                            <SelectItem value="platinum">بلاتيني</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm font-medium text-foreground mt-1">{selectedUser.level || "bronze"}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">تاريخ التسجيل</Label>
                      <p className="text-sm text-foreground mt-1">{new Date(selectedUser.created_at).toLocaleDateString("ar-SA")}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">كود الإحالة</Label>
                      <p className="text-sm text-foreground mt-1">{selectedUser.referral_code || "—"}</p>
                    </div>
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-muted/40 rounded-xl p-3 text-center">
                    <Award className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
                    <p className="text-lg font-black text-foreground">{selectedUser.points || 0}</p>
                    <p className="text-[10px] text-muted-foreground">النقاط</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3 text-center">
                    <Calendar className="h-4 w-4 mx-auto mb-1 text-primary" />
                    <p className="text-lg font-black text-foreground">{selectedUser.streak || 0}</p>
                    <p className="text-[10px] text-muted-foreground">أيام متتالية</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3 text-center">
                    <BookOpen className="h-4 w-4 mx-auto mb-1 text-secondary" />
                    <p className="text-lg font-black text-foreground">{selectedUser.bookingsAsStudent || 0}</p>
                    <p className="text-[10px] text-muted-foreground">حجوزات كطالب</p>
                  </div>
                  {selectedUser.role === "teacher" && (
                    <div className="bg-muted/40 rounded-xl p-3 text-center">
                      <GraduationCap className="h-4 w-4 mx-auto mb-1 text-green-600" />
                      <p className="text-lg font-black text-foreground">{selectedUser.bookingsAsTeacher || 0}</p>
                      <p className="text-[10px] text-muted-foreground">حجوزات كمعلم</p>
                    </div>
                  )}
                </div>

                {/* Subscriptions */}
                {selectedUser.subscriptions && selectedUser.subscriptions.length > 0 && (
                  <div className="bg-muted/30 rounded-xl p-4">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                      <Package className="h-4 w-4 text-primary" /> الاشتراكات
                    </h3>
                    <div className="space-y-2">
                      {selectedUser.subscriptions.map((sub, i) => (
                        <div key={i} className="flex items-center justify-between bg-background/60 rounded-lg p-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{sub.plan_name}</p>
                            <p className="text-xs text-muted-foreground">
                              ينتهي: {new Date(sub.ends_at).toLocaleDateString("ar-SA")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={sub.is_active ? "default" : "outline"} className="text-xs">
                              {sub.is_active ? "نشط" : "منتهي"}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {sub.sessions_remaining} حصة متبقية
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Teacher Info */}
                {selectedUser.teacherProfile && (
                  <div className="bg-muted/30 rounded-xl p-4">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                      <GraduationCap className="h-4 w-4 text-secondary" /> بيانات المعلم
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">السعر/ساعة</span>
                        <p className="font-medium text-foreground">{selectedUser.teacherProfile.hourly_rate} ر.س</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">سنوات الخبرة</span>
                        <p className="font-medium text-foreground">{selectedUser.teacherProfile.years_experience || 0}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">التقييم</span>
                        <p className="font-medium text-foreground flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-500" />
                          {Number(selectedUser.teacherProfile.avg_rating).toFixed(1)} ({selectedUser.teacherProfile.total_reviews})
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">الحصص المكتملة</span>
                        <p className="font-medium text-foreground">{selectedUser.teacherProfile.total_sessions || 0}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">الحالة</span>
                        <div className="flex gap-1 mt-0.5">
                          <Badge variant={selectedUser.teacherProfile.is_approved ? "default" : "destructive"} className="text-[10px]">
                            {selectedUser.teacherProfile.is_approved ? "معتمد" : "غير معتمد"}
                          </Badge>
                          {selectedUser.teacherProfile.is_verified && (
                            <Badge className="bg-green-600 text-white text-[10px]">موثق</Badge>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">المواد</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {(selectedUser.subjects || []).map((s, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{s}</Badge>
                          ))}
                          {(!selectedUser.subjects || selectedUser.subjects.length === 0) && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                      {selectedUser.teacherProfile.bio && (
                        <div className="col-span-2">
                          <span className="text-xs text-muted-foreground">النبذة</span>
                          <p className="text-xs text-foreground mt-0.5">{selectedUser.teacherProfile.bio}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Badges */}
                {selectedUser.badges && selectedUser.badges.length > 0 && (
                  <div className="bg-muted/30 rounded-xl p-4">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                      <Award className="h-4 w-4 text-yellow-500" /> الشارات
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedUser.badges.map((b, i) => (
                        <Badge key={i} variant="secondary" className="text-xs gap-1">
                          {b.icon && <span>{b.icon}</span>}
                          {b.name_ar}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {selectedUser.warnings && selectedUser.warnings.length > 0 && (
                  <div className="bg-destructive/5 rounded-xl p-4 border border-destructive/20">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3 text-destructive">
                      <AlertTriangle className="h-4 w-4" /> التحذيرات ({selectedUser.warnings.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedUser.warnings.map((w, i) => (
                        <div key={i} className="bg-background/60 rounded-lg p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <Badge variant="destructive" className="text-[10px]">{w.warning_type}</Badge>
                            <span className="text-muted-foreground">{new Date(w.created_at).toLocaleDateString("ar-SA")}</span>
                          </div>
                          {w.description && <p className="mt-1 text-foreground">{w.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
