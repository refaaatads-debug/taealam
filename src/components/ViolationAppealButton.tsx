import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AppealRow {
  violation_id: string;
  status: "pending" | "accepted" | "rejected";
  admin_note?: string | null;
}

const STATUS_LABEL: Record<AppealRow["status"], string> = {
  pending: "الاعتراض قيد المراجعة",
  accepted: "تم قبول الاعتراض",
  rejected: "تم رفض الاعتراض",
};

interface Props {
  violationId: string;
  userId: string;
  appeal?: AppealRow;
  onCreated: (a: AppealRow) => void;
}

// One appeal per violation. The database also enforces: own violation only, pending only.
export default function ViolationAppealButton({ violationId, userId, appeal, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  if (appeal) {
    return (
      <div className="mt-1">
        <Badge variant={appeal.status === "accepted" ? "secondary" : "outline"} className="text-[10px]">{STATUS_LABEL[appeal.status]}</Badge>
        {appeal.admin_note && appeal.status !== "pending" && (
          <p className="text-[11px] text-muted-foreground mt-1">رد الإدارة: {appeal.admin_note}</p>
        )}
      </div>
    );
  }

  const submit = async () => {
    const message = text.trim();
    if (message.length < 5) { toast.error("اكتب سبب الاعتراض (5 أحرف على الأقل)"); return; }
    setBusy(true);
    const { error } = await (supabase as any).from("violation_appeals").insert({ violation_id: violationId, user_id: userId, message, status: "pending" });
    setBusy(false);
    if (error) { toast.error("تعذر إرسال الاعتراض"); return; }
    toast.success("تم إرسال الاعتراض للإدارة");
    onCreated({ violation_id: violationId, status: "pending" });
    setOpen(false);
  };

  return (
    <div className="mt-2">
      {!open ? (
        <Button size="sm" variant="outline" className="text-xs h-7 rounded-lg" onClick={() => setOpen(true)}>اعتراض على المخالفة</Button>
      ) : (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="اشرح لماذا ترى أن المخالفة غير صحيحة" className="text-xs min-h-[70px]" />
          <div className="flex gap-2">
            <Button size="sm" className="text-xs h-7 rounded-lg" disabled={busy} onClick={submit}>إرسال</Button>
            <Button size="sm" variant="ghost" className="text-xs h-7 rounded-lg" onClick={() => setOpen(false)}>إلغاء</Button>
          </div>
        </div>
      )}
    </div>
  );
}
