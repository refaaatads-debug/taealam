import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Video, VideoOff, Mic, MicOff, Monitor, MessageSquare,
  PenTool, Phone, Send, Users, MoreVertical, Hand, FileText, Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SessionReport from "@/components/SessionReport";
import { toast } from "sonner";

const LiveSession = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("booking");
  const [videoOn, setVideoOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [meetingStarted, setMeetingStarted] = useState(false);
  const [messages, setMessages] = useState<{ sender: string; text: string; time: string; me: boolean }[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const timerRef = useRef<number>();
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);

  // Booking data
  const [bookingData, setBookingData] = useState<any>(null);
  const [otherName, setOtherName] = useState("المشارك");
  const [subjectName, setSubjectName] = useState("");

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

      const otherId = user.id === booking.student_id ? booking.teacher_id : booking.student_id;
      const { data: otherProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", otherId)
        .maybeSingle();
      if (otherProfile) setOtherName(otherProfile.full_name || "المشارك");
    };
    fetchBooking();
  }, [bookingId, user]);

  // Session timer
  useEffect(() => {
    timerRef.current = window.setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Load Jitsi Meet API script
  useEffect(() => {
    if (document.getElementById("jitsi-script")) return;
    const script = document.createElement("script");
    script.id = "jitsi-script";
    script.src = "https://8x8.vc/vpaas-magic-cookie-ef5ce88c523d41a599c8b1dc5b3ab765/external_api.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Cleanup Jitsi on unmount
  useEffect(() => {
    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, []);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const startMeeting = () => {
    if (!bookingId) {
      toast.error("لا يوجد حجز محدد");
      return;
    }
    // Set meetingStarted first so the container div renders
    setMeetingStarted(true);

    // Clean room name from booking ID
    const roomName = `taealam-${bookingId.replace(/-/g, "")}`;
    const displayName = profile?.full_name || "مشارك";

    // Wait for JitsiMeetExternalAPI to load
    const initJitsi = () => {
      if (!(window as any).JitsiMeetExternalAPI) {
        setTimeout(initJitsi, 500);
        return;
      }

      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
      }

      const api = new (window as any).JitsiMeetExternalAPI("meet.jit.si", {
        roomName,
        parentNode: jitsiContainerRef.current,
        width: "100%",
        height: "100%",
        configOverwrite: {
          startWithAudioMuted: !micOn,
          startWithVideoMuted: !videoOn,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          toolbarButtons: [],
          hideConferenceSubject: true,
          hideConferenceTimer: true,
          disableProfile: true,
          enableClosePage: false,
          disableRemoteMute: false,
          remoteVideoMenu: { disableKick: true },
          notifications: [],
          disableThirdPartyRequests: true,
        },
        interfaceConfigOverwrite: {
          SHOW_CHROME_EXTENSION_BANNER: false,
          MOBILE_APP_PROMO: false,
          HIDE_INVITE_MORE_HEADER: true,
          TOOLBAR_BUTTONS: [],
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          SHOW_BRAND_WATERMARK: false,
          FILM_STRIP_MAX_HEIGHT: 0,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
          DISABLE_PRESENCE_STATUS: true,
          DEFAULT_BACKGROUND: "#1a1a2e",
        },
        userInfo: {
          displayName,
        },
      });

      api.addListener("readyToClose", () => {
        endSession();
      });

      jitsiApiRef.current = api;
      setMeetingStarted(true);

      // Update session start time
      supabase
        .from("sessions")
        .update({ started_at: new Date().toISOString() })
        .eq("booking_id", bookingId)
        .then(() => {});
    };

    initJitsi();
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
        body: {
          messages: [{ text: msgText, sender_id: user.id }],
          booking_id: bookingId,
          source: "chat",
        },
      }).then(({ data }) => {
        if (data?.violations_found > 0) {
          toast.warning("⚠️ تم رصد محتوى مخالف. تجنب مشاركة معلومات اتصال خارجية.");
        }
      }).catch(() => {});
    }
  };

  const toggleMic = () => {
    setMicOn(!micOn);
    if (jitsiApiRef.current) {
      jitsiApiRef.current.executeCommand("toggleAudio");
    }
  };

  const toggleVideo = () => {
    setVideoOn(!videoOn);
    if (jitsiApiRef.current) {
      jitsiApiRef.current.executeCommand("toggleVideo");
    }
  };

  const toggleScreenShare = () => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.executeCommand("toggleShareScreen");
    }
  };

  const endSession = async () => {
    clearInterval(timerRef.current);
    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
      jitsiApiRef.current = null;
    }
    if (bookingId) {
      try {
        await supabase
          .from("bookings")
          .update({ status: "completed", session_status: "completed" })
          .eq("id", bookingId);
        
        await supabase
          .from("sessions")
          .update({ ended_at: new Date().toISOString() })
          .eq("booking_id", bookingId);

        toast.success("تم إنهاء الحصة بنجاح ✅");
      } catch (e) {
        console.error("Error ending session:", e);
      }
    }
    navigate(`/rating${bookingId ? `?booking=${bookingId}` : ""}`);
  };

  const displayTitle = subjectName ? `${subjectName} - ${otherName}` : otherName;

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
              <span className="text-xs text-card/60">● مباشر</span>
              <span className="text-xs text-card/60 font-mono">{formatTime(elapsed)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs bg-destructive/20 text-destructive px-3 py-1.5 rounded-lg font-bold animate-pulse-soft">
            <span className="w-2 h-2 rounded-full bg-destructive" /> REC
          </span>
          <Button size="icon" variant="ghost" className="text-card/60 hover:text-card h-8 w-8 rounded-lg" onClick={() => setShowReport(!showReport)}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex relative overflow-hidden">
        <div className={`flex-1 flex flex-col items-center justify-center relative ${boardOpen || showReport ? "hidden md:flex" : ""}`}>
          {/* Jitsi container or start screen */}
          {meetingStarted ? (
            <div ref={jitsiContainerRef} className="absolute inset-0 w-full h-full" />
          ) : (
            <div className="text-center text-primary-foreground gradient-hero w-full h-full flex flex-col items-center justify-center">
              <div className="w-28 h-28 rounded-3xl bg-primary-foreground/10 backdrop-blur-sm mx-auto mb-5 flex items-center justify-center border border-primary-foreground/10">
                <Users className="h-14 w-14 text-primary-foreground/60" />
              </div>
              <p className="font-black text-xl mb-1">{otherName}</p>
              <p className="text-sm opacity-60 mb-6">جاهز لبدء الحصة</p>
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

          {/* Self view overlay (only when meeting not started) */}
          {!meetingStarted && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute bottom-20 left-4 w-36 h-28 rounded-2xl bg-primary-foreground/10 backdrop-blur-md border border-primary-foreground/10 flex items-center justify-center">
              <div className="text-center">
                <p className="text-xs text-primary-foreground font-bold">أنت</p>
                {!videoOn && <VideoOff className="h-5 w-5 text-primary-foreground/50 mx-auto mt-1" />}
              </div>
            </motion.div>
          )}

          {handRaised && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 bg-gold text-gold-foreground px-4 py-2 rounded-xl font-bold text-sm shadow-lg z-20">
              <Hand className="h-4 w-4 inline ml-1" /> رفعت يدك
            </motion.div>
          )}
          <div className="absolute top-4 left-4 bg-primary-foreground/10 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-2 z-20">
            <Clock className="h-3.5 w-3.5 text-primary-foreground/60" />
            <span className="text-xs font-mono text-primary-foreground/80">{formatTime(elapsed)}</span>
          </div>
        </div>

        {/* Whiteboard */}
        <AnimatePresence>
          {boardOpen && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex-1 bg-card flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <PenTool className="h-10 w-10 opacity-30" />
                </div>
                <p className="font-bold text-lg mb-1">السبورة التفاعلية</p>
                <p className="text-sm">ارسم واكتب هنا</p>
              </div>
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
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${micOn ? "bg-card/20 hover:bg-card/30 text-card border-0" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"}`} onClick={toggleMic}>
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${videoOn ? "bg-card/20 hover:bg-card/30 text-card border-0" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"}`} onClick={toggleVideo}>
          {videoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${boardOpen ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => { setBoardOpen(!boardOpen); setShowReport(false); }}>
          <PenTool className="h-5 w-5" />
        </Button>
        <Button size="icon" className="rounded-xl h-12 w-12 bg-card/20 hover:bg-card/30 text-card border-0" onClick={toggleScreenShare}>
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
        <Button size="icon" className="rounded-xl h-12 w-12 bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0" onClick={endSession}>
          <Phone className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default LiveSession;
