import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const buildIceServers = (): RTCConfiguration => {
  const expressUsername = import.meta.env.VITE_EXPRESSTURN_USERNAME || "000000002091120202";
  const expressPassword = import.meta.env.VITE_EXPRESSTURN_PASSWORD || "yMcCGKBanSb4GJyhvfTXoyVxOwM=";
  const meteredUsername = import.meta.env.VITE_METERED_USERNAME || "a2b6ebb5a402c8a088554c59";
  const meteredCredential = import.meta.env.VITE_METERED_CREDENTIAL || "5OhXqtII0C1GiILt";

  const iceServers: RTCIceServer[] = [
    // STUN servers (direct P2P attempts)
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },

    // Primary TURN: ExpressTURN
    {
      urls: "turn:free.expressturn.com:3478",
      username: expressUsername,
      credential: expressPassword,
    },

    // Fallback TURN: Metered (multiple ports/protocols for max reliability)
    {
      urls: "turn:global.relay.metered.ca:80",
      username: meteredUsername,
      credential: meteredCredential,
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: meteredUsername,
      credential: meteredCredential,
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: meteredUsername,
      credential: meteredCredential,
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: meteredUsername,
      credential: meteredCredential,
    },
  ];

  return { iceServers };
};

interface UseWebRTCOptions {
  bookingId: string;
  userId: string;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
  onRemoteJoin?: () => void;
  onRemoteLeave?: () => void;
  onDataMessage?: (msg: any) => void;
}

export function useWebRTC({
  bookingId,
  userId,
  onRemoteStream,
  onConnectionState,
  onRemoteJoin,
  onRemoteLeave,
  onDataMessage,
}: UseWebRTCOptions) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<any>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const makingOfferRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const onDataMessageRef = useRef(onDataMessage);
  onDataMessageRef.current = onDataMessage;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [dataChannelReady, setDataChannelReady] = useState(false);
  const [iceTransportType, setIceTransportType] = useState<string>("unknown");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const screenTransceiverRef = useRef<RTCRtpTransceiver | null>(null);
  // Always points to the latest active remote stream (audio+video) for recording
  const latestRemoteStreamRef = useRef<MediaStream | null>(null);
  const recordingHiddenVideoRef = useRef<HTMLVideoElement | null>(null);

  // Stable refs for callbacks
  const onRemoteStreamRef = useRef(onRemoteStream);
  onRemoteStreamRef.current = onRemoteStream;
  const onConnectionStateRef = useRef(onConnectionState);
  onConnectionStateRef.current = onConnectionState;
  const onRemoteJoinRef = useRef(onRemoteJoin);
  onRemoteJoinRef.current = onRemoteJoin;
  const onRemoteLeaveRef = useRef(onRemoteLeave);
  onRemoteLeaveRef.current = onRemoteLeave;

  const waitForChannelSubscription = useCallback((channel: any) => {
    return new Promise<any>((resolve, reject) => {
      let settled = false;
      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED" && !settled) {
          settled = true;
          resolve(channel);
        }
        if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !settled) {
          settled = true;
          reject(new Error(`Channel subscription failed: ${status}`));
        }
      });
    });
  }, []);

  const initLocalMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setVideoEnabled(false);
      return stream;
    } catch (err) {
      console.error("Failed to get user media:", err);
      return null;
    }
  }, []);

  const sendSignal = useCallback(async (signalType: string, payload: any) => {
    const channel = channelRef.current;
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event: "signal",
      payload: { bookingId, senderId: userId, signalType, payload },
    });
  }, [bookingId, userId]);

  // Send data via DataChannel
  const sendDataMessage = useCallback((msg: any) => {
    const dc = dataChannelRef.current;
    if (dc && dc.readyState === "open") {
      dc.send(JSON.stringify(msg));
    }
  }, []);

  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dataChannelRef.current = dc;
    dc.onopen = () => {
      console.log("DataChannel open");
      setDataChannelReady(true);
    };
    dc.onclose = () => {
      console.log("DataChannel closed");
      setDataChannelReady(false);
    };
    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        onDataMessageRef.current?.(msg);
      } catch {}
    };
  }, []);

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) pcRef.current.close();

    const pc = new RTCPeerConnection(buildIceServers());
    pcRef.current = pc;

    // Create DataChannel (only initiator creates it)
    const dc = pc.createDataChannel("session-data", { ordered: true });
    setupDataChannel(dc);

    // Receive DataChannel from remote
    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Pre-add a video transceiver for screen sharing (inactive by default)
    // This ensures stable m-line ordering across renegotiations
    const videoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });
    screenTransceiverRef.current = videoTransceiver;

    // Handle remote tracks
    const remote = new MediaStream();
    const syncRemoteStream = () => {
      const updated = new MediaStream(remote.getTracks());
      latestRemoteStreamRef.current = updated;
      // Update hidden recording <video> srcObject so canvas keeps capturing live frames
      if (recordingHiddenVideoRef.current) {
        recordingHiddenVideoRef.current.srcObject = updated;
        recordingHiddenVideoRef.current.play().catch(() => {});
      }
      setRemoteStream(updated);
      onRemoteStreamRef.current?.(updated);
    };

    latestRemoteStreamRef.current = remote;
    setRemoteStream(remote);

    pc.ontrack = (event) => {
      const incomingTracks = event.streams[0]?.getTracks().length
        ? event.streams[0].getTracks()
        : [event.track];

      incomingTracks.forEach((track) => {
        const exists = remote.getTracks().some((existingTrack) => existingTrack.id === track.id);
        if (!exists) {
          remote.addTrack(track);
        }

        track.addEventListener("unmute", syncRemoteStream);
        track.addEventListener("mute", syncRemoteStream);
        track.addEventListener("ended", () => {
          remote.getTracks().forEach((existingTrack) => {
            if (existingTrack.id === track.id) {
              remote.removeTrack(existingTrack);
            }
          });
          syncRemoteStream();
        });
      });

      syncRemoteStream();
    };

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await sendSignal("ice-candidate", { candidate: event.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setConnectionState(state);
      onConnectionStateRef.current?.(state);
      if (state === "connected") {
        detectIceTransportType(pc);
      }
      if (state === "failed") {
        setTimeout(() => {
          if (pcRef.current?.connectionState === "failed") restartConnection();
        }, 2000);
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") return;
        await pc.setLocalDescription(offer);
        await sendSignal("offer", { sdp: pc.localDescription?.toJSON() });
      } catch (err) {
        console.error("Negotiation error:", err);
      } finally {
        makingOfferRef.current = false;
      }
    };

    return pc;
  }, [sendSignal, setupDataChannel]);

  const detectIceTransportType = useCallback(async (pc: RTCPeerConnection) => {
    try {
      const stats = await pc.getStats();
      let activeCandidatePairId: string | null = null;
      stats.forEach((report) => {
        if (report.type === "transport" && report.selectedCandidatePairId) {
          activeCandidatePairId = report.selectedCandidatePairId;
        }
      });
      if (!activeCandidatePairId) {
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            activeCandidatePairId = report.id;
          }
        });
      }
      if (activeCandidatePairId) {
        const pair = stats.get(activeCandidatePairId);
        if (pair?.localCandidateId) {
          const local = stats.get(pair.localCandidateId);
          if (local) {
            const cType = local.candidateType;
            if (cType === "relay") setIceTransportType("TURN Relay");
            else if (cType === "srflx") setIceTransportType("STUN");
            else if (cType === "host") setIceTransportType("Direct");
            else if (cType === "prflx") setIceTransportType("Direct (prflx)");
            else setIceTransportType(cType || "unknown");
            console.log("ICE transport type:", cType, "| server:", local.url || local.relayProtocol || "N/A");
            return;
          }
        }
      }
      setIceTransportType("unknown");
    } catch (err) {
      console.error("Failed to detect ICE transport type:", err);
      setIceTransportType("unknown");
    }
  }, []);

  const handleSignal = useCallback(async (signalType: string, payload: any, senderId: string) => {
    if (senderId === userId) return;
    const pc = pcRef.current;
    if (!pc) return;

    try {
      if (signalType === "offer") {
        const isPolitePeer = userId.localeCompare(senderId) > 0;
        const offerCollision = makingOfferRef.current || pc.signalingState !== "stable";
        if (offerCollision && !isPolitePeer) return;

        if (pc.signalingState !== "stable") {
          await pc.setLocalDescription({ type: "rollback" } as any);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal("answer", { sdp: pc.localDescription?.toJSON() });

        for (const c of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        }
        pendingCandidatesRef.current = [];
      } else if (signalType === "answer") {
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          for (const c of pendingCandidatesRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingCandidatesRef.current = [];
        }
      } else if (signalType === "ice-candidate") {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } else {
          pendingCandidatesRef.current.push(payload.candidate);
        }
      } else if (signalType === "join") {
        onRemoteJoinRef.current?.();
        // Remote peer (re)joined — rebuild our peer connection from scratch
        // to ensure a clean ICE/DTLS handshake even if the previous one is stale.
        const freshPc = createPeerConnection();
        pendingCandidatesRef.current = [];
        try {
          const offer = await freshPc.createOffer();
          await freshPc.setLocalDescription(offer);
          await sendSignal("offer", { sdp: freshPc.localDescription?.toJSON() });
        } catch (err) {
          console.error("Failed to send offer after remote join:", err);
        }
      } else if (signalType === "leave") {
        onRemoteLeaveRef.current?.();
      }
    } catch (err) {
      console.error("Signal handling error:", err);
    }
  }, [userId, sendSignal, createPeerConnection]);

  const start = useCallback(async () => {
    await initLocalMedia();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    pendingCandidatesRef.current = [];
    makingOfferRef.current = false;

    const channel = supabase
      .channel(`webrtc-${bookingId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "signal" }, (event: any) => {
        const signal = event.payload;
        if (signal?.senderId !== userId) {
          handleSignal(signal.signalType, signal.payload, signal.senderId);
        }
      });

    await waitForChannelSubscription(channel);
    channelRef.current = channel;
    createPeerConnection();
    await sendSignal("join", { userId });
  }, [bookingId, userId, initLocalMedia, createPeerConnection, handleSignal, waitForChannelSubscription, sendSignal]);

  const restartConnection = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      await sendSignal("offer", { sdp: pc.localDescription?.toJSON() });
    } catch (err) {
      console.error("Restart error:", err);
    }
  }, [sendSignal]);

  const toggleMic = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
      setMicEnabled(t.enabled);
    });
  }, []);

  const toggleVideo = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
      setVideoEnabled(t.enabled);
    });
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    const transceiver = screenTransceiverRef.current;
    if (!pc || !transceiver) return;

    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      await transceiver.sender.replaceTrack(null);
      transceiver.direction = "sendrecv";
      setScreenSharing(false);
      sendDataMessage({ type: "screen-share-status", active: false });
      return;
    }

    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
    const hasDisplayMedia = !!navigator.mediaDevices?.getDisplayMedia;

    if (!hasDisplayMedia) {
      alert(
        isIOS
          ? "مشاركة الشاشة تتطلب iPadOS 16 أو أحدث مع متصفح Safari."
          : "مشاركة الشاشة غير مدعومة على هذا الجهاز/المتصفح. يُرجى استخدام Chrome/Edge على الكمبيوتر."
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
        } as any,
        audio: false,
      });
    } catch (err: any) {
      if (err?.name === "NotAllowedError") return;
      console.error("Screen share failed:", err);
      alert("تعذّر بدء مشاركة الشاشة على هذا الجهاز. جرّب من متصفح حديث على الكمبيوتر.");
      return;
    }

    screenStreamRef.current = stream;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      alert("لم يتم الحصول على إشارة فيديو من المصدر المختار.");
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    // Hint encoder to prioritize sharpness/motion balance for screen content
    try { (videoTrack as any).contentHint = "detail"; } catch {}

    await transceiver.sender.replaceTrack(videoTrack);
    transceiver.direction = "sendrecv";

    try {
      const params = transceiver.sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{ maxBitrate: 4_000_000, maxFramerate: 30 } as any];
      } else {
        params.encodings[0].maxBitrate = 4_000_000;
        (params.encodings[0] as any).maxFramerate = 30;
        (params.encodings[0] as any).networkPriority = "high";
        (params.encodings[0] as any).priority = "high";
      }
      // Prefer low-latency mode when supported
      (params as any).degradationPreference = "maintain-framerate";
      await transceiver.sender.setParameters(params);
    } catch (e) {
      console.warn("setParameters failed (non-fatal):", e);
    }

    videoTrack.addEventListener("ended", async () => {
      await transceiver.sender.replaceTrack(null);
      setScreenSharing(false);
      screenStreamRef.current = null;
      sendDataMessage({ type: "screen-share-status", active: false });
    });

    setScreenSharing(true);
    sendDataMessage({ type: "screen-share-status", active: true });
  }, [screenSharing, sendDataMessage]);

  // Manual recording (screen share based - kept for manual use)
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" } as any,
        audio: true,
      });
      recordedChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus" : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => stream.getTracks().forEach((t) => t.stop());
      stream.getVideoTracks()[0].addEventListener("ended", () => stopRecording());
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      console.error("Recording cancelled");
    }
  }, []);

  // Auto video recording - captures remote video/screen + combined audio using offscreen canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasIntervalRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const startAutoRecording = useCallback(() => {
    try {
      // Avoid double-start
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        console.log("[recording] already running, skip");
        return;
      }
      const localAudioStream = localStreamRef.current;
      const remoteMediaStream = latestRemoteStreamRef.current ?? remoteStream;
      if (!localAudioStream && !remoteMediaStream) {
        console.warn("[recording] no streams yet, will retry");
        return;
      }

      // Create offscreen canvas for video capture
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d", { alpha: false })!;
      canvasRef.current = canvas;

      // Hidden video element bound to LIVE remote stream
      const sourceStream = remoteMediaStream ?? localAudioStream;
      const hiddenVideo = document.createElement("video");
      hiddenVideo.srcObject = sourceStream;
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.play().catch(() => {});
      recordingHiddenVideoRef.current = hiddenVideo;

      // Hidden video for LOCAL screen share / camera (so we capture teacher's shared screen)
      const hiddenLocalVideo = document.createElement("video");
      hiddenLocalVideo.muted = true;
      hiddenLocalVideo.playsInline = true;

      let audioLevel = 0;
      let analyserNode: AnalyserNode | null = null;
      let analyserData: Uint8Array<ArrayBuffer> | null = null;

      const getLocalVideoStream = (): MediaStream | null => {
        // Only screen share — camera is not used in this system
        if (screenStreamRef.current && screenStreamRef.current.getVideoTracks().length > 0) {
          return screenStreamRef.current;
        }
        return null;
      };

      const getRemoteVideoStream = (): MediaStream | null => {
        const live = latestRemoteStreamRef.current;
        if (live && live.getVideoTracks().some(t => t.readyState === "live")) return live;
        return null;
      };

      const drawVideoFit = (vid: HTMLVideoElement, dx: number, dy: number, dw: number, dh: number) => {
        const vw = vid.videoWidth || dw;
        const vh = vid.videoHeight || dh;
        const scale = Math.min(dw / vw, dh / vh);
        const w = vw * scale;
        const h = vh * scale;
        const x = dx + (dw - w) / 2;
        const y = dy + (dh - h) / 2;
        ctx.drawImage(vid, x, y, w, h);
      };

      const drawFrame = () => {
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, "#1e293b");
        grad.addColorStop(1, "#0f172a");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const liveRemote = getRemoteVideoStream();
        if (liveRemote && hiddenVideo.srcObject !== liveRemote) {
          hiddenVideo.srcObject = liveRemote;
          hiddenVideo.play().catch(() => {});
        }
        const liveLocal = getLocalVideoStream();
        if (liveLocal && hiddenLocalVideo.srcObject !== liveLocal) {
          hiddenLocalVideo.srcObject = liveLocal;
          hiddenLocalVideo.play().catch(() => {});
        } else if (!liveLocal && hiddenLocalVideo.srcObject) {
          hiddenLocalVideo.srcObject = null;
        }

        // RECORD ONLY TEACHER'S SCREEN: prefer local screen share / camera.
        // Whiteboard overlay (drawn below) covers the case where teacher uses the whiteboard.
        const hasLocal = hiddenLocalVideo.readyState >= 2 && (hiddenLocalVideo.videoWidth || 0) > 0;
        const wbEl = document.querySelector('canvas[data-whiteboard="true"]') as HTMLCanvasElement | null;
        const hasWhiteboard = !!(wbEl && wbEl.width > 0 && wbEl.height > 0);

        if (hasLocal) {
          drawVideoFit(hiddenLocalVideo, 0, 0, canvas.width, canvas.height);
        } else if (hasWhiteboard) {
          // Fullscreen whiteboard
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const scale = Math.min(canvas.width / wbEl!.width, canvas.height / wbEl!.height);
          const w = wbEl!.width * scale;
          const h = wbEl!.height * scale;
          ctx.drawImage(wbEl!, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        } else {
          if (analyserNode && analyserData) {
            analyserNode.getByteFrequencyData(analyserData);
            let sum = 0;
            for (let i = 0; i < analyserData.length; i++) sum += analyserData[i];
            audioLevel = Math.min(1, sum / analyserData.length / 128);
          } else {
            audioLevel = 0.3 + Math.sin(Date.now() / 400) * 0.15;
          }
          const cx = canvas.width / 2;
          const cy = canvas.height / 2 - 40;
          const baseR = 80;
          const r = baseR + audioLevel * 60;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(56, 189, 248, ${0.15 + audioLevel * 0.25})`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
          ctx.fillStyle = "#38bdf8";
          ctx.fill();
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(cx - 14, cy - 28, 28, 40);
          ctx.beginPath();
          ctx.arc(cx, cy + 12, 14, 0, Math.PI, false);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 32px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("جلسة صوتية مباشرة", canvas.width / 2, canvas.height / 2 + 80);
          ctx.fillStyle = "#94a3b8";
          ctx.font = "20px sans-serif";
          ctx.fillText("تسجيل جارٍ...", canvas.width / 2, canvas.height / 2 + 115);
        }

        // Overlay whiteboard as a thumbnail only when teacher is sharing screen/camera
        // (so we see both the screen AND the whiteboard if both are active).
        try {
          if (hasLocal && hasWhiteboard) {
            const wbW = 360;
            const wbH = (wbEl!.height / wbEl!.width) * wbW;
            ctx.fillStyle = "#fff";
            ctx.fillRect(20, 20, wbW, wbH);
            ctx.drawImage(wbEl!, 20, 20, wbW, wbH);
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 2;
            ctx.strokeRect(20, 20, wbW, wbH);
          }
        } catch {}

        const now = new Date();
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(canvas.width - 200, canvas.height - 40, 200, 40);
        ctx.fillStyle = "#ffffff";
        ctx.font = "14px monospace";
        ctx.textAlign = "right";
        ctx.fillText(now.toLocaleTimeString("ar-SA"), canvas.width - 10, canvas.height - 12);
      };

      // Initial frame to seed the stream
      drawFrame();

      // Setup audio analyser for visualizer (best-effort)
      try {
        const tmpCtx = new AudioContext();
        const allAudio = [
          ...(localAudioStream?.getAudioTracks() || []),
          ...(remoteMediaStream?.getAudioTracks() || []),
        ];
        if (allAudio.length > 0) {
          const src = tmpCtx.createMediaStreamSource(new MediaStream(allAudio));
          analyserNode = tmpCtx.createAnalyser();
          analyserNode.fftSize = 256;
          analyserData = new Uint8Array(new ArrayBuffer(analyserNode.frequencyBinCount));
          src.connect(analyserNode);
        }
      } catch (e) {
        console.warn("[recording] analyser init failed:", e);
      }

      // Draw loop
      canvasIntervalRef.current = window.setInterval(drawFrame, 66);

      const canvasStream = canvas.captureStream(15);

      // Mix audio with try/catch — AudioContext can fail without user gesture
      const audioTracks: MediaStreamTrack[] = [];
      try {
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        // Resume if suspended (some browsers require explicit resume)
        if (audioCtx.state === "suspended") {
          audioCtx.resume().catch(() => {});
        }
        const dest = audioCtx.createMediaStreamDestination();
        if (localAudioStream && localAudioStream.getAudioTracks().length > 0) {
          try { audioCtx.createMediaStreamSource(localAudioStream).connect(dest); } catch (e) { console.warn("[recording] local audio mix failed:", e); }
        }
        if (remoteMediaStream && remoteMediaStream.getAudioTracks().length > 0) {
          try { audioCtx.createMediaStreamSource(remoteMediaStream).connect(dest); } catch (e) { console.warn("[recording] remote audio mix failed:", e); }
        }
        audioTracks.push(...dest.stream.getAudioTracks());
      } catch (e) {
        console.warn("[recording] AudioContext failed, recording video only:", e);
        // Fallback: use raw audio tracks
        if (localAudioStream) audioTracks.push(...localAudioStream.getAudioTracks());
        if (remoteMediaStream) audioTracks.push(...remoteMediaStream.getAudioTracks());
      }

      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks,
      ]);

      // IMPORTANT: do NOT wipe chunks here — preserve across restarts (reconnect/renegotiation)
      // Chunks are only cleared when a NEW session starts via resetRecordingBuffer()
      // Use VP8 for maximum browser compatibility (Safari, iOS, older Chrome).
      // VP9 produces smaller files but fails to decode in many <video> players, causing black screens.
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
          ? "video/webm;codecs=vp8"
          : MediaRecorder.isTypeSupported("video/webm")
            ? "video/webm"
            : "";
      console.log("[recording] starting with mimeType:", mimeType, "videoTracks:", canvasStream.getVideoTracks().length, "audioTracks:", audioTracks.length);
      const recorder = mimeType
        ? new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 1_000_000 })
        : new MediaRecorder(combinedStream, { videoBitsPerSecond: 1_000_000 });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
          if (recordedChunksRef.current.length === 1) {
            console.log("[recording] first chunk received:", e.data.size, "bytes");
          }
        }
      };
      recorder.onerror = (e) => console.error("[recording] MediaRecorder error:", e);
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      console.log("[recording] started successfully");
    } catch (err) {
      console.error("[recording] Auto video recording failed:", err);
    }
  }, [remoteStream]);

  const stopRecording = useCallback(() => {
    return new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.addEventListener("stop", () => {
          console.log("[recording] stopped, chunks:", recordedChunksRef.current.length,
            "total bytes:", recordedChunksRef.current.reduce((s, b) => s + b.size, 0));
          resolve();
        }, { once: true });
        try { recorder.requestData(); } catch {}
        try { recorder.stop(); } catch { resolve(); }
      } else {
        resolve();
      }
      if (canvasIntervalRef.current) {
        clearInterval(canvasIntervalRef.current);
        canvasIntervalRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      canvasRef.current = null;
      setIsRecording(false);
    });
  }, []);

  const getRecordingBlob = useCallback(() => {
    if (recordedChunksRef.current.length === 0) return null;
    return new Blob(recordedChunksRef.current, { type: "video/webm" });
  }, []);

  const stop = useCallback(async () => {
    await sendSignal("leave", { userId });
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    setDataChannelReady(false);
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    if (isRecording) stopRecording();
  }, [userId, isRecording, stopRecording, sendSignal]);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      dataChannelRef.current?.close();
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  return {
    localStream,
    remoteStream,
    connectionState,
    micEnabled,
    videoEnabled,
    screenSharing,
    isRecording,
    dataChannelReady,
    iceTransportType,
    start,
    stop,
    toggleMic,
    toggleVideo,
    toggleScreenShare,
    startRecording,
    startAutoRecording,
    stopRecording,
    getRecordingBlob,
    restartConnection,
    sendDataMessage,
  };
}
