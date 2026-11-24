import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LifeBuoy, ExternalLink, MessageSquare } from "lucide-react";
import type { StudentBundle } from "@/pages/AdminStudentProfile";

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: "مفتوحة", cls: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
    in_progress: { label: "قيد المعالجة", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    closed: { label: "مغلقة", cls: "bg-muted text-muted-foreground border-border" },
    resolved: { label: "محلولة", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  };
  const m = map[status] || { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
};

const StudentSupportTab = ({ data, studentId }: { data: StudentBundle; studentId: string }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">إجمالي التذاكر</div><div className="text-2xl font-bold">{data.tickets.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">مفتوحة</div><div className="text-2xl font-bold text-amber-600">{data.tickets.filter((t: any) => t.status !== "closed").length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">مغلقة</div><div className="text-2xl font-bold text-emerald-600">{data.tickets.filter((t: any) => t.status === "closed").length}</div></CardContent></Card>
      </div>

      {data.tickets.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><LifeBuoy className="h-8 w-8 mx-auto mb-2 opacity-50" />لا توجد تذاكر دعم لهذا الطالب</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.tickets.map((t: any) => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm truncate">{t.title || "تذكرة بدون عنوان"}</h4>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{new Date(t.created_at).toLocaleString("ar-SA")}</span>
                      {t.priority && <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>}
                    </div>
                  </div>
                  {statusBadge(t.status)}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {t.support_messages?.[0]?.count || 0} رسالة
                  </div>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate(`/admin?tab=support&ticket=${t.id}`)}>
                    <ExternalLink className="h-3 w-3" /> فتح التذكرة
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentSupportTab;
