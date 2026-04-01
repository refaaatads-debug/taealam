import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Users, BookOpen, DollarSign, TrendingUp, Search,
  CheckCircle, XCircle, Eye, Shield, BarChart3, Clock,
  UserCheck, UserX, GraduationCap
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted))"];

const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({ users: 0, teachers: 0, bookings: 0, revenue: 0 });
  const [pendingTeachers, setPendingTeachers] = useState<any[]>([]);
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch counts
      const [profilesRes, teachersRes, bookingsRes, paymentsRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("teacher_profiles").select("id", { count: "exact", head: true }),
        supabase.from("bookings").select("id", { count: "exact", head: true }),
        supabase.from("payment_records").select("amount").eq("status", "completed"),
      ]);

      const revenue = (paymentsRes.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
      setStats({
        users: profilesRes.count ?? 0,
        teachers: teachersRes.count ?? 0,
        bookings: bookingsRes.count ?? 0,
        revenue,
      });

      // Pending teachers
      const { data: pending } = await supabase
        .from("teacher_profiles")
        .select("*, profiles!teacher_profiles_user_id_fkey(full_name, avatar_url, phone)")
        .eq("is_approved", false)
        .order("created_at", { ascending: false })
        .limit(20);

      // We can't use the FK join directly since there's no FK. Let's query separately.
      const { data: pendingRaw } = await supabase
        .from("teacher_profiles")
        .select("*")
        .eq("is_approved", false)
        .order("created_at", { ascending: false })
        .limit(20);

      if (pendingRaw) {
        const userIds = pendingRaw.map(t => t.user_id);
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, avatar_url, phone").in("user_id", userIds);
        const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));
        setPendingTeachers(pendingRaw.map(t => ({ ...t, profile: profileMap.get(t.user_id) })));
      }

      // Recent bookings
      const { data: bookings } = await supabase
        .from("bookings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      setRecentBookings(bookings ?? []);

      // All users
      const { data: users } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setAllUsers(users ?? []);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const approveTeacher = async (teacherId: string) => {
    const { error } = await supabase
      .from("teacher_profiles")
      .update({ is_approved: true, is_verified: true })
      .eq("id", teacherId);
    if (error) { toast.error("حدث خطأ"); return; }
    toast.success("تمت الموافقة على المعلم!");
    setPendingTeachers(prev => prev.filter(t => t.id !== teacherId));
    setStats(prev => ({ ...prev, teachers: prev.teachers }));
  };

  const rejectTeacher = async (teacherId: string, userId: string) => {
    await supabase.from("teacher_profiles").delete().eq("id", teacherId);
    await supabase.from("user_roles").update({ role: "student" as any }).eq("user_id", userId);
    toast.success("تم رفض طلب المعلم");
    setPendingTeachers(prev => prev.filter(t => t.id !== teacherId));
  };

  const chartData = [
    { name: "يناير", حجوزات: 12, إيرادات: 2400 },
    { name: "فبراير", حجوزات: 19, إيرادات: 3800 },
    { name: "مارس", حجوزات: 28, إيرادات: 5600 },
    { name: "أبريل", حجوزات: 35, إيرادات: 7000 },
  ];

  const pieData = [
    { name: "طلاب", value: stats.users - stats.teachers },
    { name: "معلمين", value: stats.teachers },
  ];

  const filteredUsers = allUsers.filter(u =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.phone?.includes(searchQuery)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground">لوحة التحكم</h1>
            <p className="text-sm text-muted-foreground">إدارة المنصة التعليمية</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "المستخدمين", value: stats.users, icon: Users, color: "text-primary" },
            { label: "المعلمين", value: stats.teachers, icon: GraduationCap, color: "text-secondary" },
            { label: "الحجوزات", value: stats.bookings, icon: BookOpen, color: "text-accent-foreground" },
            { label: "الإيرادات", value: `${stats.revenue} ر.س`, icon: DollarSign, color: "text-green-600" },
          ].map((s, i) => (
            <Card key={i} className="border-0 shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                  <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                </div>
                <p className="text-2xl font-black text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted rounded-xl p-1 w-full md:w-auto">
            <TabsTrigger value="overview" className="rounded-lg gap-1.5">
              <BarChart3 className="h-4 w-4" />
              نظرة عامة
            </TabsTrigger>
            <TabsTrigger value="teachers" className="rounded-lg gap-1.5">
              <UserCheck className="h-4 w-4" />
              طلبات المعلمين
              {pendingTeachers.length > 0 && (
                <Badge variant="destructive" className="mr-1 text-[10px] px-1.5 py-0">{pendingTeachers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-lg gap-1.5">
              <Users className="h-4 w-4" />
              المستخدمين
            </TabsTrigger>
            <TabsTrigger value="bookings" className="rounded-lg gap-1.5">
              <Clock className="h-4 w-4" />
              الحجوزات
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="border-0 shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold">الحجوزات والإيرادات</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="حجوزات" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="إيرادات" fill="hsl(var(--secondary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold">توزيع المستخدمين</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Teachers Tab */}
          <TabsContent value="teachers" className="space-y-4">
            <Card className="border-0 shadow-card">
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-secondary" />
                  طلبات تسجيل المعلمين ({pendingTeachers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingTeachers.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <p className="text-muted-foreground">لا توجد طلبات معلقة</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingTeachers.map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                            <GraduationCap className="h-5 w-5 text-secondary" />
                          </div>
                          <div>
                            <p className="font-bold text-foreground text-sm">{t.profile?.full_name || "بدون اسم"}</p>
                            <p className="text-xs text-muted-foreground">{t.profile?.phone || "لا يوجد رقم"}</p>
                            <p className="text-xs text-muted-foreground">خبرة: {t.years_experience || 0} سنوات</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="rounded-lg bg-green-600 hover:bg-green-700 text-white gap-1" onClick={() => approveTeacher(t.id)}>
                            <CheckCircle className="h-3.5 w-3.5" />
                            موافقة
                          </Button>
                          <Button size="sm" variant="destructive" className="rounded-lg gap-1" onClick={() => rejectTeacher(t.id, t.user_id)}>
                            <XCircle className="h-3.5 w-3.5" />
                            رفض
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card className="border-0 shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold">المستخدمين</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث بالاسم أو الرقم..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-10 rounded-xl h-9 text-sm"
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
                        <th className="text-right pb-3 font-medium">المستوى</th>
                        <th className="text-right pb-3 font-medium">التسجيل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-muted/30">
                          <td className="py-3 font-medium text-foreground">{u.full_name || "—"}</td>
                          <td className="py-3 text-muted-foreground" dir="ltr">{u.phone || "—"}</td>
                          <td className="py-3">
                            <Badge variant="outline" className="text-xs">{u.level || "bronze"}</Badge>
                          </td>
                          <td className="py-3 text-muted-foreground text-xs">{new Date(u.created_at).toLocaleDateString("ar-SA")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bookings Tab */}
          <TabsContent value="bookings" className="space-y-4">
            <Card className="border-0 shadow-card">
              <CardHeader>
                <CardTitle className="text-base font-bold">آخر الحجوزات</CardTitle>
              </CardHeader>
              <CardContent>
                {recentBookings.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">لا توجد حجوزات بعد</p>
                ) : (
                  <div className="space-y-3">
                    {recentBookings.map((b) => (
                      <div key={b.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                        <div>
                          <p className="font-medium text-sm text-foreground">{new Date(b.scheduled_at).toLocaleDateString("ar-SA")}</p>
                          <p className="text-xs text-muted-foreground">{b.duration_minutes} دقيقة</p>
                        </div>
                        <Badge variant={b.status === "completed" ? "default" : b.status === "confirmed" ? "secondary" : "outline"} className="text-xs">
                          {b.status === "completed" ? "مكتملة" : b.status === "confirmed" ? "مؤكدة" : b.status === "cancelled" ? "ملغاة" : "معلقة"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <BottomNav />
    </div>
  );
};

export default AdminDashboard;
