import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Video, VideoOff, Mic, MicOff, Monitor, MessageSquare,
  PenTool, Phone, Send, Users
} from "lucide-react";

const messages = [
  { sender: "أ. سارة", text: "أهلاً أحمد! جاهز نبدأ؟", time: "4:00 م" },
  { sender: "أحمد", text: "أهلاً أستاذة، نعم جاهز", time: "4:01 م", me: true },
  { sender: "أ. سارة", text: "ممتاز، اليوم راح نراجع المعادلات التربيعية", time: "4:01 م" },
];

const LiveSession = () => {
  const [videoOn, setVideoOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);

  return (
    <div className="h-screen bg-foreground flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-card/10">
        <div className="flex items-center gap-3 text-primary-foreground">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <Users className="h-4 w-4 text-secondary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-card">رياضيات - أ. سارة المحمدي</p>
            <p className="text-xs opacity-60 text-card">● مباشر • 00:32:15</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-destructive/20 text-destructive px-2 py-1 rounded-full">● REC</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Video Area */}
        <div className={`flex-1 flex items-center justify-center bg-gradient-to-br from-primary/90 to-primary/70 ${boardOpen ? "hidden md:flex" : ""}`}>
          <div className="text-center text-card">
            <div className="w-24 h-24 rounded-full bg-card/20 mx-auto mb-4 flex items-center justify-center">
              <Users className="h-12 w-12 text-card/80" />
            </div>
            <p className="font-semibold text-lg">أ. سارة المحمدي</p>
            <p className="text-sm opacity-70">الفيديو قيد التشغيل</p>
          </div>
          {/* Self video preview */}
          <div className="absolute bottom-20 left-4 w-32 h-24 rounded-xl bg-card/20 backdrop-blur border border-card/10 flex items-center justify-center">
            <p className="text-xs text-card">أنت</p>
          </div>
        </div>

        {/* Whiteboard */}
        {boardOpen && (
          <div className="flex-1 bg-card flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <PenTool className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="font-medium">السبورة التفاعلية</p>
              <p className="text-sm">ارسم واكتب هنا</p>
            </div>
          </div>
        )}

        {/* Chat */}
        {chatOpen && (
          <div className="w-full md:w-80 bg-card border-r flex flex-col absolute md:relative inset-0 md:inset-auto z-10">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-foreground">المحادثة</h3>
              <button onClick={() => setChatOpen(false)} className="text-muted-foreground md:hidden">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`${m.me ? "mr-auto" : "ml-auto"} max-w-[80%]`}>
                  <div className={`p-3 rounded-2xl text-sm ${m.me ? "bg-secondary text-secondary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                    {!m.me && <p className="text-xs font-semibold mb-1 opacity-70">{m.sender}</p>}
                    {m.text}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{m.time}</p>
                </div>
              ))}
            </div>
            <div className="p-3 border-t flex gap-2">
              <Input placeholder="اكتب رسالة..." className="text-right h-10" />
              <Button size="icon" className="gradient-cta text-secondary-foreground h-10 w-10">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 p-4 bg-card/10">
        <Button
          size="icon"
          variant={micOn ? "secondary" : "destructive"}
          className="rounded-full h-12 w-12"
          onClick={() => setMicOn(!micOn)}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        <Button
          size="icon"
          variant={videoOn ? "secondary" : "destructive"}
          className="rounded-full h-12 w-12"
          onClick={() => setVideoOn(!videoOn)}
        >
          {videoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
        <Button
          size="icon"
          variant={boardOpen ? "default" : "secondary"}
          className="rounded-full h-12 w-12"
          onClick={() => setBoardOpen(!boardOpen)}
        >
          <PenTool className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="rounded-full h-12 w-12"
        >
          <Monitor className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant={chatOpen ? "default" : "secondary"}
          className="rounded-full h-12 w-12"
          onClick={() => setChatOpen(!chatOpen)}
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
        <Button size="icon" variant="destructive" className="rounded-full h-12 w-12">
          <Phone className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default LiveSession;
