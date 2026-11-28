import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { detectPersonalInfo, maskedEvidence, type PersonalInfoType } from "../../supabase/functions/_shared/personalInfo";

interface ViolationRecord {
  type: "chat" | "voice";
  content: string;
  timestamp: number;
}

interface UseSessionProtectionOptions {
  bookingId: string;
  userId: string;
  localStream: MediaStream | null;
  meetingStarted: boolean;
  // Voice monitoring runs for the teacher only. Chat is checked for everyone.
  isTeacher?: boolean;
  onMuteUser?: () => void;
  onEndSession?: () => void;
}

export function useSessionProtection({
  bookingId,
  userId,
  localStream,
  meetingStarted,
  isTeacher = false,
}: UseSessionProtectionOptions) {
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [violationCount, setViolationCount] = useState(0);
  const [isMutedBySystem, setIsMutedBySystem] = useState(false);
  const [isChatBlocked, setIsChatBlocked] = useState(false);
  const [latestAlert, setLatestAlert] = useState<string | null>(null);
  const [muteCountdown, setMuteCountdown] = useState(0);

  const recognitionRef = useRef<any>(null);
  const analysisIntervalRef = useRef<number>();
  const transcriptBufferRef = useRef<string>("");
  const previousVoiceWindowRef = useRef<string>("");
  const muteTimerRef = useRef<number>();
  const violationCountRef = useRef(0);

  // Keep ref in sync
  useEffect(() => {
    violationCountRef.current = violationCount;
  }, [violationCount]);

  // ─── Chat Filtering ───
  // One shared detector (phones even when spaced or spelled out, emails, links, handles, addresses).
  const analyzeText = useCallback((text: string): { isViolation: boolean; detected: string; type: PersonalInfoType | null } => {
    const r = detectPersonalInfo(text);
    return { isViolation: r.detected, detected: maskedEvidence(r), type: r.type };
  }, []);

  const filterChatMessage = useCallback((message: string): { allowed: boolean; reason?: string } => {
    if (isChatBlocked) {
      return { allowed: false, reason: "تم حظر الدردشة مؤقتاً بسبب تكرار المخالفات" };
    }

    const result = analyzeText(message);
    if (result.isViolation) {
      recordViolation("chat", result.detected, message);
      return { allowed: false, reason: "ممنوع مشاركة بيانات شخصية" };
    }

    return { allowed: true };
  }, [isChatBlocked, analyzeText]);

  // ─── Record Violation ───
  const recordViolation = useCallback(async (type: "chat" | "voice", detected: string, originalText?: string) => {
    const newCount = violationCountRef.current + 1;
    violationCountRef.current = newCount;
    setViolationCount(newCount);

    const record: ViolationRecord = { type, content: detected, timestamp: Date.now() };
    setViolations(prev => [...prev, record]);

    // Save through the server: normal users cannot insert into violations, and the server re-checks the text.
    try {
      const { error } = await supabase.functions.invoke("record-personal-info-violation", {
        body: { booking_id: bookingId, source: type, text: originalText || detected },
      });
      if (error) console.error("Failed to record violation:", error);
    } catch (e) {
      console.error("Failed to record violation:", e);
    }

    // Show alert
    setLatestAlert(`⚠️ مخالفة ${type === "chat" ? "دردشة" : "صوتية"}: ${detected}`);
    setTimeout(() => setLatestAlert(null), 5000);

    // Apply penalties based on count
    applyPenalty(newCount, type);
  }, [bookingId, userId]);

  // ─── Penalty System ───
  // Detections never end a session, mute a microphone or ban anyone. They only warn, and a third
  // CHAT hit pauses the chat for 60 s. Warnings and bans come from an admin after review.
  const applyPenalty = useCallback((count: number, type: string) => {
    if (type === "chat" && count >= 3 && !muteTimerRef.current) {
      toast.error("تم إيقاف الدردشة مؤقتاً (60 ثانية) بسبب تكرار مشاركة بيانات شخصية", { duration: 8000 });
      setIsChatBlocked(true);
      setMuteCountdown(60);
      muteTimerRef.current = window.setInterval(() => {
        setMuteCountdown(prev => {
          if (prev <= 1) {
            clearInterval(muteTimerRef.current);
            muteTimerRef.current = undefined;
            setIsChatBlocked(false);
            toast.info("تم رفع الإيقاف المؤقت. يرجى الالتزام بالقواعد.");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return;
    }
    toast.warning("تنبيه: يرجى عدم مشاركة بيانات شخصية أو وسائل تواصل خارج المنصة", { duration: 5000 });
  }, []);

  // ─── Voice Monitoring (Speech-to-Text) ───
  const startVoiceMonitoring = useCallback(() => {
    // Disable on mobile/tablet devices: continuous SpeechRecognition triggers
    // the system mic-in-use indicator with repeated notification beeps every
    // few seconds (especially on Samsung/Android), which is intrusive during class.
    if (!isTeacher) return;
    const ua = navigator.userAgent || "";
    const isMobileOrTablet = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk/i.test(ua);
    if (isMobileOrTablet) {
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API not available");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "ar-SA";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript + " ";
      }
      transcriptBufferRef.current += transcript;
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.error("Speech recognition error:", event.error);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still in session
      if (meetingStarted && recognitionRef.current) {
        try {
          recognition.start();
        } catch {}
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
    }

    // Analyze buffer every 4 seconds
    analysisIntervalRef.current = window.setInterval(() => {
      const buffer = transcriptBufferRef.current.trim();
      if (!buffer) return;

      // Look at the previous window too, so a number spoken across two windows is still caught.
      const combined = `${previousVoiceWindowRef.current} ${buffer}`.trim();
      const result = analyzeText(combined);
      if (result.isViolation) {
        recordViolation("voice", result.detected, combined);
        previousVoiceWindowRef.current = "";
      } else {
        previousVoiceWindowRef.current = buffer.slice(-200);
      }

      // Clear buffer
      transcriptBufferRef.current = "";
    }, 4000);
  }, [meetingStarted, isTeacher, analyzeText, recordViolation]);

  const stopVoiceMonitoring = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = undefined;
    }
    transcriptBufferRef.current = "";
    previousVoiceWindowRef.current = "";
  }, []);

  // Start/stop voice monitoring based on meeting state
  useEffect(() => {
    if (meetingStarted && localStream) {
      startVoiceMonitoring();
    }
    return () => {
      stopVoiceMonitoring();
    };
  }, [meetingStarted, localStream, isTeacher]);

  // One clear notice per session about what is checked (shown to everyone).
  const noticeShownRef = useRef(false);
  useEffect(() => {
    if (!meetingStarted || noticeShownRef.current) return;
    noticeShownRef.current = true;
    toast.info(
      isTeacher
        ? "تنبيه: تُفحص الدردشة وصوتك آلياً لمنع تبادل بيانات التواصل الشخصية خارج المنصة. يُحفظ مقتطف مخفي فقط عند المخالفة."
        : "تنبيه: تُفحص الدردشة آلياً لمنع تبادل بيانات التواصل الشخصية خارج المنصة. يُحفظ مقتطف مخفي فقط عند المخالفة.",
      { duration: 9000 },
    );
  }, [meetingStarted, isTeacher]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopVoiceMonitoring();
      if (muteTimerRef.current) clearInterval(muteTimerRef.current);
    };
  }, []);

  return {
    filterChatMessage,
    violations,
    violationCount,
    isMutedBySystem,
    isChatBlocked,
    latestAlert,
    muteCountdown,
  };
}
