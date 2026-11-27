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
  onMuteUser?: () => void;
  onEndSession?: () => void;
}

export function useSessionProtection({
  bookingId,
  userId,
  localStream,
  meetingStarted,
  onMuteUser,
  onEndSession,
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
  const applyPenalty = useCallback((count: number, type: string) => {
    if (count <= 2) {
      // Warning only
      toast.warning(`⚠️ تحذير (${count}/5): يرجى عدم مشاركة بيانات شخصية`, { duration: 5000 });
    } else if (count === 3) {
      // Mute + block chat temporarily
      toast.error("🔇 تم كتم الصوت ومنع الدردشة مؤقتاً (60 ثانية) بسبب تكرار المخالفات", { duration: 8000 });
      setIsMutedBySystem(true);
      setIsChatBlocked(true);
      setMuteCountdown(60);
      onMuteUser?.();

      // Start countdown
      muteTimerRef.current = window.setInterval(() => {
        setMuteCountdown(prev => {
          if (prev <= 1) {
            clearInterval(muteTimerRef.current);
            setIsMutedBySystem(false);
            setIsChatBlocked(false);
            toast.info("تم رفع الحظر المؤقت. يرجى الالتزام بالقواعد.");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (count >= 5) {
      // End session
      toast.error("🚫 تم إنهاء الجلسة بسبب تكرار المخالفات. سيتم إبلاغ الإدارة.", { duration: 10000 });

      // Notify admin
      supabase.from("notifications").insert({
        user_id: userId,
        title: "🚫 تم إنهاء جلسة بسبب مخالفات متكررة",
        body: `تم إنهاء الجلسة (${bookingId}) تلقائياً بعد ${count} مخالفات.`,
        type: "violation",
      }).then(() => {});

      // Log for admin
      supabase.from("system_logs").insert({
        level: "error",
        message: `جلسة أُنهيت تلقائياً بسبب ${count} مخالفات`,
        source: "session_protection",
        user_id: userId,
        metadata: { booking_id: bookingId, violation_count: count },
      }).then(() => {});

      setTimeout(() => onEndSession?.(), 2000);
    }
  }, [bookingId, userId, onMuteUser, onEndSession]);

  // ─── Voice Monitoring (Speech-to-Text) ───
  const startVoiceMonitoring = useCallback(() => {
    // Disable on mobile/tablet devices: continuous SpeechRecognition triggers
    // the system mic-in-use indicator with repeated notification beeps every
    // few seconds (especially on Samsung/Android), which is intrusive during class.
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
  }, [meetingStarted, analyzeText, recordViolation]);

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
  }, [meetingStarted, localStream]);

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
