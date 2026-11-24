import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search, Users, Star, BookOpen, Wallet,
  ExternalLink, RefreshCw, AlertCircle, GraduationCap, Clock, XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { AdminTable, AdminTableColumn } from "./AdminTable";
import { AdminKPIBar } from "./AdminKPIBar";
import ExportCSVButton from "./ExportCSVButton";

interface TeacherRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  created_at: string | null;
  is_approved: boolean;
  approval_status: string;
  hourly_rate: number;
  avg_rating: number;
  total_sessions: number;
  balance: number;
  open_tickets: number;
}

const FILTERS = [
  { value: "all", label: "الكل" },
  { value: "approved", label: "معتمدون" },
  { value: "pending", label: "بانتظار الموافقة" },
  { value: "rejected", label: "مرفوضون" },
  { value: "issues", label: "لديهم تذاكر" },
] as const;
type FilterType = typeof FILTERS[number]["value"];

const TeacherProfilesTab = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TeacherRow[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => { loadTeachers(); }, []);

  const loadTeachers = async () => {
    setLoading(true);
    try {
      const { data: tps } = await supabase
        .from("teacher_profiles")
        .select("user_id, hourly_rate, avg_rating, total_sessions, is_approved, approval_status, balance, created_at")
        .order("created_at", { ascending: false });

      const ids = (tps || []).map((t: any) => t.user_id);
      if (ids.length === 0) { setRows([]); return; }

      const [profilesRes, ticketsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, avatar_url, phone").in("user_id", ids),
        supabase.from("support_tickets").select("user_id, status").in("user_id", ids).neq("status", "closed"),
      ]);

      const profMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));
      const ticketsByUser = new Map<string, number>();
      (ticketsRes.data || []).forEach((t: any) => {
        ticketsByUser.set(t.user_id, (ticketsByUser.get(t.user_id) || 0) + 1);
      });

      const list: TeacherRow[] = (tps || []).map((t: any) => {
        const p: any = profMap.get(t.user_id) || {};
        return {
          user_id: t.user_id,
          full_name: p.full_name || null,
          avatar_url: p.avatar_url || null,
          phone: p.phone || null,
          created_at: t.created_at,
          is_approved: !!t.is_approved,
          approval_status: t.approval_status || (t.is_approved ? "approved" : "pending"),
          hourly_rate: Number(t.hourly_rate || 0),
          avg_rating: Number(t.avg_rating || 0),
          total_sessions: Number(t.total_sessions || 0),
          balance: Number(t.balance || 0),
          open_tickets: ticketsByUser.get(t.user_id) || 0,
        };
      });
      setRows(list);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "approved" && r.approval_status !== "approved") return false;
      if (filter === "pending" && r.approval_status !== "pending") return false;
      if (filter === "rejected" && r.approval_status !== "rejected") return false;
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
    approved: rows.filter((r) => r.is_approved).length,
    pending: rows.filter((r) => r.approval_status === "pending").length,
    rejected: rows.filter((r) => r.approval_status === "rejected").length,
    totalBalance: rows.reduce((s, r) => s + r.balance, 0),
    issues: rows.filter((r) => r.open_tickets > 0).length,
  }), [rows]);

  const columns: AdminTableColumn<TeacherRow>[] = [
    {
      key: "full_name",
      label: "المعلم",
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={r.avatar_url || undefined} />
            <AvatarFallback className="text-xs">{(r.full_name || "?").charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium text-sm text-foreground truncate max-w-[150px]">
              {r.full_name || "بدون اسم"}
            </p>
            <p className="text-[11px] text-muted-foreground">{r.phone || "—"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "is_approved",
      label: "الحالة",
      render: (r) =>
        r.approval_status === "approved" ? (
          <Badge className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-none">معتمد</Badge>
        ) : r.approval_status === "rejected" ? (
          <Badge variant="destructive" className="text-[11px]">مرفوض</Badge>
        ) : (
          <Badge variant="outline" className="text-[11px] border-amber-300 text-amber-600 bg-amber-50">بانتظار</Badge>
        ),
    },
    {
      key: "avg_rating",
      label: "التقييم",
      render: (r) =>
        r.avg_rating > 0 ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-600">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {r.avg_rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "total_sessions",
      label: "الحصص",
      render: (r) => (
        <span className="text-sm font-medium text-foreground">
          {r.total_sessions.toLocaleString("ar-SA")}
        </span>
      ),
    },
    {
      key: "hourly_rate",
      label: "السعر/ساعة",
      render: (r) => (
        <span className="text-sm text-foreground">
          {r.hourly_rate > 0 ? `${r.hourly_rate} ر.س` : "—"}
        </span>
      ),
    },
    {
      key: "balance",
      label: "الرصيد",
      render: (r) => (
        <span className={`text-sm font-semibold ${r.balance > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
          {r.balance.toFixed(2)} ر.س
        </span>
      ),
    },
    {
      key: "open_tickets",
      label: "تذاكر",
      render: (r) =>
        r.open_tickets > 0 ? (
          <Badge variant="destructive" className="text-[11px]">{r.open_tickets}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "created_at",
      label: "تاريخ الانضمام",
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
          { label: "إجمالي المعلمين", value: stats.total.toLocaleString("ar-SA"), icon: Users, accent: "bg-violet-50", iconClass: "text-violet-600" },
          { label: "معتمدون", value: stats.approved.toLocaleString("ar-SA"), icon: GraduationCap, accent: "bg-emerald-50", iconClass: "text-emerald-600" },
          { label: "بانتظار الموافقة", value: stats.pending.toLocaleString("ar-SA"), icon: Clock, accent: "bg-amber-50", iconClass: "text-amber-600" },
          { label: "مرفوضون", value: stats.rejected.toLocaleString("ar-SA"), icon: XCircle, accent: "bg-red-50", iconClass: "text-red-600" },
          { label: "إجمالي الأرصدة", value: `${stats.totalBalance.toFixed(0)} ر.س`, icon: Wallet, accent: "bg-blue-50", iconClass: "text-blue-600" },
        ]}
      />

      {/* Table Card */}
      <Card className="border border-border/50 bg-card shadow-sm">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              ملفات المعلمين{" "}
              <span className="text-muted-foreground font-normal">({filtered.length})</span>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو الهاتف..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pr-9 h-8 text-sm w-48 bg-muted/30 border-border/60"
                />
              </div>
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
              <ExportCSVButton
                data={filtered.map((r) => ({
                  name: r.full_name || "",
                  phone: r.phone || "",
                  status: r.approval_status === "approved" ? "معتمد" : r.approval_status === "rejected" ? "مرفوض" : "بانتظار",
                  rating: r.avg_rating.toFixed(1),
                  sessions: r.total_sessions,
                  rate: r.hourly_rate,
                  balance: r.balance.toFixed(2),
                  tickets: r.open_tickets,
                  joined: r.created_at ? format(new Date(r.created_at), "dd/MM/yyyy") : "",
                }))}
                headers={[
                  { key: "name", label: "الاسم" },
                  { key: "phone", label: "الهاتف" },
                  { key: "status", label: "الحالة" },
                  { key: "rating", label: "التقييم" },
                  { key: "sessions", label: "عدد الحصص" },
                  { key: "rate", label: "السعر/ساعة" },
                  { key: "balance", label: "الرصيد" },
                  { key: "tickets", label: "التذاكر" },
                  { key: "joined", label: "تاريخ الانضمام" },
                ]}
                filename="ملفات_المعلمين"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadTeachers}>
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
            emptyText="لا يوجد معلمون مطابقون"
            onRowClick={(r) => navigate(`/admin/teachers/${r.user_id}`)}
            actions={(r) => (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-primary hover:bg-primary/8"
                onClick={() => navigate(`/admin/teachers/${r.user_id}`)}
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

export default TeacherProfilesTab;
