import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Sparkles, ArrowRight, Loader2, HelpCircle, MessageSquare, BookOpen, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface Msg { role: "user" | "assistant"; content: string }

const QUICK_QUESTIONS = [
  "كيف أحجز حصة؟",
  "كيف أشترك في باقة؟",
  "ما هي طرق الدفع المتاحة؟",
  "كيف أسحب أرباحي كمعلم؟",
  "متى تُخصم دقائق الباقة؟",
];

const HelpCenter = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ask = async (text: string) => {
    if (!text.trim() || loading) return;
    const newMsgs: Msg[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);

    const { data, error } = await supabase.functions.invoke("help-bot", {
      body: { messages: newMsgs },
    });

    setLoading(false);
    if (error || data?.error) {
      toast.error(data?.error || "تعذر الاتصال");
      return;
    }
    setMessages([...newMsgs, { role: "assistant", content: data.reply }]);
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <Navbar />
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 gap-2">
          <ArrowRight className="h-4 w-4" /> رجوع
        </Button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-info to-primary mb-3 shadow-lg">
            <LifeBuoy className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black">مركز المساعدة الذكي</h1>
          <p className="text-sm text-muted-foreground mt-1">احصل على إجابات فورية أو تواصل مع الدعم</p>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <Button variant="outline" className="flex-col h-auto py-3 gap-1" onClick={() => navigate("/faq")}>
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-xs">الأسئلة الشائعة</span>
          </Button>
          <Button variant="outline" className="flex-col h-auto py-3 gap-1" onClick={() => navigate("/support")}>
            <MessageSquare className="h-4 w-4 text-secondary" />
            <span className="text-xs">دعم بشري</span>
          </Button>
          <Button variant="outline" className="flex-col h-auto py-3 gap-1" onClick={() => navigate("/install")}>
            <HelpCircle className="h-4 w-4 text-info" />
            <span className="text-xs">تثبيت التطبيق</span>
          </Button>
        </div>

        <Card className="min-h-[420px] mb-3">
          <CardContent className="p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm mb-4">اسأل عن أي شيء يخص المنصة</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {QUICK_QUESTIONS.map((q, i) => (
                    <Button key={i} variant="secondary" size="sm" className="text-xs h-auto py-1.5" onClick={() => ask(q)}>
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none text-foreground/90 leading-relaxed text-sm">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
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

        {messages.length > 2 && (
          <div className="bg-info/10 border border-info/30 rounded-xl p-3 mb-3 flex items-center justify-between">
            <p className="text-sm">لم تجد إجابتك؟</p>
            <Button size="sm" variant="outline" onClick={() => navigate("/support")} className="gap-1">
              <MessageSquare className="h-3.5 w-3.5" /> تواصل مع الدعم
            </Button>
          </div>
        )}

        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-card border-t p-3 z-40">
          <div className="container mx-auto max-w-3xl flex gap-2">
            <Input
              placeholder="اكتب سؤالك هنا..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask(input)}
              disabled={loading}
            />
            <Button onClick={() => ask(input)} disabled={loading || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
};

export default HelpCenter;
