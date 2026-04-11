import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mic, MicOff, Monitor, MessageSquare,
  PenTool, Phone, Send, Users, MoreVertical, Hand, FileText, Clock,
  Circle, Square, Wifi, WifiOff, RefreshCw, Headphones, ShieldAlert, AlertTriangle, VolumeX,
  Pen, Brain, Pause, Play, Paperclip, Download, Loader2, Image as ImageIcon, Maximize, Minimize
} from "lucide-react";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SessionReport from "@/components/SessionReport";
import { toast } from "sonner";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useSessionProtection } from "@/hooks/useSessionProtection";
import { useSessionAntiCheat } from "@/hooks/useSessionAntiCheat";
import WhiteboardCanvas from "@/components/WhiteboardCanvas";
import LiveAIAssistant from "@/components/LiveAIAssistant";

const LiveSession = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("booking");

  const [chatOpen, setChatOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [teacherSpeakingSec, setTeacherSpeakingSec] = useState(0);
  const [studentSpeakingSec, setStudentSpeakingSec] = useState(0);
  const [questionsDetected, setQuestionsDetected] = useState(0);
  const voiceActivityRef = useRef<{ localSpeaking: boolean; remoteSpeaking: boolean }>({ localSpeaking: false, remoteSpeaking: false });
  const [meetingStarted, setMeetingStarted] = useState(false);
  const [messages, setMessages] = useState<{ sender: string; text: string; time: string; me: boolean; fileUrl?: string; fileName?: string; fileType?: string }[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const timerRef = useRef<number>();
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const [bookingData, setBookingData] = useState<any>(null);
  const [otherName, setOtherName] = useState("المشارك");
  const [subjectName, setSubjectName] = useState("");
  const [sessionDuration, setSessionDuration] = useState(45);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [subscriptionRemainingMinutes, setSubscriptionRemainingMinutes] = useState(0);
  const [timeWarningShown, setTimeWarningShown] = useState(false);
  const [tenMinWarningShown, setTenMinWarningShown] = useState(false);
  const [recordingUploading, setRecordingUploading] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [bothJoined, setBothJoined] = useState(false);
  const sessionEndingRef = useRef(false);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);
  const [remoteDrawing, setRemoteDrawing] = useState(false);
  const [whiteboardRemoteActions, setWhiteboardRemoteActions] = useState<any[]>([]);
  const [remoteLaserPos, setRemoteLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [pageFrozen, setPageFrozen] = useState(false);
  const [remoteVideoStatus, setRemoteVideoStatus] = useState("idle");
  const [lastDataMessageType, setLastDataMessageType] = useState("-");
  const [lastDataMessageAt, setLastDataMessageAt] = useState("-");
  const [debugEvents, setDebugEvents] = useState<{ time: string; label: string; value: string }[]>([]);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatChannelRef = useRef<any>(null);
  const remoteDrawingTimerRef = useRef<number>();
  const [unreadCount, setUnreadCount] = useState(0);
  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { play: playNotificationSound } = useNotificationSound();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Listen for toast click to open chat panel inside session
  useEffect(() => {
    const handleOpenChat = () => {
      setChatOpen(true);
      setUnreadCount(0);
    };
    window.addEventListener("open-session-chat", handleOpenChat);
    return () => window.removeEventListener("open-session-chat", handleOpenChat);
  }, []);
  const isTeacher = user && bookingData ? user.id === bookingData.teacher_id : false;

  const pushDebugEvent = useCallback((label: string, value: string) => {
    const time = new Date().toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    setDebugEvents((prev) => [{ time, label, value }, ...prev].slice(0, 8));
  }, []);

  // Handle DataChannel messages (whiteboard sync, screen share status)
  const handleDataMessage = useCallback((msg: any) => {
    const messageType = msg?.type || "unknown";
    setLastDataMessageType(messageType);
    setLastDataMessageAt(new Date().toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }));
    pushDebugEvent("data", messageType);

    if (msg.type === "whiteboard-action") {
      setWhiteboardRemoteActions((prev) => [...prev, msg.action]);
      if (!isTeacher) {
        setBoardOpen(true);
        setRemoteDrawing(true);
        clearTimeout(remoteDrawingTimerRef.current);
        remoteDrawingTimerRef.current = window.setTimeout(() => setRemoteDrawing(false), 2000);
      }
    } else if (msg.type === "whiteboard-clear") {
      setWhiteboardRemoteActions([]);
      if (!isTeacher) {
        setBoardOpen(true);
      }
    } else if (msg.type === "screen-share-status") {
      setRemoteScreenSharing(msg.active);
      if (msg.active && !isTeacher) {
        toast.info("المعلم يشارك الشاشة الآن 🖥️");
      }
    } else if (msg.type === "laser-move") {
      setRemoteLaserPos(msg.pos);
    } else if (msg.type === "laser-hide") {
      setRemoteLaserPos(null);
    } else if (msg.type === "page-freeze") {
      if (!isTeacher) setPageFrozen(msg.active);
    } else if (msg.type === "session-end") {
      // The other party ended the session - auto-end for this party too
      if (!sessionEndingRef.current) {
        toast.info("أنهى الطرف الآخر الجلسة. جارٍ إغلاق الجلسة...");
        setTimeout(() => endSession(), 1500);
      }
    } else if (msg.type === "timer-sync") {
      // Sync elapsed time from the other party
      if (typeof msg.elapsed === "number") {
        setElapsed(prev => Math.max(prev, msg.elapsed));
      }
    }
  }, [isTeacher, pushDebugEvent]);

  const {
    localStream,
    remoteStream,
    connectionState,
    micEnabled,
    screenSharing,
    isRecording,
    dataChannelReady,
    iceTransportType,
    start,
    stop,
    toggleMic,
    toggleScreenShare,
    startRecording,
    startAutoRecording,
    stopRecording,
    getRecordingBlob,
    restartConnection,
    sendDataMessage,
  } = useWebRTC({
    bookingId: bookingId || "",
    userId: user?.id || "",
    onRemoteStream: (stream) => {
      const audioTracks = stream.getAudioTracks().length;
      const videoTracks = stream.getVideoTracks().length;
      pushDebugEvent("remote-stream", `audio:${audioTracks} video:${videoTracks}`);

      // Check for video tracks (screen sharing from teacher)
      const hasVideo = videoTracks > 0;
      if (hasVideo && remoteVideoRef.current) {
        setRemoteScreenSharing(true);
      }

      stream.getVideoTracks().forEach((track) => {
        track.onunmute = () => {
          setRemoteScreenSharing(true);
          pushDebugEvent("screen-track", `unmuted:${track.readyState}`);
        };
        track.onmute = () => {
          pushDebugEvent("screen-track", `muted:${track.readyState}`);
        };
        track.onended = () => {
          setRemoteScreenSharing(false);
          pushDebugEvent("screen-track", "ended");
        };
      });

      stream.onaddtrack = () => {
        const v = stream.getVideoTracks().length > 0;
        pushDebugEvent("remote-stream", `track-added video:${stream.getVideoTracks().length}`);
        if (v && remoteVideoRef.current) {
          setRemoteScreenSharing(true);
        }
      };
      stream.onremovetrack = () => {
        pushDebugEvent("remote-stream", `track-removed video:${stream.getVideoTracks().length}`);
        if (stream.getVideoTracks().length === 0) {
          setRemoteScreenSharing(false);
        }
      };
    },
    onRemoteJoin: () => {
      setRemoteConnected(true);
      if (meetingStarted) {
        setBothJoined(true);
        toast.success("انضم المشارك الآخر! بدأ العداد 🎉");
      } else {
        toast.success("انضم المشارك الآخر! 🎉");
      }
    },
    onRemoteLeave: () => {
      setRemoteConnected(false);
      toast.info("غادر المشارك الآخر الجلسة");
    },
    onConnectionState: (state) => {
      if (state === "connected") setRemoteConnected(true);
      else if (state === "disconnected" || state === "failed") setRemoteConnected(false);
    },
    onDataMessage: handleDataMessage,
  });

  // ─── Session Protection System ───
  const {
    filterChatMessage,
    violationCount,
    isMutedBySystem,
    isChatBlocked,
    latestAlert,
    muteCountdown,
  } = useSessionProtection({
    bookingId: bookingId || "",
    userId: user?.id || "",
    localStream,
    meetingStarted,
    onMuteUser: () => {
      localStream?.getAudioTracks().forEach(t => { t.enabled = false; });
    },
    onEndSession: () => {
      endSession();
    },
  });

  // ─── Anti-Cheat System ───
  const {
    isTabLocked,
    peerDisconnected,
    reconnectCountdown,
    cleanupSession,
    checkActiveSession,
    logEvent,
  } = useSessionAntiCheat({
    bookingId: bookingId || "",
    userId: user?.id || "",
    enabled: meetingStarted,
    onForceEnd: () => {
      endSession();
    },
  });

  // Attach remote audio
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => {
        pushDebugEvent("remote-audio", "autoplay-blocked");
      });
    }
  }, [remoteStream, pushDebugEvent]);

  // Voice Activity Detection - track speaking time
  useEffect(() => {
    if (!meetingStarted) return;
    const audioCtx = new AudioContext();
    const analysers: { local?: AnalyserNode; remote?: AnalyserNode } = {};

    if (localStream && localStream.getAudioTracks().length > 0) {
      try {
        const src = audioCtx.createMediaStreamSource(localStream);
        analysers.local = audioCtx.createAnalyser();
        analysers.local.fftSize = 256;
        src.connect(analysers.local);
      } catch { /* ignore */ }
    }
    if (remoteStream && remoteStream.getAudioTracks().length > 0) {
      try {
        const src = audioCtx.createMediaStreamSource(remoteStream);
        analysers.remote = audioCtx.createAnalyser();
        analysers.remote.fftSize = 256;
        src.connect(analysers.remote);
      } catch { /* ignore */ }
    }

    const threshold = 15;
    const interval = setInterval(() => {
      if (analysers.local) {
        const data = new Uint8Array(analysers.local.frequencyBinCount);
        analysers.local.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        if (avg > threshold) {
          if (isTeacher) setTeacherSpeakingSec(p => p + 1);
          else setStudentSpeakingSec(p => p + 1);
        }
      }
      if (analysers.remote) {
        const data = new Uint8Array(analysers.remote.frequencyBinCount);
        analysers.remote.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        if (avg > threshold) {
          if (isTeacher) setStudentSpeakingSec(p => p + 1);
          else setTeacherSpeakingSec(p => p + 1);
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      audioCtx.close().catch(() => {});
    };
  }, [meetingStarted, localStream, remoteStream, isTeacher]);

  useEffect(() => {
    const videoElement = remoteVideoRef.current;
    if (!videoElement) return;

    if (!remoteStream || !remoteScreenSharing) {
      videoElement.pause();
      videoElement.srcObject = null;
      setRemoteVideoStatus(remoteStream ? "waiting" : "idle");
      return;
    }

    const liveVideoTracks = remoteStream.getVideoTracks().filter((track) => track.readyState === "live");

    if (liveVideoTracks.length === 0) {
      setRemoteVideoStatus("no-video-track");
      pushDebugEvent("remote-video", "no-live-video-track");
      return;
    }

    const screenOnlyStream = new MediaStream(liveVideoTracks);
    videoElement.muted = true;
    videoElement.srcObject = screenOnlyStream;
    setRemoteVideoStatus("binding");

    videoElement.play()
      .then(() => {
        setRemoteVideoStatus("playing");
        pushDebugEvent("remote-video", `playing:${liveVideoTracks.length}`);
      })
      .catch((error) => {
        setRemoteVideoStatus("play-error");
        pushDebugEvent("remote-video", error?.name || "play-error");
      });

    return () => {
      if (videoElement.srcObject === screenOnlyStream) {
        videoElement.pause();
        videoElement.srcObject = null;
      }
    };
  }, [remoteStream, remoteScreenSharing, pushDebugEvent]);

   // Chat messages persistence and realtime - UNIFIED across all bookings between pair
  useEffect(() => {
    if (!bookingId || !user || !meetingStarted) return;

    const fetchUnifiedMessages = async () => {
      // Get booking info to find the pair
      const { data: booking } = await supabase
        .from("bookings")
        .select("student_id, teacher_id")
        .eq("id", bookingId)
        .single();

      if (!booking) return;

      // Get ALL booking IDs between this pair
      const { data: pairBookings } = await supabase
        .from("bookings")
        .select("id")
        .or(`and(student_id.eq.${booking.student_id},teacher_id.eq.${booking.teacher_id}),and(student_id.eq.${booking.teacher_id},teacher_id.eq.${booking.student_id})`);

      const allIds = pairBookings?.map(b => b.id) || [bookingId];

      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const { data } = await supabase
        .from("chat_messages")
        .select("id, sender_id, content, created_at, file_url, file_name, file_type")
        .in("booking_id", allIds)
        .gte("created_at", oneYearAgo.toISOString())
        .order("created_at", { ascending: true });

      if (!data) return;

      setMessages(data.map((msg: any) => ({
        sender: msg.sender_id === user.id ? "أنت" : otherName,
        text: msg.content,
        time: new Date(msg.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
        me: msg.sender_id === user.id,
        fileUrl: msg.file_url,
        fileName: msg.file_name,
        fileType: msg.file_type,
      })));

      return allIds;
    };

    let pairBookingIds: string[] = [];

    fetchUnifiedMessages().then(ids => {
      if (ids) pairBookingIds = ids;
    });

    if (chatChannelRef.current) {
      supabase.removeChannel(chatChannelRef.current);
      chatChannelRef.current = null;
    }

    const channel = supabase
      .channel(`live-session-chat-${bookingId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
      }, (payload) => {
        const msg = payload.new as any;
        // Only show messages from bookings between this pair
        if (pairBookingIds.length > 0 && !pairBookingIds.includes(msg.booking_id)) return;
        
        const isMe = msg.sender_id === user.id;
        setMessages((prev) => {
          const formatted = {
            sender: isMe ? "أنت" : otherName,
            text: msg.content,
            time: new Date(msg.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
            me: isMe,
            fileUrl: msg.file_url,
            fileName: msg.file_name,
            fileType: msg.file_type,
          };
          const exists = prev.some((item) => item.text === formatted.text && item.time === formatted.time && item.me === formatted.me);
          return exists ? prev : [...prev, formatted];
        });
        if (!isMe) {
          playNotificationSound();
          if (!chatOpen) {
            setUnreadCount(prev => prev + 1);
          }
        }
      })
      .subscribe();

    chatChannelRef.current = channel;

    return () => {
      if (chatChannelRef.current) {
        supabase.removeChannel(chatChannelRef.current);
        chatChannelRef.current = null;
      }
    };
  }, [bookingId, user, meetingStarted, otherName, chatOpen, playNotificationSound]);

  // Fetch booking details
  useEffect(() => {
    if (!bookingId || !user) return;
    const fetchBooking = async () => {
      const { data: booking } = await supabase
        .from("bookings")
        .select("*, subjects(name)")
        .eq("id", bookingId)
        .maybeSingle();

      if (!booking) return;
      setBookingData(booking);
      setSubjectName(booking.subjects?.name || "");
      setSessionDuration(booking.duration_minutes || 45);

      const otherId = user.id === booking.student_id ? booking.teacher_id : booking.student_id;
      const { data: otherProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", otherId)
        .maybeSingle();
      if (otherProfile) setOtherName(otherProfile.full_name || "المشارك");

      const studentId = user.id === booking.student_id ? user.id : booking.student_id;
      const { data: activeSub } = await supabase
        .from("user_subscriptions")
        .select("id, sessions_remaining, remaining_minutes")
        .eq("user_id", studentId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSub) {
        const remainMin = (activeSub as any).remaining_minutes ?? (activeSub.sessions_remaining * 45);
        if (remainMin > 0) {
          setHasSubscription(true);
          setSubscriptionRemainingMinutes(remainMin);
        }
      }
    };
    fetchBooking();
  }, [bookingId, user]);

  // Track if teacher has started
  const [teacherStarted, setTeacherStarted] = useState(false);

  useEffect(() => {
    if (!bookingId || !user || !bookingData) return;
    const isStudent = user.id === bookingData.student_id;
    if (!isStudent || meetingStarted) return;

    if (bookingData.session_status === "in_progress") {
      setTeacherStarted(true);
      toast.success("المعلم بدأ الحصة! اضغط انضم للحصة 🎓", { duration: 10000 });
      return;
    }

    const channel = supabase
      .channel(`session-status-${bookingId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "bookings",
        filter: `id=eq.${bookingId}`,
      }, (payload) => {
        const updated = payload.new as any;
        if (updated.session_status === "in_progress" && !meetingStarted) {
          setTeacherStarted(true);
          toast.success("المعلم بدأ الحصة! اضغط انضم للحصة 🎓", { duration: 10000 });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [bookingId, user, bookingData, meetingStarted]);

  // Set bothJoined when meetingStarted and remoteConnected are both true
  useEffect(() => {
    if (meetingStarted && remoteConnected && !bothJoined) {
      setBothJoined(true);
      toast.success("الطرفان متصلان الآن! بدأ العداد ⏱️");
    }
  }, [meetingStarted, remoteConnected, bothJoined]);

  // Auto-start recording when both parties join
  useEffect(() => {
    if (bothJoined && !isRecording) {
      startAutoRecording();
      toast.info("🔴 يتم تسجيل الحصة تلقائياً");
    }
  }, [bothJoined]);

  // Session timer - only ticks when bothJoined
  useEffect(() => {
    if (!meetingStarted || !bothJoined) return;
    timerRef.current = window.setInterval(() => {
      if (peerDisconnected) return;

      setElapsed((p) => {
        const next = p + 1;
        const maxSeconds = hasSubscription ? subscriptionRemainingMinutes * 60 : sessionDuration * 60;
        const warningSeconds = maxSeconds - 5 * 60;
        const tenMinWarning = maxSeconds - 10 * 60;

        if (next >= tenMinWarning && next < tenMinWarning + 2 && !tenMinWarningShown) {
          setTenMinWarningShown(true);
          toast.warning("⚠️ تنبيه: متبقي 10 دقائق من رصيد باقتك!", { duration: 8000 });
        }

        if (next >= warningSeconds && next < warningSeconds + 2 && !timeWarningShown) {
          setTimeWarningShown(true);
          toast.warning("⚠️ تنبيه: متبقي 5 دقائق على انتهاء الحصة!", { duration: 10000 });
        }

        if (next >= maxSeconds) {
          toast.error("انتهى رصيد الباقة! سيتم إغلاق الجلسة تلقائياً.");
          setTimeout(() => endSession(), 2000);
          return maxSeconds;
        }

        // Sync timer to the other party every 10 seconds
        if (next % 10 === 0) {
          sendDataMessage({ type: "timer-sync", elapsed: next });
        }

        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [meetingStarted, bothJoined, sessionDuration, hasSubscription, subscriptionRemainingMinutes, peerDisconnected]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const getRemainingTime = () => {
    const maxSeconds = hasSubscription ? subscriptionRemainingMinutes * 60 : sessionDuration * 60;
    const remaining = Math.max(0, maxSeconds - elapsed);
    return formatTime(remaining);
  };

  const getRemainingMinutesValue = () => {
    const maxSeconds = hasSubscription ? subscriptionRemainingMinutes * 60 : sessionDuration * 60;
    return Math.max(0, Math.ceil((maxSeconds - elapsed) / 60));
  };

  const getRemainingColor = () => {
    const maxSeconds = hasSubscription ? subscriptionRemainingMinutes * 60 : sessionDuration * 60;
    const remaining = maxSeconds - elapsed;
    if (remaining < 60) return "text-destructive";
    if (remaining < 5 * 60) return "text-orange-500";
    return "text-card/60";
  };

  const startMeeting = async () => {
    if (!bookingId) {
      toast.error("لا يوجد حجز محدد");
      return;
    }

    if (hasSubscription && subscriptionRemainingMinutes < 5) {
      toast.error("رصيد الباقة غير كافي. يجب أن يكون لديك 5 دقائق على الأقل.");
      return;
    }

    const hasConflict = await checkActiveSession();
    if (hasConflict) return;

    if (isTabLocked) {
      toast.error("هذه الجلسة مفتوحة في تبويب آخر.");
      return;
    }
    setMeetingStarted(true);
    logEvent("start_session", { role: isTeacher ? "teacher" : "student" });

    await start();

    if (isTeacher) {
      await Promise.all([
        supabase.from("sessions").update({ started_at: new Date().toISOString() }).eq("booking_id", bookingId),
        supabase.from("bookings").update({ session_status: "in_progress" }).eq("id", bookingId),
      ]);

      if (bookingData && user) {
        supabase.from("notifications").insert({
          user_id: bookingData.student_id,
          title: "الحصة بدأت! 🎓",
          body: `بدأ المعلم ${profile?.full_name || "معلمك"} الحصة الآن. انضم فوراً!`,
          type: "session",
        });
      }
    }
  };

  const handleChatFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bookingId || !user) return;

    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("يُسمح فقط بملفات PDF و JPG و PNG");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الملف يجب أن لا يتجاوز 10 ميجابايت");
      return;
    }

    setFileUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `${bookingId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("chat-files").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(filePath);
      const { error: msgError } = await supabase.from("chat_messages").insert({
        booking_id: bookingId,
        sender_id: user.id,
        content: `📎 ${file.name}`,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_type: file.type,
      });
      if (msgError) throw msgError;
      toast.success("تم إرسال الملف بنجاح");
    } catch (err: any) {
      toast.error(err.message || "فشل في رفع الملف");
    } finally {
      setFileUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    const msgText = newMessage;

    const filterResult = filterChatMessage(msgText);
    if (!filterResult.allowed) {
      toast.error(filterResult.reason || "ممنوع مشاركة بيانات شخصية");
      setNewMessage("");
      return;
    }

    // Detect questions
    const questionPatterns = /[؟?]|كيف|ليش|لماذا|هل |ما هو|ما هي|وش |ايش|مش فاهم|ما فهمت|اشرح/;
    if (questionPatterns.test(msgText)) {
      setQuestionsDetected(p => p + 1);
    }

    setNewMessage("");

    if (bookingId && user) {
      const { error } = await supabase.from("chat_messages").insert({
        booking_id: bookingId,
        sender_id: user.id,
        content: msgText,
      });

      if (error) {
        toast.error("تعذر إرسال الرسالة");
        setNewMessage(msgText);
        return;
      }
    }

    if (bookingId && user) {
      supabase.functions.invoke("analyze-violations", {
        body: { messages: [{ text: msgText, sender_id: user.id }], booking_id: bookingId, source: "chat" },
      }).then(({ data }) => {
        if (data?.violations_found > 0) {
          toast.warning("⚠️ تم رصد محتوى مخالف. تجنب مشاركة معلومات اتصال خارجية.");
        }
      }).catch(() => {});
    }
  };

  const uploadRecording = async () => {
    const blob = getRecordingBlob();
    if (!blob || !bookingId || !user) return;
    setRecordingUploading(true);
    try {
      const isAudio = blob.type.startsWith("audio/");
      const ext = isAudio ? "webm" : "webm";
      const contentType = blob.type || "audio/webm";
      const fileName = `${user.id}/${bookingId}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("session-recordings")
        .upload(fileName, blob, { contentType, upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("session-recordings").getPublicUrl(fileName);
      const recordingUrl = urlData.publicUrl;

      // Update session with recording URL
      await supabase.from("sessions").update({ recording_url: recordingUrl }).eq("booking_id", bookingId);

      // Also update session_materials with the recording URL
      const { data: sessionData } = await supabase.from("sessions").select("id").eq("booking_id", bookingId).single();
      if (sessionData) {
        await supabase.from("session_materials").update({ recording_url: recordingUrl }).eq("session_id", sessionData.id);
      }

      toast.success("تم حفظ تسجيل الحصة بنجاح ✅");
    } catch {
      toast.error("تعذر رفع التسجيل");
    } finally {
      setRecordingUploading(false);
    }
  };

  const endSession = async () => {
    if (sessionEndingRef.current) return;
    sessionEndingRef.current = true;
    clearInterval(timerRef.current);

    // Notify the other party to end session too
    sendDataMessage({ type: "session-end", elapsed });

    if (isRecording) stopRecording();
    await stop();
    await cleanupSession();
    logEvent("end_session", { elapsed_seconds: elapsed });

    if (bookingId) {
      try {
        const durationSeconds = elapsed;
        const durationMinutes = Math.ceil(durationSeconds / 60);
        const isShortSession = durationMinutes < 5;

        await supabase.from("bookings").update({ status: "completed", session_status: "completed" }).eq("id", bookingId);
        
        await supabase.from("sessions").update({ 
          ended_at: new Date().toISOString(),
        } as any).eq("booking_id", bookingId);

        const recordingBlob = getRecordingBlob();
        if (recordingBlob) await uploadRecording();

        if (bookingData && !isShortSession) {
          const teacherId = bookingData.teacher_id;
          const teacherEarning = durationMinutes * 0.3;
          
          await supabase.from("bookings").update({ price: teacherEarning }).eq("id", bookingId);
          
          await supabase.from("notifications").insert({
            user_id: teacherId,
            title: "تم إضافة أرباح حصة ✅",
            body: `تمت إضافة ${teacherEarning.toFixed(1)} ر.س لرصيدك عن حصة مكتملة (${durationMinutes} دقيقة).`,
            type: "payment",
          });
        }

        if (bookingData && isShortSession) {
          toast.info("الجلسة أقل من 5 دقائق - لم يتم خصم أي رصيد من الباقة.");
        }

        if (bookingData && !isShortSession) {
          const studentId = bookingData.student_id;
          const newRemaining = Math.max(0, subscriptionRemainingMinutes - durationMinutes);
          
          if (newRemaining <= 30) {
            await supabase.from("notifications").insert({
              user_id: studentId,
              title: newRemaining <= 0 ? "انتهى رصيد باقتك 📋" : "⚠️ رصيد الباقة منخفض!",
              body: newRemaining <= 0 ? "نفد رصيد باقتك. جدد باقتك للاستمرار." : `متبقي ${newRemaining} دقيقة فقط. جدد باقتك.`,
              type: newRemaining <= 0 ? "subscription_expired" : "subscription_warning",
            });
          }
        }

        try {
          await supabase.functions.invoke("session-report", { body: { 
            booking_id: bookingId,
            session_stats: {
              teacher_speaking_seconds: isTeacher ? teacherSpeakingSec : studentSpeakingSec,
              student_speaking_seconds: isTeacher ? studentSpeakingSec : teacherSpeakingSec,
              messages_count: messages.length,
              violation_count: violationCount,
              duration_minutes: durationMinutes,
              is_short_session: isShortSession,
              questions_detected: questionsDetected,
            }
          } });
        } catch {
          console.log("AI report will be generated later");
        }

        toast.success("تم إنهاء الحصة بنجاح ✅");
      } catch (e) {
        console.error("Error ending session:", e);
      }
    }

    if (isTeacher) {
      navigate("/teacher");
    } else {
      navigate(`/rating${bookingId ? `?booking=${bookingId}` : ""}`);
    }
  };

  const getConnectionBadge = () => {
    switch (connectionState) {
      case "connected": return { icon: Wifi, text: "متصل", color: "text-green-400 bg-green-400/10" };
      case "connecting": return { icon: Wifi, text: "جاري الاتصال...", color: "text-yellow-400 bg-yellow-400/10" };
      case "disconnected": return { icon: WifiOff, text: "انقطع الاتصال", color: "text-orange-400 bg-orange-400/10" };
      case "failed": return { icon: WifiOff, text: "فشل الاتصال", color: "text-destructive bg-destructive/10" };
      default: return { icon: Wifi, text: "في الانتظار", color: "text-muted-foreground bg-muted/30" };
    }
  };

  const displayTitle = subjectName ? `${subjectName} - ${otherName}` : otherName;
  const connBadge = getConnectionBadge();
  const remoteAudioTracks = remoteStream?.getAudioTracks().length || 0;
  const remoteVideoTracks = remoteStream?.getVideoTracks().length || 0;
  const remoteLiveVideoTracks = remoteStream?.getVideoTracks().filter((track) => track.readyState === "live").length || 0;

  // Auto-open/close drawing tools when screen sharing toggles
  useEffect(() => {
    if (isTeacher) {
      if (screenSharing) {
        // keep boardOpen state as-is when screen sharing
      } else {
        setPageFrozen(false);
      }
    }
  }, [screenSharing, isTeacher]);

  // Callback to pass to whiteboard for sending data
  const handleWhiteboardSend = useCallback((msg: any) => {
    sendDataMessage(msg);
  }, [sendDataMessage]);


  return (
    <div className="h-screen bg-foreground flex flex-col">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 glass-strong border-b border-border/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl gradient-cta flex items-center justify-center">
            <Users className="h-4 w-4 text-secondary-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold text-card">{displayTitle}</p>
            <div className="flex items-center gap-2">
              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md ${connBadge.color}`}>
                <connBadge.icon className="h-3 w-3" />
                {connBadge.text}
              </span>
              <span className="text-xs text-card/60 font-mono">
                {!bothJoined && meetingStarted ? "⏳ بانتظار الطرف الآخر..." : formatTime(elapsed)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {violationCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs bg-destructive/20 text-destructive px-3 py-1.5 rounded-lg font-bold">
              <ShieldAlert className="h-3 w-3" />
              {violationCount} مخالفة
            </span>
          )}
          {isMutedBySystem && (
            <span className="flex items-center gap-1.5 text-xs bg-destructive/30 text-destructive px-3 py-1.5 rounded-lg font-bold animate-pulse-soft">
              <VolumeX className="h-3 w-3" />
              محظور {muteCountdown}ث
            </span>
          )}
          {meetingStarted && (
            <>
              <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold ${getRemainingColor()} bg-card/10`}>
                <Clock className="h-3 w-3" />
                <span className="font-mono">{getRemainingTime()}</span>
                <span className="hidden sm:inline">متبقي</span>
              </span>
              {hasSubscription && (
                <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold text-card/60 bg-card/10">
                  المتبقي من باقتك: {getRemainingMinutesValue()} دقيقة
                </span>
              )}
            </>
          )}
          {isRecording && (
            <span className="flex items-center gap-1.5 text-xs bg-destructive/20 text-destructive px-3 py-1.5 rounded-lg font-bold animate-pulse-soft">
              <span className="w-2 h-2 rounded-full bg-destructive" /> REC
            </span>
          )}
          {recordingUploading && (
            <span className="flex items-center gap-1.5 text-xs bg-secondary/20 text-secondary px-3 py-1.5 rounded-lg font-bold">
              جاري الرفع...
            </span>
          )}
          {connectionState === "connected" && (
            <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold ${
              iceTransportType === "TURN Relay" ? "text-blue-400 bg-blue-400/10" :
              iceTransportType === "STUN" ? "text-cyan-400 bg-cyan-400/10" :
              iceTransportType.startsWith("Direct") ? "text-green-400 bg-green-400/10" :
              "text-muted-foreground bg-muted/30"
            }`}>
              {iceTransportType === "TURN Relay" ? "🔁" : iceTransportType === "STUN" ? "🌐" : "⚡"} {iceTransportType}
            </span>
          )}
          {connectionState === "failed" && isTeacher && (
            <Button size="sm" variant="ghost" className="text-orange-400 hover:text-orange-300 gap-1" onClick={restartConnection}>
              <RefreshCw className="h-3 w-3" /> إعادة الاتصال
            </Button>
          )}
          {isTeacher && (
            <Button size="icon" variant="ghost" className="text-card/60 hover:text-card h-8 w-8 rounded-lg" onClick={() => setShowReport(!showReport)}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Tab locked overlay */}
      {isTabLocked && (
        <div className="absolute inset-0 z-50 bg-foreground/95 flex items-center justify-center">
          <div className="text-center p-8">
            <ShieldAlert className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold text-card mb-2">الجلسة مفتوحة في تبويب آخر</h2>
            <p className="text-card/60">أغلق التبويب الآخر وأعد تحميل هذه الصفحة</p>
          </div>
        </div>
      )}

      {/* Peer disconnect warning */}
      <AnimatePresence>
        {peerDisconnected && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-orange-600 text-card px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 font-bold text-sm"
          >
            <WifiOff className="h-4 w-4" />
            انقطع اتصال المشارك - مهلة إعادة الاتصال: {reconnectCountdown}ث
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating violation alert */}
      <AnimatePresence>
        {latestAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 font-bold text-sm"
          >
            <AlertTriangle className="h-4 w-4" />
            {latestAlert}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Indicators for student */}
      <AnimatePresence>
        {!isTeacher && remoteScreenSharing && !boardOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-16 right-4 z-30 bg-primary/80 text-primary-foreground px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-sm font-bold"
          >
            <Monitor className="h-4 w-4" />
            المعلم يشارك الشاشة الآن
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!isTeacher && remoteDrawing && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-16 left-4 z-30 bg-secondary/80 text-secondary-foreground px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-sm font-bold"
          >
            <Pen className="h-4 w-4" />
            المعلم يرسم الآن
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex relative overflow-hidden">

        {/* Main area */}
        <div className={`flex-1 flex flex-col items-center justify-center relative ${showReport ? "hidden md:flex" : ""}`}>
          {meetingStarted ? (
            <div className="absolute inset-0 w-full h-full bg-foreground flex items-center justify-center">
            {/* Screen share video display (for student viewing teacher's screen) */}
              {remoteScreenSharing && !isTeacher && (
                <div className="absolute inset-0 z-10">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain bg-black"
                    onLoadedMetadata={() => pushDebugEvent("remote-video", "metadata-loaded")}
                    onPlaying={() => setRemoteVideoStatus("playing")}
                  />
                  {/* Whiteboard overlay on student's screen share view */}
                   {bookingId && user && (
                     <div className="absolute inset-0 z-20 pointer-events-none">
                       <WhiteboardCanvas
                         bookingId={bookingId}
                         userId={user.id}
                         enabled={meetingStarted}
                         isTeacher={false}
                         onSendData={handleWhiteboardSend}
                         overlay={true}
                         remoteActions={whiteboardRemoteActions}
                         remoteLaserPos={remoteLaserPos}
                       />
                     </div>
                   )}
                   {pageFrozen && (
                     <div className="absolute inset-0 z-5 bg-foreground/10 flex items-center justify-center pointer-events-none">
                       <span className="bg-foreground/70 text-card px-4 py-2 rounded-xl text-sm font-bold backdrop-blur-sm">
                         ⏸️ الشاشة مجمّدة - المعلم يشرح
                       </span>
                     </div>
                   )}
                   <div className="absolute top-2 right-2 bg-primary/80 rounded-md px-2 py-1 z-30">
                     <p className="text-xs text-primary-foreground font-bold flex items-center gap-1">
                       <Monitor className="h-3 w-3" /> مشاركة الشاشة
                     </p>
                   </div>
                </div>
              )}

              {/* Teacher's own screen share preview + overlay drawing */}
              {screenSharing && isTeacher && (
                <div className="absolute inset-0 z-15">
                  {/* Overlay whiteboard for teacher drawing on screen share */}
                  {boardOpen && bookingId && user && (
                    <div className="absolute inset-0 z-20">
                      <WhiteboardCanvas
                        bookingId={bookingId}
                        userId={user.id}
                        enabled={meetingStarted}
                        isTeacher={true}
                        onSendData={handleWhiteboardSend}
                        overlay={true}
                        remoteActions={whiteboardRemoteActions}
                      />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 z-30 bg-primary/80 rounded-md px-3 py-1.5">
                    <p className="text-xs text-primary-foreground font-bold flex items-center gap-1">
                      <Monitor className="h-3 w-3" /> أنت تشارك الشاشة
                    </p>
                  </div>
                </div>
              )}

              {/* Standalone Whiteboard in main area */}
              {boardOpen && !screenSharing && isTeacher && bookingId && user && (
                <div className="absolute inset-0 z-10 bg-white">
                  <WhiteboardCanvas
                    bookingId={bookingId}
                    userId={user.id}
                    enabled={meetingStarted}
                    isTeacher={true}
                    onSendData={handleWhiteboardSend}
                    overlay={false}
                    remoteActions={whiteboardRemoteActions}
                  />
                  <div className="absolute top-2 right-2 z-30 bg-primary/80 rounded-md px-3 py-1.5">
                    <p className="text-xs text-primary-foreground font-bold flex items-center gap-1">
                      <PenTool className="h-3 w-3" /> السبورة
                    </p>
                  </div>
                </div>
              )}

              {/* Student whiteboard view (standalone, no screen share) */}
              {boardOpen && !remoteScreenSharing && !isTeacher && bookingId && user && (
                <div className="absolute inset-0 z-10 bg-white">
                  <WhiteboardCanvas
                    bookingId={bookingId}
                    userId={user.id}
                    enabled={meetingStarted}
                    isTeacher={false}
                    onSendData={handleWhiteboardSend}
                    overlay={false}
                    remoteActions={whiteboardRemoteActions}
                    remoteLaserPos={remoteLaserPos}
                  />
                  <div className="absolute top-2 right-2 z-30 bg-primary/80 rounded-md px-3 py-1.5">
                    <p className="text-xs text-primary-foreground font-bold flex items-center gap-1">
                      <PenTool className="h-3 w-3" /> السبورة
                    </p>
                  </div>
                </div>
              )}

              {/* Audio session indicator - show when no screen share and no standalone whiteboard */}
              {!(remoteScreenSharing && !isTeacher) && !(boardOpen && !screenSharing) && (
                <>
                  {!remoteConnected ? (
                    <div className="text-center">
                      <div className="w-24 h-24 rounded-3xl bg-card/10 backdrop-blur-sm mx-auto mb-4 flex items-center justify-center border border-card/10 animate-pulse">
                        <Users className="h-12 w-12 text-card/40" />
                      </div>
                      <p className="text-card/80 font-bold text-lg mb-1">في انتظار {otherName}</p>
                      <p className="text-card/50 text-sm">سيتم الاتصال تلقائياً عند انضمامه...</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="w-28 h-28 rounded-full bg-secondary/20 mx-auto mb-4 flex items-center justify-center border-2 border-secondary/40">
                        <Headphones className="h-14 w-14 text-secondary" />
                      </div>
                      <p className="text-card/90 font-bold text-xl mb-1">{otherName}</p>
                      <p className="text-card/50 text-sm flex items-center gap-1 justify-center">
                        <Wifi className="h-3 w-3 text-green-400" /> متصل - جلسة صوتية
                      </p>
                      {micEnabled && (
                        <div className="mt-4 flex items-center gap-2 justify-center">
                          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                          <span className="text-xs text-card/40">الميكروفون نشط</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="text-center text-primary-foreground gradient-hero w-full h-full flex flex-col items-center justify-center">
              <div className="w-28 h-28 rounded-3xl bg-primary-foreground/10 backdrop-blur-sm mx-auto mb-5 flex items-center justify-center border border-primary-foreground/10">
                <Headphones className="h-14 w-14 text-primary-foreground/60" />
              </div>
              <p className="font-black text-xl mb-1">{otherName}</p>
              <p className="text-sm opacity-60 mb-2">جاهز لبدء الحصة</p>
              <p className="text-xs opacity-50 mb-6">مدة الحصة: {sessionDuration} دقيقة</p>
              {!bookingId ? (
                <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">لا يوجد حجز محدد - تأكد من الدخول عبر لوحة التحكم</p>
              ) : isTeacher ? (
                <Button
                  onClick={startMeeting}
                  className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-8 py-4 text-lg font-bold shadow-lg gap-2"
                >
                  <Headphones className="h-6 w-6" />
                  ابدأ الحصة الآن
                </Button>
              ) : (
                <div className="text-center">
                  <Button
                    onClick={startMeeting}
                    disabled={!teacherStarted}
                    className={`rounded-xl px-8 py-4 text-lg font-bold shadow-lg gap-2 mb-4 ${teacherStarted ? "bg-green-600 hover:bg-green-700 text-white animate-pulse" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
                  >
                    <Headphones className="h-6 w-6" />
                    {teacherStarted ? "انضم للحصة الآن" : "بانتظار بدء المعلم..."}
                  </Button>
                  <p className="text-xs opacity-40 mt-2">
                    {teacherStarted ? "المعلم بدأ الحصة - اضغط للانضمام" : "سيتم تفعيل الزر عندما يبدأ المعلم الحصة"}
                  </p>
                </div>
              )}
            </div>
          )}

          {handRaised && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 bg-gold text-gold-foreground px-4 py-2 rounded-xl font-bold text-sm shadow-lg z-20">
              <Hand className="h-4 w-4 inline ml-1" /> {isTeacher ? "الطالب رفع يده" : "رفعت يدك"}
            </motion.div>
          )}
        </div>

        {/* Whiteboard Panel removed - drawing is now overlay on screen share */}

        {/* Session Report Panel */}
        <AnimatePresence>
          {showReport && isTeacher && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="w-full md:w-96 bg-card border-r absolute md:relative inset-0 md:inset-auto z-10 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-foreground">تقرير الحصة</h3>
                <button onClick={() => setShowReport(false)} className="text-muted-foreground hover:text-foreground md:hidden transition-colors">✕</button>
              </div>
              <SessionReport bookingId={bookingId || "demo"} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Assistant Panel - Teacher Only */}
        <AnimatePresence>
          {isTeacher && (
            <LiveAIAssistant
              messages={messages}
              subject={subjectName}
              elapsedSeconds={elapsed}
              isOpen={aiAssistantOpen}
              onClose={() => setAiAssistantOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Chat Panel */}
        <AnimatePresence>
          {chatOpen && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="w-full md:w-80 bg-card border-r flex flex-col absolute md:relative inset-0 md:inset-auto z-10">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="font-bold text-foreground">المحادثة</h3>
                <button onClick={() => setChatOpen(false)} className="text-muted-foreground hover:text-foreground md:hidden transition-colors">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.5) }} className={`${m.me ? "mr-auto" : "ml-auto"} max-w-[80%]`}>
                    <div className={`p-3 rounded-2xl text-sm ${m.me ? "bg-secondary/10 text-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                      {!m.me && <p className="text-xs font-bold mb-1 text-secondary">{m.sender}</p>}
                      <p>{m.text}</p>
                      {m.fileUrl && m.fileType?.startsWith("image/") && (
                        <div className="mt-2">
                          <a href={m.fileUrl} target="_blank" rel="noopener noreferrer">
                            <img src={m.fileUrl} alt={m.fileName || "صورة"} className="max-w-[200px] rounded-lg border border-border/30" loading="lazy" />
                          </a>
                          <a href={m.fileUrl} download={m.fileName} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-1">
                            <Download className="h-3 w-3" /> تحميل
                          </a>
                        </div>
                      )}
                      {m.fileUrl && (m.fileType === "application/pdf" || m.fileName?.endsWith(".pdf")) && (
                        <div className="mt-2 flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1.5">
                          <FileText className="h-4 w-4 shrink-0 text-destructive" />
                          <span className="text-xs truncate flex-1">{m.fileName || "PDF"}</span>
                          <a href={m.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] underline text-primary shrink-0">فتح</a>
                          <a href={m.fileUrl} download={m.fileName} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary">
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{m.time}</p>
                  </motion.div>
                ))}
              </div>
              <div className="p-3 border-t">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleChatFileUpload}
                />
                {isChatBlocked ? (
                  <div className="flex items-center gap-2 justify-center text-destructive text-sm font-bold py-2">
                    <VolumeX className="h-4 w-4" />
                    الدردشة محظورة مؤقتاً ({muteCountdown}ث)
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10 rounded-xl shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={fileUploading}
                    >
                      {fileUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </Button>
                    <Input
                      placeholder="اكتب رسالة..."
                      className="text-right h-10 rounded-xl bg-muted/30 border-0"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    />
                    <Button size="icon" className="gradient-cta text-secondary-foreground h-10 w-10 rounded-xl" onClick={sendMessage}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 md:gap-3 p-4 glass-strong border-t border-border/10">
        {/* Teacher controls */}
        {isTeacher && (
          <>
            <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${micEnabled ? "bg-card/20 hover:bg-card/30 text-card border-0" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"}`} onClick={toggleMic}>
              {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${screenSharing ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={toggleScreenShare} disabled={!meetingStarted}>
              <Monitor className="h-5 w-5" />
            </Button>
            <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${boardOpen ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => { setBoardOpen(!boardOpen); setShowReport(false); }} disabled={!meetingStarted} title="السبورة">
              <PenTool className="h-5 w-5" />
            </Button>
          </>
        )}

        {/* Chat - for both */}
        <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 relative ${chatOpen ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) setUnreadCount(0); }}>
          <MessageSquare className="h-5 w-5" />
          {unreadCount > 0 && !chatOpen && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center animate-pulse-soft">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>

        {/* Student controls */}
        {!isTeacher && (
          <>
            <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${micEnabled ? "bg-card/20 hover:bg-card/30 text-card border-0" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"}`} onClick={toggleMic}>
              {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${isFullscreen ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={toggleFullscreen} title={isFullscreen ? "إلغاء ملء الشاشة" : "ملء الشاشة"}>
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </Button>
            <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${handRaised ? "bg-gold text-gold-foreground border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => setHandRaised(!handRaised)}>
              <Hand className="h-5 w-5" />
            </Button>
          </>
        )}

        {/* Teacher extra controls */}
        {isTeacher && (
          <>
            <Button size="icon" className={`rounded-xl h-12 w-12 transition-all duration-200 ${showReport ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`} onClick={() => { setShowReport(!showReport); setBoardOpen(false); setAiAssistantOpen(false); }}>
              <FileText className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              className={`rounded-xl h-12 w-12 transition-all duration-200 ${aiAssistantOpen ? "gradient-cta text-secondary-foreground shadow-button border-0" : "bg-card/20 hover:bg-card/30 text-card border-0"}`}
              onClick={() => { setAiAssistantOpen(!aiAssistantOpen); setShowReport(false); setBoardOpen(false); }}
              disabled={!meetingStarted}
              title="المساعد الذكي"
            >
              <Brain className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              className={`rounded-xl h-12 w-12 transition-all duration-200 ${isRecording ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0 animate-pulse-soft" : "bg-card/20 hover:bg-card/30 text-card border-0"}`}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!meetingStarted}
              title={isRecording ? "إيقاف التسجيل" : "بدء التسجيل"}
            >
              {isRecording ? <Square className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
            </Button>
          </>
        )}

        {/* End call */}
        <Button size="icon" className="rounded-xl h-12 w-12 bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0" onClick={endSession}>
          <Phone className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default LiveSession;
