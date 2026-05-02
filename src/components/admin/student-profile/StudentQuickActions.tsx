import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MoreVertical, MessageSquare, Phone, Bell, Ticket, FileText, Send } from "lucide-react";

const StudentQuickActions = ({ studentId, profile, onChanged }: { studentId: string; profile: any; onChanged: () => void }) => {
  const [open, setOpen] = useState<"notify" | "note" | null>(null);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const sendNotification = async () => {
    if (!notifyTitle.trim()) return toast.error("أدخل عنواناً");
    setBusy(true);
    try {
      const { error } = await supabase.from("notifications").insert({
        user_id: studentId,
        title: notifyTitle,
        body: notifyBody || null,
        type: "admin_message",
      });
      if (error) throw error;
      toast.success("تم إرسال الإشعار");
      setNotifyTitle(""); setNotifyBody(""); setOpen(null);
      onChanged();
    } catch (e: any) {
      toast.error("فشل الإرسال");
    } finally { setBusy(false); }
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("admin_audit_log").insert({
        actor_id: user?.id,
        action: "internal_note",
        category: "students",
        description: note,
        target_table: "profiles",
        target_id: studentId,
      });
      toast.success("تم حفظ الملاحظة");
      setNote(""); setOpen(null);
    } catch {
      toast.error("فشل الحفظ");
    } finally { setBusy(false); }
  };

  const wa = profile?.phone ? `https://wa.me/${profile.phone.replace(/\D/g, "")}` : null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen("notify")}>
          <Bell className="h-3.5 w-3.5" /> إشعار
        </Button>
        {wa && (
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <a href={wa} target="_blank" rel="noreferrer"><MessageSquare className="h-3.5 w-3.5" /> واتساب</a>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1"><MoreVertical className="h-3.5 w-3.5" /> المزيد</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-background">
            <DropdownMenuItem onClick={() => setOpen("note")}><FileText className="h-3.5 w-3.5 ml-2" /> ملاحظة داخلية</DropdownMenuItem>
            {profile?.phone && (
              <DropdownMenuItem asChild>
                <a href={`tel:${profile.phone}`}><Phone className="h-3.5 w-3.5 ml-2" /> اتصال هاتفي</a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.open(`/admin?tab=support&new_for=${studentId}`, "_blank")}>
              <Ticket className="h-3.5 w-3.5 ml-2" /> إنشاء تذكرة دعم
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={open === "notify"} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إرسال إشعار للطالب</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">العنوان</Label><Input value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} /></div>
            <div><Label className="text-xs">المحتوى</Label><Textarea value={notifyBody} onChange={(e) => setNotifyBody(e.target.value)} rows={4} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>إلغاء</Button>
            <Button onClick={sendNotification} disabled={busy} className="gap-1.5"><Send className="h-3.5 w-3.5" /> إرسال</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "note"} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>ملاحظة داخلية</DialogTitle></DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="ملاحظة داخلية تظهر فقط في سجل العمليات..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>إلغاء</Button>
            <Button onClick={saveNote} disabled={busy}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StudentQuickActions;
