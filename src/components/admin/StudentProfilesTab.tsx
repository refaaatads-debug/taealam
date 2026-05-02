import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderOpen, Search, Users, Sparkles, AlertCircle, GraduationCap, Filter } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface StudentRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  created_at: string | null;
  remaining_minutes: number | null;
  active_subscription: boolean;
  open_tickets: number;
}

const StudentProfilesTab = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "issues">("all");

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");

      const ids = (roles || []).map((r: any) => r.user_id);
      if (ids.length === 0) {
        setRows([]);
        return;
      }

      const [profilesRes, subsRes, ticketsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email, avatar_url, phone_number, created_at").in("user_id", ids),
        supabase.from("user_subscriptions").select("user_id, remaining_minutes, status").in("user_id", ids),
        supabase.from("support_tickets").select("user_id, status").in("user_id", ids).neq("status", "closed"),
      ]);

      const subsByUser = new Map<string, { mins: number; active: boolean }>();
      (subsRes.data || []).forEach((s: any) => {
        const cur = subsByUser.get(s.user_id) || { mins: 0, active: false };
        cur.mins += Number(s.remaining_minutes || 0);
        if (s.status === "active") cur.active = true;
        subsByUser.set(s.user_id, cur);
      });

      const ticketsByUser = new Map<string, number>();
      (ticketsRes.data || []).forEach((t: any) => {
        ticketsByUser.set(t.user_id, (ticketsByUser.get(t.user_id) || 0) + 1);
      });

      const list: StudentRow[] = (profilesRes.data || []).map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        avatar_url: p.avatar_url,
        phone_number: p.phone_number,
        created_at: p.created_at,
        remaining_minutes: subsByUser.get(p.user_id)?.mins ?? 0,
        active_subscription: subsByUser.get(p.user_id)?.active ?? false,
        open_tickets: ticketsByUser.get(p.user_id) || 0,
      }));

      list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setRows(list);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "active" && !r.active_subscription) return false;
      if (filter === "inactive" && r.active_subscription) return false;
      if (filter === "issues" && r.open_tickets === 0) return false;
      if (!q) return true;
      return (
        (r.full_name || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.phone_number || "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, filter]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.active_subscription).length,
    issues: rows.filter((r) => r.open_tickets > 0).length,
  }), [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-primary" />
            ملفات الطلاب
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            عرض شامل لكل طالب في مكان واحد — اضغط على أي طالب لفتح ملفه الكامل.
          </p>
        </div>
        <Button variant="outline" onClick={loadStudents}>
          تحديث
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">إجمالي الطلاب</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-secondary/20 bg-gradient-to-br from-secondary/5 to-transparent">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">باشتراك نشط</div>
              <div className="text-2xl font-bold">{stats.active}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/20 bg-gradient-to-br from-destructive/5 to-transparent">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">لديهم تذاكر مفتوحة</div>
              <div className="text-2xl font-bold">{stats.issues}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث بالاسم أو البريد أو الجوال..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                { id: "all", label: "الكل" },
                { id: "active", label: "نشط" },
                { id: "inactive", label: "غير نشط" },
                { id: "issues", label: "مشاكل" },
              ].map((f) => (
                <Button
                  key={f.id}
                  variant={filter === f.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(f.id as any)}
                >
                  <Filter className="h-3.5 w-3.5 ml-1" />
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-40" />
              لا يوجد طلاب مطابقون.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <button
                  key={r.user_id}
                  onClick={() => navigate(`/admin/students/${r.user_id}`)}
                  className="w-full flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/40 hover:border-primary/30 transition-all text-right"
                >
                  <Avatar className="h-11 w-11 shrink-0">
                    <AvatarImage src={r.avatar_url || undefined} />
                    <AvatarFallback>{(r.full_name || "?").charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{r.full_name || "بدون اسم"}</span>
                      {r.active_subscription && (
                        <Badge variant="secondary" className="text-xs">نشط</Badge>
                      )}
                      {r.open_tickets > 0 && (
                        <Badge variant="destructive" className="text-xs">{r.open_tickets} تذكرة</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.email} {r.phone_number ? `• ${r.phone_number}` : ""}
                    </div>
                  </div>
                  <div className="hidden md:flex flex-col items-end text-xs text-muted-foreground shrink-0">
                    <span>{r.remaining_minutes ?? 0} دقيقة</span>
                    {r.created_at && (
                      <span>
                        {format(new Date(r.created_at), "dd MMM yyyy", { locale: ar })}
                      </span>
                    )}
                  </div>
                  <FolderOpen className="h-5 w-5 text-primary shrink-0" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentProfilesTab;
