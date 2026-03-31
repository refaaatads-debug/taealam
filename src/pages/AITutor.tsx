import { useState } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
