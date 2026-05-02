import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const VoiceTutorInner = () => {
  const [connecting, setConnecting] = useState(false);

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
      await conversation.startSession({
        signedUrl: data.signedUrl,
        connectionType: "websocket",
      });
    } catch (e: any) {
      console.error("startSession error:", e);
      toast.error(e?.message || "تعذر الوصول للميكروفون");
    } finally {
      setConnecting(false);
    }
  }, [conversation]);

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
          : "محادثة صوتية مباشرة"}
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
