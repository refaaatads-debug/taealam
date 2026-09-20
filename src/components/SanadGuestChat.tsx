import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const welcomeMessage =
  "أنا سند، مساعدك في أجيال المعرفة. أقدر أشرح لك كيف تعمل المنصة، وأساعدك في العثور على مدرس مناسب أو فهم طريقة الحجز. كيف أساعدك اليوم؟";

const quickQuestions = [
  "كيف تعمل المنصة؟",
  "كيف أجد مدرساً مناسباً؟",
  "كيف أحجز أول حصة؟",
];

export default function SanadGuestChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: welcomeMessage },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (event?: FormEvent, quickText?: string) => {
    event?.preventDefault();
    const content = (quickText ?? input).trim();
    if (!content || loading) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("sanad-public", {
        body: {
          messages: nextMessages.slice(-8),
        },
      });
      if (error) throw error;
      const reply = typeof data?.reply === "string" && data.reply.trim()
        ? data.reply.trim()
        : "أفهم سؤالك، لكن أحتاج لحظة لأرتب الإجابة. جرّب مرة أخرى من فضلك.";
      setMessages((current) => [...current, { role: "assistant", content: reply }]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "تعذر الاتصال بي الآن. يمكنك تصفح المنصة أو المحاولة مرة أخرى بعد قليل.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-5 left-4 z-[60] font-cairo" dir="rtl">
      {open && (
        <button
          type="button"
          aria-label="إغلاق نافذة سند"
          className="fixed inset-0 z-[-1] cursor-default bg-[#102f50]/10 backdrop-blur-[1px] md:bg-transparent md:backdrop-blur-none"
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <section
          aria-label="محادثة سند"
          className="mb-3 flex h-[min(660px,calc(100vh-112px))] w-[min(410px,calc(100vw-32px))] flex-col overflow-hidden rounded-[26px] border border-white/80 bg-[#f7f9f8] shadow-[0_28px_80px_-28px_rgba(15,42,78,.65)]"
        >
          <header className="relative overflow-hidden bg-gradient-to-l from-[#102e57] via-[#174b78] to-[#14786f] px-4 pb-4 pt-4 text-white">
            <div className="pointer-events-none absolute -left-8 -top-12 h-32 w-32 rounded-full bg-[#b9e4dc]/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <img
                src={logo}
                alt="شعار أجيال المعرفة - سند"
                className="h-12 w-12 rounded-2xl border border-white/25 bg-white object-contain p-1 shadow-inner"
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black">سند</h2>
                <p className="mt-0.5 text-[10px] text-white/70">مساعدك في أجيال المعرفة</p>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] text-[#b9e4dc]">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                متاح الآن
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="rounded-xl p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[#f7f9f8] p-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex items-end gap-2 ${message.role === "user" ? "justify-start" : "justify-end"}`}
              >
                {message.role === "assistant" && (
                  <img
                    src={logo}
                    alt=""
                    aria-hidden="true"
                    className="h-8 w-8 shrink-0 rounded-xl border border-[#188779]/15 bg-white object-cover"
                  />
                )}
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-7 shadow-sm ${
                    message.role === "user"
                      ? "rounded-tr-md bg-[#102f50] text-white"
                      : "rounded-tl-md border border-[#102f50]/10 bg-white text-[#102f50]"
                  }`}
                >
                  {message.role === "assistant" && (
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-black text-[#188779]">
                      <Sparkles className="h-3 w-3" />
                      سند
                    </p>
                  )}
                  <div className="prose prose-sm max-w-none prose-p:my-0 prose-p:leading-7 prose-strong:text-current">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-end justify-end gap-2">
                <img
                  src={logo}
                  alt=""
                  aria-hidden="true"
                  className="h-8 w-8 rounded-xl border border-[#188779]/15 bg-white object-cover"
                />
                <div className="rounded-2xl rounded-tl-md border border-[#102f50]/10 bg-white px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#188779]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#188779] [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#188779] [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {messages.length === 1 && (
            <div className="border-t border-[#102f50]/10 bg-white px-3 py-3">
              <p className="mb-2 text-[10px] font-bold text-[#102f50]/50">جرّب أن تسأل سنداً عن:</p>
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void sendMessage(undefined, question)}
                    disabled={loading}
                    className="rounded-full border border-[#188779]/20 bg-[#e8f1ef] px-3 py-1.5 text-[10px] font-bold text-[#176f6b] transition hover:bg-[#d9eee9] disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-[#102f50]/10 bg-white p-3">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="اكتب سؤالك لسند..."
              aria-label="رسالة إلى سند"
              className="min-h-10 flex-1 rounded-xl border border-[#102f50]/10 bg-[#f7f9f8] px-3 text-sm text-[#102f50] outline-none transition placeholder:text-[#102f50]/35 focus:border-[#188779] focus:ring-2 focus:ring-[#188779]/15"
              disabled={loading}
            />
            <button
              type="submit"
              aria-label="إرسال الرسالة"
              disabled={!input.trim() || loading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#188779] text-white transition hover:bg-[#14786f] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "إغلاق سند" : "أنا سند مساعد"}
        aria-expanded={open}
        className="group relative flex items-center gap-3 rounded-2xl bg-gradient-to-l from-[#102e57] via-[#174b78] to-[#14786f] px-3 py-2.5 text-white shadow-[0_18px_45px_-15px_rgba(17,65,102,.75)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_55px_-16px_rgba(17,65,102,.85)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#b9e4dc]/50"
      >
        <span className="absolute inset-0 -z-10 rounded-[24px] bg-[#39b89d]/20 blur-md transition-transform group-hover:scale-110" />
        <span className="relative">
          <img
            src={logo}
            alt=""
            aria-hidden="true"
            className="h-11 w-11 rounded-xl border border-white/25 bg-white object-contain p-1"
          />
          <span className="absolute -left-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-[#174b78] bg-emerald-300" />
        </span>
        <span className="pl-1 text-right">
          <span className="block text-sm font-black">أنا سند مساعد</span>
          <span className="mt-0.5 block text-[9px] text-white/65">مساعدك في أجيال المعرفة</span>
        </span>
      </button>
    </div>
  );
}