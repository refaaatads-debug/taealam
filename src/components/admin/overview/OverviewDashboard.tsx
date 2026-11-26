import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, GraduationCap, BookOpen, DollarSign, ArrowLeft, ArrowUp, ArrowDown, Minus,
  CheckCircle, XCircle, MessageSquare, CreditCard, ShieldAlert, Clock,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import AdminPeriodFilter, { getPeriodStart, type AdminPeriod } from "@/components/admin/AdminPeriodFilter";
import AdminUrgentTasks from "@/components/admin/AdminUrgentTasks";
import AdminLiveAlerts from "@/components/admin/AdminLiveAlerts";

const ACCENT = "hsl(var(--primary))";
const GREY = "#94a3b8";
const SHADES = ["hsl(var(--primary))", "#475569", "#94a3b8", "#cbd5e1"];

const nf = new Intl.NumberFormat("ar-SA");
const fmtNum = (v: number) => nf.format(Math.round(v));
const fmtMoney = (v: number) => `${nf.format(Math.round(v))} ر.س`;
const STATUS_AR: Record<string, string> = { pending: "معلق", confirmed: "مؤكد", completed: "مكتمل", cancelled: "ملغى" };

const prefersReduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function useCountUp(target: number, duration = 700) {
  const [val, setVal] = useState(prefersReduced() ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (prefersReduced()) { setVal(target); return; }
    const start = performance.now();
    const base = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(base + (target - base) * eased);
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

async function fetchRows(table: string, columns: string, sinceIso: string, extra?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  try {
    for (let p = 0; p < 20; p++) {
      let q = (supabase as any).from(table).select(columns).gte("created_at", sinceIso);
      if (extra) q = extra(q);
      const { data, error } = await q.order("created_at", { ascending: true }).order("id", { ascending: true }).range(p * 1000, p * 1000 + 999);
      if (error) return out;
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  } catch {
    return out;
  }
  return out;
}

type Series = { label: string; revenue: number; bookings: number; users: number; teachers: number }[];
interface Trends {
  series: Series;
  cur: { revenue: number; bookings: number; users: number; teachers: number };
  prev: { revenue: number; bookings: number; users: number; teachers: number } | null;
}

function useTrends(period: AdminPeriod, refreshKey: unknown): Trends | null {
  const [t, setT] = useState<Trends | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const now = Date.now();
      const hourly = period === "today";
      const hasPrev = period !== "all";
      const n = hourly ? 24 : period === "week" ? 7 : 30;
      const start = hourly ? (getPeriodStart("today") as Date).getTime()
        : period === "week" ? now - 7 * 864e5
        : period === "month" ? (getPeriodStart("month") as Date).getTime()
        : now - 30 * 864e5;
      const len = hourly ? 24 * 36e5 : now - start;
      const end = hourly ? start + len : now;
      const prevStart = start - len;
      const since = new Date(hasPrev ? prevStart : start).toISOString();
      const [pay, bk, us, te] = await Promise.all([
        fetchRows("payment_records", "id, created_at, amount", since, (q) => q.eq("status", "completed")),
        fetchRows("bookings", "id, created_at", since),
        fetchRows("profiles", "id, created_at", since),
        fetchRows("teacher_profiles", "id, created_at", since),
      ]);
      if (!alive) return;
      const series: Series = Array.from({ length: n }, (_, i) => {
        const d = new Date(start + (i / n) * (end - start));
        return { label: hourly ? `${d.getHours()}:00` : `${d.getDate()}/${d.getMonth() + 1}`, revenue: 0, bookings: 0, users: 0, teachers: 0 };
      });
      const cur = { revenue: 0, bookings: 0, users: 0, teachers: 0 };
      const prev = { revenue: 0, bookings: 0, users: 0, teachers: 0 };
      const place = (rows: any[], key: "revenue" | "bookings" | "users" | "teachers", amount = false) => {
        for (const r of rows) {
          const ts = new Date(r.created_at).getTime();
          const v = amount ? Number(r.amount || 0) : 1;
          if (ts >= start && ts <= end) {
            const i = Math.min(n - 1, Math.floor(((ts - start) / (end - start)) * n));
            series[i][key] += v; cur[key] += v;
          } else if (hasPrev && ts >= prevStart && ts < start) prev[key] += v;
        }
      };
      place(pay, "revenue", true); place(bk, "bookings"); place(us, "users"); place(te, "teachers");
      setT({ series, cur, prev: hasPrev ? prev : null });
    })();
    return () => { alive = false; };
  }, [period, refreshKey]);
  return t;
}

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="space-y-3 motion-safe:animate-fade-in">
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h3 className="text-[15px] font-black text-slate-800">{title}</h3>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
    {children}
  </section>
);

const Delta = ({ cur, prev }: { cur: number; prev: number | null | undefined }) => {
  if (prev == null) return <span className="text-xs text-slate-400">لا مقارنة</span>;
  if (prev === 0) return <span className="text-xs text-slate-400">{cur > 0 ? "جديد" : "-"}</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const Icon = pct > 0 ? ArrowUp : pct < 0 ? ArrowDown : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${pct > 0 ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
      <Icon className="h-3 w-3" />{Math.abs(pct)}%
    </span>
  );
};

const Kpi = ({ label, value, money, icon: Icon, spark, cur, prev, total, onClick }: {
  label: string; value: number; money?: boolean; icon: React.ElementType; spark: number[]; cur: number; prev?: number | null; total?: string; onClick?: () => void;
}) => {
  const shown = useCountUp(value);
  const data = spark.map((v, i) => ({ i, v }));
  const gid = `g-${label.replace(/\s/g, "")}`;
  return (
    <button onClick={onClick} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-right transition-all duration-200 active:scale-[0.98] motion-safe:hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-[13px] font-semibold">{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 text-[26px] font-black leading-none tracking-tight text-slate-900 tabular-nums">{money ? fmtMoney(shown) : fmtNum(shown)}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Delta cur={cur} prev={prev} />
        {total && <span className="text-[11px] text-slate-400">{total}</span>}
      </div>
      <div className="mt-2 h-10 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} /><stop offset="100%" stopColor={ACCENT} stopOpacity={0} /></linearGradient></defs>
            <Area type="monotone" dataKey="v" stroke={ACCENT} strokeWidth={1.75} fill={`url(#${gid})`} dot={false} isAnimationActive animationDuration={900} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
};

const Chip = ({ icon: Icon, label, value, onClick, hot }: { icon: React.ElementType; label: string; value: number; onClick: () => void; hot?: boolean }) => (
  <button onClick={onClick} className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm transition-all active:scale-95 hover:bg-slate-50">
    <Icon className="h-4 w-4 text-slate-400" />
    <span className="text-slate-600">{label}</span>
    <span className={`min-w-[1.5rem] rounded-full px-1.5 text-center text-sm font-bold tabular-nums ${hot && value > 0 ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-700"}`}>{fmtNum(value)}</span>
  </button>
);

const Panel = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <Card className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-none ${className}`}>{children}</Card>
);

const StackBar = ({ items }: { items: { name: string; value: number }[] }) => {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {items.map((it, i) => (
          <div key={it.name} className="h-full transition-all duration-700 ease-out" style={{ width: `${(it.value / total) * 100}%`, background: SHADES[i % SHADES.length] }} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
        {items.map((it, i) => (
          <li key={it.name} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SHADES[i % SHADES.length] }} />{it.name}</span>
            <span className="font-bold text-slate-900 tabular-nums">{fmtNum(it.value)} <span className="text-xs font-normal text-slate-400">({Math.round((it.value / total) * 100)}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const tip = { contentStyle: { borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "none", fontSize: 12 } } as const;

export default function OverviewDashboard({ stats, overview, bookingStatusData, pieData, period, setPeriod, onOpenTab, badgeCounts }: any) {
  const trends = useTrends(period, overview?.paymentTotal);
  const [metric, setMetric] = useState<"revenue" | "bookings">("revenue");
  const pending = (badgeCounts?.withdrawals || 0) + (badgeCounts?.support || 0) + (badgeCounts?.pendingBookings || 0) + (badgeCounts?.unreviewed || 0);
  const firstTab = (badgeCounts?.pendingBookings || 0) > 0 ? "bookings" : (badgeCounts?.support || 0) > 0 ? "support" : (badgeCounts?.withdrawals || 0) > 0 ? "withdrawals" : "violations";
  const sp = (k: "revenue" | "bookings" | "users" | "teachers") => (trends?.series ?? []).map((s) => s[k]);
  const statusItems = useMemo(() => (bookingStatusData ?? []).filter((b: any) => b.value > 0).map((b: any) => ({ name: STATUS_AR[b.name] ?? b.name, value: b.value })), [bookingStatusData]);
  const periodLabel = { today: "اليوم", week: "آخر 7 أيام", month: "آخر 30 يومًا", all: "آخر 30 يومًا (الرسوم)" }[period as string];

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900">نظرة عامة</h2>
            <p className="mt-0.5 text-sm text-slate-500">ملخص الأداء والعمل المطلوب</p>
          </div>
          <AdminPeriodFilter value={period} onChange={setPeriod} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-primary p-4 text-primary-foreground">
          <div className="min-w-0">
            <p className="text-base font-bold">{pending > 0 ? `${fmtNum(pending)} مهام تحتاج مراجعة` : "لا توجد مهام معلقة"}</p>
            <p className="mt-0.5 text-xs opacity-80">حجوزات، دعم، سحب أرباح ومخالفات</p>
          </div>
          {pending > 0 && (
            <Button onClick={() => onOpenTab(firstTab)} size="sm" className="shrink-0 gap-1.5 rounded-lg bg-white text-primary transition-transform hover:bg-white/90 active:scale-95">ابدأ <ArrowLeft className="h-4 w-4" /></Button>
          )}
        </div>
      </div>

      <Section title="المؤشرات الرئيسية" hint={`مقارنة بالفترة السابقة${period === "all" ? " (غير متاحة)" : ""}`}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="الإيرادات" money value={overview.paymentTotal} icon={DollarSign} spark={sp("revenue")} cur={trends?.cur.revenue ?? 0} prev={trends?.prev?.revenue} total={`${fmtNum(overview.newPayments)} عملية`} onClick={() => onOpenTab("financial_hub")} />
          <Kpi label="الحجوزات" value={overview.newBookings} icon={BookOpen} spark={sp("bookings")} cur={trends?.cur.bookings ?? 0} prev={trends?.prev?.bookings} total={`الإجمالي ${fmtNum(stats.bookings)}`} onClick={() => onOpenTab("bookings")} />
          <Kpi label="مستخدمون جدد" value={overview.newUsers} icon={Users} spark={sp("users")} cur={trends?.cur.users ?? 0} prev={trends?.prev?.users} total={`الإجمالي ${fmtNum(stats.users)}`} onClick={() => onOpenTab("users")} />
          <Kpi label="معلمون جدد" value={overview.newTeachers} icon={GraduationCap} spark={sp("teachers")} cur={trends?.cur.teachers ?? 0} prev={trends?.prev?.teachers} total={`الإجمالي ${fmtNum(stats.teachers)}`} onClick={() => onOpenTab("teacher_profiles")} />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <Chip icon={CheckCircle} label="حصص مكتملة" value={overview.completedBookings} onClick={() => onOpenTab("sessions_status")} />
          <Chip icon={XCircle} label="حجوزات ملغاة" value={overview.cancelledBookings} onClick={() => onOpenTab("bookings")} />
          <Chip icon={MessageSquare} label="دعم مفتوح" value={overview.openSupportTickets} onClick={() => onOpenTab("support")} hot />
          <Chip icon={CreditCard} label="سحب معلق" value={overview.pendingWithdrawals} onClick={() => onOpenTab("withdrawals")} hot />
          <Chip icon={ShieldAlert} label="مخالفات" value={overview.unreviewedViolations} onClick={() => onOpenTab("violations")} hot />
        </div>
      </Section>

      <Section title="يحتاج إجراء الآن" hint="موافقة، رفض أو تأجيل مباشرة">
        <AdminUrgentTasks onOpenTab={onOpenTab} />
      </Section>

      <Section title="الأداء" hint={periodLabel}>
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
              {([["revenue", "الإيرادات"], ["bookings", "الحجوزات"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setMetric(k)} className={`rounded-md px-3 py-1.5 font-semibold transition-all ${metric === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
              ))}
            </div>
            <span className="text-sm font-bold text-slate-900 tabular-nums">{metric === "revenue" ? fmtMoney(trends?.cur.revenue ?? 0) : fmtNum(trends?.cur.bookings ?? 0)}</span>
          </div>
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends?.series ?? []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs><linearGradient id="perf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} /><stop offset="100%" stopColor={ACCENT} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...tip} formatter={(v: number) => [metric === "revenue" ? fmtMoney(v) : fmtNum(v), metric === "revenue" ? "الإيرادات" : "الحجوزات"]} />
                <Area key={metric} type="monotone" dataKey={metric} stroke={ACCENT} strokeWidth={2} fill="url(#perf)" isAnimationActive animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        {statusItems.length > 0 && (
          <Panel>
            <p className="mb-3 text-sm font-bold text-slate-800">توزيع حالة الحجوزات</p>
            <StackBar items={statusItems} />
          </Panel>
        )}
      </Section>

      <Section title="نمو المستخدمين" hint={periodLabel}>
        <Panel>
          <div className="mb-2 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: ACCENT }} />مستخدمون</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: GREY }} />معلمون</span>
          </div>
          <div className="h-44 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends?.series ?? []} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...tip} />
                <Bar dataKey="users" name="مستخدمون" fill={ACCENT} radius={[3, 3, 0, 0]} animationDuration={800} />
                <Bar dataKey="teachers" name="معلمون" fill={GREY} radius={[3, 3, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <p className="mb-3 text-sm font-bold text-slate-800">تركيبة المنصة</p>
          <StackBar items={pieData} />
        </Panel>
      </Section>

      <Section title="التنبيهات والنشاط">
        <AdminLiveAlerts onOpenTab={onOpenTab} />
        <Panel className="p-0">
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">آخر النشاط</p>
          {overview.recentEvents.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">لا توجد أحداث في الفترة المحددة</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {overview.recentEvents.map((e: any) => (
                <li key={e.id}>
                  <button onClick={() => onOpenTab(e.tab)} className="flex w-full items-center gap-3 px-4 py-3 text-right transition-colors active:bg-slate-100 hover:bg-slate-50">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{e.label}</span><span className="block truncate text-xs text-slate-500">{e.detail}</span></span>
                    <span className="flex items-center gap-1 whitespace-nowrap text-xs text-slate-400"><Clock className="h-3 w-3" />{ago(e.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Section>
    </div>
  );
}

function ago(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - +new Date(iso)) / 60000));
  if (m < 1) return "الآن";
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} س` : `${Math.floor(h / 24)} يوم`;
}
