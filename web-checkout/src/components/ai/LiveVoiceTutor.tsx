import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2, Volume2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2500;

const VoiceTutorInner = () => {
  const [connecting, setConnecting] = useState(false);
  const [studentName, setStudentName] = useState<string>("");
  const [hasPremium, setHasPremium] = useState<boolean | null>(null);
  const [disconnectMsg, setDisconnectMsg] = useState<string>("");
  const [retryCount, setRetryCount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  const sessionStartRef = useRef<number>(0);
  const retryCountRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studentNameRef = useRef<string>("");

  useEffect(() => { studentNameRef.current = studentName; }, [studentName]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setHasPremium(false); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const name = (profile?.full_name || user.user_metadata?.full_name || "").toString().trim();
      if (name) setStudentName(name);

      const { data: subs } = await supabase
        .from("user_subscriptions")
        .select("ends_at, remaining_minutes, is_active, subscription_plans:plan_id(tier)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gt("remaining_minutes", 0)
        .gt("ends_at", new Date().toISOString());
      const ok = (subs || []).some((s: any) => s.subscription_plans?.tier === "premium");
      setHasPremium(ok);
    })();

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const doStartSession = useCallback(async (conversationInstance: ReturnType<typeof useConversation>) => {
    setConnecting(true);
    setDisconnectMsg("");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { data, error } = await supabase.functions.invoke("ai-tutor-token");
      console.log("ai-tutor-token response:", { data, error });
      if (error || !data?.signedUrl) {
        toast.error(data?.error || "تعذر بدء المحادثة. تأكد من إعداد المساعد.");
        setConnecting(false);
        return;
      }

      const name = studentNameRef.current;
      const firstName = name ? name.split(" ")[0] : "";
      const overrides = {
        agent: {
          firstMessage: name
            ? `مرحباً ${firstName}! أنا معلمك الذكي في منصة أجيال المعرفة. كيف يمكنني مساعدتك اليوم؟`
            : "مرحباً! أنا معلمك الذكي في منصة أجيال المعرفة. كيف يمكنني مساعدتك اليوم؟",
          prompt: {
            prompt: name
              ? `أنت معلم ذكي ومساعد تعليمي في منصة أجيال المعرفة. اسم الطالب الذي تتحدث معه هو "${name}". نادِه باسمه "${firstName}" أثناء المحادثة بدلاً من كلمة "طالب" أو "الطالب". تحدث وأجب دائماً باللغة العربية الفصحى فقط. لا تستخدم الإنجليزية أبداً حتى لو تحدث الطالب بالإنجليزية — أجبه بالعربية دائماً وشجّعه على استخدام العربية. كن ودوداً ومشجعاً وقدّم شرحاً واضحاً بالعربية.`
              : "أنت معلم ذكي ومساعد تعليمي في منصة أجيال المعرفة. تحدث وأجب دائماً باللغة العربية الفصحى فقط. لا تستخدم الإنجليزية أبداً حتى لو تحدث الطالب بالإنجليزية — أجبه بالعربية دائماً وشجّعه على استخدام العربية. كن ودوداً ومشجعاً وقدّم شرحاً واضحاً بالعربية.",
          },
        },
      };

      await conversationInstance.startSession({
        signedUrl: data.signedUrl,
        connectionType: "websocket",
        overrides,
      } as any);
    } catch (e: any) {
      console.error("startSession error:", e);
      toast.error(e?.message || "تعذر الوصول للميكروفون");
    } finally {
      setConnecting(false);
      setRetrying(false);
    }
  }, []);

  const conversation = useConversation({
    onConnect: () => {
      sessionStartRef.current = Date.now();
      retryCountRef.current = 0;
      setRetryCount(0);
      setDisconnectMsg("");
      toast.success("تم الاتصال بالمعلم الذكي 🎙️");
    },
    onDisconnect: () => {
      const duration = sessionStartRef.current
        ? (Date.now() - sessionStartRef.current) / 1000
        : 99;
      sessionStartRef.current = 0;

      if (duration < 8 && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        setRetryCount(retryCountRef.current);
        setRetrying(true);
        setDisconnectMsg(`⏳ إعادة الاتصال تلقائياً... (محاولة ${retryCountRef.current}/${MAX_RETRIES})`);
        console.warn(`ElevenLabs: short disconnect (${duration.toFixed(1)}s), retry ${retryCountRef.current}/${MAX_RETRIES}`);

        retryTimerRef.current = setTimeout(async () => {
          await doStartSession(conversation);
        }, RETRY_DELAY_MS);
      } else if (duration < 8) {
        setDisconnectMsg("❌ انقطع الاتصال — قد تكون دقائق الباقة قد نفدت أو يوجد مشكلة في الشبكة. حاول لاحقاً.");
        toast.error("فشل الاتصال بعد عدة محاولات");
        retryCountRef.current = 0;
        setRetryCount(0);
        setRetrying(false);
      } else {
        setDisconnectMsg("");
        retryCountRef.current = 0;
        setRetryCount(0);
        setRetrying(false);
        toast.info("انتهت المحادثة");
      }
    },
    onError: (e: any) => {
      console.error("ElevenLabs error:", e);
      toast.error("خطأ في المحادثة الصوتية");
    },
  });

  const start = useCallback(async () => {
    retryCountRef.current = 0;
    setRetryCount(0);
    await doStartSession(conversation);
  }, [conversation, doStartSession]);

  const stop = useCallback(async () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryCountRef.current = MAX_RETRIES;
    setRetrying(false);
    await conversation.endSession();
  }, [conversation]);

  const isActive = conversation.status === "connected";

  return (
    <div className="text-center py-8">
      <div className={`relative inline-flex items-center justify-center w-32 h-32 rounded-full mb-6 transition-all ${
        isActive
          ? "bg-gradient-to-br from-primary to-secondary shadow-2xl shadow-primary/40 animate-pulse"
          : "bg-muted"
      }`}>
        {isActive && conversation.isSpeaking && (
          <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
        )}
        {retrying && !isActive ? (
          <RefreshCw className="h-14 w-14 text-muted-foreground animate-spin" />
        ) : isActive ? (
          <Volume2 className="h-14 w-14 text-primary-foreground" />
        ) : (
          <Mic className="h-14 w-14 text-muted-foreground" />
        )}
      </div>

      <h3 className="text-lg font-bold mb-1">
        {isActive
          ? conversation.isSpeaking ? "المعلم يتحدث..." : "أنا أستمع إليك"
          : retrying ? `إعادة الاتصال... (${retryCount}/${MAX_RETRIES})`
          : studentName ? `مرحباً ${studentName.split(" ")[0]} 👋` : "محادثة صوتية مباشرة"}
      </h3>
      <p className="text-sm text-muted-foreground mb-6">
        {isActive
          ? "تحدث بالعربية — معلمك الذكي يفهمك ويجيبك بالعربية"
          : "تحدث مع المعلم الذكي بصوتك مباشرة بالعربية"}
      </p>

      {hasPremium === false && !isActive && !retrying && (
        <div className="mb-4 p-4 rounded-xl bg-muted/50 border border-border text-sm text-muted-foreground max-w-md mx-auto">
          🔒 المحادثة الصوتية الحية متاحة فقط لمشتركي <strong className="text-foreground">الباقة الاحترافية</strong> مع رصيد دقائق متبقي.
          <div className="mt-3">
            <Button size="sm" variant="default" onClick={() => window.location.href = "/pricing"} className="rounded-full">
              ترقية الباقة
            </Button>
          </div>
        </div>
      )}

      {disconnectMsg && (
        <div className={`mb-4 p-3 rounded-xl text-sm max-w-md mx-auto text-center border ${
          retrying
            ? "bg-blue-50 border-blue-200 text-blue-700"
            : "bg-destructive/10 border-destructive/30 text-destructive"
        }`}>
          {disconnectMsg}
        </div>
      )}

      {!isActive && !retrying ? (
        <Button onClick={start} disabled={connecting || hasPremium !== true} size="lg" className="gap-2 rounded-full px-8">
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          {connecting ? "جاري الاتصال..." : "ابدأ المحادثة بالعربية"}
        </Button>
      ) : (
        <Button onClick={stop} size="lg" variant="destructive" className="gap-2 rounded-full px-8" disabled={!isActive && !retrying}>
          <MicOff className="h-4 w-4" /> {retrying ? "إلغاء" : "إنهاء المحادثة"}
        </Button>
      )}

      <p className="text-xs text-muted-foreground mt-6">
        💡 جرّب: "اشرح لي هذه المسألة" أو "صحّح إجابتي" أو "لخّص لي هذا الدرس"
      </p>
    </div>
  );
};

export const LiveVoiceTutor = () => (
  <ConversationProvider>
    <VoiceTutorInner />
  </ConversationProvider>
);

export default LiveVoiceTutor;
