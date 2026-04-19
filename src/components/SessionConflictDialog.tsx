import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConflictDetail = { userId: string; myToken: string };

let openConflictDialog: ((detail: ConflictDetail) => void) | null = null;

export const triggerSessionConflict = (detail: ConflictDetail) => {
  if (openConflictDialog) openConflictDialog(detail);
};

const SessionConflictDialog = () => {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ConflictDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    openConflictDialog = (d) => {
      setDetail(d);
      setOpen(true);
    };
    return () => {
      openConflictDialog = null;
    };
  }, []);

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    sessionStorage.removeItem("session_token");
    window.location.href = "/login";
  };

  const handleTakeOver = async () => {
    if (!detail) return;
    setLoading(true);
    try {
      const deviceInfo = `${navigator.platform} - ${navigator.userAgent.substring(0, 100)}`;
      // Force-claim the active session for this tab
      await supabase.from("user_active_session").upsert({
        user_id: detail.userId,
        session_token: detail.myToken,
        device_info: deviceInfo,
        last_seen: new Date().toISOString(),
      });
      setOpen(false);
      setLoading(false);
      // Reload to re-initialize auth state cleanly on this device
      window.location.reload();
    } catch (e) {
      console.error("Take-over failed:", e);
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>جلسة نشطة على جهاز آخر</AlertDialogTitle>
          <AlertDialogDescription>
            حسابك مفتوح حالياً على متصفح أو جهاز آخر. يمكنك إما تسجيل الخروج من هذا الجهاز،
            أو متابعة الاستخدام هنا وتسجيل الخروج تلقائياً من الأجهزة الأخرى.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={loading} onClick={handleSignOut}>
            تسجيل الخروج من هنا
          </AlertDialogCancel>
          <AlertDialogAction disabled={loading} onClick={handleTakeOver}>
            متابعة هنا وإخراج باقي الأجهزة
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default SessionConflictDialog;
