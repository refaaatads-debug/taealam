import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mic, Send, Sparkles, Volume2, ArrowRight, Loader2, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";
import { LiveVoiceTutor } from "@/components/ai/LiveVoiceTutor";

interface Msg { role: "user" | "assistant"; content: string; audio?: string }

const AITutor = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("site_settings").select("value").eq("key", "ai_tutor_agent_id").maybeSingle()
      .then(({ data }) => setAgentId(data?.value?.trim() || ""));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !user) return;
    setInput("");
    const newMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMsgs);
    setLoading(true);

    const { data, error } = await supabase.functions.invoke("ai-tutor-chat", {
      body: { messages: newMsgs.map(m => ({ role: m.role, content: m.content })), speak: true },
    });
    setLoading(false);
    if (error || data?.error) {
      toast.error(data?.error || "خطأ في الاتصال");
      return;
    }
    const reply: Msg = { role: "assistant", content: data.text, audio: data.audio };
    setMessages(prev => [...prev, reply]);
    if (data.audio) playAudio(data.audio);
  };

  const playAudio = (base64: string) => {
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    audioRef.current = audio;
    audio.play().catch(() => {});
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <Navbar />
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 gap-2">
          <ArrowRight className="h-4 w-4" /> رجوع
        </Button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-primary to-secondary mb-3 shadow-lg">
            <Sparkles className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black">مساعد التعلّم الذكي</h1>
          <p className="text-sm text-muted-foreground mt-1">اطرح سؤالاً واسمع الإجابة بصوت طبيعي</p>
        </div>

        <Tabs defaultValue="text" className="mb-4">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="text" className="gap-2"><MessageSquare className="h-4 w-4" /> نص + نطق</TabsTrigger>
            <TabsTrigger value="voice" className="gap-2"><Phone className="h-4 w-4" /> محادثة صوتية حية</TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="space-y-3 mt-4">
            <Card className="min-h-[400px]">
              <CardContent className="p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>ابدأ بطرح سؤال... سأشرح لك بالعربية وأنطق الإجابة بصوت 🎙️</p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                      {m.audio && m.role === "assistant" && (
                        <button onClick={() => playAudio(m.audio!)} className="mt-2 inline-flex items-center gap-1 text-xs opacity-70 hover:opacity-100">
                          <Volume2 className="h-3 w-3" /> تشغيل الصوت
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-end">
                    <div className="bg-muted rounded-2xl px-4 py-2.5 inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> <span className="text-sm">يفكر...</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </CardContent>
            </Card>

            <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-card border-t p-3 z-40">
              <div className="container mx-auto max-w-3xl flex gap-2">
                <Input
                  placeholder="اكتب سؤالك هنا..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  disabled={loading}
                />
                <Button onClick={send} disabled={loading || !input.trim()} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="voice" className="mt-4">
            <Card>
              <CardContent className="p-8 text-center">
                {!agentId ? (
                  <>
                    <Mic className="h-16 w-16 mx-auto mb-4 text-muted-foreground/40" />
                    <h3 className="text-lg font-bold mb-2">المحادثة الصوتية الحية قريباً</h3>
                    <p className="text-sm text-muted-foreground">
                      نعمل على تفعيل المحادثة الصوتية المباشرة مع الذكاء الاصطناعي.<br />
                      في الوقت الحالي، استخدم وضع "نص + نطق" للتفاعل الكامل.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground mb-4">
                      المحادثة الصوتية الحية متاحة. سيتم تفعيلها قريباً في تحديث قادم.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <BottomNav />
    </div>
  );
};

export default AITutor;
