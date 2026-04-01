import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Video, VideoOff, Mic, MicOff, Monitor, MessageSquare,
  PenTool, Phone, Send, Users, MoreVertical, Hand, FileText, Clock, ExternalLink, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SessionReport from "@/components/SessionReport";
import { toast } from "sonner";

const LiveSession = () => {
  const { user } = useAuth();
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
  const [meetingLink, setMeetingLink] = useState<string | null>(null);
  const [zoomLoading, setZoomLoading] = useState(false);
  const [messages, setMessages] = useState([
    { sender: "أ. سارة", text: "أهلاً! جاهز نبدأ؟", time: "الآن", me: false },
  ]);
  const [newMessage, setNewMessage] = useState("");
  const timerRef = useRef<number>();

  // Fetch meeting link from booking
  useEffect(() => {
    if (!bookingId) return;
    (supabase as any).from("bookings").select("meeting_link").eq("id", bookingId).single()
      .then(({ data }: any) => {
        if (data?.meeting_link) setMeetingLink(data.meeting_link);
      });
  }, [bookingId]);

  // Session timer
  useEffect(() => {
    timerRef.current = window.setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
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

    // Analyze message for violations in background
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

  const createZoomMeeting = async () => {
    if (!bookingId) { toast.error("لا يوجد حجز محدد"); return; }
    setZoomLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-zoom-meeting", {
        body: { booking_id: bookingId },
      });
      if (error) throw error;
      if (data?.meeting_link) {
        setMeetingLink(data.meeting_link);
        window.open(data.meeting_link, "_blank");
      }
    } catch (e: any) {
      toast.error(e.message || "خطأ في إنشاء اجتماع Zoom");
    } finally {
      setZoomLoading(false);
    }
  };

  const joinZoom = () => {
    if (meetingLink) window.open(meetingLink, "_blank");
    else createZoomMeeting();
  };

  const endSession = () => {
    clearInterval(timerRef.current);
    navigate("/rating");
  };

  return (
    <div className="h-screen bg-foreground flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 glass-strong border-b border-border/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl gradient-cta flex items-center justify-center">
            <Users className="h-4 w-4 text-secondary-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold text-card">رياضيات - أ. سارة المحمدي</p>
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
        {/* Video Area */}
        <div className={`flex-1 flex flex-col items-center justify-center gradient-hero relative ${boardOpen || showReport ? "hidden md:flex" : ""}`}>
          <div className="text-center text-primary-foreground">
            <div className="w-28 h-28 rounded-3xl bg-primary-foreground/10 backdrop-blur-sm mx-auto mb-5 flex items-center justify-center border border-primary-foreground/10">
              <Users className="h-14 w-14 text-primary-foreground/60" />
            </div>
            <p className="font-black text-xl mb-1">أ. سارة المحمدي</p>
            <p className="text-sm opacity-60 mb-4">الفيديو قيد التشغيل</p>
            <Button
              onClick={joinZoom}
              disabled={zoomLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-6 py-3 text-base font-bold shadow-lg"
            >
              {zoomLoading ? (
                <Loader2 className="h-5 w-5 animate-spin ml-2" />
              ) : (
                <ExternalLink className="h-5 w-5 ml-2" />
              )}
              {meetingLink ? "انضم عبر Zoom" : "إنشاء اجتماع Zoom"}
            </Button>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute bottom-20 left-4 w-36 h-28 rounded-2xl bg-primary-foreground/10 backdrop-blur-md border border-primary-foreground/10 flex items-center justify-center">
            <div className="text-center">
              <p className="text-xs text-primary-foreground font-bold">أنت</p>
              {!videoOn && <VideoOff className="h-5 w-5 text-primary-foreground/50 mx-auto mt-1" />}
            </div>
          </motion.div>
          {handRaised && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 bg-gold text-gold-foreground px-4 py-2 rounded-xl font-bold text-sm shadow-lg">
              <Hand className="h-4 w-4 inline ml-1" /> رفعت يدك
            </motion.div>
          )}
          {/* Session timer overlay */}
          <div className="absolute top-4 left-4 bg-primary-foreground/10 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-2">
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
              <SessionReport bookingId="demo" />
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
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${micOn ? "bg-card/20 hover:bg-card/30 text-card border-0" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"}`} onClick={() => setMicOn(!micOn)}>
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${videoOn ? "bg-card/20 hover:bg-card/30 text-card border-0" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"}`} onClick={() => setVideoOn(!videoOn)}>
          {videoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${boardOpen ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => { setBoardOpen(!boardOpen); setShowReport(false); }}>
          <PenTool className="h-5 w-5" />
        </Button>
        <Button size="icon" className="rounded-xl h-12 w-12 bg-card/20 hover:bg-card/30 text-card border-0">
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
