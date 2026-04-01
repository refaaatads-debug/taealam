import { useState, useRef, useEffect } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Brain, Send, Sparkles, BookOpen, Calculator, FlaskConical } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-tutor`;

const quickPrompts = [
  { icon: Calculator, label: "حل معادلة", prompt: "ساعدني في حل المعادلة التربيعية: x² - 5x + 6 = 0" },
  { icon: FlaskConical, label: "شرح مفهوم", prompt: "اشرح لي قانون نيوتن الثاني بأسلوب مبسط" },
  { icon: BookOpen, label: "تلخيص درس", prompt: "لخص لي درس الخلية في الأحياء" },
];

const AITutor = () => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
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
import { Brain, Send, Sparkles, BookOpen } from "lucide-react";
import { motion } from "framer-motion";

const suggestedQuestions = [
  "اشرح لي المعادلات التربيعية",
  "ما هو قانون نيوتن الثالث؟",
  "ساعدني في حل واجب الكيمياء",
  "كيف أحسن مستواي في الإنجليزي؟",
];

const AITutor = () => {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "مرحباً! 👋 أنا المدرس الذكي. اسألني أي سؤال في أي مادة وسأساعدك بالشرح والأمثلة. كيف أقدر أساعدك اليوم؟" },
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text: input }]);
    const q = input;
    setInput("");
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "ai", text: `سؤال ممتاز! "${q}" - هذه ميزة تجريبية. عند ربط المنصة بالذكاء الاصطناعي، سأقدم لك شرحاً مفصلاً مع أمثلة تفاعلية.` }]);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col pb-16 md:pb-0">
      <Navbar />
      <div className="container py-6 flex-1 flex flex-col max-w-3xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl gradient-cta flex items-center justify-center mx-auto mb-3 shadow-button">
            <Brain className="h-8 w-8 text-secondary-foreground" />
          </div>
          <h1 className="text-2xl font-black text-foreground">المدرس الذكي AI</h1>
          <p className="text-sm text-muted-foreground">اسألني أي سؤال واحصل على شرح فوري</p>
        </motion.div>

        {/* Chat Area */}
        <Card className="border-0 shadow-card flex-1 flex flex-col overflow-hidden">
          <CardContent className="p-0 flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${m.role === "user" ? "bg-secondary/10 text-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                    {m.role === "ai" && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles className="h-3.5 w-3.5 text-secondary" />
                        <span className="text-xs font-bold text-secondary">المدرس الذكي</span>
                      </div>
                    )}
                    {m.text}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Suggestions */}
            {messages.length <= 1 && (
              <div className="px-5 pb-3">
                <p className="text-xs text-muted-foreground mb-2 font-bold">اقتراحات:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedQuestions.map((q, i) => (
                    <button key={i} onClick={() => { setInput(q); }} className="text-xs bg-accent text-accent-foreground px-3 py-2 rounded-xl hover:bg-accent/80 transition-colors font-medium">
                      <BookOpen className="h-3 w-3 inline ml-1" />{q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="اكتب سؤالك هنا..."
                className="text-right rounded-xl bg-muted/30 border-0 h-11"
              />
              <Button onClick={handleSend} size="icon" className="gradient-cta text-secondary-foreground h-11 w-11 rounded-xl shadow-button" disabled={!input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <BottomNav />
    </div>
  );
};

export default AITutor;
