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
import CallStudentButton from "@/components/teacher/CallStudentButton";

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
    } else if (msg.type === "timer-start") {
      // Authoritative session start time from the teacher (source of truth)
      if (typeof msg.startedAt === "string") {
        setSessionStartedAt(msg.startedAt);
      }
    } else if (msg.type === "timer-sync") {
      // Authoritative accumulated seconds from teacher — student always adopts
      if (!isTeacher && typeof msg.elapsed === "number") {
        setElapsed((prev) => {
          // Accept any change > 1s (covers rejoin + drift correction)
          if (Math.abs(prev - msg.elapsed) > 1) return msg.elapsed;
          return prev;
        });
      }
    } else if (msg.type === "timer-request") {
      // Peer (re)joined and asks for current authoritative elapsed
      if (isTeacher) {
        sendDataMessage({ type: "timer-sync", elapsed: elapsedRef.current, paused: !shouldCountRef.current });
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

  // ───────────────────────────────────────────────────────────
  //  Precise Session Counter — Fail-safe accumulator
  // ───────────────────────────────────────────────────────────
  // Counts a second ONLY when ALL gates are open:
  //   • meetingStarted  • bothJoined           • !peerDisconnected
  //   • WebRTC connected • navigator.onLine    • document not hidden
  // Stops on tab switch, network loss, peer drop, page leave, or RTC failure.
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [isPageVisible, setIsPageVisible] = useState<boolean>(typeof document === "undefined" ? true : !document.hidden);
  const wasCountingRef = useRef(false);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); logEvent("network_online"); };
    const onOffline = () => { setIsOnline(false); logEvent("network_offline"); toast.warning("⚠️ انقطع الإنترنت — تم إيقاف العداد", { duration: 4000 }); };
    const onVis = () => {
      const visible = !document.hidden;
      setIsPageVisible(visible);
      logEvent(visible ? "page_visible" : "page_hidden");
    };
    // pagehide fires on back/forward nav and tab close — guarantees pause
    const onPageHide = () => { setIsPageVisible(false); logEvent("page_hide"); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [logEvent]);

  const shouldCount =
    meetingStarted &&
    bothJoined &&
    !peerDisconnected &&
    isOnline &&
    isPageVisible &&
    connectionState === "connected";
  shouldCountRef.current = shouldCount;

  // On (re)connection: sync timer between peers immediately
  useEffect(() => {
    if (!dataChannelReady || !meetingStarted) return;
    if (isTeacher) {
      // Teacher pushes authoritative elapsed to (re)joined peer
      sendDataMessage({ type: "timer-sync", elapsed: elapsedRef.current, paused: !shouldCountRef.current });
    } else {
      // Student requests authoritative elapsed from teacher
      sendDataMessage({ type: "timer-request" });
    }
  }, [dataChannelReady, meetingStarted, isTeacher, sendDataMessage]);

  // Log pause/resume transitions + broadcast to peer for UI parity
  useEffect(() => {
    if (!meetingStarted) return;
    if (shouldCount && !wasCountingRef.current) {
      wasCountingRef.current = true;
      logEvent("counter_resume", { elapsed });
      if (isTeacher) sendDataMessage({ type: "timer-sync", elapsed, paused: false });
    } else if (!shouldCount && wasCountingRef.current) {
      wasCountingRef.current = false;
      logEvent("counter_pause", {
        elapsed,
        reason: !isOnline ? "offline" : !isPageVisible ? "hidden" : peerDisconnected ? "peer_disconnect" : connectionState !== "connected" ? `rtc_${connectionState}` : "other",
      });
      if (isTeacher) sendDataMessage({ type: "timer-sync", elapsed, paused: true });
    }
  }, [shouldCount, meetingStarted, elapsed, isOnline, isPageVisible, peerDisconnected, connectionState, isTeacher, sendDataMessage, logEvent]);

  // Tick — single source of truth, drift-corrected via wall-clock delta
  useEffect(() => {
    if (!shouldCount) {
      clearInterval(timerRef.current);
      lastTickRef.current = 0;
      return;
    }
    lastTickRef.current = Date.now();
    const tick = () => {
      const now = Date.now();
      const deltaSec = lastTickRef.current ? Math.max(0, Math.round((now - lastTickRef.current) / 1000)) : 1;
      lastTickRef.current = now;
      // Cap delta at 5s to defeat any background-throttling overshoot
      const inc = Math.min(deltaSec || 1, 5);

      setElapsed((prev) => {
        const next = prev + inc;
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
  }, [shouldCount, hasSubscription, subscriptionRemainingMinutes, sessionDuration, tenMinWarningShown, timeWarningShown]);

  // Teacher periodically broadcasts authoritative elapsed for drift correction (10s)
  useEffect(() => {
    if (!isTeacher || !shouldCount) return;
    const id = window.setInterval(() => {
      sendDataMessage({ type: "timer-sync", elapsed, paused: false });
    }, 10_000);
    return () => clearInterval(id);
  }, [isTeacher, shouldCount, elapsed, sendDataMessage]);

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
            title: "الحصة بدأت! 🎓",
            body: `بدأ المعلم ${profile?.full_name || "معلمك"} الحصة الآن. انضم فوراً!`,
            type: "session",
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
      const fileName = `${user.id}/${bookingId}_${Date.now()}.webm`;
      const { error: uploadErr } = await supabase.storage
        .from("session-recordings")
        .upload(fileName, blob, { contentType: "video/webm", upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("session-recordings").getPublicUrl(fileName);
      const recordingUrl = urlData.publicUrl;

      const { error: saveRecordingError } = await supabase.functions.invoke("save-session-recording", {
        body: {
          booking_id: bookingId,
          recording_url: recordingUrl,
        },
      });

      if (saveRecordingError) throw saveRecordingError;

      toast.success("تم حفظ تسجيل الحصة بنجاح ✅");
    } catch (error) {
      console.error("Recording upload failed:", error);
      toast.error("تعذر حفظ التسجيل في المواد التعليمية");
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

    // 3) Critical, fast updates in parallel
    const fastTasks: Promise<any>[] = [stop(), cleanupSession()];
    if (currentBookingId) {
      fastTasks.push(
        supabase.from("bookings")
          .update({ status: "completed", session_status: "completed" })
          .eq("id", currentBookingId) as any
      );
      fastTasks.push(
        supabase.from("sessions")
          .update({ ended_at: new Date().toISOString() } as any)
          .eq("booking_id", currentBookingId) as any
      );
    }
    await Promise.allSettled(fastTasks);

    try { logEvent("end_session", { elapsed_seconds: durationSeconds }); } catch {}

    // 4) Navigate immediately — heavy work runs in background
    if (isTeacher) navigate("/teacher");
    else navigate(`/rating${currentBookingId ? `?booking=${currentBookingId}` : ""}`);

    // 5) Background: recording upload, earnings, notifications, AI report
    void (async () => {
      try {
        if (wasRecording) {
          try { await stopRecording(); } catch {}
          try {
            const blob = getRecordingBlob();
            if (blob) await uploadRecording();
          } catch (e) { console.error("recording upload failed", e); }
        }

        if (currentBookingId && currentBookingData && !isShortSession) {
          const teacherEarning = durationMinutes * 0.3;
          await Promise.allSettled([
            supabase.from("bookings").update({ price: teacherEarning }).eq("id", currentBookingId),
            supabase.from("notifications").insert({
              user_id: currentBookingData.teacher_id,
              title: "تم إضافة أرباح حصة ✅",
              body: `تمت إضافة ${teacherEarning.toFixed(1)} ر.س لرصيدك عن حصة مكتملة (${durationMinutes} دقيقة).`,
              type: "payment",
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

  // Callback to pass to whiteboard for sending data
  const handleWhiteboardSend = useCallback((msg: any) => {
    sendDataMessage(msg);
  }, [sendDataMessage]);


  return (
    <div className="h-screen bg-foreground flex flex-col">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-l from-foreground via-foreground/95 to-foreground border-b border-card/10 backdrop-blur-xl">
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
            <span className="flex items-center gap-1.5 text-[11px] bg-destructive/15 text-destructive px-2.5 py-1 rounded-lg font-bold animate-pulse-soft border border-destructive/20">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" /> REC
            </span>
          )}
          {recordingUploading && (
            <span className="flex items-center gap-1.5 text-[11px] bg-secondary/15 text-secondary px-2.5 py-1 rounded-lg font-bold border border-secondary/20">
              <Loader2 className="h-3 w-3 animate-spin" /> جاري الرفع
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
              <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={(el) => { if (el) setTimeout(() => el.scrollTop = el.scrollHeight, 50); }}>
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
