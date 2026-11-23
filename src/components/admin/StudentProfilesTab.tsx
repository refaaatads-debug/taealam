import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Users, GraduationCap, Clock, AlertCircle,
  ExternalLink, RefreshCw, TicketCheck,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { AdminTable, AdminTableColumn } from "./AdminTable";
import { AdminKPIBar } from "./AdminKPIBar";
import ExportCSVButton from "./ExportCSVButton";

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

const FILTERS = [
  { value: "all", label: "الكل" },
  { value: "active", label: "باقة نشطة" },
  { value: "inactive", label: "بدون باقة" },
  { value: "issues", label: "لديهم تذاكر" },
] as const;
type FilterType = typeof FILTERS[number]["value"];

const StudentProfilesTab = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => { loadStudents(); }, []);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");

      const ids = (roles || []).map((r: any) => r.user_id);
      if (ids.length === 0) { setRows([]); return; }

      const [profilesRes, subsRes, ticketsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, avatar_url, phone, created_at").in("user_id", ids),
        supabase.from("user_subscriptions").select("user_id, remaining_minutes, is_active").in("user_id", ids),
        supabase.from("support_tickets").select("user_id, status").in("user_id", ids).neq("status", "closed"),
      ]);

      const subsByUser = new Map<string, { mins: number; active: boolean }>();
      (subsRes.data || []).forEach((s: any) => {
        const cur = subsByUser.get(s.user_id) || { mins: 0, active: false };
        cur.mins += Number(s.remaining_minutes || 0);
        if (s.is_active) cur.active = true;
        subsByUser.set(s.user_id, cur);
      });

      const ticketsByUser = new Map<string, number>();
      (ticketsRes.data || []).forEach((t: any) => {
        ticketsByUser.set(t.user_id, (ticketsByUser.get(t.user_id) || 0) + 1);
      });

      const list: StudentRow[] = (profilesRes.data || []).map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        phone: p.phone,
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
        (r.phone || "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, filter]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.active_subscription).length,
    inactive: rows.filter((r) => !r.active_subscription).length,
    issues: rows.filter((r) => r.open_tickets > 0).length,
  }), [rows]);

  const columns: AdminTableColumn<StudentRow>[] = [
    {
      key: "full_name",
      label: "الطالب",
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={r.avatar_url || undefined} />
            <AvatarFallback className="text-xs">{(r.full_name || "?").charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium text-sm text-foreground truncate max-w-[160px]">
              {r.full_name || "بدون اسم"}
            </p>
            <p className="text-[11px] text-muted-foreground">{r.phone || "—"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "active_subscription",
      label: "الباقة",
      render: (r) =>
        r.active_subscription ? (
          <Badge variant="secondary" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200">نشطة</Badge>
        ) : (
          <Badge variant="outline" className="text-[11px] text-muted-foreground">بدون باقة</Badge>
        ),
    },
    {
      key: "remaining_minutes",
      label: "الدقائق المتبقية",
      render: (r) => (
        <span className={`text-sm font-medium ${(r.remaining_minutes || 0) < 30 && r.active_subscription ? "text-amber-600" : "text-foreground"}`}>
          {(r.remaining_minutes || 0).toLocaleString("ar-SA")} د
        </span>
      ),
    },
    {
      key: "open_tickets",
      label: "التذاكر المفتوحة",
      render: (r) =>
        r.open_tickets > 0 ? (
          <Badge variant="destructive" className="text-[11px]">{r.open_tickets}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "created_at",
      label: "تاريخ التسجيل",
      render: (r) =>
        r.created_at ? (
          <span className="text-xs text-muted-foreground">
            {format(new Date(r.created_at), "dd MMM yyyy", { locale: ar })}
          </span>
        ) : "—",
    },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <AdminKPIBar
        kpis={[
          { label: "إجمالي الطلاب", value: stats.total.toLocaleString("ar-SA"), icon: Users, accent: "bg-blue-50", iconClass: "text-blue-600" },
          { label: "باقة نشطة", value: stats.active.toLocaleString("ar-SA"), icon: GraduationCap, accent: "bg-emerald-50", iconClass: "text-emerald-600" },
          { label: "بدون باقة", value: stats.inactive.toLocaleString("ar-SA"), icon: Clock, accent: "bg-amber-50", iconClass: "text-amber-600" },
          { label: "لديهم تذاكر مفتوحة", value: stats.issues.toLocaleString("ar-SA"), icon: TicketCheck, accent: "bg-rose-50", iconClass: "text-rose-600" },
        ]}
      />

      {/* Table Card */}
      <Card className="border border-border/50 bg-card shadow-sm">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              ملفات الطلاب{" "}
              <span className="text-muted-foreground font-normal">({filtered.length})</span>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو الهاتف..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pr-9 h-8 text-sm w-48 bg-muted/30 border-border/60"
                />
              </div>
              {/* Filters */}
              <div className="flex items-center gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFilter(f.value)}
                    className={[
                      "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                      filter === f.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {/* Export */}
              <ExportCSVButton
                data={filtered.map((r) => ({
                  name: r.full_name || "",
                  phone: r.phone || "",
                  subscription: r.active_subscription ? "نشطة" : "غير نشطة",
                  minutes: r.remaining_minutes ?? 0,
                  tickets: r.open_tickets,
                  joined: r.created_at ? format(new Date(r.created_at), "dd/MM/yyyy") : "",
                }))}
                headers={[
                  { key: "name", label: "الاسم" },
                  { key: "phone", label: "الهاتف" },
                  { key: "subscription", label: "الباقة" },
                  { key: "minutes", label: "الدقائق المتبقية" },
                  { key: "tickets", label: "التذاكر المفتوحة" },
                  { key: "joined", label: "تاريخ التسجيل" },
                ]}
                filename="ملفات_الطلاب"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadStudents} title="تحديث">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <AdminTable
            columns={columns}
            data={filtered}
            loading={loading}
            rowKey={(r) => r.user_id}
            emptyIcon={<GraduationCap className="h-10 w-10" />}
            emptyText="لا يوجد طلاب مطابقون"
            onRowClick={(r) => navigate(`/admin/students/${r.user_id}`)}
            actions={(r) => (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-primary hover:bg-primary/8"
                onClick={() => navigate(`/admin/students/${r.user_id}`)}
              >
                <ExternalLink className="h-3 w-3 ml-1" />
                عرض
              </Button>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentProfilesTab;
