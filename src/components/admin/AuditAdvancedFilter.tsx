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
import type { AuditRow } from "./AuditLogExport";

const STORAGE_KEY = "admin_audit_filter_presets_v1";

export type AuditFilters = {
  search: string;
  category: string; // "all" | category key
  action: string;   // "all" | action name
  actor: string;    // free text
  from: string;     // YYYY-MM-DD
  to: string;       // YYYY-MM-DD
};

export const DEFAULT_FILTERS: AuditFilters = {
  search: "", category: "all", action: "all", actor: "", from: "", to: "",
};

export function applyAuditFilters(rows: AuditRow[], f: AuditFilters): AuditRow[] {
  const fromTs = f.from ? new Date(f.from).getTime() : null;
  const toTs = f.to ? new Date(f.to).getTime() + 86400000 - 1 : null;
  const search = f.search.trim().toLowerCase();
  const actor = f.actor.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.category !== "all" && r.category !== f.category) return false;
    if (f.action !== "all" && r.action !== f.action) return false;
    if (actor && !(r.actor_name || "").toLowerCase().includes(actor)) return false;
    if (search) {
      const blob = `${r.action} ${r.description || ""} ${r.target_table || ""} ${r.target_id || ""} ${r.ip_address || ""}`.toLowerCase();
      if (!blob.includes(search)) return false;
    }
    if (fromTs !== null) { const t = new Date(r.created_at).getTime(); if (t < fromTs) return false; }
    if (toTs !== null) { const t = new Date(r.created_at).getTime(); if (t > toTs) return false; }
    return true;
  });
}

type Preset = { name: string; filters: AuditFilters };

interface Props {
  rows: AuditRow[]; // unfiltered, used to derive distinct actions
  filters: AuditFilters;
  setFilters: (f: AuditFilters) => void;
  categoryLabels: Record<string, string>;
}

export default function AuditAdvancedFilter({ rows, filters, setFilters, categoryLabels }: Props) {
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

  const distinctActions = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.action))).sort();
  }, [rows]);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.search) n++;
    if (filters.category !== "all") n++;
    if (filters.action !== "all") n++;
    if (filters.actor) n++;
    if (filters.from) n++;
    if (filters.to) n++;
    return n;
  }, [filters]);

  const update = (patch: Partial<AuditFilters>) => setFilters({ ...filters, ...patch });
  const clear = () => setFilters(DEFAULT_FILTERS);

  const saveCurrent = () => {
    const name = presetName.trim();
    if (!name) { toast.error("أدخل اسماً للإعداد"); return; }
    const next = [...presets.filter((p) => p.name !== name), { name, filters }];
    savePresets(next);
    setPresetName("");
    toast.success(`تم حفظ الإعداد "${name}"`);
  };

  const applyPreset = (p: Preset) => {
    setFilters(p.filters);
    toast.success(`تم تطبيق "${p.name}"`);
  };

  const removePreset = (name: string) => {
    savePresets(presets.filter((p) => p.name !== name));
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
        <div className="md:col-span-3">
          <Label className="text-[10px]">بحث نصي</Label>
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="إجراء، وصف، IP..."
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
              className="pr-8 h-9 text-xs"
            />
          </div>
        </div>
        <div className="md:col-span-2">
          <Label className="text-[10px]">المنفذ</Label>
          <Input
            placeholder="اسم العضو..."
            value={filters.actor}
            onChange={(e) => update({ actor: e.target.value })}
            className="h-9 text-xs"
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-[10px]">الفئة</Label>
          <Select value={filters.category} onValueChange={(v) => update({ category: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفئات</SelectItem>
              {Object.entries(categoryLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-[10px]">الإجراء</Label>
          <Select value={filters.action} onValueChange={(v) => update({ action: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">كل الإجراءات</SelectItem>
              {distinctActions.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          {filters.from && filters.to && (
            <Badge variant="outline" className="text-[10px]">
              {filters.from} → {filters.to}
            </Badge>
          )}
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
              <p className="px-2 py-3 text-[11px] text-muted-foreground text-center">لا توجد إعدادات محفوظة</p>
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
