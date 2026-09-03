import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, BrainCircuit, CheckCircle2, ChevronDown, ChevronUp,
  Clock3, Eye, EyeOff, KeyRound, Loader2, RefreshCw, Save, Search, ServerCog,
  ShieldCheck, Sparkles, Volume2, XCircle,
} from "lucide-react";

type ModelInfo = {
  id: string;
  name: string;
  version: string;
  owner: string;
  active: boolean;
  inputLimit: number | null;
  outputLimit: number | null;
  capabilities: string[];
};

type QuotaInfo = {
  available: boolean;
  unit?: string;
  used?: number;
  limit?: number;
  remaining?: number;
  resetAt?: string | null;
  message?: string;
};

type ProviderInfo = {
  provider: "gemini" | "groq" | "elevenlabs";
  name: string;
  apiVersion: string;
  uses: string[];
  enabled: boolean;
  selectedModel: string | null;
  fallbackModel: string | null;
  keyConfigured: boolean;
  maskedKey: string;
  backupMaskedKey?: string;
  keySource: "vault" | "environment";
  connected: boolean;
  activeCredential?: "primary" | "backup" | null;
  warning?: string | null;
  error: string | null;
  models: ModelInfo[];
  quota: QuotaInfo | null;
  updatedAt: string | null;
};

const providerTheme = {
  gemini: {
    icon: Sparkles,
    gradient: "from-blue-600 to-violet-600",
    soft: "bg-blue-50 text-blue-700 border-blue-200",
  },
  groq: {
    icon: BrainCircuit,
    gradient: "from-orange-500 to-rose-500",
    soft: "bg-orange-50 text-orange-700 border-orange-200",
  },
  elevenlabs: {
    icon: Volume2,
    gradient: "from-emerald-500 to-teal-600",
    soft: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

const formatNumber = (value: number | null | undefined) =>
  value == null ? "غير محدد" : new Intl.NumberFormat("ar-SA").format(value);

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
};

const AIModelsManagementTab = () => {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ gemini: true });
  const [search, setSearch] = useState<Record<string, string>>({});
  const [newKeys, setNewKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("ai-model-management", { body });
    if (error) throw new Error((data as any)?.error || error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const loadProviders = async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const data = await invoke({ action: "list" });
      setProviders(data.providers || []);
      setCheckedAt(data.checkedAt || new Date().toISOString());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل بيانات مزودي الذكاء الاصطناعي");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadProviders(); }, []);

  const totals = useMemo(() => ({
    providers: providers.length,
    connected: providers.filter((provider) => provider.connected && provider.enabled).length,
    models: providers.reduce((sum, provider) => sum + provider.models.length, 0),
    activeModels: providers.reduce((sum, provider) => sum + provider.models.filter((model) => model.active).length, 0),
  }), [providers]);

  const saveKey = async (provider: ProviderInfo, backup = false) => {
    const slot = backup ? "elevenlabs_backup" : provider.provider;
    const apiKey = (newKeys[slot] || "").trim();
    if (apiKey.length < 8) return toast.error("أدخل مفتاحًا صالحًا أولًا");
    setSaving(`key:${slot}`);
    try {
      await invoke({ action: "save_key", provider: slot, api_key: apiKey });
      setNewKeys((current) => ({ ...current, [slot]: "" }));
      toast.success("تم التحقق من المفتاح وحفظه مشفّرًا، وأصبح جاهزًا للاستخدام");
      await loadProviders(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "لم يتم حفظ المفتاح");
    } finally {
      setSaving(null);
    }
  };

  const saveConfig = async (provider: ProviderInfo, changes: Partial<Pick<ProviderInfo, "enabled" | "selectedModel" | "fallbackModel">>) => {
    const next = { ...provider, ...changes };
    setSaving(`config:${provider.provider}`);
    try {
      await invoke({
        action: "save_config",
        provider: provider.provider,
        enabled: next.enabled,
        selected_model: next.selectedModel,
        fallback_model: next.fallbackModel,
      });
      setProviders((current) => current.map((item) => item.provider === provider.provider ? next : item));
      toast.success("تم حفظ إعدادات المزود");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الإعدادات");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-[#123d6b]" />
          <p className="mt-3 text-sm font-bold text-slate-600">جارٍ فحص المزودين والنماذج والحدود…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="overflow-hidden rounded-3xl bg-[linear-gradient(120deg,#102f55_0%,#174d79_52%,#12806f_100%)] p-6 text-white shadow-xl shadow-blue-950/10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-white/12 p-3 ring-1 ring-white/20"><ServerCog className="h-7 w-7" /></div>
            <div>
              <h2 className="text-2xl font-black">نماذج الذكاء الاصطناعي</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-50/85">
                حالة المزودين والمفاتيح والنماذج الفعلية المستخدمة في المنصة. المفاتيح لا تظهر أو تُحفظ في المتصفح؛ يتم اختبارها أولًا ثم تخزينها مشفّرة.
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-blue-100/80">
                <Clock3 className="h-3.5 w-3.5" />
                آخر فحص مباشر: {formatDate(checkedAt)}
              </div>
            </div>
          </div>
          <Button
            onClick={() => loadProviders(true)}
            disabled={refreshing}
            variant="secondary"
            className="rounded-xl bg-white text-[#123d6b] hover:bg-blue-50"
          >
            <RefreshCw className={`ml-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            تحديث الحالة
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "المزودون", value: totals.providers, icon: ServerCog, color: "text-blue-600 bg-blue-50" },
          { label: "المزودون الفعّالون", value: totals.connected, icon: Activity, color: "text-emerald-600 bg-emerald-50" },
          { label: "النماذج المكتشفة", value: totals.models, icon: BrainCircuit, color: "text-violet-600 bg-violet-50" },
          { label: "النماذج النشطة", value: totals.activeModels, icon: CheckCircle2, color: "text-teal-600 bg-teal-50" },
        ].map((item) => (
          <Card key={item.label} className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="flex items-center justify-between p-5">
              <div><p className="text-xs font-bold text-slate-500">{item.label}</p><p className="mt-1 text-3xl font-black text-slate-800">{formatNumber(item.value)}</p></div>
              <div className={`rounded-2xl p-3 ${item.color}`}><item.icon className="h-5 w-5" /></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {providers.map((provider) => {
        const theme = providerTheme[provider.provider];
        const Icon = theme.icon;
        const query = (search[provider.provider] || "").toLowerCase();
        const visibleModels = provider.models.filter((model) =>
          !query || `${model.name} ${model.id} ${model.version} ${model.owner}`.toLowerCase().includes(query)
        );
        const quotaPercent = provider.quota?.available && provider.quota.limit
          ? Math.min(100, Math.round(((provider.quota.used || 0) / provider.quota.limit) * 100))
          : 0;

        return (
          <Card key={provider.provider} className="overflow-hidden rounded-3xl border-slate-200 shadow-sm">
            <div className={`h-1.5 bg-gradient-to-l ${theme.gradient}`} />
            <CardHeader className="border-b border-slate-100 bg-slate-50/60">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-2xl bg-gradient-to-br p-3 text-white shadow-lg ${theme.gradient}`}><Icon className="h-6 w-6" /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-xl font-black text-slate-800">{provider.name}</CardTitle>
                      <Badge className={provider.connected && provider.enabled ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-rose-100 text-rose-700 hover:bg-rose-100"}>
                        {provider.connected && provider.enabled ? <CheckCircle2 className="ml-1 h-3.5 w-3.5" /> : <XCircle className="ml-1 h-3.5 w-3.5" />}
                        {provider.connected && provider.enabled ? "نشط وفعّال" : provider.enabled ? "غير متصل" : "موقوف"}
                      </Badge>
                      <Badge variant="outline">API {provider.apiVersion}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{provider.models.length} نموذج مكتشف • {provider.models.filter((model) => model.active).length} نشط</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2">
                  <div><p className="text-xs font-bold text-slate-700">تشغيل المزود</p><p className="text-[10px] text-slate-400">يؤثر على جميع وظائفه</p></div>
                  <Switch
                    checked={provider.enabled}
                    disabled={saving === `config:${provider.provider}`}
                    onCheckedChange={(enabled) => saveConfig(provider, { enabled })}
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 p-5 lg:p-6">
              {provider.error && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-black">تعذر الاتصال بالمزود</p><p className="mt-1">{provider.error}</p></div>
                </div>
              )}
              {provider.warning && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div><p className="font-black">تم تفعيل المسار الاحتياطي</p><p className="mt-1">{provider.warning}</p></div>
                </div>
              )}

              <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div><h3 className="font-black text-slate-800">مفتاح API الأساسي</h3><p className="mt-1 text-xs text-slate-500">المفتاح الحالي: {provider.maskedKey || "غير معد"}{provider.activeCredential === "backup" ? " • الاحتياطي مستخدم الآن" : ""}</p></div>
                    <Badge variant="outline" className={theme.soft}><ShieldCheck className="ml-1 h-3.5 w-3.5" />{provider.keySource === "vault" ? "Supabase Vault" : "متغير الخادم"}</Badge>
                  </div>
                  <Label htmlFor={`key-${provider.provider}`} className="text-xs text-slate-600">أدخل المفتاح الجديد فقط عند الاستبدال</Label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <Input
                        id={`key-${provider.provider}`}
                        type={showKeys[provider.provider] ? "text" : "password"}
                        value={newKeys[provider.provider] || ""}
                        onChange={(event) => setNewKeys((current) => ({ ...current, [provider.provider]: event.target.value }))}
                        placeholder="ألصق المفتاح الجديد هنا"
                        autoComplete="new-password"
                        className="pl-10 font-mono text-left"
                        dir="ltr"
                      />
                      <button type="button" onClick={() => setShowKeys((current) => ({ ...current, [provider.provider]: !current[provider.provider] }))} className="absolute left-3 top-2.5 text-slate-400">
                        {showKeys[provider.provider] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button onClick={() => saveKey(provider)} disabled={saving === `key:${provider.provider}`} className="rounded-xl bg-[#123d6b]">
                      {saving === `key:${provider.provider}` ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                      اختبار وحفظ
                    </Button>
                  </div>

                  {provider.provider === "elevenlabs" && (
                    <div className="mt-5 border-t border-dashed border-slate-200 pt-5">
                      <div className="mb-2 flex items-center justify-between"><Label className="text-xs text-slate-600">المفتاح الاحتياطي</Label><span className="text-xs font-mono text-slate-500">{provider.backupMaskedKey || "غير معد"}</span></div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          type={showKeys.elevenlabs_backup ? "text" : "password"}
                          value={newKeys.elevenlabs_backup || ""}
                          onChange={(event) => setNewKeys((current) => ({ ...current, elevenlabs_backup: event.target.value }))}
                          placeholder="مفتاح ElevenLabs الاحتياطي"
                          autoComplete="new-password"
                          className="font-mono text-left"
                          dir="ltr"
                        />
                        <Button variant="outline" onClick={() => saveKey(provider, true)} disabled={saving === "key:elevenlabs_backup"}>
                          {saving === "key:elevenlabs_backup" ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <KeyRound className="ml-2 h-4 w-4" />}حفظ الاحتياطي
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 p-5">
                  <h3 className="font-black text-slate-800">حد الاستخدام المتبقي</h3>
                  {provider.quota?.available ? (
                    <div className="mt-4">
                      <div className="flex items-end justify-between">
                        <div><p className="text-3xl font-black text-emerald-700">{formatNumber(provider.quota.remaining)}</p><p className="text-xs text-slate-500">{provider.quota.unit} متبقٍ</p></div>
                        <div className="text-left text-xs text-slate-500"><p>المستخدم: {formatNumber(provider.quota.used)}</p><p>الإجمالي: {formatNumber(provider.quota.limit)}</p></div>
                      </div>
                      <Progress value={quotaPercent} className="mt-4 h-2.5" />
                      <p className="mt-3 text-xs text-slate-500">موعد التجديد: {formatDate(provider.quota.resetAt)}</p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                      <AlertTriangle className="mb-2 h-5 w-5" />{provider.quota?.message || "لا توجد بيانات حدود متاحة."}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div><h3 className="font-black text-slate-800">الاستخدام داخل المنصة</h3><div className="mt-2 flex flex-wrap gap-2">{provider.uses.map((use) => <Badge key={use} variant="secondary">{use}</Badge>)}</div></div>
                  {provider.provider !== "elevenlabs" && (
                    <div className="w-full lg:w-80">
                      <Label className="mb-2 block text-xs text-slate-500">النموذج الرئيسي</Label>
                      <Select
                        value={provider.selectedModel || "automatic"}
                        onValueChange={(value) => saveConfig(provider, { selectedModel: value === "automatic" ? null : value })}
                        disabled={saving === `config:${provider.provider}`}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="automatic">اختيار تلقائي موصى به</SelectItem>
                          {provider.models.filter((model) => model.active).map((model) => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <button type="button" onClick={() => setExpanded((current) => ({ ...current, [provider.provider]: !current[provider.provider] }))} className="flex w-full items-center justify-between bg-slate-50 px-5 py-4 text-right">
                  <div><p className="font-black text-slate-800">تفاصيل النماذج</p><p className="mt-1 text-xs text-slate-500">الإصدار، الحالة، السعة، القدرات والحد المتبقي لكل نموذج</p></div>
                  {expanded[provider.provider] ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
                </button>
                {expanded[provider.provider] && (
                  <div className="p-4">
                    <div className="relative mb-4">
                      <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input value={search[provider.provider] || ""} onChange={(event) => setSearch((current) => ({ ...current, [provider.provider]: event.target.value }))} placeholder="ابحث بالاسم أو الإصدار…" className="pr-9" />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead><tr className="border-b text-right text-xs text-slate-500"><th className="p-3">النموذج</th><th className="p-3">الإصدار والمالك</th><th className="p-3">الحالة</th><th className="p-3">حد الإدخال</th><th className="p-3">حد الإخراج</th><th className="p-3">القدرات</th><th className="p-3">المتبقي</th></tr></thead>
                        <tbody>
                          {visibleModels.map((model) => (
                            <tr key={model.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                              <td className="p-3"><p className="font-bold text-slate-800">{model.name}</p><p className="mt-1 max-w-[250px] truncate font-mono text-[10px] text-slate-400" dir="ltr">{model.id}</p></td>
                              <td className="p-3"><p className="font-medium">{model.version}</p><p className="text-xs text-slate-400">{model.owner}</p></td>
                              <td className="p-3"><Badge className={model.active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-100"}>{model.active ? "فعال" : "غير مخصص للتوليد"}</Badge></td>
                              <td className="p-3 font-mono text-xs">{formatNumber(model.inputLimit)}</td>
                              <td className="p-3 font-mono text-xs">{formatNumber(model.outputLimit)}</td>
                              <td className="p-3"><div className="flex max-w-[260px] flex-wrap gap-1">{model.capabilities.slice(0, 3).map((capability) => <Badge key={capability} variant="outline" className="text-[10px]">{capability}</Badge>)}</div></td>
                              <td className="p-3">{provider.quota?.available ? <span className="font-bold text-emerald-700">{formatNumber(provider.quota.remaining)} {provider.quota.unit}</span> : <span className="text-xs text-amber-700">غير متاح من المزود</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!visibleModels.length && <p className="py-8 text-center text-sm text-slate-500">لا توجد نماذج مطابقة للبحث.</p>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <p><strong>الحماية:</strong> لا تعيد الخوادم المفتاح الكامل إلى لوحة التحكم في أي وقت. عند الاستبدال يُختبر المفتاح مع المزود، ثم يُحفظ داخل Supabase Vault ويبدأ استخدامه في وظائف الذكاء الاصطناعي خلال ثوانٍ.</p>
      </div>
    </div>
  );
};

export default AIModelsManagementTab;