import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mic, MicOff, Monitor, MessageSquare,
  PenTool, Phone, Send, Users, MoreVertical, Hand, FileText, Clock,
  Circle, Square, Wifi, WifiOff, RefreshCw, Headphones, ShieldAlert, AlertTriangle, VolumeX
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SessionReport from "@/components/SessionReport";
import { toast } from "sonner";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useSessionProtection } from "@/hooks/useSessionProtection";
import { useSessionAntiCheat } from "@/hooks/useSessionAntiCheat";
import WhiteboardCanvas from "@/components/WhiteboardCanvas";

const LiveSession = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("booking");

  const [chatOpen, setChatOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [meetingStarted, setMeetingStarted] = useState(false);
  const [messages, setMessages] = useState<{ sender: string; text: string; time: string; me: boolean }[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const timerRef = useRef<number>();
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const [bookingData, setBookingData] = useState<any>(null);
  const [otherName, setOtherName] = useState("المشارك");
  const [subjectName, setSubjectName] = useState("");
  const [sessionDuration, setSessionDuration] = useState(45);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [subscriptionRemainingMinutes, setSubscriptionRemainingMinutes] = useState(0);
  const [timeWarningShown, setTimeWarningShown] = useState(false);
  const [tenMinWarningShown, setTenMinWarningShown] = useState(false);
  const [recordingUploading, setRecordingUploading] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);

  const isTeacher = user && bookingData ? user.id === bookingData.teacher_id : false;

  const {
    localStream,
    remoteStream,
    connectionState,
    micEnabled,
    screenSharing,
    isRecording,
    start,
    stop,
    toggleMic,
    toggleScreenShare,
    startRecording,
    stopRecording,
    getRecordingBlob,
    restartConnection,
  } = useWebRTC({
    bookingId: bookingId || "",
    userId: user?.id || "",
    onRemoteJoin: () => {
      setRemoteConnected(true);
      toast.success("انضم المشارك الآخر! 🎉");
    },
    onRemoteLeave: () => {
      setRemoteConnected(false);
      toast.info("غادر المشارك الآخر الجلسة");
    },
    onConnectionState: (state) => {
      if (state === "connected") {
        setRemoteConnected(true);
      } else if (state === "disconnected" || state === "failed") {
        setRemoteConnected(false);
      }
    },
  });

  // ─── Session Protection System ───
  const {
    filterChatMessage,
    violationCount,
    isMutedBySystem,
    isChatBlocked,
    latestAlert,
    muteCountdown,
  } = useSessionProtection({
    bookingId: bookingId || "",
    userId: user?.id || "",
    localStream,
    meetingStarted,
    onMuteUser: () => {
      // Mute the user's mic
      localStream?.getAudioTracks().forEach(t => { t.enabled = false; });
    },
    onEndSession: () => {
      endSession();
    },
  });

  // ─── Anti-Cheat System ───
  const {
    isTabLocked,
    peerDisconnected,
    reconnectCountdown,
    cleanupSession,
    checkActiveSession,
    logEvent,
  } = useSessionAntiCheat({
    bookingId: bookingId || "",
    userId: user?.id || "",
    enabled: meetingStarted,
    onForceEnd: () => {
      endSession();
    },
  });

  // Attach remote audio
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Fetch booking details
  useEffect(() => {
    if (!bookingId || !user) return;
    const fetchBooking = async () => {
      const { data: booking } = await supabase
        .from("bookings")
        .select("*, subjects(name)")
        .eq("id", bookingId)
        .maybeSingle();

      if (!booking) return;
      setBookingData(booking);
      setSubjectName(booking.subjects?.name || "");
      setSessionDuration(booking.duration_minutes || 45);

      const otherId = user.id === booking.student_id ? booking.teacher_id : booking.student_id;
      const { data: otherProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", otherId)
        .maybeSingle();
      if (otherProfile) setOtherName(otherProfile.full_name || "المشارك");

      const studentId = user.id === booking.student_id ? user.id : booking.student_id;
      const { data: activeSub } = await supabase
        .from("user_subscriptions")
        .select("id, sessions_remaining, remaining_minutes")
        .eq("user_id", studentId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSub) {
        const remainMin = (activeSub as any).remaining_minutes ?? (activeSub.sessions_remaining * 45);
        if (remainMin > 0) {
          setHasSubscription(true);
          setSubscriptionRemainingMinutes(remainMin);
        }
      }
    };
    fetchBooking();
  }, [bookingId, user]);

  // Auto-join for student when teacher starts session
  useEffect(() => {
    if (!bookingId || !user || !bookingData) return;
    const isStudent = user.id === bookingData.student_id;
    if (!isStudent || meetingStarted) return;

    // Check if session is already in progress
    if (bookingData.session_status === "in_progress") {
      setMeetingStarted(true);
      start();
      logEvent("auto_join_session", { role: "student" });
      return;
    }

    // Listen for realtime changes
    const channel = supabase
      .channel(`session-status-${bookingId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "bookings",
        filter: `id=eq.${bookingId}`,
      }, (payload) => {
        const updated = payload.new as any;
        if (updated.session_status === "in_progress" && !meetingStarted) {
          setMeetingStarted(true);
          start();
          logEvent("auto_join_session", { role: "student", trigger: "realtime" });
          toast.success("بدأ المعلم الحصة! جاري الانضمام... 🎓");
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };

  // Session timer - counts only when both connected (anti-cheat)
  useEffect(() => {
    if (!meetingStarted) return;
    timerRef.current = window.setInterval(() => {
      // Only count time when both are connected (anti-cheat)
      if (peerDisconnected) return;

      setElapsed((p) => {
        const next = p + 1;
        const maxSeconds = hasSubscription ? subscriptionRemainingMinutes * 60 : sessionDuration * 60;
        const warningSeconds = maxSeconds - 5 * 60;
        const tenMinWarning = maxSeconds - 10 * 60;

        // 10-minute warning
        if (next >= tenMinWarning && next < tenMinWarning + 2 && !tenMinWarningShown) {
          setTenMinWarningShown(true);
          toast.warning("⚠️ تنبيه: متبقي 10 دقائق من رصيد باقتك!", { duration: 8000 });
        }

        if (next >= warningSeconds && next < warningSeconds + 2 && !timeWarningShown) {
          setTimeWarningShown(true);
          toast.warning("⚠️ تنبيه: متبقي 5 دقائق على انتهاء الحصة!", { duration: 10000 });
        }

        if (next >= maxSeconds) {
          toast.error("انتهى رصيد الباقة! سيتم إغلاق الجلسة تلقائياً.");
          setTimeout(() => endSession(), 2000);
          return maxSeconds;
        }

        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [meetingStarted, sessionDuration, hasSubscription, subscriptionRemainingMinutes, peerDisconnected]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const getRemainingTime = () => {
    const maxSeconds = hasSubscription ? subscriptionRemainingMinutes * 60 : sessionDuration * 60;
    const remaining = Math.max(0, maxSeconds - elapsed);
    return formatTime(remaining);
  };

  const getRemainingMinutesValue = () => {
    const maxSeconds = hasSubscription ? subscriptionRemainingMinutes * 60 : sessionDuration * 60;
    return Math.max(0, Math.ceil((maxSeconds - elapsed) / 60));
  };

  const getRemainingColor = () => {
    const maxSeconds = hasSubscription ? subscriptionRemainingMinutes * 60 : sessionDuration * 60;
    const remaining = maxSeconds - elapsed;
    if (remaining < 60) return "text-destructive";
    if (remaining < 5 * 60) return "text-orange-500";
    return "text-card/60";
  };

  const startMeeting = async () => {
    if (!bookingId) {
      toast.error("لا يوجد حجز محدد");
      return;
    }

    // Check subscription balance (must have >= 5 minutes)
    if (hasSubscription && subscriptionRemainingMinutes < 5) {
      toast.error("رصيد الباقة غير كافي. يجب أن يكون لديك 5 دقائق على الأقل.");
      return;
    }

    // Anti-cheat: check for existing active sessions
    const hasConflict = await checkActiveSession();
    if (hasConflict) return;

    // Anti-cheat: check tab lock
    if (isTabLocked) {
      toast.error("هذه الجلسة مفتوحة في تبويب آخر.");
      return;
    }
    setMeetingStarted(true);
    logEvent("start_session", { role: isTeacher ? "teacher" : "student" });

    await start();

    await Promise.all([
      supabase.from("sessions").update({ started_at: new Date().toISOString() }).eq("booking_id", bookingId),
      supabase.from("bookings").update({ session_status: "in_progress" }).eq("id", bookingId),
    ]);

    if (bookingData && user) {
      if (isTeacher) {
        supabase.from("notifications").insert({
          user_id: bookingData.student_id,
          title: "الحصة بدأت! 🎓",
          body: `بدأ المعلم ${profile?.full_name || "معلمك"} الحصة الآن. انضم فوراً!`,
          type: "session",
        });
      }
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    const msgText = newMessage;

    // ─── Client-side protection filter ───
    const filterResult = filterChatMessage(msgText);
    if (!filterResult.allowed) {
      toast.error(filterResult.reason || "ممنوع مشاركة بيانات شخصية");
      setNewMessage("");
      return;
    }

    setMessages((prev) => [...prev, {
      sender: "أنت",
      text: msgText,
      time: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
      me: true,
    }]);
    setNewMessage("");

    if (bookingId && user) {
      supabase.functions.invoke("analyze-violations", {
        body: { messages: [{ text: msgText, sender_id: user.id }], booking_id: bookingId, source: "chat" },
      }).then(({ data }) => {
        if (data?.violations_found > 0) {
          toast.warning("⚠️ تم رصد محتوى مخالف. تجنب مشاركة معلومات اتصال خارجية.");
        }
      }).catch(() => {});
    }
  };

  const uploadRecording = async () => {
    const blob = getRecordingBlob();
    if (!blob || !bookingId || !user) return;
    setRecordingUploading(true);
    try {
      const fileName = `${user.id}/${bookingId}_${Date.now()}.webm`;
      const { error: uploadErr } = await supabase.storage
        .from("session-recordings")
        .upload(fileName, blob, { contentType: "video/webm", upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("session-recordings").getPublicUrl(fileName);
      await supabase.from("sessions").update({ recording_url: urlData.publicUrl }).eq("booking_id", bookingId);
      toast.success("تم حفظ تسجيل الحصة بنجاح ✅");
    } catch {
      toast.error("تعذر رفع التسجيل");
    } finally {
      setRecordingUploading(false);
    }
  };

  const endSession = async () => {
    clearInterval(timerRef.current);

    if (isRecording) stopRecording();
    await stop();
    await cleanupSession();
    logEvent("end_session", { elapsed_seconds: elapsed });

    if (bookingId) {
      try {
        const durationSeconds = elapsed;
        const durationMinutes = Math.ceil(durationSeconds / 60);
        const isShortSession = durationMinutes < 5;

        await supabase.from("bookings").update({ status: "completed", session_status: "completed" }).eq("id", bookingId);
        
        // Only set ended_at - the DB trigger auto_complete_session handles:
        // duration_minutes, deducted_minutes, teacher_earning, short_session,
        // subscription deduction, and teacher balance update
        await supabase.from("sessions").update({ 
          ended_at: new Date().toISOString(),
        } as any).eq("booking_id", bookingId);

        const recordingBlob = getRecordingBlob();
        if (recordingBlob) await uploadRecording();

        if (bookingData && !isShortSession) {
          const teacherId = bookingData.teacher_id;
          const teacherEarning = durationMinutes * 0.3;
          
          await supabase.from("bookings").update({ price: teacherEarning }).eq("id", bookingId);
          
          await supabase.from("notifications").insert({
            user_id: teacherId,
            title: "تم إضافة أرباح حصة ✅",
            body: `تمت إضافة ${teacherEarning.toFixed(1)} ر.س لرصيدك عن حصة مكتملة (${durationMinutes} دقيقة).`,
            type: "payment",
          });
        }

        if (bookingData && isShortSession) {
          toast.info("الجلسة أقل من 5 دقائق - لم يتم خصم أي رصيد من الباقة.");
        }

        if (bookingData && !isShortSession) {
          const studentId = bookingData.student_id;
          const newRemaining = Math.max(0, subscriptionRemainingMinutes - durationMinutes);
          
          if (newRemaining <= 30) {
            await supabase.from("notifications").insert({
              user_id: studentId,
              title: newRemaining <= 0 ? "انتهى رصيد باقتك 📋" : "⚠️ رصيد الباقة منخفض!",
              body: newRemaining <= 0 ? "نفد رصيد باقتك. جدد باقتك للاستمرار." : `متبقي ${newRemaining} دقيقة فقط. جدد باقتك.`,
              type: newRemaining <= 0 ? "subscription_expired" : "subscription_warning",
            });
          }
        }

        try {
          await supabase.functions.invoke("session-report", { body: { 
            booking_id: bookingId,
            session_stats: {
              teacher_speaking_seconds: 0,
              student_speaking_seconds: 0,
              messages_count: messages.length,
              violation_count: violationCount,
              duration_minutes: durationMinutes,
              is_short_session: isShortSession,
            }
          } });
        } catch {
          console.log("AI report will be generated later");
        }

        toast.success("تم إنهاء الحصة بنجاح ✅");
      } catch (e) {
        console.error("Error ending session:", e);
      }
    }

    if (isTeacher) {
      navigate("/teacher");
    } else {
      navigate(`/rating${bookingId ? `?booking=${bookingId}` : ""}`);
    }
  };

  const getConnectionBadge = () => {
    switch (connectionState) {
      case "connected": return { icon: Wifi, text: "متصل", color: "text-green-400 bg-green-400/10" };
      case "connecting": return { icon: Wifi, text: "جاري الاتصال...", color: "text-yellow-400 bg-yellow-400/10" };
      case "disconnected": return { icon: WifiOff, text: "انقطع الاتصال", color: "text-orange-400 bg-orange-400/10" };
      case "failed": return { icon: WifiOff, text: "فشل الاتصال", color: "text-destructive bg-destructive/10" };
      default: return { icon: Wifi, text: "في الانتظار", color: "text-muted-foreground bg-muted/30" };
    }
  };

  const displayTitle = subjectName ? `${subjectName} - ${otherName}` : otherName;
  const connBadge = getConnectionBadge();

  return (
    <div className="h-screen bg-foreground flex flex-col">
      {/* Hidden audio element for remote stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 glass-strong border-b border-border/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl gradient-cta flex items-center justify-center">
            <Users className="h-4 w-4 text-secondary-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold text-card">{displayTitle}</p>
            <div className="flex items-center gap-2">
              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md ${connBadge.color}`}>
                <connBadge.icon className="h-3 w-3" />
                {connBadge.text}
              </span>
              <span className="text-xs text-card/60 font-mono">{formatTime(elapsed)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Violation counter badge */}
          {violationCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs bg-destructive/20 text-destructive px-3 py-1.5 rounded-lg font-bold">
              <ShieldAlert className="h-3 w-3" />
              {violationCount} مخالفة
            </span>
          )}
          {/* System mute indicator */}
          {isMutedBySystem && (
            <span className="flex items-center gap-1.5 text-xs bg-destructive/30 text-destructive px-3 py-1.5 rounded-lg font-bold animate-pulse-soft">
              <VolumeX className="h-3 w-3" />
              محظور {muteCountdown}ث
            </span>
          )}
          {meetingStarted && (
            <>
              <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold ${getRemainingColor()} bg-card/10`}>
                <Clock className="h-3 w-3" />
                <span className="font-mono">{getRemainingTime()}</span>
                <span className="hidden sm:inline">متبقي</span>
              </span>
              {hasSubscription && (
                <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold text-card/60 bg-card/10">
                  المتبقي من باقتك: {getRemainingMinutesValue()} دقيقة
                </span>
              )}
            </>
          )}
          {isRecording && (
            <span className="flex items-center gap-1.5 text-xs bg-destructive/20 text-destructive px-3 py-1.5 rounded-lg font-bold animate-pulse-soft">
              <span className="w-2 h-2 rounded-full bg-destructive" /> REC
            </span>
          )}
          {recordingUploading && (
            <span className="flex items-center gap-1.5 text-xs bg-secondary/20 text-secondary px-3 py-1.5 rounded-lg font-bold">
              جاري الرفع...
            </span>
          )}
          {connectionState === "failed" && isTeacher && (
            <Button size="sm" variant="ghost" className="text-orange-400 hover:text-orange-300 gap-1" onClick={restartConnection}>
              <RefreshCw className="h-3 w-3" /> إعادة الاتصال
            </Button>
          )}
          {isTeacher && (
            <Button size="icon" variant="ghost" className="text-card/60 hover:text-card h-8 w-8 rounded-lg" onClick={() => setShowReport(!showReport)}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Tab locked overlay */}
      {isTabLocked && (
        <div className="absolute inset-0 z-50 bg-foreground/95 flex items-center justify-center">
          <div className="text-center p-8">
            <ShieldAlert className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold text-card mb-2">الجلسة مفتوحة في تبويب آخر</h2>
            <p className="text-card/60">أغلق التبويب الآخر وأعد تحميل هذه الصفحة</p>
          </div>
        </div>
      )}

      {/* Peer disconnect warning */}
      <AnimatePresence>
        {peerDisconnected && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-orange-600 text-card px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 font-bold text-sm"
          >
            <WifiOff className="h-4 w-4" />
            انقطع اتصال المشارك - مهلة إعادة الاتصال: {reconnectCountdown}ث
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating violation alert */}
      <AnimatePresence>
        {latestAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 font-bold text-sm"
          >
            <AlertTriangle className="h-4 w-4" />
            {latestAlert}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Main area - audio session view */}
        <div className={`flex-1 flex flex-col items-center justify-center relative ${boardOpen || showReport ? "hidden md:flex" : ""}`}>
          {meetingStarted ? (
            <div className="absolute inset-0 w-full h-full bg-foreground flex items-center justify-center">
              {/* Screen share display (visible when teacher shares) */}
              {screenSharing && isTeacher && (
                <div className="absolute top-2 right-2 bg-primary/80 rounded-md px-2 py-1 z-20">
                  <p className="text-xs text-primary-foreground font-bold flex items-center gap-1">
                    <Monitor className="h-3 w-3" /> مشاركة الشاشة نشطة
                  </p>
                </div>
              )}

              {/* Audio session indicator */}
              {!remoteConnected ? (
                <div className="text-center">
                  <div className="w-24 h-24 rounded-3xl bg-card/10 backdrop-blur-sm mx-auto mb-4 flex items-center justify-center border border-card/10 animate-pulse">
                    <Users className="h-12 w-12 text-card/40" />
                  </div>
                  <p className="text-card/80 font-bold text-lg mb-1">في انتظار {otherName}</p>
                  <p className="text-card/50 text-sm">سيتم الاتصال تلقائياً عند انضمامه...</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-28 h-28 rounded-full bg-secondary/20 mx-auto mb-4 flex items-center justify-center border-2 border-secondary/40">
                    <Headphones className="h-14 w-14 text-secondary" />
                  </div>
                  <p className="text-card/90 font-bold text-xl mb-1">{otherName}</p>
                  <p className="text-card/50 text-sm flex items-center gap-1 justify-center">
                    <Wifi className="h-3 w-3 text-green-400" /> متصل - جلسة صوتية
                  </p>
                  {micEnabled && (
                    <div className="mt-4 flex items-center gap-2 justify-center">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-xs text-card/40">الميكروفون نشط</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-primary-foreground gradient-hero w-full h-full flex flex-col items-center justify-center">
              <div className="w-28 h-28 rounded-3xl bg-primary-foreground/10 backdrop-blur-sm mx-auto mb-5 flex items-center justify-center border border-primary-foreground/10">
                <Headphones className="h-14 w-14 text-primary-foreground/60" />
              </div>
              <p className="font-black text-xl mb-1">{otherName}</p>
              <p className="text-sm opacity-60 mb-2">جاهز لبدء الحصة</p>
              <p className="text-xs opacity-50 mb-6">مدة الحصة: {sessionDuration} دقيقة</p>
              {!bookingId ? (
                <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">لا يوجد حجز محدد - تأكد من الدخول عبر لوحة التحكم</p>
              ) : isTeacher ? (
                <Button
                  onClick={startMeeting}
                  className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-8 py-4 text-lg font-bold shadow-lg gap-2"
                >
                  <Headphones className="h-6 w-6" />
                  ابدأ الحصة الآن
                </Button>
              ) : (
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-primary-foreground/10 mx-auto mb-3 flex items-center justify-center animate-pulse">
                    <Clock className="h-8 w-8 text-primary-foreground/50" />
                  </div>
                  <p className="text-sm opacity-70">في انتظار المعلم لبدء الحصة...</p>
                  <p className="text-xs opacity-40 mt-1">سيتم الانضمام تلقائياً عند بدء المعلم</p>
                </div>
              )}
            </div>
          )}

          {handRaised && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 bg-gold text-gold-foreground px-4 py-2 rounded-xl font-bold text-sm shadow-lg z-20">
              <Hand className="h-4 w-4 inline ml-1" /> {isTeacher ? "الطالب رفع يده" : "رفعت يدك"}
            </motion.div>
          )}
        </div>

        {/* Whiteboard - Teacher only */}
        <AnimatePresence>
          {boardOpen && bookingId && user && isTeacher && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex-1 min-w-0">
              <WhiteboardCanvas bookingId={bookingId} userId={user.id} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Session Report Panel - Teacher only */}
        <AnimatePresence>
          {showReport && isTeacher && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="w-full md:w-96 bg-card border-r absolute md:relative inset-0 md:inset-auto z-10 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-foreground">تقرير الحصة</h3>
                <button onClick={() => setShowReport(false)} className="text-muted-foreground hover:text-foreground md:hidden transition-colors">✕</button>
              </div>
              <SessionReport bookingId={bookingId || "demo"} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat - Available for both */}
        <AnimatePresence>
          {chatOpen && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="w-full md:w-80 bg-card border-r flex flex-col absolute md:relative inset-0 md:inset-auto z-10">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="font-bold text-foreground">المحادثة</h3>
                <button onClick={() => setChatOpen(false)} className="text-muted-foreground hover:text-foreground md:hidden transition-colors">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`${m.me ? "mr-auto" : "ml-auto"} max-w-[80%]`}>
                    <div className={`p-3 rounded-2xl text-sm ${m.me ? "bg-secondary/10 text-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                      {!m.me && <p className="text-xs font-bold mb-1 text-secondary">{m.sender}</p>}
                      {m.text}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{m.time}</p>
                  </motion.div>
                ))}
              </div>
              <div className="p-3 border-t">
                {isChatBlocked ? (
                  <div className="flex items-center gap-2 justify-center text-destructive text-sm font-bold py-2">
                    <VolumeX className="h-4 w-4" />
                    الدردشة محظورة مؤقتاً ({muteCountdown}ث)
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="اكتب رسالة..."
                      className="text-right h-10 rounded-xl bg-muted/30 border-0"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    />
                    <Button size="icon" className="gradient-cta text-secondary-foreground h-10 w-10 rounded-xl" onClick={sendMessage}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 md:gap-3 p-4 glass-strong border-t border-border/10">
        {/* Teacher controls */}
        {isTeacher && (
          <>
            <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${micEnabled ? "bg-card/20 hover:bg-card/30 text-card border-0" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"}`} onClick={toggleMic}>
              {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${screenSharing ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={toggleScreenShare} disabled={!meetingStarted}>
              <Monitor className="h-5 w-5" />
            </Button>
            <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${boardOpen ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => { setBoardOpen(!boardOpen); setShowReport(false); }}>
              <PenTool className="h-5 w-5" />
            </Button>
          </>
        )}

        {/* Chat - for both */}
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${chatOpen ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => setChatOpen(!chatOpen)}>
          <MessageSquare className="h-5 w-5" />
        </Button>

        {/* Student hand raise */}
        {!isTeacher && (
          <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${handRaised ? "bg-gold text-gold-foreground border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => setHandRaised(!handRaised)}>
            <Hand className="h-5 w-5" />
          </Button>
        )}

        {/* Teacher extra controls */}
        {isTeacher && (
          <>
            <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${showReport ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => { setShowReport(!showReport); setBoardOpen(false); }}>
              <FileText className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              className={`rounded-xl h-12 w-12 transition-all duration-200 ${isRecording ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0 animate-pulse-soft" : "bg-card/20 hover:bg-card/30 text-card border-0"}`}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!meetingStarted}
              title={isRecording ? "إيقاف التسجيل" : "بدء التسجيل"}
            >
              {isRecording ? <Square className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
            </Button>
          </>
        )}

        {/* End call - for both */}
        <Button size="icon" className="rounded-xl h-12 w-12 bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0" onClick={endSession}>
          <Phone className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default LiveSession;
