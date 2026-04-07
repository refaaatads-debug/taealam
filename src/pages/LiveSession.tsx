import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Video, VideoOff, Mic, MicOff, Monitor, MessageSquare,
  PenTool, Phone, Send, Users, MoreVertical, Hand, FileText, Clock,
  Circle, Square, Wifi, WifiOff, RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SessionReport from "@/components/SessionReport";
import { toast } from "sonner";
import { useWebRTC } from "@/hooks/useWebRTC";
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
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [bookingData, setBookingData] = useState<any>(null);
  const [otherName, setOtherName] = useState("المشارك");
  const [subjectName, setSubjectName] = useState("");
  const [sessionDuration, setSessionDuration] = useState(45);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [subscriptionMinutes, setSubscriptionMinutes] = useState(0);
  const [timeWarningShown, setTimeWarningShown] = useState(false);
  const [recordingUploading, setRecordingUploading] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);

  const {
    localStream,
    remoteStream,
    connectionState,
    micEnabled,
    videoEnabled,
    screenSharing,
    isRecording,
    start,
    stop,
    toggleMic,
    toggleVideo,
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

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
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
        .select("id, sessions_remaining")
        .eq("user_id", studentId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSub && activeSub.sessions_remaining > 0) {
        setHasSubscription(true);
        setSubscriptionMinutes(activeSub.sessions_remaining * 45);
      }
    };
    fetchBooking();
  }, [bookingId, user]);

  // Session timer
  useEffect(() => {
    if (!meetingStarted) return;
    timerRef.current = window.setInterval(() => {
      setElapsed((p) => {
        const next = p + 1;
        const maxSeconds = hasSubscription ? subscriptionMinutes * 60 : sessionDuration * 60;
        const warningSeconds = maxSeconds - 5 * 60;

        if (next === warningSeconds && !timeWarningShown) {
          setTimeWarningShown(true);
          toast.warning("⚠️ تنبيه: متبقي 5 دقائق على انتهاء الحصة!", { duration: 10000 });
        }

        if (next >= maxSeconds) {
          toast.error("انتهى وقت الحصة! سيتم إغلاق الجلسة تلقائياً.");
          setTimeout(() => endSession(), 2000);
          return maxSeconds;
        }

        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [meetingStarted, sessionDuration, hasSubscription, subscriptionMinutes]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const getRemainingTime = () => {
    const maxSeconds = hasSubscription ? subscriptionMinutes * 60 : sessionDuration * 60;
    const remaining = Math.max(0, maxSeconds - elapsed);
    return formatTime(remaining);
  };

  const getRemainingColor = () => {
    const maxSeconds = hasSubscription ? subscriptionMinutes * 60 : sessionDuration * 60;
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
    setMeetingStarted(true);

    await start();

    Promise.all([
      supabase.from("sessions").update({ started_at: new Date().toISOString() }).eq("booking_id", bookingId),
      supabase.from("bookings").update({ session_status: "in_progress" }).eq("id", bookingId),
    ]);

    if (bookingData && user) {
      const isTeacher = user.id === bookingData.teacher_id;
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

    if (bookingId) {
      try {
        const sessionDurationMinutes = Math.floor(elapsed / 60);

        await supabase.from("bookings").update({ status: "completed", session_status: "completed" }).eq("id", bookingId);
        await supabase.from("sessions").update({ ended_at: new Date().toISOString(), duration_minutes: sessionDurationMinutes }).eq("booking_id", bookingId);

        const recordingBlob = getRecordingBlob();
        if (recordingBlob) await uploadRecording();

        if (bookingData && sessionDurationMinutes >= 45) {
          const teacherId = bookingData.teacher_id;
          await supabase.from("bookings").update({ price: 25 }).eq("id", bookingId);
          await supabase.from("teacher_payments").insert({
            teacher_id: teacherId,
            amount: 25,
            notes: `أرباح حصة مكتملة (${sessionDurationMinutes} دقيقة) - حجز ${bookingId}`,
            payment_method: "session_credit",
          });
          await supabase.from("notifications").insert({
            user_id: teacherId,
            title: "تم إضافة أرباح حصة ✅",
            body: `تمت إضافة 25 ر.س لرصيدك عن حصة مكتملة (${sessionDurationMinutes} دقيقة).`,
            type: "payment",
          });
        }

        if (bookingData) {
          const studentId = bookingData.student_id;
          const { data: activeSub } = await supabase
            .from("user_subscriptions")
            .select("id, sessions_remaining")
            .eq("user_id", studentId)
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeSub) {
            const afterDeduction = activeSub.sessions_remaining - 1;
            if (afterDeduction === 1) {
              await supabase.from("notifications").insert({
                user_id: studentId,
                title: "⚠️ متبقي حصة واحدة فقط!",
                body: "تنبيه: بقيت حصة واحدة في باقتك. جدد الآن.",
                type: "subscription_warning",
              });
            } else if (afterDeduction <= 0) {
              await supabase.from("notifications").insert({
                user_id: studentId,
                title: "انتهت حصص باقتك 📋",
                body: "نفدت جميع حصصك. جدد باقتك.",
                type: "subscription_expired",
              });
            }
          }
        }

        try {
          await supabase.functions.invoke("session-report", { body: { booking_id: bookingId } });
        } catch {
          console.log("AI report will be generated later");
        }

        toast.success("تم إنهاء الحصة بنجاح ✅");
      } catch (e) {
        console.error("Error ending session:", e);
      }
    }

    const isTeacherUser = user && bookingData && user.id === bookingData.teacher_id;
    if (isTeacherUser) {
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
          {meetingStarted && (
            <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold ${getRemainingColor()} bg-card/10`}>
              <Clock className="h-3 w-3" />
              <span className="font-mono">{getRemainingTime()}</span>
              <span className="hidden sm:inline">متبقي</span>
            </span>
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
          {connectionState === "failed" && (
            <Button size="sm" variant="ghost" className="text-orange-400 hover:text-orange-300 gap-1" onClick={restartConnection}>
              <RefreshCw className="h-3 w-3" /> إعادة الاتصال
            </Button>
          )}
          <Button size="icon" variant="ghost" className="text-card/60 hover:text-card h-8 w-8 rounded-lg" onClick={() => setShowReport(!showReport)}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex relative overflow-hidden">
        <div className={`flex-1 flex flex-col items-center justify-center relative ${boardOpen || showReport ? "hidden md:flex" : ""}`}>
          {meetingStarted ? (
            <div className="absolute inset-0 w-full h-full bg-foreground">
              {/* Remote Video (main) */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {/* No remote yet overlay */}
              {!remoteConnected && (
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/90 z-10">
                  <div className="text-center">
                    <div className="w-24 h-24 rounded-3xl bg-card/10 backdrop-blur-sm mx-auto mb-4 flex items-center justify-center border border-card/10 animate-pulse">
                      <Users className="h-12 w-12 text-card/40" />
                    </div>
                    <p className="text-card/80 font-bold text-lg mb-1">في انتظار {otherName}</p>
                    <p className="text-card/50 text-sm">سيتم الاتصال تلقائياً عند انضمامه...</p>
                  </div>
                </div>
              )}

              {/* Local Video (PiP) */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute bottom-20 left-4 w-44 h-32 rounded-2xl overflow-hidden border-2 border-card/20 shadow-lg z-20 bg-foreground"
                drag
                dragConstraints={{ top: -400, left: -800, right: 800, bottom: 50 }}
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${!videoEnabled ? "hidden" : ""}`}
                />
                {!videoEnabled && (
                  <div className="w-full h-full flex items-center justify-center bg-foreground">
                    <div className="text-center">
                      <VideoOff className="h-6 w-6 text-card/40 mx-auto" />
                      <p className="text-xs text-card/50 mt-1">الكاميرا مغلقة</p>
                    </div>
                  </div>
                )}
                <div className="absolute bottom-1 left-1 bg-foreground/70 rounded-md px-1.5 py-0.5">
                  <p className="text-[10px] text-card font-bold">أنت</p>
                </div>
                {screenSharing && (
                  <div className="absolute top-1 right-1 bg-primary/80 rounded-md px-1.5 py-0.5">
                    <p className="text-[10px] text-primary-foreground font-bold flex items-center gap-0.5">
                      <Monitor className="h-2.5 w-2.5" /> مشاركة
                    </p>
                  </div>
                )}
              </motion.div>
            </div>
          ) : (
            <div className="text-center text-primary-foreground gradient-hero w-full h-full flex flex-col items-center justify-center">
              <div className="w-28 h-28 rounded-3xl bg-primary-foreground/10 backdrop-blur-sm mx-auto mb-5 flex items-center justify-center border border-primary-foreground/10">
                <Users className="h-14 w-14 text-primary-foreground/60" />
              </div>
              <p className="font-black text-xl mb-1">{otherName}</p>
              <p className="text-sm opacity-60 mb-2">جاهز لبدء الحصة</p>
              <p className="text-xs opacity-50 mb-6">مدة الحصة: {sessionDuration} دقيقة</p>
              {!bookingId ? (
                <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">لا يوجد حجز محدد - تأكد من الدخول عبر لوحة التحكم</p>
              ) : (
                <Button
                  onClick={startMeeting}
                  className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-8 py-4 text-lg font-bold shadow-lg gap-2"
                >
                  <Video className="h-6 w-6" />
                  ابدأ الحصة الآن
                </Button>
              )}
            </div>
          )}

          {handRaised && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 bg-gold text-gold-foreground px-4 py-2 rounded-xl font-bold text-sm shadow-lg z-20">
              <Hand className="h-4 w-4 inline ml-1" /> رفعت يدك
            </motion.div>
          )}
        </div>

        {/* Whiteboard */}
        <AnimatePresence>
          {boardOpen && bookingId && user && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex-1 min-w-0">
              <WhiteboardCanvas bookingId={bookingId} userId={user.id} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Session Report Panel */}
        <AnimatePresence>
          {showReport && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="w-full md:w-96 bg-card border-r absolute md:relative inset-0 md:inset-auto z-10 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-foreground">تقرير الحصة</h3>
                <button onClick={() => setShowReport(false)} className="text-muted-foreground hover:text-foreground md:hidden transition-colors">✕</button>
              </div>
              <SessionReport bookingId={bookingId || "demo"} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat */}
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
              <div className="p-3 border-t flex gap-2">
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 md:gap-3 p-4 glass-strong border-t border-border/10">
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${micEnabled ? "bg-card/20 hover:bg-card/30 text-card border-0" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"}`} onClick={toggleMic}>
          {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${videoEnabled ? "bg-card/20 hover:bg-card/30 text-card border-0" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"}`} onClick={toggleVideo}>
          {videoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${boardOpen ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => { setBoardOpen(!boardOpen); setShowReport(false); }}>
          <PenTool className="h-5 w-5" />
        </Button>
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${screenSharing ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={toggleScreenShare} disabled={!meetingStarted}>
          <Monitor className="h-5 w-5" />
        </Button>
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${chatOpen ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => setChatOpen(!chatOpen)}>
          <MessageSquare className="h-5 w-5" />
        </Button>
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${handRaised ? "bg-gold text-gold-foreground border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => setHandRaised(!handRaised)}>
          <Hand className="h-5 w-5" />
        </Button>
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
        <Button size="icon" className="rounded-xl h-12 w-12 bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0" onClick={endSession}>
          <Phone className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default LiveSession;
