import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Sparkles, RefreshCw, Headphones } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
  ticketId?: string;
}

const STORAGE_KEY = "ai_support_chat_v1";
const MAX_HISTORY = 20;

const QUICK_REPLIES_STUDENT = [
  "كم الدقائق المتبقية في باقتي؟",
  "متى موعد حصتي القادمة؟",
  "ما هي واجباتي الحالية؟",
  "أريد التحدث مع الدعم البشري",
];

const QUICK_REPLIES_TEACHER = [
  "كم أرباحي هذا الشهر؟",
  "ما هي حصصي القادمة؟",
  "كم رصيدي الحالي؟",
  "أريد التحدث مع الدعم البشري",
];

interface Props {
  onCreateTicket?: (subject: string, conversationLog: string) => void;
  onTicketCreated?: (ticketId: string) => void;
}

const AIAssistantChat = ({ onCreateTicket, onTicketCreated }: Props) => {
  const { user, roles } = useAuth();
  const isTeacher = roles.includes("teacher");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load persisted history (per-user)
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}:${user.id}`);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, [user]);

  // Persist
  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(
        `${STORAGE_KEY}:${user.id}`,
        JSON.stringify(messages.slice(-MAX_HISTORY))
      );
    } catch {}
  }, [messages, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !user) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim(), ts: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // Handoff intent — short-circuit to ticket creation
    const lower = text.toLowerCase();
    if (
      lower.includes("دعم بشري") ||
      lower.includes("موظف") ||
      lower.includes("human support")
    ) {
      const reply: ChatMessage = {
        role: "assistant",
        content:
          "بالتأكيد 👨‍💻 سأقوم بتحويلك لفريق الدعم البشري. اضغط على زر **«تحويل لفريق الدعم»** بالأسفل وسيتم إنشاء تذكرة تحتوي على محادثتنا.",
        ts: Date.now(),
      };
      setMessages([...newMessages, reply]);
      setLoading(false);
      return;
    }

    try {
      const history = newMessages.slice(-MAX_HISTORY).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke("ai-support", {
        body: { messages: history },
      });

      if (error) throw error;

      const reply = (data?.content as string) || (data?.reply as string) || "عذرًا، لم أتمكن من الرد. حاول مرة أخرى.";
      const ticket = data?.ticket as { id: string; subject: string; category: string } | null;

      // If AI created a ticket, seed conversation log into it (best effort) and surface CTA
      if (ticket?.id && user) {
        const log = newMessages
          .map((m) => `${m.role === "user" ? "👤 المستخدم" : "🤖 المساعد"}: ${m.content}`)
          .join("\n\n");
        try {
          await supabase.from("support_messages").insert({
            ticket_id: ticket.id,
            sender_id: user.id,
            content: `📋 **سجل المحادثة الكامل مع المساعد الذكي:**\n\n${log}`,
            is_admin: false,
          });
        } catch (err) {
          console.error("Failed to seed conversation log:", err);
        }
        toast.success("تم تحويلك لفريق الدعم");
        onTicketCreated?.(ticket.id);
      }

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: reply,
          ts: Date.now(),
          ticketId: ticket?.id,
        } as ChatMessage,
      ]);
    } catch (e: any) {
      console.error("AI support error:", e);
      const errMsg = e?.message?.includes("429")
        ? "⚠️ تم تجاوز الحد المسموح به مؤقتًا. حاول بعد قليل."
        : e?.message?.includes("402")
        ? "⚠️ يحتاج النظام لإعادة تعبئة الرصيد. تواصل مع الإدارة."
        : "حدث خطأ في الاتصال بالمساعد. حاول مرة أخرى.";
      setMessages([
        ...newMessages,
        { role: "assistant", content: errMsg, ts: Date.now() },
      ]);
      toast.error("فشل الاتصال بالمساعد الذكي");
    } finally {
      setLoading(false);
    }
  };

  const resetChat = () => {
    setMessages([]);
    if (user) localStorage.removeItem(`${STORAGE_KEY}:${user.id}`);
  };

  const handleHandoff = () => {
    if (!onCreateTicket) {
      toast.info("استخدم تبويب «فريق الدعم» لإنشاء تذكرة");
      return;
    }
    const log = messages
      .map((m) => `${m.role === "user" ? "👤 أنا" : "🤖 المساعد"}: ${m.content}`)
      .join("\n\n");
    const subject = messages[0]?.content.slice(0, 60) || "استفسار من المساعد الذكي";
    onCreateTicket(`[محادثة AI] ${subject}`, log);
  };

  const quickReplies = isTeacher ? QUICK_REPLIES_TEACHER : QUICK_REPLIES_STUDENT;

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-l from-primary/5 to-transparent rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="absolute -bottom-0.5 -left-0.5 w-3 h-3 bg-emerald-500 border-2 border-card rounded-full animate-pulse" />
          </div>
          <div>
            <p className="font-bold text-sm text-foreground">المساعد الذكي</p>
            <p className="text-[11px] text-muted-foreground">متصل دائمًا • يفهم بياناتك</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={resetChat} className="rounded-xl gap-1 text-xs">
            <RefreshCw className="h-3 w-3" />
            محادثة جديدة
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted/20">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-bold text-foreground">مرحبًا 👋</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              أنا مساعدك الذكي. يمكنني الرد على استفساراتك حول باقتك، حصصك، واجباتك،
              {isTeacher && " أرباحك،"} والمزيد.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "flex animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
              m.role === "user" ? "justify-start" : "justify-end"
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border/40"
              )}
            >
              {m.role === "assistant" && (
                <p className="text-[10px] font-bold mb-1 text-primary flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" /> المساعد الذكي
                </p>
              )}
              <div
                className={cn(
                  "text-sm leading-relaxed prose prose-sm max-w-none",
                  "prose-headings:text-current prose-strong:text-current prose-p:text-current prose-li:text-current prose-a:text-current",
                  m.role === "user" ? "prose-invert" : "dark:prose-invert"
                )}
              >
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
              <p
                className={cn(
                  "text-[10px] mt-1 text-left",
                  m.role === "user"
                    ? "text-primary-foreground/60"
                    : "text-muted-foreground"
                )}
              >
                {new Date(m.ts).toLocaleTimeString("ar-SA", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-end">
            <div className="bg-card border border-border/40 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      {messages.length === 0 && (
        <div className="px-4 py-3 border-t bg-card/50">
          <p className="text-[11px] text-muted-foreground mb-2">اقتراحات سريعة:</p>
          <div className="flex flex-wrap gap-2">
            {quickReplies.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={loading}
                className="text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Handoff CTA when conversation has substance */}
      {messages.length >= 2 && onCreateTicket && (
        <div className="px-4 pt-2 pb-1 bg-card/50">
          <Button
            variant="outline"
            size="sm"
            onClick={handleHandoff}
            className="w-full rounded-xl gap-2 text-xs"
          >
            <Headphones className="h-3.5 w-3.5" />
            تحويل المحادثة لفريق الدعم البشري
          </Button>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="p-3 border-t bg-card flex items-center gap-2 rounded-b-xl"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="اسأل المساعد الذكي..."
          className="rounded-xl flex-1"
          dir="rtl"
          disabled={loading}
        />
        <Button
          type="submit"
          size="icon"
          className="rounded-xl shrink-0"
          disabled={!input.trim() || loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
};

export default AIAssistantChat;
