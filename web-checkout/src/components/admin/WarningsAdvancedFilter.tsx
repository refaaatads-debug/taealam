import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Search, Filter, Bookmark, Save, X, Trash2, Globe } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "admin_warnings_filter_presets_v1";

export type WarningStatus = "all" | "active_ban" | "expired" | "warning_only";

export type WarningFilters = {
  search: string;
  type: string;     // "all" | warning_type
  status: WarningStatus;
  role: "all" | "student" | "teacher";
  countMin: string; // "" | number string
  from: string;     // YYYY-MM-DD
  to: string;       // YYYY-MM-DD
};

export const DEFAULT_WARNING_FILTERS: WarningFilters = {
  search: "", type: "all", status: "all", role: "all", countMin: "", from: "", to: "",
};

type Preset = { name: string; filters: WarningFilters };

interface Props {
  filters: WarningFilters;
  setFilters: (f: WarningFilters) => void;
  typeLabels: Record<string, string>;
  availableTypes: string[];
}

export default function WarningsAdvancedFilter({ filters, setFilters, typeLabels, availableTypes }: Props) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPresets(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  const savePresets = (next: Preset[]) => {
    setPresets(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  };

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.search) n++;
    if (filters.type !== "all") n++;
    if (filters.status !== "all") n++;
    if (filters.role !== "all") n++;
    if (filters.countMin) n++;
    if (filters.from) n++;
    if (filters.to) n++;
    return n;
  }, [filters]);

  const update = (patch: Partial<WarningFilters>) => setFilters({ ...filters, ...patch });
  const clear = () => setFilters(DEFAULT_WARNING_FILTERS);

  const saveCurrent = () => {
    const name = presetName.trim();
    if (!name) { toast.error("أدخل اسماً للإعداد"); return; }
    const next = [...presets.filter((p) => p.name !== name), { name, filters }];
    savePresets(next);
    setPresetName("");
    toast.success(`تم حفظ "${name}"`);
  };

  const applyPreset = (p: Preset) => {
    setFilters(p.filters);
    toast.success(`تم تطبيق "${p.name}"`);
  };

  const removePreset = (name: string) => savePresets(presets.filter((p) => p.name !== name));

  return (
    <div className="space-y-2 p-3 rounded-xl border bg-muted/20">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
        <div className="md:col-span-3">
          <Label className="text-[10px]">بحث نصي</Label>
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="اسم، وصف..."
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
              className="pr-8 h-9 text-xs"
            />
          </div>
        </div>
        <div className="md:col-span-2">
          <Label className="text-[10px]">نوع التحذير</Label>
          <Select value={filters.type} onValueChange={(v) => update({ type: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              {availableTypes.map((t) => (
                <SelectItem key={t} value={t}>{typeLabels[t] || t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-[10px]">الحالة</Label>
          <Select value={filters.status} onValueChange={(v: WarningStatus) => update({ status: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="active_ban">محظور حالياً</SelectItem>
              <SelectItem value="expired">انتهى الحظر</SelectItem>
              <SelectItem value="warning_only">تحذير فقط (بدون حظر)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-1">
          <Label className="text-[10px]">الدور</Label>
          <Select value={filters.role} onValueChange={(v: any) => update({ role: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="student">طالب</SelectItem>
              <SelectItem value="teacher">معلم</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-1">
          <Label className="text-[10px]">عداد ≥</Label>
          <Input
            type="number" min={0} max={3} placeholder="0"
            value={filters.countMin}
            onChange={(e) => update({ countMin: e.target.value })}
            className="h-9 text-xs"
          />
        </div>
        <div className="md:col-span-1">
          <Label className="text-[10px]">من</Label>
          <Input type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} className="h-9 text-xs" />
        </div>
        <div className="md:col-span-2">
          <Label className="text-[10px]">إلى</Label>
          <Input type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} className="h-9 text-xs" />
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Filter className="h-3 w-3" />
            {activeCount === 0 ? "بدون فلتر" : `${activeCount} فلتر نشط`}
          </Badge>
          {activeCount > 0 && (
            <Button size="sm" variant="ghost" onClick={clear} className="h-7 text-[11px] gap-1">
              <X className="h-3 w-3" /> مسح
            </Button>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 h-9">
              <Bookmark className="h-3.5 w-3.5" />
              الإعدادات المحفوظة
              {presets.length > 0 && <Badge className="text-[9px] h-4 px-1.5">{presets.length}</Badge>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="flex items-center gap-1">
              <Save className="h-3.5 w-3.5" /> حفظ الإعداد الحالي
            </DropdownMenuLabel>
            <div className="px-2 pb-2 flex gap-1">
              <Input
                placeholder="اسم الإعداد..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="h-8 text-xs"
              />
              <Button size="sm" onClick={saveCurrent} className="h-8 px-2 gap-1">
                <Save className="h-3 w-3" />
              </Button>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px]">إعدادات محفوظة</DropdownMenuLabel>
            {presets.length === 0 ? (
              <p className="px-2 py-3 text-[11px] text-muted-foreground text-center">لا توجد إعدادات</p>
            ) : (
              presets.map((p) => (
                <div key={p.name} className="flex items-center gap-1 px-1">
                  <DropdownMenuItem onClick={() => applyPreset(p)} className="flex-1 text-xs">
                    <Globe className="h-3 w-3 ml-1" /> {p.name}
                  </DropdownMenuItem>
                  <button
                    onClick={(e) => { e.stopPropagation(); removePreset(p.name); }}
                    className="p-1 rounded hover:bg-destructive/10 text-destructive"
                    title="حذف"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function applyWarningFilters<T extends {
  warning_type: string; warning_count: number; is_banned: boolean;
  banned_until: string | null; description: string | null; created_at: string;
  user_name?: string; user_role?: string;
}>(rows: T[], f: WarningFilters): T[] {
  const now = Date.now();
  const fromTs = f.from ? new Date(f.from).getTime() : null;
  const toTs = f.to ? new Date(f.to).getTime() + 86400000 - 1 : null;
  const search = f.search.trim().toLowerCase();
  const minCount = f.countMin ? parseInt(f.countMin, 10) : null;
  return rows.filter((r) => {
    if (f.role !== "all" && r.user_role !== f.role) return false;
    if (f.type !== "all" && r.warning_type !== f.type) return false;
    if (minCount !== null && !isNaN(minCount) && r.warning_count < minCount) return false;
    if (f.status === "active_ban") {
      if (!r.is_banned) return false;
      if (r.banned_until && new Date(r.banned_until).getTime() < now) return false;
    }
    if (f.status === "expired") {
      if (!r.banned_until) return false;
      if (new Date(r.banned_until).getTime() >= now) return false;
    }
    if (f.status === "warning_only" && r.is_banned) return false;
    if (search) {
      const blob = `${r.user_name || ""} ${r.warning_type} ${r.description || ""}`.toLowerCase();
      if (!blob.includes(search)) return false;
    }
    const t = new Date(r.created_at).getTime();
    if (fromTs !== null && t < fromTs) return false;
    if (toTs !== null && t > toTs) return false;
    return true;
  });
}
