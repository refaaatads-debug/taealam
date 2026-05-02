import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean | null;
  created_at: string;
  type: string | null;
  link?: string | null;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const { play: playSound } = useNotificationSound();

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setNotifications(data as Notification[]);
    };

    fetchNotifications();

    const channel = supabase
      .channel("user-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev.slice(0, 9)]);
          // Play sound based on notification type
          playSound(newNotif.type);
          // Default link by type if not provided
          const target =
            newNotif.link ||
            (newNotif.type === "support_reply" ? "/support" :
             newNotif.type === "assignment" ? "/student/assignments" :
             newNotif.type === "submission" ? "/teacher/assignments" : null);

          // Action label per type
          const actionLabel =
            newNotif.type === "assignment" ? "📝 فتح الواجب" :
            newNotif.type === "submission" ? "📥 عرض الحل" :
            newNotif.type === "support_reply" ? "فتح المحادثة" :
            "فتح";

          // Show transient popup at bottom-right; clickable when a target exists.
          toast(newNotif.title, {
            description: newNotif.body || undefined,
            duration: 7000,
            position: "bottom-right",
            ...(target
              ? {
                  action: {
                    label: actionLabel,
                    onClick: () => navigate(target),
                  },
                  onDismiss: () => {},
                  className: "cursor-pointer",
                }
              : {}),
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, navigate, playSound]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = async () => {
    if (!user || unreadCount === 0) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) markAsRead(); }}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="relative rounded-xl h-9 w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center animate-pulse-soft">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 rounded-2xl" align="end">
        <div className="p-4 border-b">
          <h3 className="font-bold text-foreground text-sm">الإشعارات</h3>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">لا توجد إشعارات</p>
          ) : (
            notifications.map((n) => {
              const target = n.link || (n.type === "support_reply" ? "/support" : null);
              return (
                <div
                  key={n.id}
                  className={`p-3 border-b last:border-0 transition-colors ${!n.is_read ? "bg-accent/50" : ""} ${target ? "cursor-pointer hover:bg-accent" : ""}`}
                  onClick={() => { if (target) { setOpen(false); navigate(target); } }}
                >
                  <p className="text-sm font-bold text-foreground">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleDateString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
