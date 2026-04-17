import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Brain, Send, Sparkles, BookOpen, Calculator, FlaskConical, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { checkRateLimit } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-tutor`;

const quickPrompts = [
  { icon: Calculator, label: "حل معادلة", prompt: "ساعدني في حل المعادلة التربيعية: x² - 5x + 6 = 0" },
  { icon: FlaskConical, label: "شرح مفهوم", prompt: "اشرح لي قانون نيوتن الثاني بأسلوب مبسط" },
  { icon: BookOpen, label: "تلخيص درس", prompt: "لخص لي درس الخلية في الأحياء" },
];

const AITutor = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkAccess = async () => {
      if (!user) { setHasAccess(false); return; }
      const { data } = await supabase
        .from("user_subscriptions")
        .select("is_active, ends_at, plan:subscription_plans(has_ai_tutor, tier)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gt("ends_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const plan = (data as any)?.plan;
      const ok = !!plan && plan.tier !== "free" && plan.has_ai_tutor === true;
      setHasAccess(ok);
    };
    checkAccess();
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    if (!hasAccess) {
      toast.error("المدرس الذكي متاح فقط لمشتركي الباقات المدفوعة");
      return;
    }
    if (!checkRateLimit("ai-tutor", 15, 60000)) {
      toast.error("تم تجاوز حد الطلبات، انتظر قليلاً");
      return;
    }
    const userMsg: Msg = { role: "user", content: text.trim() };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "فشل الاتصال");
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
      setMessages((prev) => [...prev, { role: "assistant", content: "عذراً، حدث خطأ. حاول مرة أخرى." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30 pb-16 md:pb-0">
      <Navbar />
      <div className="container flex-1 flex flex-col py-4 max-w-3xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl gradient-cta flex items-center justify-center">
            <Brain className="h-5 w-5 text-secondary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground">المدرس الذكي</h1>
            <p className="text-xs text-muted-foreground">مدعوم بالذكاء الاصطناعي</p>
          </div>
        </div>

        <Card className="flex-1 flex flex-col border-0 shadow-card overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[400px]">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-secondary" />
                </div>
                <h3 className="font-bold text-foreground mb-2">كيف أقدر أساعدك؟</h3>
                <p className="text-sm text-muted-foreground mb-6">اسألني أي سؤال في أي مادة</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {quickPrompts.map((q, i) => (
                    <Button key={i} variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => send(q.prompt)}>
                      <q.icon className="h-4 w-4" />
                      {q.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`max-w-[85%] ${m.role === "user" ? "mr-auto" : "ml-auto"}`}>
                <div className={`p-3 rounded-2xl text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-secondary/10 text-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}>
                  {m.content}
                </div>
              </motion.div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="ml-auto max-w-[85%]">
                <div className="bg-muted p-3 rounded-2xl rounded-bl-sm flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t flex gap-2">
            <Input
              placeholder="اكتب سؤالك..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
              className="text-right h-11 rounded-xl bg-muted/30 border-0"
              disabled={isLoading}
            />
            <Button onClick={() => send(input)} disabled={isLoading || !input.trim()} size="icon" className="gradient-cta text-secondary-foreground h-11 w-11 rounded-xl shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
      <BottomNav />
    </div>
  );
};

export default AITutor;
