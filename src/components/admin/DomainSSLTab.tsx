import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX, RefreshCw, Plus, Trash2, Globe, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/auditLog";

interface SSLCheck {
  id: string;
  domain: string;
  https_enabled: boolean;
  status_code: number | null;
  cert_valid: boolean | null;
  cert_issuer: string | null;
  cert_valid_to: string | null;
  days_until_expiry: number | null;
  protocol: string | null;
  response_time_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

const DEFAULT_DOMAINS_KEY = "admin_ssl_domains";

const DomainSSLTab = () => {
  const { toast } = useToast();
  const [domains, setDomains] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DEFAULT_DOMAINS_KEY) || "null");
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch { /* ignore */ }
    return ["ajyalaap.lovable.app"];
  });
  const [newDomain, setNewDomain] = useState("");
  const [checking, setChecking] = useState(false);
  const [latest, setLatest] = useState<SSLCheck[]>([]);
  const [history, setHistory] = useState<SSLCheck[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    localStorage.setItem(DEFAULT_DOMAINS_KEY, JSON.stringify(domains));
  }, [domains]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from("domain_ssl_checks")
      .select("*")
      .order("checked_at", { ascending: false })
      .limit(100);
    if (error) {
      toast({ title: "خطأ في تحميل السجل", description: error.message, variant: "destructive" });
    } else {
      setHistory((data as SSLCheck[]) || []);
      // Latest per domain
      const map = new Map<string, SSLCheck>();
      (data as SSLCheck[] || []).forEach((r) => {
        if (!map.has(r.domain)) map.set(r.domain, r);
      });
      setLatest(Array.from(map.values()));
    }
    setLoadingHistory(false);
  };

  useEffect(() => { loadHistory(); }, []);

  const runCheck = async () => {
    if (domains.length === 0) {
      toast({ title: "لا توجد دومينات للفحص", variant: "destructive" });
      return;
    }
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-ssl-status", {
        body: { domains },
      });
      if (error) throw error;
      toast({ title: "✅ اكتمل الفحص", description: `تم فحص ${domains.length} دومين` });
      await logAdminAction({
        action: "ssl_check",
        category: "system",
        description: `فحص SSL لـ ${domains.join(", ")}`,
        metadata: { domains, results: data?.results },
      });
      await loadHistory();
    } catch (e: any) {
      toast({ title: "فشل الفحص", description: e.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const addDomain = () => {
    const d = newDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!d) return;
    if (domains.includes(d)) {
      toast({ title: "الدومين موجود مسبقاً", variant: "destructive" });
      return;
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)) {
      toast({ title: "صيغة الدومين غير صحيحة", variant: "destructive" });
      return;
    }
    setDomains([...domains, d]);
    setNewDomain("");
  };

  const removeDomain = (d: string) => setDomains(domains.filter((x) => x !== d));

  const statusBadge = (r: SSLCheck) => {
    if (!r.https_enabled) {
      return <Badge variant="destructive" className="gap-1"><ShieldX className="h-3 w-3" />HTTPS معطل</Badge>;
    }
    if (r.cert_valid === false) {
      return <Badge variant="destructive" className="gap-1"><ShieldX className="h-3 w-3" />شهادة منتهية</Badge>;
    }
    if (r.days_until_expiry !== null && r.days_until_expiry < 14) {
      return <Badge className="gap-1 bg-amber-500"><ShieldAlert className="h-3 w-3" />تنتهي قريباً</Badge>;
    }
    return <Badge className="gap-1 bg-emerald-600"><ShieldCheck className="h-3 w-3" />آمن</Badge>;
  };

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            تقرير حالة HTTPS / SSL
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="example.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDomain()}
              className="max-w-xs"
            />
            <Button onClick={addDomain} variant="outline" size="sm">
              <Plus className="h-4 w-4 ml-1" /> إضافة دومين
            </Button>
            <Button onClick={runCheck} disabled={checking || domains.length === 0}>
              {checking ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <RefreshCw className="h-4 w-4 ml-1" />}
              فحص الآن
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <Badge key={d} variant="secondary" className="gap-1 py-1.5 px-3">
                <Globe className="h-3 w-3" /> {d}
                <button onClick={() => removeDomain(d)} className="mr-1 opacity-60 hover:opacity-100">
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">آخر حالة لكل دومين</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : latest.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">لم يتم تنفيذ أي فحص بعد. اضغط "فحص الآن".</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الدومين</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">المُصدِر</TableHead>
                  <TableHead className="text-right">تاريخ الانتهاء</TableHead>
                  <TableHead className="text-right">الأيام المتبقية</TableHead>
                  <TableHead className="text-right">زمن الاستجابة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latest.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.domain}</TableCell>
                    <TableCell>{statusBadge(r)}</TableCell>
                    <TableCell className="text-xs">{r.cert_issuer || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.cert_valid_to ? new Date(r.cert_valid_to).toLocaleDateString("ar-EG") : "—"}
                    </TableCell>
                    <TableCell>
                      {r.days_until_expiry !== null ? (
                        <span className={r.days_until_expiry < 14 ? "text-amber-600 font-bold" : ""}>
                          {r.days_until_expiry} يوم
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.response_time_ms ? `${r.response_time_ms}ms` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> سجل الفحوصات السابقة ({history.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-96 overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">لا توجد فحوصات سابقة</p>
          ) : (
            <div className="space-y-2">
              {history.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b pb-2">
                  <div className="flex items-center gap-2">
                    {statusBadge(r)}
                    <span className="font-medium">{r.domain}</span>
                    {r.error_message && <span className="text-xs text-destructive">{r.error_message}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.checked_at).toLocaleString("ar-EG")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DomainSSLTab;
