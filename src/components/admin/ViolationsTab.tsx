import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertTriangle, ShieldAlert, Shield, FileWarning, Play, Pause,
  Ban, Send, Archive, GraduationCap, BookOpen, Clock, Calendar, ChevronDown, Users,
} from "lucide-react";
import StatusFilter from "./StatusFilter";
import DateFilter from "./DateFilter";
import ExportCSVButton from "./ExportCSVButton";
import UserWarningsList from "./UserWarningsList";
import ViolationUserHistory from "./ViolationUserHistory";
import ViolationAppealReview from "./ViolationAppealReview";
import { addConfirmedWarning, removeConfirmedWarning } from "@/lib/violationReview";
import {
  VIOLATION_META, SEVERITY_LABELS, SOURCE_LABELS, DEFAULT_FILTERS, metaFor, severityOf,
  applyViolationFilters, sortBySeverityThenDate, monthRange, type ViolationFilters, type ViolationSeverity,
} from "@/lib/violationMeta";

const SEVERITY_BADGE: Record<ViolationSeverity, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/15 text-warning",
  high: "bg-destructive/15 text-destructive",
  critical: "bg-destructive text-destructive-foreground",
};

interface ViolationsTabProps {
  violations: any[];
  setViolations: (updater: any) => void;
  user: any;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
}

const formatTimestampInSession = (ms: number | null) => {
  if (ms == null) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ar-SA")} - ${d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
};

const reasonForType = (type: string) => metaFor(type).reason;

const ViolationCard = ({ v, user, setViolations, allViolations }: { v: any; user: any; setViolations: any; allViolations: any[] }) => {
  const [audioOpen, setAudioOpen] = useState(false);
  // Compact by default: details (session context, reason, warning log, audio) open on demand.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tsLabel = formatTimestampInSession(v.timestamp_in_session);
  const isTeacher = v.user_role === "teacher";
  const sourceLabel =
    v.source === "chat" ? "💬 الدردشة" :
    v.source === "recording" ? "🎥 تسجيل الجلسة" :
    v.source === "call" || v.source === "phone_call" ? "📞 المكالمة الهاتفية" :
    v.source === "voice" ? "🎙️ صوت الجلسة" : v.source;

  const sendWarning = async () => {
    const note = window.prompt("اكتب نص الإنذار الذي سيُرسل للمستخدم:");
    if (!note || !note.trim()) return;
    await supabase.from("user_warnings").insert({
      user_id: v.user_id,
      warning_type: v.violation_type || "manual",
      description: note.trim(),
      warning_count: 1,
    } as any);
    await supabase.from("notifications").insert({
      user_id: v.user_id,
      title: "⚠️ إنذار من الإدارة",
      body: note.trim(),
      type: "warning",
    });
    toast.success("تم إرسال الإنذار");
  };

  const banUser = async () => {
    const daysStr = window.prompt("مدة الحظر بالأيام (مثلاً: 7):", "7");
    const days = parseInt(daysStr || "0", 10);
    if (!days || days < 1) return;
    const until = new Date(Date.now() + days * 86400000).toISOString();
    const { data: existing } = await supabase.from("user_warnings")
      .select("id, warning_count").eq("user_id", v.user_id).maybeSingle();
    if (existing) {
      await supabase.from("user_warnings").update({
        is_banned: true, banned_until: until,
        warning_count: (existing.warning_count || 0) + 1,
      }).eq("user_id", v.user_id);
    } else {
      await supabase.from("user_warnings").insert({
        user_id: v.user_id, warning_type: v.violation_type || "manual",
        description: `حظر مؤقت — مدة: ${days} يوم`, warning_count: 1,
        is_banned: true, banned_until: until,
      } as any);
    }
    await supabase.from("notifications").insert({
      user_id: v.user_id,
      title: "🚫 تم حظر حسابك مؤقتاً",
      body: `تم حظر الحساب لمدة ${days} يوم بسبب: ${reasonForType(v.violation_type)}`,
      type: "warning",
    });
    setViolations((prev: any[]) => prev.map((it: any) =>
      it.user_id === v.user_id ? { ...it, is_banned: true, banned_until: until } : it
    ));
    toast.success(`تم حظر المستخدم ${days} يوم`);
  };

  return (
    <div className={`p-3 rounded-xl border transition-colors ${v.is_false_positive ? "bg-muted/20 border-border" : v.is_reviewed ? "bg-muted/30 border-border" : "bg-destructive/5 border-destructive/20"}`}>
      <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <AlertTriangle className={`h-4 w-4 ${v.is_false_positive ? "text-muted-foreground" : "text-destructive"}`} />
          <span className="font-bold text-sm text-foreground">{v.user_name}</span>
          <Badge variant="outline" className="text-[10px]">
            {isTeacher ? "👨‍🏫 معلم" : "🎓 طالب"}
          </Badge>
          <Badge variant={v.is_false_positive ? "secondary" : v.is_reviewed ? "default" : "destructive"} className="text-[10px]">
            {v.is_false_positive ? "ملغاة" : v.is_reviewed ? "مؤكدة" : "قيد المراجعة"}
          </Badge>
          <Badge className={`text-[10px] border-0 ${SEVERITY_BADGE[severityOf(v.violation_type)]}`}>
            {SEVERITY_LABELS[severityOf(v.violation_type)]} · {metaFor(v.violation_type).label}
          </Badge>
          {v.is_banned && <Badge variant="destructive" className="text-[10px]">🚫 محظور</Badge>}
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDateTime(v.created_at)}
        </span>
      </div>

      {/* Session / other party context */}
      {detailsOpen && (v.booking_id || v.other_party_name || tsLabel) && (
        <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {v.other_party_name && (
            <div className="flex items-center gap-1">
              <GraduationCap className="h-3 w-3 text-primary" />
              <span className="text-muted-foreground">الطرف الآخر:</span>
              <span className="font-bold text-foreground">{v.other_party_name}</span>
            </div>
          )}
          {v.booking_id && (
            <div className="flex items-center gap-1">
              <BookOpen className="h-3 w-3 text-primary" />
              <span className="text-muted-foreground">الجلسة:</span>
              <span className="font-mono text-[10px] text-foreground">{String(v.booking_id).slice(0, 8)}…</span>
            </div>
          )}
          {tsLabel && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-primary" />
              <span className="text-muted-foreground">في اللحظة:</span>
              <span className="font-mono text-foreground">{tsLabel}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">المصدر:</span>
            <span className="font-bold text-foreground">{sourceLabel}</span>
          </div>
        </div>
      )}

      <div className="space-y-2 mb-2">
        <div className="bg-muted/50 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-muted-foreground">الدليل (مخفي):</span>
          <span className="text-sm text-foreground">{v.original_message || v.detected_text}</span>
          <span className="text-[10px] text-muted-foreground mr-auto">{reasonForType(v.violation_type)}</span>
        </div>
        {detailsOpen && v.detected_text && v.original_message && v.detected_text !== v.original_message && (
          <div className="bg-destructive/5 rounded-lg p-3">
            <p className="text-[10px] font-bold text-destructive mb-1">الأنماط المكتشفة:</p>
            <p className="text-sm text-foreground font-mono">{v.detected_text}</p>
          </div>
        )}
      </div>

      <ViolationAppealReview
        violation={v}
        adminId={user?.id}
        onViolationChange={(patch) => setViolations((prev: any[]) => prev.map((item: any) => item.id === v.id ? { ...item, ...patch } : item))}
      />

      {detailsOpen && v.warning_count > 0 && (
        <div className={`rounded-lg p-3 mb-3 ${v.warning_count >= 3 ? "bg-destructive/10 border border-destructive/20" : "bg-warning/10 border border-warning/20"}`}>
          <div className="flex items-center gap-2 mb-1">
            <FileWarning className="h-3.5 w-3.5 text-warning" />
            <p className="text-[10px] font-bold text-warning">سجل التحذيرات</p>
          </div>
          <p className="text-xs text-foreground">
            عدد التحذيرات: <span className="font-bold">{v.warning_count}</span> / 3
            {v.warning_count >= 3 && " — تم الحظر تلقائياً"}
            {v.banned_until && ` حتى ${new Date(v.banned_until).toLocaleDateString("ar-SA")}`}
          </p>
        </div>
      )}

      {/* Audio playback for voice/call/recording sources */}
      {detailsOpen && (v.source === "recording" || v.source === "voice" || v.source === "call") && v.recording_url && (
        <div className="mb-3">
          <Button size="sm" variant="outline" className="rounded-lg text-xs h-8" onClick={() => setAudioOpen(o => !o)}>
            {audioOpen ? <Pause className="h-3.5 w-3.5 ml-1" /> : <Play className="h-3.5 w-3.5 ml-1" />}
            {audioOpen ? "إخفاء المقطع" : "تشغيل المقطع المخالف"}
          </Button>
          {audioOpen && (
            <div className="mt-2 bg-muted/30 rounded-lg p-3">
              {v.recording_url.endsWith(".webm") || v.recording_url.includes("video") ? (
                <video
                  src={v.recording_url}
                  controls
                  autoPlay
                  className="w-full rounded-lg max-h-60"
                  onLoadedMetadata={(e) => {
                    if (v.timestamp_in_session != null) {
                      (e.currentTarget as HTMLVideoElement).currentTime = v.timestamp_in_session / 1000;
                    }
                  }}
                />
              ) : (
                <audio
                  src={v.recording_url}
                  controls
                  autoPlay
                  className="w-full"
                  onLoadedMetadata={(e) => {
                    if (v.timestamp_in_session != null) {
                      (e.currentTarget as HTMLAudioElement).currentTime = v.timestamp_in_session / 1000;
                    }
                  }}
                />
              )}
              {v.timestamp_in_session != null && (
                <p className="text-[10px] text-muted-foreground mt-1">سيبدأ التشغيل عند {tsLabel}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <button type="button" onClick={() => setDetailsOpen((o) => !o)} className="text-xs text-primary flex items-center gap-1">
          <ChevronDown className={`h-3 w-3 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
          {detailsOpen ? "إخفاء التفاصيل" : "التفاصيل"}
          <span className="text-muted-foreground">· ثقة {Math.round((v.confidence_score || 0) * 100)}%</span>
        </button>
        <div className="flex gap-2 flex-wrap">
          {!v.is_reviewed && (
            <>
              <Button size="sm" variant="outline" className="text-xs h-7 rounded-lg" onClick={async () => {
                await (supabase as any).from("violations").update({ is_reviewed: true, is_false_positive: true, reviewed_by: user?.id }).eq("id", v.id);
                if (v.is_reviewed && !v.is_false_positive) await removeConfirmedWarning(v.user_id);
                await supabase.from("notifications").insert({ user_id: v.user_id, title: "✅ تم إلغاء مخالفة", body: "تمت مراجعة مخالفة وتم إلغاؤها.", type: "violation" });
                setViolations((prev: any[]) => prev.map((item: any) => item.id === v.id ? { ...item, is_reviewed: true, is_false_positive: true } : item));
                toast.success("تم إلغاء المخالفة (إنذار كاذب)");
              }}>إنذار كاذب</Button>
              <Button size="sm" variant="default" className="text-xs h-7 rounded-lg" onClick={async () => {
                await (supabase as any).from("violations").update({ is_reviewed: true, is_false_positive: false, reviewed_by: user?.id }).eq("id", v.id);
                // A warning is added only now, after an admin confirms. Detections alone never create one.
                await addConfirmedWarning(v.user_id, `مخالفة مؤكدة: ${reasonForType(v.violation_type)}`);
                setViolations((prev: any[]) => prev.map((item: any) => item.id === v.id ? { ...item, is_reviewed: true, is_false_positive: false } : item));
                toast.success("تمت المراجعة وتأكيد المخالفة");
              }}>تمت المراجعة</Button>
            </>
          )}
          <ViolationUserHistory userId={v.user_id} userName={v.user_name || "المستخدم"} violations={allViolations} />
          <Button size="sm" variant="outline" className="text-xs h-7 rounded-lg" onClick={sendWarning}>
            <Send className="h-3 w-3 ml-1" /> إرسال إنذار
          </Button>
          <Button size="sm" variant="destructive" className="text-xs h-7 rounded-lg" onClick={banUser}>
            <Ban className="h-3 w-3 ml-1" /> حظر مؤقت
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-7 rounded-lg text-muted-foreground" onClick={async () => {
            const reason = window.prompt("سبب الأرشفة (يبقى في السجل ولا يظهر للمستخدم):");
            if (!reason || !reason.trim()) return;
            const { error } = await (supabase as any).from("violations")
              .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id, delete_reason: reason.trim() }).eq("id", v.id);
            if (error) { toast.error("تعذرت الأرشفة"); return; }
            if (v.is_reviewed && !v.is_false_positive) await removeConfirmedWarning(v.user_id);
            setViolations((prev: any[]) => prev.filter((item: any) => item.id !== v.id));
            toast.success("تمت أرشفة المخالفة (محفوظة في السجل)");
          }}>
            <Archive className="h-3.5 w-3.5 ml-1" /> أرشفة
          </Button>
        </div>
      </div>
    </div>
  );
};

// One collapsible block per teacher: all of that teacher's violations in one place, compact cards inside.
const TeacherGroup = ({ name, items, defaultOpen, user, setViolations, allViolations }: { name: string; items: any[]; defaultOpen: boolean; user: any; setViolations: any; allViolations: any[] }) => {
  const [open, setOpen] = useState(defaultOpen);
  const counted = items.filter((v: any) => !v.is_false_positive);
  const pending = counted.filter((v: any) => !v.is_reviewed).length;
  const byType = new Map<string, number>();
  counted.forEach((v: any) => byType.set(v.violation_type, (byType.get(v.violation_type) || 0) + 1));
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 flex-wrap px-3 py-2 bg-muted/40 hover:bg-muted/60 text-right">
        <Users className="h-4 w-4 text-primary" />
        <span className="font-bold text-sm text-foreground">{name}</span>
        <Badge variant="outline" className="text-[10px]">{counted.length} مخالفة</Badge>
        {pending > 0 && <Badge className="text-[10px] border-0 bg-warning/15 text-warning">قيد المراجعة {pending}</Badge>}
        {[...byType.entries()].map(([t, n]) => (
          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-background text-muted-foreground">{metaFor(t).label} {n}</span>
        ))}
        <ChevronDown className={`h-4 w-4 mr-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="p-2 space-y-2">
          {items.map((v: any) => <ViolationCard key={v.id} v={v} user={user} setViolations={setViolations} allViolations={allViolations} />)}
        </div>
      )}
    </div>
  );
};

const ViolationsList = ({ items, user, setViolations, allViolations, groupByUser = false }: { items: any[]; user: any; setViolations: any; allViolations: any[]; groupByUser?: boolean }) => {
  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 text-success mx-auto mb-3 opacity-60" />
        <p className="font-bold text-foreground mb-1">لا توجد مخالفات</p>
        <p className="text-sm text-muted-foreground">النظام يراقب المحادثات والصوت تلقائياً</p>
      </div>
    );
  }
  if (groupByUser) {
    const groups = new Map<string, any[]>();
    items.forEach((v: any) => { const k = v.user_id; groups.set(k, [...(groups.get(k) || []), v]); });
    return (
      <div className="space-y-2">
        {[...groups.entries()].map(([uid, list], i) => (
          <TeacherGroup key={uid} name={list[0]?.user_name || "معلم"} items={list} defaultOpen={i < 3} user={user} setViolations={setViolations} allViolations={allViolations} />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((v: any) => <ViolationCard key={v.id} v={v} user={user} setViolations={setViolations} allViolations={allViolations} />)}
    </div>
  );
};

const ViolationsTab = ({
  violations, setViolations, user,
  searchQuery, setSearchQuery, statusFilter, setStatusFilter,
  dateFrom, dateTo, setDateFrom, setDateTo,
}: ViolationsTabProps) => {
  const [activeRole, setActiveRole] = useState<"all" | "student" | "teacher">("all");

  const [filters, setFilters] = useState<ViolationFilters>(DEFAULT_FILTERS);
  const filtered = useMemo(() => sortBySeverityThenDate(applyViolationFilters(violations, filters)), [violations, filters]);
  const studentItems = useMemo(() => filtered.filter((v: any) => v.user_role !== "teacher"), [filtered]);
  const teacherItems = useMemo(() => filtered.filter((v: any) => v.user_role === "teacher"), [filtered]);
  const selectCls = "h-9 rounded-xl border border-input bg-background px-2 text-sm";

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            المخالفات المكتشفة ({violations.length})
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Input placeholder="بحث بالاسم..." value={searchQuery} onChange={(e: any) => setSearchQuery(e.target.value)} className="w-40 rounded-xl text-sm h-9" />
            <StatusFilter value={statusFilter} onChange={setStatusFilter} options={[
              { value: "unreviewed", label: "قيد المراجعة" },
              { value: "reviewed", label: "مؤكدة" },
              { value: "false_positive", label: "ملغاة" },
            ]} />
            <select aria-label="الخطورة" className={selectCls} value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value as ViolationFilters["severity"] })}>
              <option value="all">كل الخطورة</option>
              {(Object.keys(SEVERITY_LABELS) as ViolationSeverity[]).map((k) => <option key={k} value={k}>{SEVERITY_LABELS[k]}</option>)}
            </select>
            <select aria-label="النوع" className={selectCls} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="all">كل الأنواع</option>
              {Object.entries(VIOLATION_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <select aria-label="المصدر" className={selectCls} value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
              <option value="all">كل المصادر</option>
              {Object.entries(SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <Input type="month" aria-label="الشهر" title="اختر شهراً" className="w-40 rounded-xl text-sm h-9"
              value={dateFrom && dateFrom.slice(0, 7) === dateTo.slice(0, 7) && dateFrom.endsWith("-01") ? dateFrom.slice(0, 7) : ""}
              onChange={(e: any) => { const r = monthRange(e.target.value); setDateFrom(r.from); setDateTo(r.to); }} />
            <DateFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
            <ExportCSVButton
              data={filtered.map((v: any) => ({
                user: v.user_name, role: v.user_role === "teacher" ? "معلم" : "طالب",
                other_party: v.other_party_name || "—",
                booking: v.booking_id || "—",
                type: metaFor(v.violation_type).label, severity: SEVERITY_LABELS[severityOf(v.violation_type)], text: v.original_message || v.detected_text,
                source: v.source, confidence: Math.round((v.confidence_score || 0) * 100) + "%",
                in_session: formatTimestampInSession(v.timestamp_in_session) || "—",
                warnings: v.warning_count || 0,
                date: formatDateTime(v.created_at),
                status: v.is_false_positive ? "ملغاة" : v.is_reviewed ? "مؤكدة" : "قيد المراجعة",
              }))}
              headers={[
                { key: "user", label: "المستخدم" }, { key: "role", label: "الدور" },
                { key: "other_party", label: "الطرف الآخر" }, { key: "booking", label: "الجلسة" },
                { key: "type", label: "النوع" }, { key: "severity", label: "الخطورة" }, { key: "text", label: "النص" },
                { key: "source", label: "المصدر" }, { key: "confidence", label: "الثقة" },
                { key: "in_session", label: "اللحظة" }, { key: "warnings", label: "التحذيرات" },
                { key: "date", label: "التاريخ" }, { key: "status", label: "الحالة" },
              ]}
              filename="المخالفات"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeRole} onValueChange={(v: any) => setActiveRole(v)} className="w-full">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl mb-4">
            <TabsTrigger value="all">الكل ({filtered.length})</TabsTrigger>
            <TabsTrigger value="student">🎓 الطلاب ({studentItems.length})</TabsTrigger>
            <TabsTrigger value="teacher">👨‍🏫 المعلمون ({teacherItems.length})</TabsTrigger>
            <TabsTrigger value="warnings" className="gap-1">
              <FileWarning className="h-3 w-3" /> التحذيرات والحظر
            </TabsTrigger>
          </TabsList>
          <TabsContent value="all"><ViolationsList items={filtered} user={user} setViolations={setViolations} allViolations={violations} /></TabsContent>
          <TabsContent value="student"><ViolationsList items={studentItems} user={user} setViolations={setViolations} allViolations={violations} /></TabsContent>
          <TabsContent value="teacher"><ViolationsList items={teacherItems} user={user} setViolations={setViolations} allViolations={violations} groupByUser /></TabsContent>
          <TabsContent value="warnings"><UserWarningsList roleFilter="all" /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ViolationsTab;
