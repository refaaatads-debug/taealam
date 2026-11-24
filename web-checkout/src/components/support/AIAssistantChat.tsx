import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Send, Loader2, Sparkles, RefreshCw, Headphones,
  Paperclip, X, FileText, Image as ImageIcon, Mic, Square,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface Attachment {
  url: string;
  name: string;
  type: string;
  textContent?: string; // extracted text for AI context
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
  ticketId?: string;
  attachment?: Attachment;
  /** while streaming the typing simulation */
  streaming?: boolean;
}

const STORAGE_KEY = "ai_support_chat_v1";
const MAX_HISTORY = 20;
const TYPING_CHARS_PER_TICK = 3;
const TYPING_INTERVAL_MS = 18;

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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);

  // Load persisted history
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}:${user.id}`);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, [user]);

  // Persist (skip while a message is mid-stream so we don't save partial text)
  useEffect(() => {
    if (!user) return;
    if (messages.some((m) => m.streaming)) return;
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

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [input]);

  // ─── File handling ───────────────────────────────────────────────────
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("الحد الأقصى 8 ميجابايت");
      return;
    }
    setPendingFile(file);
  };

  const uploadAttachment = async (file: File): Promise<Attachment | null> => {
    if (!user) return null;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `ai-support/${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("support-files")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (error) throw error;
      const { data } = supabase.storage.from("support-files").getPublicUrl(path);

      // Try to extract text content for AI context (text/markdown/json/csv only)
      let textContent: string | undefined;
      if (
        file.type.startsWith("text/") ||
        file.type === "application/json" ||
        file.name.match(/\.(md|txt|csv|log|json)$/i)
      ) {
        try {
          const raw = await file.text();
          textContent = raw.slice(0, 12000);
        } catch {}
      }
      return { url: data.publicUrl, name: file.name, type: file.type, textContent };
    } catch (err: any) {
      toast.error("فشل رفع الملف");
      console.error(err);
      return null;
    } finally {
      setUploading(false);
    }
  };

  // ─── Voice recording → transcription ─────────────────────────────────
  const startRecording = async () => {
    if (recording || transcribing || loading) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recordChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) recordChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordChunksRef.current, { type: "audio/webm" });
        if (!blob.size) return;
        await transcribe(new File([blob], "voice.webm", { type: "audio/webm" }));
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (err) {
      toast.error("تعذر الوصول للميكروفون");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const transcribe = async (file: File) => {
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("audio", file);
      const { data, error } = await supabase.functions.invoke(
        "ai-support-transcribe",
        { body: fd },
      );
      if (error) throw error;
      const text = (data?.text as string)?.trim();
      if (text) {
        setInput((prev) => (prev ? `${prev} ${text}` : text));
        textareaRef.current?.focus();
      } else {
        toast.error("لم يتم التعرف على كلام");
      }
    } catch {
      toast.error("فشل تحويل الصوت لنص");
    } finally {
      setTranscribing(false);
    }
  };

  // ─── Typing simulation for assistant replies ─────────────────────────
  const streamReply = (full: string, ticketId?: string) => {
    return new Promise<void>((resolve) => {
      // Add placeholder message marked streaming
      const baseTs = Date.now();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", ts: baseTs, streaming: true, ticketId },
      ]);

      let i = 0;
      const tick = () => {
        i = Math.min(i + TYPING_CHARS_PER_TICK, full.length);
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.streaming) {
            copy[copy.length - 1] = { ...last, content: full.slice(0, i) };
          }
          return copy;
        });
        if (i < full.length) {
          setTimeout(tick, TYPING_INTERVAL_MS);
        } else {
          // finalize
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.streaming) {
              copy[copy.length - 1] = { ...last, streaming: false };
            }
            return copy;
          });
          resolve();
        }
      };
      tick();
    });
  };

  // ─── Send message ────────────────────────────────────────────────────
  const sendMessage = async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if ((!text && !pendingFile) || loading || !user) return;

    // Upload pending file first
    let attachment: Attachment | null = null;
    if (pendingFile) {
      attachment = await uploadAttachment(pendingFile);
      if (!attachment) return;
      setPendingFile(null);
    }

    const userMsg: ChatMessage = {
      role: "user",
      content: text || (attachment ? `📎 ${attachment.name}` : ""),
      ts: Date.now(),
      attachment: attachment ?? undefined,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Build history; inject extracted file text as system-side context
      const history = newMessages.slice(-MAX_HISTORY).map((m) => {
        let content = m.content;
        if (m.attachment?.textContent) {
          content += `\n\n[📎 محتوى الملف "${m.attachment.name}"]:\n${m.attachment.textContent}`;
        } else if (m.attachment) {
          content += `\n\n[📎 رفع المستخدم ملفاً: ${m.attachment.name} (${m.attachment.type}). الرابط: ${m.attachment.url}]`;
        }
        return { role: m.role, content };
      });

      const { data, error } = await supabase.functions.invoke("ai-support", {
        body: { messages: history },
      });
      if (error) throw error;

      const reply = (data?.content as string) || "عذرًا، لم أتمكن من الرد. حاول مرة أخرى.";
      const ticket = data?.ticket as { id: string; subject: string; category: string } | null;

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
      }

      await streamReply(reply, ticket?.id);
      if (ticket?.id) onTicketCreated?.(ticket.id);
    } catch (e: any) {
      console.error("AI support error:", e);
      const errMsg = e?.message?.includes("429")
        ? "⚠️ تم تجاوز الحد المسموح به مؤقتًا. حاول بعد قليل."
        : e?.message?.includes("402")
        ? "⚠️ يحتاج النظام لإعادة تعبئة الرصيد. تواصل مع الإدارة."
        : "حدث خطأ في الاتصال بالمساعد. حاول مرة أخرى.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: errMsg, ts: Date.now() },
      ]);
      toast.error("فشل الاتصال بالمساعد الذكي");
    } finally {
      setLoading(false);
    }
  };

  const onTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage();
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
  const isImage = (t?: string) => t?.startsWith("image/");

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
      {/* Header */}
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
            <RefreshCw className="h-3 w-3" /> محادثة جديدة
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
              أنا مساعدك الذكي. اسألني عن باقتك، حصصك، واجباتك،
              {isTeacher && " أرباحك،"} ويمكنك إرفاق ملف أو التسجيل بالصوت.
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
              {m.attachment && (
                <div className="mb-2">
                  {isImage(m.attachment.type) ? (
                    <a href={m.attachment.url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={m.attachment.url}
                        alt={m.attachment.name}
                        className="max-w-[220px] rounded-lg border border-border/30"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <div className={cn(
                      "flex items-center gap-2 rounded-xl px-3 py-2",
                      m.role === "user" ? "bg-primary-foreground/10" : "bg-muted"
                    )}>
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="text-xs truncate flex-1">{m.attachment.name}</span>
                    </div>
                  )}
                </div>
              )}
              {m.content && (
                <div
                  className={cn(
                    "text-sm leading-relaxed prose prose-sm max-w-none",
                    "prose-headings:text-current prose-strong:text-current prose-p:text-current prose-li:text-current prose-a:text-current",
                    m.role === "user" ? "prose-invert" : "dark:prose-invert"
                  )}
                >
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                  {m.streaming && (
                    <span className="inline-block w-1.5 h-3.5 bg-current opacity-70 align-middle ml-0.5 animate-pulse" />
                  )}
                </div>
              )}
              <p className={cn(
                "text-[10px] mt-1 text-left",
                m.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"
              )}>
                {new Date(m.ts).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
              </p>
              {m.ticketId && !m.streaming && (
                <div className="mt-2 pt-2 border-t border-border/30">
                  <Button
                    size="sm"
                    onClick={() => onTicketCreated?.(m.ticketId!)}
                    className="w-full rounded-xl gap-1.5 text-xs h-8"
                  >
                    <Headphones className="h-3 w-3" /> فتح تذكرة الدعم
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && !messages.some((m) => m.streaming) && (
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

      {/* Handoff CTA */}
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

      {/* Pending attachment preview */}
      {pendingFile && (
        <div className="px-3 pt-2 bg-card/70">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm">
            {pendingFile.type.startsWith("image/") ? (
              <ImageIcon className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <FileText className="h-4 w-4 text-primary shrink-0" />
            )}
            <span className="truncate flex-1 text-foreground">{pendingFile.name}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6"
              onClick={() => setPendingFile(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
        className="p-3 border-t bg-card flex items-end gap-2 rounded-b-xl"
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx"
          onChange={handleFilePick}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-xl shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || uploading}
          title="إرفاق ملف"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant={recording ? "destructive" : "ghost"}
          size="icon"
          className="rounded-xl shrink-0"
          onClick={recording ? stopRecording : startRecording}
          disabled={loading || transcribing}
          title={recording ? "إيقاف التسجيل" : "تسجيل صوتي"}
        >
          {transcribing ? <Loader2 className="h-4 w-4 animate-spin" />
            : recording ? <Square className="h-4 w-4" />
            : <Mic className="h-4 w-4" />}
        </Button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onTextareaKeyDown}
          placeholder={recording ? "🔴 جارٍ التسجيل..." : "اسأل المساعد الذكي... (Enter لإرسال، Shift+Enter لسطر جديد)"}
          rows={1}
          dir="rtl"
          disabled={loading || recording}
          className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          style={{ maxHeight: 140 }}
        />
        <Button
          type="submit"
          size="icon"
          className="rounded-xl shrink-0"
          disabled={(!input.trim() && !pendingFile) || loading || uploading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
};

export default AIAssistantChat;
