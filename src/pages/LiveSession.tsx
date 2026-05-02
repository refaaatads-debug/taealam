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
import { notificationTemplates } from "@/lib/notificationTemplates";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useConnectionQuality, type ConnectionQuality } from "@/hooks/useConnectionQuality";
import { playJoinSound, playLeaveSound, playHandRaiseSound } from "@/lib/sessionSounds";
import { useSessionProtection } from "@/hooks/useSessionProtection";
import { useSessionAntiCheat } from "@/hooks/useSessionAntiCheat";
import WhiteboardCanvas from "@/components/WhiteboardCanvas";
import LiveAIAssistant from "@/components/LiveAIAssistant";
import CallStudentButton from "@/components/teacher/CallStudentButton";
import ScreenShareToolbar from "@/components/teacher/ScreenShareToolbar";
import VoiceRecorder from "@/components/VoiceRecorder";
import VoicePlayer from "@/components/VoicePlayer";
import { useIsPhoneDevice } from "@/hooks/use-is-phone";

const LiveSession = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("booking");

  const [chatOpen, setChatOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [filePreview, setFilePreview] = useState<{ url: string; name: string; type: "pdf" | "image" } | null>(null);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [remoteHandRaised, setRemoteHandRaised] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;
  const shouldCountRef = useRef(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
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
  // Floating screen-share annotation toolbar (teacher) + remote drawings (student sees teacher's annotations)
  const [screenToolbarOpen, setScreenToolbarOpen] = useState(false);
  const [screenAnnotations, setScreenAnnotations] = useState<any[]>([]);
  const [pageFrozen, setPageFrozen] = useState(false);
  const [remoteVideoStatus, setRemoteVideoStatus] = useState("idle");
  const [lastDataMessageType, setLastDataMessageType] = useState("-");
  const [lastDataMessageAt, setLastDataMessageAt] = useState("-");
  const [debugEvents, setDebugEvents] = useState<{ time: string; label: string; value: string }[]>([]);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatChannelRef = useRef<any>(null);
  const sessionStatusChannelRef = useRef<any>(null);
  const remoteDrawingTimerRef = useRef<number>();
  const [unreadCount, setUnreadCount] = useState(0);
  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { play: playNotificationSound } = useNotificationSound();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const uiHideTimerRef = useRef<number>();

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

  // Auto-hide UI (top bar + controls) when student is in fullscreen.
  // Reveal on mouse move/click/touch and re-hide after 3s of inactivity.
  useEffect(() => {
    if (!isFullscreen) { setUiVisible(true); clearTimeout(uiHideTimerRef.current); return; }
    const reveal = () => {
      setUiVisible(true);
      clearTimeout(uiHideTimerRef.current);
      uiHideTimerRef.current = window.setTimeout(() => setUiVisible(false), 3000);
    };
    reveal();
    window.addEventListener("mousemove", reveal);
    window.addEventListener("click", reveal);
    window.addEventListener("touchstart", reveal);
    return () => {
      window.removeEventListener("mousemove", reveal);
      window.removeEventListener("click", reveal);
      window.removeEventListener("touchstart", reveal);
      clearTimeout(uiHideTimerRef.current);
    };
  }, [isFullscreen]);

  // End session for BOTH parties when user presses browser back arrow
  useEffect(() => {
    if (!meetingStarted) return;
    // Push a sentinel state so the first back press triggers popstate instead of leaving
    window.history.pushState({ liveSession: true }, "");
    const onPopState = () => {
      if (sessionEndingRef.current) return;
      toast.info("تم الرجوع — جارٍ إنهاء الحصة للطرفين...");
      endSession();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingStarted]);

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

  // Block teachers from starting/joining session on phone devices
  const isPhone = useIsPhoneDevice();
  useEffect(() => {
    if (isPhone && isTeacher && bookingData) {
      toast.error("بدء الحصة غير متاح على الهاتف. يرجى استخدام الكمبيوتر أو اللاب توب.");
      navigate("/teacher", { replace: true });
    }
  }, [isPhone, isTeacher, bookingData, navigate]);

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
    } else if (msg.type === "whiteboard-toggle") {
      // Sync board open/close state from teacher to student instantly
      if (!isTeacher) setBoardOpen(!!msg.open);
    } else if (msg.type === "screen-share-status") {
      setRemoteScreenSharing(msg.active);
    } else if (msg.type === "screen-annotation") {
      setScreenAnnotations((prev) => [...prev, msg.action]);
    } else if (msg.type === "screen-annotation-clear") {
      setScreenAnnotations([]);
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
    } else if (msg.type === "timer-start") {
      // Authoritative session start time from the teacher (source of truth)
      if (typeof msg.startedAt === "string") {
        setSessionStartedAt(msg.startedAt);
      }
    } else if (msg.type === "timer-sync") {
      // Teacher is the SOLE source of truth. Student mirrors teacher's value exactly
      // (both forward and backward correction allowed) so paused/resumed states stay aligned.
      if (!isTeacher && typeof msg.elapsed === "number") {
        const paused = msg.paused === true;
        const latencySec = !paused && typeof msg.ts === "number"
          ? Math.max(0, (Date.now() - msg.ts) / 1000)
          : 0;
        const target = Math.max(0, Math.round(msg.elapsed + latencySec));
        setElapsed(target);
      }
    } else if (msg.type === "timer-request") {
      if (isTeacher) {
        sendDataMessage({ type: "timer-sync", elapsed: elapsedRef.current, ts: Date.now(), paused: !shouldCountRef.current });
      }
    } else if (msg.type === "hand-raise") {
      setRemoteHandRaised(!!msg.raised);
      if (msg.raised) {
        playHandRaiseSound();
        toast.info(isTeacher ? "✋ الطالب رفع يده" : "✋ المعلم رفع يده", { id: "hand-raise" });
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
    setVideoQuality,
    pcRef,
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

  // ─── Connection Quality Monitoring + Adaptive Bitrate ───
  const lastQualityLevelRef = useRef<ConnectionQuality["level"]>("good");
  const connectionQuality = useConnectionQuality(pcRef.current, {
    intervalMs: 3000,
    disconnectThresholdMs: 30000,
    onQualityChange: (q) => {
      // Adaptive bitrate: downgrade/upgrade video sender based on quality
      if (q.level === lastQualityLevelRef.current) return;
      lastQualityLevelRef.current = q.level;
      if (q.level === "poor") {
        setVideoQuality("low");
        toast.warning("جودة الاتصال ضعيفة — تم تخفيض جودة الفيديو تلقائياً", { id: "net-quality" });
      } else if (q.level === "fair") {
        setVideoQuality("medium");
      } else if (q.level === "good" || q.level === "excellent") {
        setVideoQuality("high");
      }
    },
    onSustainedDisconnect: (ms) => {
      toast.error(`انقطع الاتصال لأكثر من ${Math.round(ms / 1000)} ثانية. جاري المحاولة...`, { id: "net-down" });
    },
  });

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
        .from("public_profiles")
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
        // If the other party marked the session completed/cancelled, force-end on this side too
        if ((updated.status === "completed" || updated.session_status === "completed" ||
             updated.status === "cancelled" || updated.session_status === "cancelled")
            && !sessionEndingRef.current && meetingStarted) {
          toast.info("أنهى الطرف الآخر الجلسة. جارٍ إغلاق الجلسة...");
          setTimeout(() => endSession(), 1000);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "sessions",
        filter: `booking_id=eq.${bookingId}`,
      }, (payload) => {
        const updated = payload.new as any;
        if (updated.ended_at && !sessionEndingRef.current && meetingStarted) {
          toast.info("أنهى الطرف الآخر الجلسة. جارٍ إغلاق الجلسة...");
          setTimeout(() => endSession(), 1000);
        }
      })
      .on("broadcast", { event: "session-end" }, () => {
        if (!sessionEndingRef.current && meetingStarted) {
          toast.info("أنهى الطرف الآخر الجلسة. جارٍ إغلاق الجلسة...");
          setTimeout(() => endSession(), 1000);
        }
      })
      .subscribe();

    sessionStatusChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); sessionStatusChannelRef.current = null; };
  }, [bookingId, user, bookingData, meetingStarted]);

  // Set bothJoined when meetingStarted and remoteConnected are both true
  useEffect(() => {
    if (meetingStarted && remoteConnected && !bothJoined) {
      setBothJoined(true);
      toast.success("الطرفان متصلان الآن! بدأ العداد ⏱️");
    }
  }, [meetingStarted, remoteConnected, bothJoined]);

  // Auto-start recording when both parties join (retry when remoteStream arrives)
  const recordingToastShownRef = useRef(false);
  const screenSharePromptShownRef = useRef(false);
  useEffect(() => {
    if (bothJoined && !isRecording && remoteStream) {
      startAutoRecording();
      if (!recordingToastShownRef.current) {
        toast.info("🔴 يتم تسجيل الحصة تلقائياً");
        recordingToastShownRef.current = true;
      }
    }
  }, [bothJoined, remoteStream, isRecording, startAutoRecording]);

  // Recover any stranded local backups from previous failed sessions (teacher only)
  const backupRecoveryAttemptedRef = useRef(false);
  useEffect(() => {
    if (!isTeacher || !user || backupRecoveryAttemptedRef.current) return;
    backupRecoveryAttemptedRef.current = true;
    (async () => {
      try {
        const { listAllBackups, clearRecordingBackup } = await import("@/lib/recordingBackup");
        const backups = await listAllBackups();
        const mine = backups.filter((b) => b.userId === user.id);
        if (mine.length === 0) return;
        console.log(`[recording-backup] found ${mine.length} pending backup(s), retrying upload...`);
        for (const b of mine) {
          try {
            const { error } = await supabase.storage
              .from("session-recordings")
              .upload(b.fileName, b.blob, { contentType: "video/webm", upsert: true });
            if (error) {
              console.warn("[recording-backup] retry failed for", b.bookingId, error.message);
              continue;
            }
            const { data: signedData } = await supabase.storage
              .from("session-recordings")
              .createSignedUrl(b.fileName, 60 * 60 * 24 * 7);
            const { data: urlData } = supabase.storage.from("session-recordings").getPublicUrl(b.fileName);
            await supabase.functions.invoke("save-session-recording", {
              body: { booking_id: b.bookingId, recording_url: signedData?.signedUrl || urlData.publicUrl },
            });
            await clearRecordingBackup(b.bookingId);
            toast.success("تم استرداد ورفع تسجيل سابق محفوظ محلياً ✅");
          } catch (e) {
            console.warn("[recording-backup] recovery exception:", e);
          }
        }
      } catch (e) {
        console.warn("[recording-backup] recovery init failed:", e);
      }
    })();
  }, [isTeacher, user]);

  // NOTE: Recording is NOT tied to screen sharing. The auto-recorder (canvas pipeline)
  // captures audio + whiteboard + remote video as soon as both parties join.
  // No nagging toast is needed — teachers may share the screen optionally.

  // ───────────────────────────────────────────────────────────
  //  Chunked recording uploader — every 60s, teacher uploads
  //  the cumulative recording so far (overwriting same file).
  //  Guarantees the latest portion is preserved even if the
  //  session crashes / connection dies before normal endSession.
  // ───────────────────────────────────────────────────────────
  const chunkUploadFileNameRef = useRef<string | null>(null);
  const chunkUploadInFlightRef = useRef(false);
  const chunkUploadIntervalRef = useRef<number | null>(null);
  const lastUploadedSizeRef = useRef(0);

  // Stable filename for the whole session (set once recording starts).
  useEffect(() => {
    if (isRecording && bookingId && user && !chunkUploadFileNameRef.current) {
      chunkUploadFileNameRef.current = `${user.id}/${bookingId}_${Date.now()}.webm`;
      console.log("[chunked-upload] filename set:", chunkUploadFileNameRef.current);
    }
    if (!isRecording) {
      // Clear on session end so a fresh name is generated next time
      chunkUploadFileNameRef.current = null;
      lastUploadedSizeRef.current = 0;
    }
  }, [isRecording, bookingId, user]);

  const uploadFailureCountRef = useRef(0);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "synced" | "failed" | "queued">("idle");
  const [lastUploadAt, setLastUploadAt] = useState<number | null>(null);

  const uploadCumulativeChunk = useCallback(async () => {
    if (!isTeacher) return; // only teacher uploads to avoid duplicate writes
    if (chunkUploadInFlightRef.current) return;
    const fileName = chunkUploadFileNameRef.current;
    if (!fileName || !bookingId || !user) return;

    const blob = getRecordingBlob();
    if (!blob || blob.size === 0) return;
    if (blob.size === lastUploadedSizeRef.current) return; // nothing new

    chunkUploadInFlightRef.current = true;
    setUploadStatus("uploading");

    // Always save a local backup BEFORE upload — guarantees recovery even if upload fails forever
    try {
      const { saveRecordingBackup } = await import("@/lib/recordingBackup");
      await saveRecordingBackup({
        bookingId,
        userId: user.id,
        fileName,
        blob,
        size: blob.size,
        savedAt: Date.now(),
      });
    } catch {}

    // Retry with exponential backoff: 0s, 2s, 6s
    const delays = [0, 2000, 6000];
    let uploaded = false;
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]));
      try {
        const { error } = await supabase.storage
          .from("session-recordings")
          .upload(fileName, blob, { contentType: "video/webm", upsert: true });
        if (!error) {
          uploaded = true;
          break;
        }
        console.warn(`[chunked-upload] attempt ${attempt + 1} failed:`, error.message);
      } catch (e) {
        console.warn(`[chunked-upload] attempt ${attempt + 1} exception:`, e);
      }
    }

    if (!uploaded) {
      uploadFailureCountRef.current += 1;
      setUploadStatus("queued");
      console.warn(`[chunked-upload] all retries failed (total failures: ${uploadFailureCountRef.current}). Saved to local backup.`);
      if (uploadFailureCountRef.current === 1) {
        toast.warning("تعذر رفع التسجيل — تم الحفظ محلياً وسيُعاد رفعه تلقائياً", { id: "rec-upload-fail" });
      }
      chunkUploadInFlightRef.current = false;
      return;
    }

    // Success
    uploadFailureCountRef.current = 0;
    lastUploadedSizeRef.current = blob.size;
    setUploadStatus("synced");
    setLastUploadAt(Date.now());
    console.log("[chunked-upload] uploaded", blob.size, "bytes");

    // Persist URL on first successful upload of this session
    try {
      const { data: signedData } = await supabase.storage
        .from("session-recordings")
        .createSignedUrl(fileName, 60 * 60 * 24 * 7);
      const { data: urlData } = supabase.storage.from("session-recordings").getPublicUrl(fileName);
      const recordingUrl = signedData?.signedUrl || urlData.publicUrl;
      await supabase.functions.invoke("save-session-recording", {
        body: { booking_id: bookingId, recording_url: recordingUrl },
      });
    } catch (e) {
      console.warn("[chunked-upload] save-session-recording skipped:", e);
    }

    chunkUploadInFlightRef.current = false;
  }, [isTeacher, bookingId, user, getRecordingBlob]);

  // Run periodic uploads while recording.
  useEffect(() => {
    if (!isRecording || !isTeacher) return;
    chunkUploadIntervalRef.current = window.setInterval(() => {
      uploadCumulativeChunk();
    }, 60_000);
    return () => {
      if (chunkUploadIntervalRef.current) {
        clearInterval(chunkUploadIntervalRef.current);
        chunkUploadIntervalRef.current = null;
      }
    };
  }, [isRecording, isTeacher, uploadCumulativeChunk]);

  // Best-effort upload on tab close / refresh.
  useEffect(() => {
    const handler = () => { uploadCumulativeChunk(); };
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [uploadCumulativeChunk]);

  // ───────────────────────────────────────────────────────────
  //  Precise Session Counter — Fail-safe accumulator
  // ───────────────────────────────────────────────────────────
  // Counter policy (per product spec):
  //   • Starts when BOTH parties are in the session (bothJoined).
  //   • NEVER pauses for tab switch, screen share, network drop, or RTC state.
  //   • Stops ONLY when one party explicitly ends the session.
  //   • On reconnect, the teacher broadcasts authoritative elapsed so the
  //     student resyncs from the exact same point (monotonic forward only).
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [isPageVisible, setIsPageVisible] = useState<boolean>(typeof document === "undefined" ? true : !document.hidden);
  const wasCountingRef = useRef(false);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); logEvent("network_online"); };
    const onOffline = () => { setIsOnline(false); logEvent("network_offline"); };
    const onVis = () => {
      const visible = !document.hidden;
      setIsPageVisible(visible);
      logEvent(visible ? "page_visible" : "page_hidden");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [logEvent]);

  // Counter runs after both parties join. Pauses ONLY when:
  //   • A party leaves/ends the session (peerDisconnected)
  //   • Local network is offline OR WebRTC connection is not "connected"
  // On reconnect: resumes from the exact same point. Teacher broadcasts the
  // authoritative elapsed every second so the student stays in sync.
  // Tab switching and screen sharing do NOT pause the timer.
  const connectionHealthy = isOnline && connectionState === "connected" && !peerDisconnected;
  const shouldCount = meetingStarted && bothJoined && connectionHealthy;
  shouldCountRef.current = shouldCount;

  // On (re)connection: sync timer between peers immediately (teacher = source of truth)
  useEffect(() => {
    if (!dataChannelReady || !meetingStarted) return;
    if (isTeacher) {
      sendDataMessage({ type: "timer-sync", elapsed: elapsedRef.current, ts: Date.now(), paused: !shouldCountRef.current });
    } else {
      sendDataMessage({ type: "timer-request" });
    }
  }, [dataChannelReady, meetingStarted, isTeacher, sendDataMessage]);

  // Log start/pause/resume transitions and notify peer
  useEffect(() => {
    if (!meetingStarted) return;
    if (shouldCount && !wasCountingRef.current) {
      wasCountingRef.current = true;
      logEvent("counter_resume", { elapsed });
      if (isTeacher) sendDataMessage({ type: "timer-sync", elapsed, ts: Date.now(), paused: false });
    } else if (!shouldCount && wasCountingRef.current) {
      wasCountingRef.current = false;
      const reason = !isOnline ? "offline" : peerDisconnected ? "peer_disconnect" : connectionState !== "connected" ? `rtc_${connectionState}` : "other";
      logEvent("counter_pause", { elapsed, reason });
      if (isTeacher) sendDataMessage({ type: "timer-sync", elapsed, ts: Date.now(), paused: true });
      if (reason === "offline") toast.warning("⚠️ انقطع الإنترنت — سيستأنف العداد عند العودة", { duration: 4000 });
    }
  }, [shouldCount, meetingStarted, elapsed, isOnline, peerDisconnected, connectionState, isTeacher, sendDataMessage, logEvent]);

  // Tick — ONLY the teacher ticks locally (source of truth). The student is a pure mirror
  // and updates its `elapsed` exclusively from the teacher's `timer-sync` messages. This
  // guarantees both sides display the same value during disconnects and reconnects.
  useEffect(() => {
    if (!isTeacher || !shouldCount) {
      clearInterval(timerRef.current);
      lastTickRef.current = 0;
      return;
    }
    lastTickRef.current = Date.now();
    const tick = () => {
      const now = Date.now();
      const deltaSec = lastTickRef.current ? Math.max(0, Math.round((now - lastTickRef.current) / 1000)) : 1;
      lastTickRef.current = now;
      const inc = Math.min(deltaSec || 1, 5);

      setElapsed((prev) => {
        const next = prev + inc;
        if (!isTeacher) return next; // student doesn't enforce limits
        const maxSeconds = hasSubscription ? subscriptionRemainingMinutes * 60 : sessionDuration * 60;
        const warningSeconds = maxSeconds - 5 * 60;
        const tenMinWarning = maxSeconds - 10 * 60;

        if (next >= tenMinWarning && prev < tenMinWarning && !tenMinWarningShown) {
          setTenMinWarningShown(true);
          toast.warning("⚠️ تنبيه: متبقي 10 دقائق من رصيد باقتك!", { duration: 8000 });
        }
        if (next >= warningSeconds && prev < warningSeconds && !timeWarningShown) {
          setTimeWarningShown(true);
          toast.warning("⚠️ تنبيه: متبقي 5 دقائق على انتهاء الحصة!", { duration: 10000 });
        }
        if (next >= maxSeconds) {
          toast.error("انتهى رصيد الباقة! سيتم إغلاق الجلسة تلقائياً.");
          setTimeout(() => endSession(), 2000);
          return maxSeconds;
        }
        return next;
      });
    };
    timerRef.current = window.setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [isTeacher, shouldCount, hasSubscription, subscriptionRemainingMinutes, sessionDuration, tenMinWarningShown, timeWarningShown]);

  // Teacher broadcasts authoritative anchor every 1s for tight sync
  useEffect(() => {
    if (!isTeacher || !shouldCount) return;
    const id = window.setInterval(() => {
      sendDataMessage({ type: "timer-sync", elapsed: elapsedRef.current, ts: Date.now(), paused: false });
    }, 1_000);
    return () => clearInterval(id);
  }, [isTeacher, shouldCount, sendDataMessage]);


  // Persist elapsed to localStorage every 5s (fail-safe for rejoin)
  useEffect(() => {
    if (!bookingId || !meetingStarted) return;
    const id = window.setInterval(() => {
      try {
        localStorage.setItem(
          `session_elapsed_${bookingId}`,
          JSON.stringify({ elapsed: elapsedRef.current, ts: Date.now() })
        );
      } catch {}
    }, 5_000);
    return () => clearInterval(id);
  }, [bookingId, meetingStarted]);

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

    // Check if session already has a started_at (rejoin scenario)
    const { data: existingSess } = await supabase
      .from("sessions")
      .select("started_at")
      .eq("booking_id", bookingId)
      .maybeSingle();

    const existingStartedAt = existingSess?.started_at;

    // Read locally persisted elapsed (respects pauses) — used on rejoin
    let persistedElapsed: number | null = null;
    try {
      const raw = localStorage.getItem(`session_elapsed_${bookingId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.elapsed === "number") persistedElapsed = parsed.elapsed;
      }
    } catch {}

    if (isTeacher) {
      let startedAtIso = existingStartedAt;
      if (!startedAtIso) {
        // First time starting - create new started_at
        startedAtIso = new Date().toISOString();
        await Promise.all([
          supabase.from("sessions").update({ started_at: startedAtIso }).eq("booking_id", bookingId),
          supabase.from("bookings").update({ session_status: "in_progress" }).eq("id", bookingId),
        ]);

        if (bookingData && user) {
          supabase.from("notifications").insert({
            user_id: bookingData.student_id,
            ...notificationTemplates.sessionStarted({
              teacherName: profile?.full_name || "معلمك",
            }),
          });
        }
      } else if (persistedElapsed !== null) {
        // Rejoin - restore exact elapsed from local persistence
        setElapsed(persistedElapsed);
        logEvent("rejoin_session", { role: "teacher", elapsed: persistedElapsed, source: "localStorage" });
      }
      setSessionStartedAt(startedAtIso);

      // Broadcast authoritative start time to student
      sendDataMessage({ type: "timer-start", startedAt: startedAtIso });
    } else {
      // Student: use authoritative started_at + persisted elapsed if available
      if (existingStartedAt) {
        setSessionStartedAt(existingStartedAt);
        if (persistedElapsed !== null) {
          setElapsed(persistedElapsed);
          logEvent("rejoin_session", { role: "student", elapsed: persistedElapsed, source: "localStorage" });
        }
        // Otherwise wait for teacher's `timer-sync` (sent on DataChannel ready)
      }
    }
  };

  // Open file inline (in-page modal) so the session tab remains visible
  // and the timer/visibility-based pause is NOT triggered.
  const openFileInNewTab = (url: string, name?: string, type?: string) => {
    const isPdf = type === "application/pdf" || (!!name && name.toLowerCase().endsWith(".pdf"));
    const isImg = !!type && type.startsWith("image/");
    setFilePreview({
      url,
      name: name || (isPdf ? "ملف PDF" : isImg ? "صورة" : "ملف"),
      type: isPdf ? "pdf" : "image",
    });
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const uploadChatFile = async (file: File) => {
    if (!bookingId || !user) return;
    const isAudio = file.type.startsWith("audio/");
    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!isAudio && !allowedTypes.includes(file.type)) {
      toast.error("يُسمح فقط بملفات PDF و JPG و PNG والرسائل الصوتية");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الملف يجب أن لا يتجاوز 10 ميجابايت");
      return;
    }

    setFileUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const filePath = `${bookingId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-files")
        .upload(filePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(filePath);
      const safeContent = isAudio ? "🎤 رسالة صوتية" : `📎 ${file.name}`;
      const { error: msgError } = await supabase.from("chat_messages").insert({
        booking_id: bookingId,
        sender_id: user.id,
        content: safeContent,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_type: file.type,
      });
      if (msgError) throw msgError;
      toast.success(isAudio ? "تم إرسال الرسالة الصوتية" : "تم إرسال الملف بنجاح");
    } catch (err: any) {
      toast.error(err.message || "فشل في رفع الملف");
    } finally {
      setFileUploading(false);
    }
  };

  const handleChatFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadChatFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

  const markRecordingFailed = async (reason: string) => {
    if (!bookingId) return;
    try {
      const { data: sess } = await supabase.from("sessions").select("id, duration_minutes")
        .eq("booking_id", bookingId).maybeSingle();
      if (!sess) return;
      await supabase.from("session_materials")
        .update({ description: `مدة الحصة: ${sess.duration_minutes ?? 0} دقيقة — تعذّر حفظ تسجيل الفيديو (${reason})` })
        .eq("session_id", sess.id);
    } catch (e) { console.warn("markRecordingFailed:", e); }
  };

  const uploadRecording = async () => {
    const blob = getRecordingBlob();
    console.log("[uploadRecording] blob:", blob ? `${blob.size} bytes` : "null", "bookingId:", bookingId);
    if (!blob || blob.size === 0 || !bookingId || !user) {
      console.warn("[uploadRecording] Skipped - no blob/booking/user");
      toast.error("لم يتم العثور على فيديو للرفع");
      await markRecordingFailed("لم يبدأ التسجيل أو كان فارغاً");
      return;
    }
    setRecordingUploading(true);
    try {
      // Reuse the chunked-upload filename when available so the final
      // upload overwrites the same object instead of creating a duplicate.
      const fileName = chunkUploadFileNameRef.current
        || `${user.id}/${bookingId}_${Date.now()}.webm`;
      console.log("[uploadRecording] Uploading", blob.size, "bytes to:", fileName);
      const { error: uploadErr } = await supabase.storage
        .from("session-recordings")
        .upload(fileName, blob, { contentType: "video/webm", upsert: true });
      if (uploadErr) {
        console.error("[uploadRecording] Storage upload error:", uploadErr);
        throw uploadErr;
      }

      const { data: urlData } = supabase.storage.from("session-recordings").getPublicUrl(fileName);
      const { data: signedData } = await supabase.storage
        .from("session-recordings")
        .createSignedUrl(fileName, 60 * 60 * 24 * 7);
      const recordingUrl = signedData?.signedUrl || urlData.publicUrl;
      console.log("[uploadRecording] Recording URL:", recordingUrl);

      const { data: saveData, error: saveRecordingError } = await supabase.functions.invoke("save-session-recording", {
        body: { booking_id: bookingId, recording_url: recordingUrl },
      });

      if (saveRecordingError) {
        console.error("[uploadRecording] save-session-recording error:", saveRecordingError);
        throw saveRecordingError;
      }
      console.log("[uploadRecording] Saved successfully:", saveData);

      // Clear local backup once final upload is confirmed
      try {
        const { clearRecordingBackup } = await import("@/lib/recordingBackup");
        if (bookingId) await clearRecordingBackup(bookingId);
      } catch {}

      toast.success("تم حفظ تسجيل الحصة بنجاح ✅");
    } catch (error) {
      console.error("[uploadRecording] Failed:", error);
      toast.error("تعذر حفظ التسجيل: " + (error instanceof Error ? error.message : "خطأ غير معروف"));
      await markRecordingFailed(error instanceof Error ? error.message : "خطأ في الرفع");
    } finally {
      setRecordingUploading(false);
    }
  };

  const endSession = async () => {
    if (sessionEndingRef.current) return;
    sessionEndingRef.current = true;
    clearInterval(timerRef.current);
    // Clear local timer persistence — session is ending
    try { localStorage.removeItem(`session_elapsed_${bookingId}`); } catch {}

    // 1) Notify peer immediately so their side starts closing in parallel
    try { sendDataMessage({ type: "session-end", elapsed }); } catch {}
    // Also broadcast via Supabase Realtime in case DataChannel isn't connected
    try {
      sessionStatusChannelRef.current?.send({
        type: "broadcast",
        event: "session-end",
        payload: { elapsed, by: user?.id },
      });
    } catch {}

    // 2) Show success toast right away — UX feels instant
    toast.success("تم إنهاء الحصة ✅");

    const durationSeconds = elapsed;
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const isShortSession = durationMinutes < 5;
    const currentBookingId = bookingId;
    const currentBookingData = bookingData;
    const currentRemaining = subscriptionRemainingMinutes;
    const wasRecording = isRecording;
    const teacherSpeak = isTeacher ? teacherSpeakingSec : studentSpeakingSec;
    const studentSpeak = isTeacher ? studentSpeakingSec : teacherSpeakingSec;
    const msgCount = messages.length;
    const violations = violationCount;
    const questions = questionsDetected;

    // 3) CRITICAL: stop recording FIRST and grab blob before peer cleanup destroys streams
    if (wasRecording) {
      try { await stopRecording(); } catch (e) { console.error("stopRecording failed", e); }
    }

    // 4) Navigate IMMEDIATELY for instant UX — student goes to rating, teacher to dashboard
    if (isTeacher) {
      navigate("/teacher");
    } else {
      navigate(currentBookingId ? `/rating?booking=${currentBookingId}` : "/student");
    }

    // 5) Background: cleanup, DB updates, upload (non-blocking — page already navigated)
    void (async () => {
      const fastTasks: Promise<any>[] = [stop(), cleanupSession()];
      if (currentBookingId) {
        fastTasks.push(
          supabase.from("bookings")
            .update({ status: "completed", session_status: "completed" })
            .eq("id", currentBookingId) as any
        );
        const sessionUpdate: any = { ended_at: new Date().toISOString() };
        if (isTeacher) sessionUpdate.duration_minutes = durationMinutes;
        fastTasks.push(
          supabase.from("sessions")
            .update(sessionUpdate)
            .eq("booking_id", currentBookingId) as any
        );
      }
      await Promise.allSettled(fastTasks);
      try { logEvent("end_session", { elapsed_seconds: durationSeconds }); } catch {}

      if (!isShortSession) {
        try {
          const blob = getRecordingBlob();
          if (blob && blob.size > 0) {
            await uploadRecording();
          } else {
            await markRecordingFailed(wasRecording ? "لم يتم التقاط أي بيانات فيديو" : "لم يبدأ التسجيل");
          }
        } catch (e) { console.error("recording upload failed", e); }
      }
    })();

    // 6) Background: earnings, notifications, AI report (non-critical for video display)
    void (async () => {
      try {
        if (currentBookingId && currentBookingData && !isShortSession) {
          // Use the teacher's current hourly_rate; charge the FULL duration (seconds-precise)
          let hourlyRate = 0;
          try {
            const { data: tp } = await supabase
              .from("teacher_profiles")
              .select("hourly_rate")
              .eq("user_id", currentBookingData.teacher_id)
              .maybeSingle();
            hourlyRate = Number(tp?.hourly_rate) || 0;
          } catch {}
          const teacherEarning = hourlyRate > 0
            ? Math.round((hourlyRate / 60) * (durationSeconds / 60) * 10) / 10
            : 0;
          await Promise.allSettled([
            supabase.from("bookings").update({ price: teacherEarning }).eq("id", currentBookingId),
            supabase.from("notifications").insert({
              user_id: currentBookingData.teacher_id,
              ...notificationTemplates.sessionCompletedTeacher({
                durationMinutes,
                earning: teacherEarning,
              }),
            }),
          ]);

          const newRemaining = Math.max(0, currentRemaining - durationMinutes);
          if (newRemaining <= 30) {
            await supabase.from("notifications").insert({
              user_id: currentBookingData.student_id,
              title: newRemaining <= 0 ? "انتهى رصيد باقتك 📋" : "⚠️ رصيد الباقة منخفض!",
              body: newRemaining <= 0 ? "نفد رصيد باقتك. جدد باقتك للاستمرار." : `متبقي ${newRemaining} دقيقة فقط. جدد باقتك.`,
              type: newRemaining <= 0 ? "subscription_expired" : "subscription_warning",
            });
          }
        }

        if (currentBookingId) {
          try {
            await supabase.functions.invoke("session-report", { body: {
              booking_id: currentBookingId,
              session_stats: {
                teacher_speaking_seconds: teacherSpeak,
                student_speaking_seconds: studentSpeak,
                messages_count: msgCount,
                violation_count: violations,
                duration_minutes: durationMinutes,
                is_short_session: isShortSession,
                questions_detected: questions,
              }
            }});
          } catch { /* report can be regenerated later */ }
        }

        // Notify students who recently asked this teacher for an instant session that they're now free
        if (isTeacher && currentBookingData) {
          try {
            const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
            const { data: waiters } = await supabase
              .from("notifications")
              .select("user_id")
              .eq("type", "info")
              .gte("created_at", since)
              .ilike("body", `%${currentBookingData.teacher_id ? "" : ""}%`);
            // Simpler: notify the student of the just-finished booking
            await supabase.from("notifications").insert({
              user_id: currentBookingData.student_id,
              title: "✅ المعلم متاح الآن",
              body: "انتهت جلسة المعلم وهو متاح الآن لاستقبال جلسة جديدة.",
              type: "info",
            });
          } catch {}
        }
      } catch (e) {
        console.error("Background end-session tasks failed:", e);
      }
    })();
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

  // Auto open/close floating annotation toolbar when teacher toggles screen share
  useEffect(() => {
    if (isTeacher && screenSharing) setScreenToolbarOpen(true);
    if (!screenSharing) { setScreenToolbarOpen(false); setScreenAnnotations([]); }
  }, [screenSharing, isTeacher]);

  // Callback to pass to whiteboard for sending data
  const handleWhiteboardSend = useCallback((msg: any) => {
    sendDataMessage(msg);
  }, [sendDataMessage]);


  return (
    <div className="h-screen bg-foreground flex flex-col">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Top Bar */}
      <div className={`flex items-center justify-between px-3 py-2 bg-gradient-to-l from-foreground via-foreground/95 to-foreground border-b border-card/10 backdrop-blur-xl transition-all duration-300 ${isFullscreen && !isTeacher ? (uiVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none absolute top-0 inset-x-0 z-40") : ""}`}>
        {/* Right section - Session info */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
              <Users className="h-4.5 w-4.5 text-white" />
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-foreground ${connectionState === "connected" ? "bg-green-400" : connectionState === "connecting" ? "bg-yellow-400 animate-pulse" : "bg-muted-foreground"}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-card truncate max-w-[180px]">{displayTitle}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium ${connBadge.color}`}>
                <connBadge.icon className="h-2.5 w-2.5" />
                {connBadge.text}
              </span>
              {connectionState === "connected" && (
                <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                  iceTransportType === "TURN Relay" ? "text-blue-400 bg-blue-400/10" :
                  iceTransportType === "STUN" ? "text-cyan-400 bg-cyan-400/10" :
                  iceTransportType.startsWith("Direct") ? "text-green-400 bg-green-400/10" :
                  "text-muted-foreground bg-muted/30"
                }`}>
                  {iceTransportType === "TURN Relay" ? "🔁" : iceTransportType === "STUN" ? "🌐" : "⚡"} {iceTransportType}
                </span>
              )}
              {connectionState === "connected" && connectionQuality.level !== "disconnected" && (
                <span
                  title={`RTT: ${connectionQuality.rtt ?? 0}ms | Loss: ${((connectionQuality.packetLoss ?? 0) * 100).toFixed(1)}% | ${connectionQuality.bitrate ?? 0}kbps`}
                  className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                    connectionQuality.level === "excellent" ? "text-green-400 bg-green-400/10" :
                    connectionQuality.level === "good" ? "text-emerald-400 bg-emerald-400/10" :
                    connectionQuality.level === "fair" ? "text-yellow-400 bg-yellow-400/10" :
                    "text-red-400 bg-red-400/10 animate-pulse"
                  }`}
                >
                  {connectionQuality.level === "excellent" ? "📶 ممتاز" :
                   connectionQuality.level === "good" ? "📶 جيد" :
                   connectionQuality.level === "fair" ? "📶 متوسط" : "⚠️ ضعيف"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center section - Timer & Status */}
        <div className="flex items-center gap-2">
          {meetingStarted ? (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-1.5 border ${meetingStarted && bothJoined && !shouldCount ? "bg-orange-500/10 border-orange-500/30" : "bg-card/5 border-card/10"}`}>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-card/40 font-medium">
                  {meetingStarted && bothJoined && !shouldCount ? "⏸ متوقف مؤقتاً" : "الوقت المنقضي"}
                </span>
                <span className={`text-sm font-mono font-bold ${meetingStarted && bothJoined && !shouldCount ? "text-orange-400" : "text-card"}`}>
                  {!bothJoined ? "⏳" : formatTime(elapsed)}
                </span>
              </div>
              <div className="w-px h-6 bg-card/10" />
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-card/40 font-medium">المتبقي</span>
                <span className={`text-sm font-mono font-bold ${getRemainingColor()}`}>
                  {getRemainingTime()}
                </span>
              </div>
              {hasSubscription && (
                <>
                  <div className="w-px h-6 bg-card/10" />
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-card/40 font-medium">رصيد الباقة</span>
                    <span className="text-sm font-mono font-bold text-secondary">
                      {getRemainingMinutesValue()} <span className="text-[10px] font-normal">د</span>
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-card/40 font-medium">بانتظار بدء الجلسة...</span>
          )}
        </div>

        {/* Left section - Status badges & actions */}
        <div className="flex items-center gap-1.5">
          {isRecording && (
            <span
              title={
                uploadStatus === "synced" && lastUploadAt
                  ? `آخر رفع: ${new Date(lastUploadAt).toLocaleTimeString("ar")}`
                  : uploadStatus === "queued"
                    ? "تعذر الرفع — محفوظ محلياً للمحاولة لاحقاً"
                    : uploadStatus === "uploading"
                      ? "جاري الرفع..."
                      : "التسجيل نشط"
              }
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg font-bold border ${
                uploadStatus === "queued"
                  ? "bg-orange-500/15 text-orange-400 border-orange-500/30 animate-pulse-soft"
                  : "bg-destructive/15 text-destructive border-destructive/20 animate-pulse-soft"
              }`}
            >
              <span className={`w-2 h-2 rounded-full animate-pulse ${uploadStatus === "queued" ? "bg-orange-400" : "bg-destructive"}`} />
              REC
              {uploadStatus === "uploading" && <Loader2 className="h-3 w-3 animate-spin" />}
              {uploadStatus === "synced" && <span className="text-[9px] opacity-70">✓</span>}
              {uploadStatus === "queued" && <span className="text-[9px]">⏳</span>}
            </span>
          )}
          {recordingUploading && (
            <span className="flex items-center gap-1.5 text-[11px] bg-secondary/15 text-secondary px-2.5 py-1 rounded-lg font-bold border border-secondary/20">
              <Loader2 className="h-3 w-3 animate-spin" /> جاري الرفع النهائي
            </span>
          )}
          {violationCount > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] bg-destructive/15 text-destructive px-2.5 py-1 rounded-lg font-bold border border-destructive/20">
              <ShieldAlert className="h-3 w-3" />
              {violationCount}
            </span>
          )}
          {isMutedBySystem && (
            <span className="flex items-center gap-1.5 text-[11px] bg-destructive/20 text-destructive px-2.5 py-1 rounded-lg font-bold animate-pulse-soft border border-destructive/30">
              <VolumeX className="h-3 w-3" />
              {muteCountdown}ث
            </span>
          )}
          {connectionState === "failed" && isTeacher && (
            <Button size="sm" variant="ghost" className="text-orange-400 hover:text-orange-300 gap-1 h-7 text-[11px] rounded-lg" onClick={restartConnection}>
              <RefreshCw className="h-3 w-3" /> إعادة
            </Button>
          )}
          {isTeacher && bookingId && (connectionState === "failed" || connectionState === "disconnected") && (
            <CallStudentButton
              bookingId={bookingId}
              variant="outline"
              size="sm"
              className="h-7 text-[11px] rounded-lg bg-card/10 border-card/20 text-card hover:bg-card/20"
            />
          )}
          {isTeacher && (
            <Button size="icon" variant="ghost" className="text-card/50 hover:text-card hover:bg-card/10 h-8 w-8 rounded-lg" onClick={() => setShowReport(!showReport)}>
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

      {/* Compact indicator for student - small badge that doesn't obscure content */}
      <AnimatePresence>
        {!isTeacher && remoteScreenSharing && !boardOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-14 right-3 z-30 bg-primary/70 backdrop-blur-sm text-primary-foreground px-2 py-0.5 rounded-full shadow flex items-center gap-1 text-[10px] font-medium"
          >
            <Monitor className="h-3 w-3" />
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
                      {meetingStarted ? (
                        <>
                          <div className="w-24 h-24 rounded-full bg-secondary/10 backdrop-blur-sm mx-auto mb-4 flex items-center justify-center border-2 border-secondary/30">
                            <Loader2 className="h-12 w-12 text-secondary animate-spin" />
                          </div>
                          <p className="text-card/90 font-bold text-lg mb-1">جاري إعادة الاتصال بالجلسة...</p>
                          <p className="text-card/50 text-sm">يتم استعادة الاتصال مع {otherName}</p>
                        </>
                      ) : (
                        <>
                          <div className="w-24 h-24 rounded-3xl bg-card/10 backdrop-blur-sm mx-auto mb-4 flex items-center justify-center border border-card/10 animate-pulse">
                            <Users className="h-12 w-12 text-card/40" />
                          </div>
                          <p className="text-card/80 font-bold text-lg mb-1">في انتظار {otherName}</p>
                          <p className="text-card/50 text-sm">سيتم الاتصال تلقائياً عند انضمامه...</p>
                        </>
                      )}
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
              <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={(el) => { if (el) setTimeout(() => el.scrollTop = el.scrollHeight, 50); }}>
                {messages.map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.5) }} className={`${m.me ? "mr-auto" : "ml-auto"} max-w-[80%]`}>
                    <div className={`p-3 rounded-2xl text-sm ${m.me ? "bg-secondary/10 text-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                      {!m.me && <p className="text-xs font-bold mb-1 text-secondary">{m.sender}</p>}
                      <p>{m.text}</p>
                      {m.fileUrl && m.fileType?.startsWith("image/") && (
                        <div className="mt-2">
                          <button type="button" onClick={() => openFileInNewTab(m.fileUrl!, m.fileName, m.fileType)} className="block">
                            <img src={m.fileUrl} alt={m.fileName || "صورة"} className="max-w-[200px] rounded-lg border border-border/30" loading="lazy" />
                          </button>
                          <button type="button" onClick={() => downloadFile(m.fileUrl!, m.fileName || "image")} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-1">
                            <Download className="h-3 w-3" /> تحميل
                          </button>
                        </div>
                      )}
                      {m.fileUrl && (m.fileType === "application/pdf" || m.fileName?.endsWith(".pdf")) && (
                        <div className="mt-2 flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1.5">
                          <FileText className="h-4 w-4 shrink-0 text-destructive" />
                          <span className="text-xs truncate flex-1">{m.fileName || "PDF"}</span>
                          <button type="button" onClick={() => openFileInNewTab(m.fileUrl!, m.fileName, m.fileType)} className="text-[11px] underline text-primary shrink-0">فتح</button>
                          <button type="button" onClick={() => downloadFile(m.fileUrl!, m.fileName || "file.pdf")} className="shrink-0 text-primary">
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      {m.fileUrl && m.fileType?.startsWith("audio/") && (
                        <VoicePlayer url={m.fileUrl} fileName={m.fileName} />
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
                  accept=".pdf,.jpg,.jpeg,.png,.webm,.m4a,audio/*"
                  className="hidden"
                  onChange={handleChatFileUpload}
                />
                {isChatBlocked ? (
                  <div className="flex items-center gap-2 justify-center text-destructive text-sm font-bold py-2">
                    <VolumeX className="h-4 w-4" />
                    الدردشة محظورة مؤقتاً ({muteCountdown}ث)
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10 rounded-xl shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={fileUploading}
                    >
                      {fileUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </Button>
                    <VoiceRecorder onRecorded={uploadChatFile} disabled={fileUploading} />
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
      <div className={`flex items-center justify-center gap-2 md:gap-2.5 px-4 py-3 glass-strong border-t border-border/10 transition-all duration-300 ${isFullscreen && !isTeacher ? (uiVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none absolute bottom-0 inset-x-0 z-40") : ""}`}>
        {/* Teacher controls */}
        {isTeacher && (
          <>
            <Button size="icon" className={`rounded-full h-11 w-11 shadow-md hover:scale-105 active:scale-95 transition-all duration-200 ${micEnabled ? "bg-card/15 hover:bg-card/25 text-card border-0 ring-1 ring-card/20" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0 ring-2 ring-destructive/40"}`} onClick={toggleMic} title={micEnabled ? "كتم الميكروفون" : "تشغيل الميكروفون"}>
              {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            <Button size="icon" className={`rounded-full h-11 w-11 shadow-md hover:scale-105 active:scale-95 transition-all duration-200 ${screenSharing ? "gradient-cta text-secondary-foreground shadow-button border-0 ring-2 ring-secondary/40" : "bg-card/15 hover:bg-card/25 text-card border-0 ring-1 ring-card/20"}`} onClick={toggleScreenShare} disabled={!meetingStarted} title="مشاركة الشاشة">
              <Monitor className="h-5 w-5" />
            </Button>
            <Button size="icon" className={`rounded-full h-11 w-11 shadow-md hover:scale-105 active:scale-95 transition-all duration-200 ${boardOpen ? "gradient-cta text-secondary-foreground shadow-button border-0 ring-2 ring-secondary/40" : "bg-card/15 hover:bg-card/25 text-card border-0 ring-1 ring-card/20"}`} onClick={() => { const next = !boardOpen; setBoardOpen(next); setShowReport(false); sendDataMessage({ type: "whiteboard-toggle", open: next }); }} disabled={!meetingStarted} title="السبورة">
              <PenTool className="h-5 w-5" />
            </Button>
          </>
        )}

        {/* Chat - for both */}
        <Button size="icon" className={`rounded-full h-11 w-11 shadow-md hover:scale-105 active:scale-95 transition-all duration-200 relative ${chatOpen ? "gradient-cta text-secondary-foreground shadow-button border-0 ring-2 ring-secondary/40" : "bg-card/15 hover:bg-card/25 text-card border-0 ring-1 ring-card/20"}`} onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) setUnreadCount(0); }} title="الدردشة">
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
            <Button size="icon" className={`rounded-full h-11 w-11 shadow-md hover:scale-105 active:scale-95 transition-all duration-200 ${micEnabled ? "bg-card/15 hover:bg-card/25 text-card border-0 ring-1 ring-card/20" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0 ring-2 ring-destructive/40"}`} onClick={toggleMic} title={micEnabled ? "كتم" : "تشغيل"}>
              {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            <Button size="icon" className={`rounded-full h-11 w-11 shadow-md hover:scale-105 active:scale-95 transition-all duration-200 ${isFullscreen ? "gradient-cta text-secondary-foreground shadow-button border-0 ring-2 ring-secondary/40" : "bg-card/15 hover:bg-card/25 text-card border-0 ring-1 ring-card/20"}`} onClick={toggleFullscreen} title={isFullscreen ? "إلغاء ملء الشاشة" : "ملء الشاشة"}>
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </Button>
            <Button size="icon" className={`rounded-full h-11 w-11 shadow-md hover:scale-105 active:scale-95 transition-all duration-200 ${handRaised ? "bg-gold text-gold-foreground border-0 ring-2 ring-gold/40" : "bg-card/15 hover:bg-card/25 text-card border-0 ring-1 ring-card/20"}`} onClick={() => { const next = !handRaised; setHandRaised(next); try { sendDataMessage({ type: "hand-raise", raised: next }); } catch {} }} title="رفع اليد">
              <Hand className="h-5 w-5" />
            </Button>
          </>
        )}

        {/* Teacher extra controls */}
        {isTeacher && (
          <>
            <Button size="icon" className={`rounded-full h-11 w-11 shadow-md hover:scale-105 active:scale-95 transition-all duration-200 ${showReport ? "gradient-cta text-secondary-foreground shadow-button border-0 ring-2 ring-secondary/40" : "bg-card/15 hover:bg-card/25 text-card border-0 ring-1 ring-card/20"}`} onClick={() => { setShowReport(!showReport); setBoardOpen(false); setAiAssistantOpen(false); }} title="التقرير">
              <FileText className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              className={`rounded-full h-11 w-11 shadow-md hover:scale-105 active:scale-95 transition-all duration-200 ${aiAssistantOpen ? "gradient-cta text-secondary-foreground shadow-button border-0 ring-2 ring-secondary/40" : "bg-card/15 hover:bg-card/25 text-card border-0 ring-1 ring-card/20"}`}
              onClick={() => { setAiAssistantOpen(!aiAssistantOpen); setShowReport(false); setBoardOpen(false); }}
              disabled={!meetingStarted}
              title="المساعد الذكي"
            >
              <Brain className="h-5 w-5" />
            </Button>
            {/* تم إلغاء زر التسجيل اليدوي بناءً على طلب المستخدم */}
          </>
        )}

        {/* Visual divider before end-call */}
        <div className="w-px h-8 bg-card/15 mx-1" />

        {/* End call */}
        <Button size="icon" className="rounded-full h-12 w-12 bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0 shadow-lg shadow-destructive/30 hover:scale-105 active:scale-95 transition-all duration-200 ring-2 ring-destructive/30" onClick={endSession} title="إنهاء الحصة">
          <Phone className="h-5 w-5 rotate-[135deg]" />
        </Button>
      </div>

      {/* In-page File Preview Modal — keeps session tab visible (no timer pause) */}
      {filePreview && (
        <div className="fixed inset-0 z-[100] bg-foreground/80 backdrop-blur-sm flex flex-col" dir="rtl">
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-card border-b">
            <div className="flex items-center gap-2 min-w-0">
              {filePreview.type === "pdf" ? <FileText className="h-5 w-5 text-destructive shrink-0" /> : <ImageIcon className="h-5 w-5 text-primary shrink-0" />}
              <span className="text-sm font-medium truncate">{filePreview.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => downloadFile(filePreview.url, filePreview.name)} className="rounded-xl">
                <Download className="h-4 w-4 ml-1" /> تحميل
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFilePreview(null)} className="rounded-xl">إغلاق ✕</Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-muted/30 flex items-center justify-center p-2">
            {filePreview.type === "pdf" ? (
              <iframe src={filePreview.url} className="w-full h-full bg-card rounded-lg" title={filePreview.name} />
            ) : (
              <img src={filePreview.url} alt={filePreview.name} className="max-w-full max-h-full object-contain rounded-lg" />
            )}
          </div>
        </div>
      )}

      {/* Screen-share annotation toolbar removed per request — keeps the shared screen clean */}
    </div>
  );
};

export default LiveSession;
