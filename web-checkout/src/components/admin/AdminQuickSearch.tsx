import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, User, BookOpen, Video, Loader2, GraduationCap } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Result = {
  id: string;
  type: "user" | "teacher" | "booking" | "session";
  title: string;
  subtitle?: string;
  tab: string;
  highlightId?: string;
};

interface Props {
  onNavigateTab: (tab: string) => void;
}

export default function AdminQuickSearch({ onNavigateTab }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const navigate = useNavigate();

  // Open with Ctrl/Cmd + K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) { setResults([]); return; }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const like = `%${q}%`;
        const [profilesRes, teachersRes, bookingsRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("user_id, full_name, phone")
            .or(`full_name.ilike.${like},phone.ilike.${like}`)
            .limit(8),
          supabase
            .from("teacher_profiles")
            .select("id, user_id, is_approved, hourly_rate")
            .limit(20),
          supabase
            .from("bookings")
            .select("id, status, scheduled_at, student_id, teacher_id, duration_minutes")
            .or(`status.ilike.${like}`)
            .order("created_at", { ascending: false })
            .limit(8),
        ]);

        const userResults: Result[] = (profilesRes.data || []).map(p => ({
          id: p.user_id,
          type: "user",
          title: p.full_name || "بدون اسم",
          subtitle: p.phone || "—",
          tab: "users",
          highlightId: p.user_id,
        }));

        // Cross-reference teachers with profiles for teacher entries
        const teacherIds = (teachersRes.data || []).map(t => t.user_id);
        let teacherProfiles: Record<string, { full_name?: string; phone?: string }> = {};
        if (teacherIds.length > 0) {
          const { data } = await supabase
            .from("profiles")
            .select("user_id, full_name, phone")
            .in("user_id", teacherIds);
          (data || []).forEach(p => { teacherProfiles[p.user_id] = p; });
        }
        const teacherResults: Result[] = (teachersRes.data || [])
          .map(t => {
            const p = teacherProfiles[t.user_id];
            const name = p?.full_name || "";
            const phone = p?.phone || "";
            const matches = name.toLowerCase().includes(q.toLowerCase()) || phone.includes(q);
            return matches ? {
              id: t.id,
              type: "teacher" as const,
              title: name || "معلم",
              subtitle: `${t.is_approved ? "معتمد" : "بانتظار الموافقة"} · ${t.hourly_rate || 0} ر.س/س`,
              tab: t.is_approved ? "teacher_performance" : "teachers",
              highlightId: t.user_id,
            } : null;
          })
          .filter(Boolean) as Result[];

        const bookingResults: Result[] = (bookingsRes.data || []).map(b => ({
          id: b.id,
          type: "booking",
          title: `حجز · ${b.status === "completed" ? "مكتمل" : b.status === "confirmed" ? "مؤكد" : b.status === "cancelled" ? "ملغى" : "معلق"}`,
          subtitle: `${new Date(b.scheduled_at).toLocaleDateString("ar-SA")} · ${b.duration_minutes} د`,
          tab: "bookings",
          highlightId: b.id,
        }));

        setResults([...userResults, ...teacherResults, ...bookingResults]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, open]);

  const grouped = useMemo(() => {
    return {
      users: results.filter(r => r.type === "user"),
      teachers: results.filter(r => r.type === "teacher"),
      bookings: results.filter(r => r.type === "booking"),
    };
  }, [results]);

  const handleSelect = (r: Result) => {
    setOpen(false);
    onNavigateTab(r.tab);
    navigate(`/admin?tab=${r.tab}${r.highlightId ? `&q=${encodeURIComponent(r.highlightId)}` : ""}`);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 h-9 w-64 justify-between text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4" />
          <span className="text-xs">بحث سريع...</span>
        </span>
        <kbd className="hidden lg:inline-flex pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="md:hidden h-9 w-9"
        aria-label="بحث سريع"
      >
        <Search className="h-4 w-4" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="ابحث بالاسم، رقم الجوال، أو الحالة..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading && (
            <div className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> جاري البحث...
            </div>
          )}
          {!loading && query && results.length === 0 && (
            <CommandEmpty>لا توجد نتائج لـ "{query}"</CommandEmpty>
          )}
          {!loading && !query && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              ابدأ بكتابة اسم أو رقم جوال أو حالة (مثال: pending)
            </div>
          )}

          {grouped.users.length > 0 && (
            <CommandGroup heading="المستخدمون">
              {grouped.users.map(r => (
                <CommandItem key={`u-${r.id}`} onSelect={() => handleSelect(r)} className="gap-2">
                  <User className="h-4 w-4 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {grouped.teachers.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="المعلمون">
                {grouped.teachers.map(r => (
                  <CommandItem key={`t-${r.id}`} onSelect={() => handleSelect(r)} className="gap-2">
                    <GraduationCap className="h-4 w-4 text-secondary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {grouped.bookings.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="الحجوزات والحصص">
                {grouped.bookings.map(r => (
                  <CommandItem key={`b-${r.id}`} onSelect={() => handleSelect(r)} className="gap-2">
                    <BookOpen className="h-4 w-4 text-info" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
