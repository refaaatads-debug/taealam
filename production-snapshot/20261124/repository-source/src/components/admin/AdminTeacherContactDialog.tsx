import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Loader2 } from "lucide-react";

interface Props {
  userId: string;
  userName?: string | null;
  onSent?: () => void;
}

const AdminTeacherContactDialog = ({ userId, userName, onSent }: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("استكمال إجراءات اعتماد المعلم");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const sendMessage = async () => {
    if (!user || !message.trim()) return;
    setSending(true);
    try {
      const { data: ticket, error: ticketError } = await supabase
        .from("support_tickets")
        .insert({
          user_id: userId,
          subject: subject.trim() || "رسالة من الإدارة",
          status: "in_progress",
          assigned_to: user.id,
          assigned_at: new Date().toISOString(),
        } as any)
        .select()
        .single();
      if (ticketError || !ticket) throw ticketError || new Error("ticket creation failed");

      const { error: messageError } = await supabase.from("support_messages").insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        content: message.trim(),
        is_admin: true,
      });
      if (messageError) throw messageError;

      await supabase.from("notifications").insert({
        user_id: userId,
        title: "رسالة جديدة من الإدارة 💬",
        body: message.trim().slice(0, 140),
        type: "support_reply",
        link: `/support?ticket=${ticket.id}`,
      } as any);

      toast.success(`تم إرسال الرسالة إلى ${userName || "المعلم"}`);
      setOpen(false);
      setMessage("");
      onSent?.();
    } catch (error: any) {
      toast.error(error?.message || "تعذر إرسال الرسالة");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpen(true)}>
        <MessageSquare className="h-3.5 w-3.5" /> مراسلة المعلم
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>مراسلة {userName || "المعلم"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="عنوان المحادثة" />
            <textarea
              className="w-full min-h-[130px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="اكتب الرسالة التي ستصل إلى حساب المعلم..."
              autoFocus
            />
            <p className="text-xs text-muted-foreground">سيتم إنشاء تذكرة دعم ويمكن للمعلم الرد عليها من مركز الدعم.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={sendMessage} disabled={!message.trim() || sending} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              إرسال الرسالة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminTeacherContactDialog;
