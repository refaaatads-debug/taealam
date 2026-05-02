import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const VoiceTutorInner = () => {
  const [connecting, setConnecting] = useState(false);
  const [studentName, setStudentName] = useState<string>("");
  const [hasPremium, setHasPremium] = useState<boolean | null>(null);

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
  }, []);

  const conversation = useConversation({
    onConnect: () => toast.success("تم الاتصال بالمعلم الذكي 🎙️"),
    onDisconnect: () => toast.info("انتهت المحادثة"),
    onError: (e: any) => {
      console.error("ElevenLabs error:", e);
      toast.error("خطأ في المحادثة الصوتية");
    },
  });

  const start = useCallback(async () => {
    setConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { data, error } = await supabase.functions.invoke("ai-tutor-token");
      console.log("ai-tutor-token response:", { data, error });
      if (error || !data?.signedUrl) {
        toast.error(data?.error || "تعذر بدء المحادثة. تأكد من إعداد المساعد.");
        setConnecting(false);
        return;
      }

      const firstName = studentName ? studentName.split(" ")[0] : "";
      const overrides = studentName
        ? {
            agent: {
              firstMessage: `مرحباً ${firstName}! أنا معلمك الذكي في منصة أجيال المعرفة. كيف يمكنني مساعدتك اليوم؟`,
              prompt: {
                prompt: `أنت معلم ذكي ومساعد تعليمي في منصة أجيال المعرفة. اسم الطالب الذي تتحدث معه هو "${studentName}". نادِه باسمه "${firstName}" أثناء المحادثة بدلاً من كلمة "طالب" أو "الطالب". كن ودوداً وشخصياً وشجّعه على التعلم بالعربية والإنجليزية.`,
              },
            },
          }
        : undefined;

      await conversation.startSession({
        signedUrl: data.signedUrl,
        connectionType: "websocket",
        ...(overrides ? { overrides } : {}),
      } as any);
    } catch (e: any) {
      console.error("startSession error:", e);
      toast.error(e?.message || "تعذر الوصول للميكروفون");
    } finally {
      setConnecting(false);
    }
  }, [conversation, studentName]);

  const stop = useCallback(async () => {
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
        {isActive ? (
          <Volume2 className="h-14 w-14 text-primary-foreground" />
        ) : (
          <Mic className="h-14 w-14 text-muted-foreground" />
        )}
      </div>

      <h3 className="text-lg font-bold mb-1">
        {isActive
          ? conversation.isSpeaking ? "المعلم يتحدث..." : "أنا أستمع إليك"
          : studentName ? `مرحباً ${studentName.split(" ")[0]} 👋` : "محادثة صوتية مباشرة"}
      </h3>
      <p className="text-sm text-muted-foreground mb-6">
        {isActive
          ? "تحدث بشكل طبيعي - مارس العربية أو الإنجليزية"
          : "تحدث مع المعلم الذكي بصوتك مباشرة"}
      </p>

      {!isActive ? (
        <Button onClick={start} disabled={connecting} size="lg" className="gap-2 rounded-full px-8">
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          {connecting ? "جاري الاتصال..." : "ابدأ المحادثة"}
        </Button>
      ) : (
        <Button onClick={stop} size="lg" variant="destructive" className="gap-2 rounded-full px-8">
          <MicOff className="h-4 w-4" /> إنهاء المحادثة
        </Button>
      )}

      <p className="text-xs text-muted-foreground mt-6">
        💡 جرّب: "علّمني نطق هذه الكلمة" أو "صحّح جملتي بالإنجليزية"
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
