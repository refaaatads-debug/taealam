import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Snap {
  disk_total_bytes: number; disk_used_bytes: number; last_backup_at: string | null;
  last_backup_bytes: number | null; backup_count: number | null; created_at: string;
}
const gb = (n: number) => `${(Number(n) / 1024 ** 3).toFixed(1)} GB`;
const hoursAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3600000;

export default function ServerStatusTab() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [state, setState] = useState<"loading" | "missing" | "empty" | "ok">("loading");

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any).from("server_status_snapshots").select("*").order("created_at", { ascending: false }).limit(1);
      if (error) return setState("missing");
      if (!data?.length) return setState("empty");
      setSnap(data[0]); setState("ok");
    })();
  }, []);

  if (state !== "ok" || !snap) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground" dir="rtl">
      {state === "loading" ? "جارٍ التحميل..." : "لا توجد بيانات حالة الخادم بعد."}
    </CardContent></Card>;
  }
  const pct = Math.round((Number(snap.disk_used_bytes) / Number(snap.disk_total_bytes)) * 100);
  const diskBad = pct >= 85;
  const stale = hoursAgo(snap.created_at) > 3;
  const backupOld = !snap.last_backup_at || hoursAgo(snap.last_backup_at) > 36;
  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="h-5 w-5 text-primary" />النسخ الاحتياطي ومساحة القرص</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className={diskBad ? "font-bold text-destructive" : "font-bold"}>القرص: {pct}% مستخدم ({gb(snap.disk_used_bytes)} من {gb(snap.disk_total_bytes)})</p>
            <div className="mt-1 h-2 w-full rounded bg-muted"><div className={`h-2 rounded ${diskBad ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
          </div>
          <p className={backupOld ? "font-bold text-destructive" : ""}>
            آخر نسخة احتياطية: {snap.last_backup_at ? new Date(snap.last_backup_at).toLocaleString("ar-SA") : "غير موجودة"}
            {snap.last_backup_bytes ? ` (${(Number(snap.last_backup_bytes) / 1024 ** 2).toFixed(0)} MB)` : ""}
          </p>
          <p>عدد النسخ المحفوظة: {snap.backup_count ?? 0}</p>
          <p className={stale ? "text-destructive" : "text-muted-foreground"}>آخر تحديث للبيانات: {new Date(snap.created_at).toLocaleString("ar-SA")}{stale ? " (قديم)" : ""}</p>
        </CardContent>
      </Card>
    </div>
  );
}
