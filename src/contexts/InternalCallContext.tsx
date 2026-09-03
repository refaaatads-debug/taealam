import {
  createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Check, Loader2, Mic, MicOff, Phone, PhoneCall, PhoneIncoming, PhoneOff, X,
} from "lucide-react";

type InternalCallStatus =
  | "ringing" | "connecting" | "connected" | "rejected" | "busy"
  | "cancelled" | "missed" | "ended" | "failed";

type InternalCall = {
  id: string;
  caller_id: string;
  callee_id: string;
  booking_id: string | null;
  status: InternalCallStatus;
  expires_at: string;
  max_ends_at: string | null;
  connected_at: string | null;
  end_reason: string | null;
  duration_seconds: number;
  created_at: string;
};

type StartCallInput = {
  studentId: string;
  bookingId: string;
  studentName?: string;
};

type InternalCallContextValue = {
  startInternalCall: (input: StartCallInput) => Promise<{ success: boolean; code?: string; message?: string }>;
  hasActiveCall: boolean;
};

const InternalCallContext = createContext<InternalCallContextValue | null>(null);
const TERMINAL: InternalCallStatus[] = ["rejected", "busy", "cancelled", "missed", "ended", "failed"];

const formatTime = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, "0")}:${(Math.max(0, seconds) % 60).toString().padStart(2, "0")}`;

async function getIceConfig(): Promise<RTCConfiguration> {
  try {
    const { data, error } = await supabase.functions.invoke("turn-credentials");
    if (error || !data?.iceServers?.length) throw error || new Error("TURN unavailable");
    return { iceServers: data.iceServers, bundlePolicy: "max-bundle", iceCandidatePoolSize: 6 };
  } catch {
    return {
      iceServers: [
        { urls: "stun:ajyal.app:3478" },
        { urls: "stun:stun.l.google.com:19302" },
      ],
    };
  }
}

export const useInternalCall = () => {
  const context = useContext(InternalCallContext);
  if (!context) throw new Error("useInternalCall must be used inside InternalCallProvider");
  return context;
};

export function InternalCallProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [call, setCall] = useState<InternalCall | null>(null);
  const [otherPartyName, setOtherPartyName] = useState("الطرف الآخر");
  const [remaining, setRemaining] = useState(0);
  const [muted, setMuted] = useState(false);
  const [peerState, setPeerState] = useState<RTCPeerConnectionState>("new");
  const [ending, setEnding] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const signalChannelRef = useRef<any>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const offerStartedRef = useRef(false);
  const markedConnectedRef = useRef(false);
  const ringtoneContextRef = useRef<AudioContext | null>(null);
  const ringtoneTimerRef = useRef<number | null>(null);
  const voiceAnnouncementTimerRef = useRef<number | null>(null);
  const voiceAnnouncementCallRef = useRef<string | null>(null);
  const incomingCallRef = useRef<string | null>(null);
  const clearCallTimerRef = useRef<number | null>(null);

  const isCaller = Boolean(call && user && call.caller_id === user.id);
  const isIncoming = Boolean(call && user && call.callee_id === user.id && call.status === "ringing");

  const stopRingtone = useCallback(() => {
    if (ringtoneTimerRef.current) window.clearInterval(ringtoneTimerRef.current);
    ringtoneTimerRef.current = null;
    ringtoneContextRef.current?.close().catch(() => {});
    ringtoneContextRef.current = null;
  }, []);

  const playIncomingRingtone = useCallback(() => {
    stopRingtone();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const context: AudioContext = new AudioCtx();
      ringtoneContextRef.current = context;
      const playPattern = () => {
        [0, 0.22, 0.54].forEach((offset, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = index === 1 ? "sine" : "triangle";
          oscillator.frequency.value = index === 1 ? 740 : 620;
          gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + offset + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.18);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(context.currentTime + offset);
          oscillator.stop(context.currentTime + offset + 0.2);
        });
      };
      context.resume().then(playPattern).catch(() => {});
      ringtoneTimerRef.current = window.setInterval(playPattern, 2200);
    } catch (error) {
      console.warn("Incoming ringtone unavailable:", error);
    }
  }, [stopRingtone]);

  const stopIncomingAnnouncement = useCallback(() => {
    if (voiceAnnouncementTimerRef.current) window.clearInterval(voiceAnnouncementTimerRef.current);
    voiceAnnouncementTimerRef.current = null;
    voiceAnnouncementCallRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const playIncomingAnnouncement = useCallback((callId: string, teacherName: string) => {
    if (!("speechSynthesis" in window)) return;
    if (voiceAnnouncementCallRef.current === callId && voiceAnnouncementTimerRef.current) return;

    stopIncomingAnnouncement();
    voiceAnnouncementCallRef.current = callId;
    const text = `لديك اتصال وارد من المعلم، ${teacherName.trim() || "المعلم"}.`;

    const speak = () => {
      const synthesis = window.speechSynthesis;
      if (!synthesis) return;
      synthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ar-SA";
      utterance.volume = 1;
      utterance.rate = 0.82;
      utterance.pitch = 1;
      const voices = synthesis.getVoices();
      const arabicVoice = voices.find((voice) => voice.lang.toLowerCase() === "ar-sa")
        || voices.find((voice) => voice.lang.toLowerCase().startsWith("ar"));
      if (arabicVoice) utterance.voice = arabicVoice;
      synthesis.resume();
      synthesis.speak(utterance);
    };

    // يبدأ فورًا ثم يتكرر أثناء الرنين دون تداخل بين الجمل.
    speak();
    voiceAnnouncementTimerRef.current = window.setInterval(speak, 6500);
  }, [stopIncomingAnnouncement]);

  const stopMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setMuted(false);
  }, []);

  const cleanupPeer = useCallback(() => {
    if (signalChannelRef.current) supabase.removeChannel(signalChannelRef.current);
    signalChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    pendingCandidatesRef.current = [];
    offerStartedRef.current = false;
    markedConnectedRef.current = false;
    setPeerState("new");
  }, []);

  const ensureMicrophone = useCallback(async () => {
    if (localStreamRef.current?.active) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("المتصفح لا يدعم المكالمات الصوتية");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      localStreamRef.current = stream;
      return stream;
    } catch {
      throw new Error("يلزم السماح باستخدام الميكروفون لإجراء الاتصال الداخلي");
    }
  }, []);

  const loadOtherPartyName = useCallback(async (row: InternalCall) => {
    const fallback = row.caller_id === user?.id ? "الطالب" : "المعلم";
    if (!user) return fallback;
    const otherId = row.caller_id === user.id ? row.callee_id : row.caller_id;
    const { data } = await supabase.from("public_profiles").select("full_name").eq("user_id", otherId).maybeSingle();
    const name = data?.full_name?.trim() || fallback;
    setOtherPartyName(name);
    return name;
  }, [user?.id]);

  const applyCallUpdate = useCallback((row: InternalCall) => {
    if (!user || (row.caller_id !== user.id && row.callee_id !== user.id)) return;
    setCall((current) => {
      if (current && current.id !== row.id && !TERMINAL.includes(current.status)) return current;
      return row;
    });
    if (row.callee_id === user.id && row.status === "ringing") {
      incomingCallRef.current = row.id;
      playIncomingRingtone();
      void loadOtherPartyName(row).then((teacherName) => {
        if (teacherName && incomingCallRef.current === row.id) playIncomingAnnouncement(row.id, teacherName);
      });
    } else {
      incomingCallRef.current = null;
      stopRingtone();
      stopIncomingAnnouncement();
      void loadOtherPartyName(row);
    }

    if (TERMINAL.includes(row.status)) {
      cleanupPeer();
      stopMedia();
      if (clearCallTimerRef.current) window.clearTimeout(clearCallTimerRef.current);
      clearCallTimerRef.current = window.setTimeout(() => setCall((current) => current?.id === row.id ? null : current), 2800);
    }
  }, [user?.id, cleanupPeer, loadOtherPartyName, playIncomingAnnouncement, playIncomingRingtone, stopIncomingAnnouncement, stopMedia, stopRingtone]);

  useEffect(() => {
    if (!user) {
      setCall(null);
      stopRingtone();
      stopIncomingAnnouncement();
      cleanupPeer();
      stopMedia();
      return;
    }
    let disposed = false;
    (async () => {
      await (supabase as any).rpc("expire_internal_calls");
      const { data } = await (supabase as any)
        .from("internal_calls")
        .select("*")
        .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
        .in("status", ["ringing", "connecting", "connected"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!disposed && data) applyCallUpdate(data as InternalCall);
    })();

    const handlePayload = (payload: any) => payload.new?.id && applyCallUpdate(payload.new as InternalCall);
    const incomingChannel = supabase
      .channel(`internal-calls-incoming-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_calls", filter: `callee_id=eq.${user.id}` }, handlePayload)
      .subscribe();
    const outgoingChannel = supabase
      .channel(`internal-calls-outgoing-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_calls", filter: `caller_id=eq.${user.id}` }, handlePayload)
      .subscribe();
    return () => {
      disposed = true;
      supabase.removeChannel(incomingChannel);
      supabase.removeChannel(outgoingChannel);
    };
  }, [user?.id, applyCallUpdate, cleanupPeer, stopIncomingAnnouncement, stopMedia, stopRingtone]);

  const startInternalCall = useCallback(async ({ studentId, bookingId, studentName }: StartCallInput) => {
    if (!user) return { success: false, code: "UNAUTHENTICATED", message: "سجّل الدخول أولًا" };
    if (call && !TERMINAL.includes(call.status)) return { success: false, code: "USER_BUSY", message: "لديك مكالمة أخرى جارية" };
    try {
      await ensureMicrophone();
      const { data, error } = await (supabase as any).rpc("start_internal_call", {
        p_student_id: studentId,
        p_booking_id: bookingId,
      });
      if (error) throw error;
      if (!data?.success) {
        stopMedia();
        return { success: false, code: data?.code, message: data?.message || "تعذر بدء الاتصال" };
      }
      setOtherPartyName(studentName || "الطالب");
      applyCallUpdate(data.call as InternalCall);
      return { success: true };
    } catch (error) {
      stopMedia();
      return { success: false, code: "ERROR", message: error instanceof Error ? error.message : "تعذر بدء الاتصال" };
    }
  }, [user?.id, call, applyCallUpdate, ensureMicrophone, stopMedia]);

  const respond = useCallback(async (accept: boolean) => {
    if (!call) return;
    try {
      if (accept) await ensureMicrophone();
      const { data, error } = await (supabase as any).rpc("respond_internal_call", {
        p_call_id: call.id,
        p_accept: accept,
      });
      if (error) throw error;
      if (!data?.success) {
        stopMedia();
        toast.error(data?.message || "تعذر الرد على المكالمة");
        if (data?.call) applyCallUpdate(data.call);
        return;
      }
      applyCallUpdate(data.call as InternalCall);
    } catch (error) {
      stopMedia();
      toast.error(error instanceof Error ? error.message : "تعذر استخدام الميكروفون");
    }
  }, [call, applyCallUpdate, ensureMicrophone, stopMedia]);

  const endCall = useCallback(async (reason = "participant_ended") => {
    if (!call || ending) return;
    setEnding(true);
    stopRingtone();
    stopIncomingAnnouncement();
    cleanupPeer();
    stopMedia();
    try {
      const { data } = await (supabase as any).rpc("end_internal_call", { p_call_id: call.id, p_reason: reason });
      if (data?.call) applyCallUpdate(data.call as InternalCall);
    } finally {
      setEnding(false);
    }
  }, [call, ending, applyCallUpdate, cleanupPeer, stopIncomingAnnouncement, stopMedia, stopRingtone]);

  useEffect(() => {
    if (!call || !user || !["connecting", "connected"].includes(call.status) || !localStreamRef.current) return;
    let disposed = false;
    let readyTimer: number | null = null;

    (async () => {
      cleanupPeer();
      const pc = new RTCPeerConnection(await getIceConfig());
      if (disposed) return pc.close();
      peerRef.current = pc;
      localStreamRef.current?.getAudioTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));
      const channel = supabase.channel(`internal-voice-${call.id}`, { config: { broadcast: { self: false } } });
      signalChannelRef.current = channel;

      const send = (signalType: string, payload: unknown = {}) =>
        channel.send({ type: "broadcast", event: "signal", payload: { signalType, payload, senderId: user.id } });

      const addOrQueueCandidate = async (candidate: RTCIceCandidateInit) => {
        if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {});
        else pendingCandidatesRef.current.push(candidate);
      };
      const flushCandidates = async () => {
        for (const candidate of pendingCandidatesRef.current.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
      };
      const createOffer = async () => {
        if (!isCaller || offerStartedRef.current || pc.signalingState !== "stable") return;
        offerStartedRef.current = true;
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        await send("offer", { sdp: pc.localDescription?.toJSON() });
      };

      pc.onicecandidate = (event) => event.candidate && send("ice", { candidate: event.candidate.toJSON() });
      pc.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.play().catch(() => {});
        }
      };
      pc.onconnectionstatechange = async () => {
        setPeerState(pc.connectionState);
        if (pc.connectionState === "connected" && !markedConnectedRef.current) {
          markedConnectedRef.current = true;
          const { data } = await (supabase as any).rpc("mark_internal_call_connected", { p_call_id: call.id });
          if (data?.call) applyCallUpdate(data.call as InternalCall);
        }
        if (pc.connectionState === "failed") endCall("connection_failed");
      };

      channel.on("broadcast", { event: "signal" }, async ({ payload }: any) => {
        if (!payload || payload.senderId === user.id) return;
        if (payload.signalType === "ready") {
          await createOffer();
        } else if (payload.signalType === "offer" && !isCaller) {
          await pc.setRemoteDescription(payload.payload.sdp);
          await flushCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await send("answer", { sdp: pc.localDescription?.toJSON() });
        } else if (payload.signalType === "answer" && isCaller && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(payload.payload.sdp);
          await flushCandidates();
        } else if (payload.signalType === "ice" && payload.payload?.candidate) {
          await addOrQueueCandidate(payload.payload.candidate);
        } else if (payload.signalType === "hangup") {
          endCall("remote_ended");
        }
      });

      channel.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (!isCaller) {
          send("ready");
          readyTimer = window.setInterval(() => {
            if (!pc.remoteDescription) send("ready");
            else if (readyTimer) window.clearInterval(readyTimer);
          }, 900);
        }
      });
    })().catch((error) => {
      console.error("Internal voice setup failed:", error);
      endCall("connection_failed");
    });

    return () => {
      disposed = true;
      if (readyTimer) window.clearInterval(readyTimer);
    };
  }, [call?.id, Boolean(call && ["connecting", "connected"].includes(call.status)), user?.id]);

  useEffect(() => {
    if (!call) return;
    const tick = async () => {
      const deadline = call.status === "ringing" ? call.expires_at : call.max_ends_at;
      if (!deadline || TERMINAL.includes(call.status)) return setRemaining(0);
      const seconds = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds <= 0) {
        const { data } = await (supabase as any).rpc("expire_internal_calls");
        if (data !== null) {
          const { data: latest } = await (supabase as any).from("internal_calls").select("*").eq("id", call.id).single();
          if (latest) applyCallUpdate(latest as InternalCall);
        }
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [call, applyCallUpdate]);

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };

  const terminalLabel: Partial<Record<InternalCallStatus, string>> = {
    rejected: "رفض الطالب المكالمة",
    busy: "الطالب مشغول حاليًا",
    cancelled: "تم إلغاء الاتصال",
    missed: "لم يتم الرد",
    ended: call?.end_reason === "time_limit" ? "انتهت مدة الدقيقتين" : "انتهت المكالمة",
    failed: "تعذر إنشاء الاتصال",
  };

  return (
    <InternalCallContext.Provider value={{ startInternalCall, hasActiveCall: Boolean(call && !TERMINAL.includes(call.status)) }}>
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      {call && (
        <div className="fixed bottom-20 left-4 right-4 z-[100] mx-auto max-w-sm md:bottom-6 md:left-6 md:right-auto" dir="rtl">
          <div className="overflow-hidden rounded-3xl border border-white/30 bg-[#102f55] text-white shadow-2xl shadow-slate-950/35">
            <div className="relative p-5">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,.28),transparent_48%)]" />
              <div className="relative">
                <div className="mb-5 flex items-center justify-between">
                  <Badge className="border-0 bg-white/12 text-white hover:bg-white/12">
                    <PhoneCall className="ml-1.5 h-3.5 w-3.5" /> اتصال داخلي
                  </Badge>
                  {!TERMINAL.includes(call.status) && (
                    <span className="font-mono text-sm font-black tabular-nums text-emerald-200">
                      {call.status === "ringing" ? `مهلة الرد ${formatTime(remaining)}` : formatTime(remaining)}
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-center text-center">
                  <div className={`relative ${isIncoming ? "animate-pulse" : ""}`}>
                    <span className="absolute -inset-3 rounded-full bg-emerald-400/15" />
                    <Avatar className="relative h-20 w-20 border-4 border-white/20">
                      <AvatarFallback className="bg-white/15 text-2xl font-black text-white">{otherPartyName.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                  </div>
                  <h3 className="mt-4 text-xl font-black">{otherPartyName}</h3>
                  <p aria-live={isIncoming ? "assertive" : "off"} className="mt-1 text-sm text-blue-100/80">
                    {isIncoming && `لديك اتصال وارد من المعلم، ${otherPartyName}`}
                    {call.status === "ringing" && isCaller && "جارٍ الاتصال بالطالب…"}
                    {call.status === "connecting" && "جارٍ إنشاء اتصال صوتي آمن…"}
                    {call.status === "connected" && (peerState === "connected" ? "المكالمة متصلة" : "جارٍ تثبيت الاتصال…")}
                    {TERMINAL.includes(call.status) && terminalLabel[call.status]}
                  </p>
                </div>

                {isIncoming ? (
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <Button onClick={() => respond(false)} className="h-12 rounded-2xl bg-rose-500 text-white hover:bg-rose-600"><X className="ml-2 h-5 w-5" />رفض</Button>
                    <Button onClick={() => respond(true)} className="h-12 rounded-2xl bg-emerald-500 text-white hover:bg-emerald-600"><Check className="ml-2 h-5 w-5" />قبول</Button>
                  </div>
                ) : !TERMINAL.includes(call.status) ? (
                  <div className="mt-6 flex items-center justify-center gap-4">
                    {call.status !== "ringing" && (
                      <Button size="icon" variant="secondary" onClick={toggleMute} className="h-12 w-12 rounded-full bg-white/12 text-white hover:bg-white/20">
                        {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                      </Button>
                    )}
                    <Button size="icon" onClick={() => endCall()} disabled={ending} className="h-14 w-14 rounded-full bg-rose-500 text-white hover:bg-rose-600">
                      {ending ? <Loader2 className="h-6 w-6 animate-spin" /> : <PhoneOff className="h-6 w-6" />}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-6 flex justify-center">
                    <Button variant="secondary" className="rounded-xl" onClick={() => setCall(null)}>إغلاق</Button>
                  </div>
                )}

                {call.status === "connected" && (
                  <p className="mt-4 text-center text-[11px] text-blue-100/65">تُغلق المكالمة تلقائيًا عند انتهاء دقيقتين</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </InternalCallContext.Provider>
  );
}