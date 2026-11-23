import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Brain, Lightbulb, HelpCircle, FileText, Clock, Power, PowerOff,
  ChevronDown, ChevronUp, Sparkles, AlertCircle, TrendingUp
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatMessage {
  sender: string;
  text: string;
  time: string;
  me: boolean;
}

interface AIInsight {
  id: string;
  type: "suggestion" | "warning" | "summary" | "help" | "silence";
  title: string;
  content: string;
  details?: string[];
  timestamp: string;
  dismissed?: boolean;
}

interface LiveAIAssistantProps {
  messages: ChatMessage[];
  subject: string;
  elapsedSeconds: number;
  isOpen: boolean;
  onClose: () => void;
}

const LiveAIAssistant = ({ messages, subject, elapsedSeconds, isOpen, onClose }: LiveAIAssistantProps) => {
  const [enabled, setEnabled] = useState(true);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const lastAnalyzedCountRef = useRef(0);
  const lastSummaryTimeRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const silenceCheckerRef = useRef<number>();

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  const addInsight = useCallback((insight: Omit<AIInsight, "id" | "timestamp">) => {
    const newInsight: AIInsight = {
      ...insight,
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
    };
    setInsights(prev => [newInsight, ...prev].slice(0, 20));
  }, []);

  // Analyze chat on new messages
  useEffect(() => {
    if (!enabled || messages.length === 0 || messages.length <= lastAnalyzedCountRef.current) return;
    
    // Only analyze every 3 new messages
    if (messages.length - lastAnalyzedCountRef.current < 3) return;
    lastAnalyzedCountRef.current = messages.length;
    lastActivityRef.current = Date.now();

    const analyze = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("live-ai-assistant", {
          body: { messages, subject, action: "analyze_chat", elapsed_minutes: elapsedMinutes },
        });
        if (error) throw error;
        if (!data) return;

        if (data.student_understanding === "low" || data.engagement_level === "confused") {
          addInsight({
            type: "warning",
            title: "الطالب يبدو غير متأكد",
            content: data.suggestions?.[0] || "حاول إعادة الشرح بطريقة مختلفة",
            details: data.suggestions,
          });
        } else if (data.suggestions?.length > 0) {
          addInsight({
            type: "suggestion",
            title: "اقتراح تعليمي",
            content: data.suggestions[0],
            details: data.suggestions,
          });
        }

        if (data.key_question && data.key_question !== "null") {
          addInsight({
            type: "suggestion",
            title: "سؤال مهم من الطالب",
            content: data.key_question,
          });
        }
      } catch (e) {
        console.error("AI analysis error:", e);
      }
    };

    analyze();
  }, [messages.length, enabled, subject, elapsedMinutes, addInsight]);

  // Mini summary every 5 minutes
  useEffect(() => {
    if (!enabled || elapsedMinutes < 5) return;
    if (elapsedMinutes - lastSummaryTimeRef.current < 5) return;
    if (messages.length < 2) return;
    
    lastSummaryTimeRef.current = elapsedMinutes;

    const generateSummary = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("live-ai-assistant", {
          body: { messages, subject, action: "mini_summary", elapsed_minutes: elapsedMinutes },
        });
        if (error) throw error;
        if (!data) return;

        addInsight({
          type: "summary",
          title: `ملخص - دقيقة ${elapsedMinutes}`,
          content: data.recommendation || "لا توجد توصيات",
          details: data.summary_points,
        });
      } catch (e) {
        console.error("Summary error:", e);
      }
    };

    generateSummary();
  }, [elapsedMinutes, enabled, messages, subject, addInsight]);

  // Silence detection (2 minutes of no activity)
  useEffect(() => {
    if (!enabled) return;

    silenceCheckerRef.current = window.setInterval(() => {
      const silence = Date.now() - lastActivityRef.current;
      if (silence >= 120_000) {
        lastActivityRef.current = Date.now(); // Reset to avoid spam

        const suggest = async () => {
          try {
            const { data, error } = await supabase.functions.invoke("live-ai-assistant", {
              body: { subject, action: "silence_suggestion", elapsed_minutes: elapsedMinutes },
            });
            if (error) throw error;
            if (!data) return;

            addInsight({
              type: "silence",
              title: "لاحظنا صمتاً في الجلسة",
              content: data.suggested_question || "اطرح سؤالاً تفاعلياً على الطالب",
              details: data.ice_breaker ? [data.ice_breaker] : undefined,
            });
          } catch (e) {
            console.error("Silence suggestion error:", e);
          }
        };

        suggest();
      }
    }, 30_000);

    return () => clearInterval(silenceCheckerRef.current);
  }, [enabled, subject, elapsedMinutes, addInsight]);

  // Update activity on new messages
  useEffect(() => {
    if (messages.length > 0) lastActivityRef.current = Date.now();
  }, [messages.length]);

  const handleHelpExplain = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("live-ai-assistant", {
        body: { messages: messages.slice(-5), subject, action: "help_explain", elapsed_minutes: elapsedMinutes },
      });
      if (error) throw error;
      if (!data) return;

      addInsight({
        type: "help",
        title: "مساعدة في الشرح",
        content: data.explanation || "",
        details: [
          data.example ? `💡 مثال: ${data.example}` : "",
          data.question ? `❓ سؤال للطالب: ${data.question}` : "",
        ].filter(Boolean),
      });
    } catch (e) {
      toast.error("تعذر الحصول على مساعدة");
    } finally {
      setLoading(false);
    }
  };

  const dismissInsight = (id: string) => {
    setInsights(prev => prev.map(i => i.id === id ? { ...i, dismissed: true } : i));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "suggestion": return <Lightbulb className="h-4 w-4 text-yellow-400" />;
      case "warning": return <AlertCircle className="h-4 w-4 text-orange-400" />;
      case "summary": return <FileText className="h-4 w-4 text-blue-400" />;
      case "help": return <HelpCircle className="h-4 w-4 text-green-400" />;
      case "silence": return <Clock className="h-4 w-4 text-purple-400" />;
      default: return <Sparkles className="h-4 w-4" />;
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case "warning": return "border-orange-500/30 bg-orange-500/5";
      case "summary": return "border-blue-500/30 bg-blue-500/5";
      case "help": return "border-green-500/30 bg-green-500/5";
      case "silence": return "border-purple-500/30 bg-purple-500/5";
      default: return "border-yellow-500/30 bg-yellow-500/5";
    }
  };

  const activeInsights = insights.filter(i => !i.dismissed);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-full md:w-96 bg-card border-r flex flex-col absolute md:relative inset-0 md:inset-auto z-10"
    >
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-foreground text-sm">المساعد الذكي</h3>
          {enabled && (
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setEnabled(!enabled)}
            title={enabled ? "إيقاف المساعد" : "تشغيل المساعد"}
          >
            {enabled ? <Power className="h-3.5 w-3.5 text-green-400" /> : <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />}
          </Button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground md:hidden transition-colors text-lg">✕</button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-3 border-b flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs gap-1 h-8"
          onClick={handleHelpExplain}
          disabled={loading || !enabled}
        >
          <HelpCircle className="h-3 w-3" />
          ساعدني في الشرح
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs gap-1 h-8"
          onClick={async () => {
            if (messages.length < 2) { toast.info("لا توجد رسائل كافية للتلخيص"); return; }
            setLoading(true);
            try {
              const { data, error } = await supabase.functions.invoke("live-ai-assistant", {
                body: { messages, subject, action: "mini_summary", elapsed_minutes: elapsedMinutes },
              });
              if (error) throw error;
              if (data) {
                addInsight({
                  type: "summary",
                  title: "ملخص يدوي",
                  content: data.recommendation || "",
                  details: data.summary_points,
                });
              }
            } catch { toast.error("تعذر التلخيص"); }
            finally { setLoading(false); }
          }}
          disabled={loading || !enabled}
        >
          <FileText className="h-3 w-3" />
          ملخص الآن
        </Button>
      </div>

      {/* Insights Feed */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {!enabled && (
            <div className="text-center py-8 text-muted-foreground">
              <PowerOff className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">المساعد متوقف</p>
              <p className="text-xs mt-1">اضغط زر التشغيل لتفعيله</p>
            </div>
          )}

          {enabled && activeInsights.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-8 w-8 mx-auto mb-2 opacity-40 animate-pulse" />
              <p className="text-sm">المساعد يراقب الجلسة</p>
              <p className="text-xs mt-1">سيقدم اقتراحات عند الحاجة</p>
            </div>
          )}

          <AnimatePresence>
            {activeInsights.map((insight) => (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`rounded-xl border p-3 ${getBgColor(insight.type)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getIcon(insight.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{insight.title}</p>
                      <p className="text-[10px] text-muted-foreground">{insight.timestamp}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {insight.details && insight.details.length > 0 && (
                      <button onClick={() => setExpandedId(expandedId === insight.id ? null : insight.id)} className="text-muted-foreground hover:text-foreground">
                        {expandedId === insight.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    )}
                    <button onClick={() => dismissInsight(insight.id)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
                  </div>
                </div>
                <p className="text-xs text-foreground/80 mt-1.5 leading-relaxed">{insight.content}</p>
                
                <AnimatePresence>
                  {expandedId === insight.id && insight.details && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <ul className="mt-2 space-y-1 border-t border-border/20 pt-2">
                        {insight.details.map((d, i) => (
                          <li key={i} className="text-xs text-foreground/70 flex items-start gap-1.5">
                            <span className="text-primary mt-0.5">•</span>
                            {d}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Status Bar */}
      {enabled && (
        <div className="p-2 border-t flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            {messages.length} رسالة | {elapsedMinutes} دقيقة
          </span>
          <span>{activeInsights.length} اقتراح نشط</span>
        </div>
      )}
    </motion.div>
  );
};

export default LiveAIAssistant;
