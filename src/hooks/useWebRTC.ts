import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};

interface UseWebRTCOptions {
  bookingId: string;
  userId: string;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
  onRemoteJoin?: () => void;
  onRemoteLeave?: () => void;
}

export function useWebRTC({
  bookingId,
  userId,
  onRemoteStream,
  onConnectionState,
  onRemoteJoin,
  onRemoteLeave,
}: UseWebRTCOptions) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<any>(null);
  const makingOfferRef = useRef(false);
  const isPoliteRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Initialize local media
  const initLocalMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error("Failed to get user media:", err);
      // Try audio only
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setVideoEnabled(false);
        return audioStream;
      } catch {
        console.error("No media devices available");
        return null;
      }
    }
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote tracks
    const remote = new MediaStream();
    setRemoteStream(remote);

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        remote.addTrack(track);
      });
      setRemoteStream(new MediaStream(remote.getTracks()));
      onRemoteStream?.(remote);
    };

    // ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await sendSignal("ice-candidate", { candidate: event.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setConnectionState(state);
      onConnectionState?.(state);

      if (state === "disconnected" || state === "failed") {
        // Auto-reconnect after 2s
        setTimeout(() => {
          if (pcRef.current?.connectionState === "failed") {
            restartConnection();
          }
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
  }, [onRemoteStream, onConnectionState]);

  // Send signal via Supabase
  const sendSignal = async (signalType: string, payload: any) => {
    await supabase.from("webrtc_signals" as any).insert({
      booking_id: bookingId,
      sender_id: userId,
      signal_type: signalType,
      payload,
    } as any);
  };

  // Handle incoming signal
  const handleSignal = useCallback(async (signalType: string, payload: any, senderId: string) => {
    if (senderId === userId) return;
    const pc = pcRef.current;
    if (!pc) return;

    try {
      if (signalType === "offer") {
        const offerCollision = makingOfferRef.current || pc.signalingState !== "stable";
        if (offerCollision && !isPoliteRef.current) return;

        if (pc.signalingState !== "stable") {
          await pc.setLocalDescription({ type: "rollback" } as any);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal("answer", { sdp: pc.localDescription?.toJSON() });

        // Flush pending candidates
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
        onRemoteJoin?.();
        // The later joiner is "polite"
        isPoliteRef.current = true;
        // Re-negotiate
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal("offer", { sdp: pc.localDescription?.toJSON() });
      } else if (signalType === "leave") {
        onRemoteLeave?.();
      }
    } catch (err) {
      console.error("Signal handling error:", err);
    }
  }, [userId, bookingId, onRemoteJoin, onRemoteLeave]);

  // Start connection
  const start = useCallback(async () => {
    const stream = await initLocalMedia();
    if (!stream) return;

    createPeerConnection();

    // Clean old signals for this booking
    await supabase.from("webrtc_signals" as any).delete().eq("booking_id", bookingId);

    // Subscribe to realtime signals
    const channel = supabase
      .channel(`webrtc-${bookingId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "webrtc_signals",
        filter: `booking_id=eq.${bookingId}`,
      }, (payload: any) => {
        const row = payload.new;
        if (row.sender_id !== userId) {
          handleSignal(row.signal_type, row.payload, row.sender_id);
        }
      })
      .subscribe();

    channelRef.current = channel;

    // Announce join
    await sendSignal("join", { userId });
  }, [bookingId, userId, initLocalMedia, createPeerConnection, handleSignal]);

  // Restart connection
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
  }, [bookingId, userId]);

  // Toggle mic
  const toggleMic = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
      setMicEnabled(t.enabled);
    });
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
      setVideoEnabled(t.enabled);
    });
  }, []);

  // Screen sharing
  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    if (screenSharing) {
      // Stop screen share, restore camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;

      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        sender?.replaceTrack(videoTrack);
      }
      setScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        screenStreamRef.current = screenStream;

        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        sender?.replaceTrack(screenTrack);

        screenTrack.addEventListener("ended", () => {
          const camTrack = localStreamRef.current?.getVideoTracks()[0];
          if (camTrack) sender?.replaceTrack(camTrack);
          setScreenSharing(false);
          screenStreamRef.current = null;
        });

        setScreenSharing(true);
      } catch {
        console.error("Screen share cancelled");
      }
    }
  }, [screenSharing]);

  // Recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" } as any,
        audio: true,
      });
      recordedChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => stream.getTracks().forEach((t) => t.stop());
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        stopRecording();
      });
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      console.error("Recording cancelled");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    setIsRecording(false);
  }, []);

  const getRecordingBlob = useCallback(() => {
    if (recordedChunksRef.current.length === 0) return null;
    return new Blob(recordedChunksRef.current, { type: "video/webm" });
  }, []);

  // Cleanup
  const stop = useCallback(async () => {
    await sendSignal("leave", { userId });

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    pcRef.current?.close();
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;

    if (isRecording) stopRecording();

    // Clean signals
    await supabase.from("webrtc_signals" as any).delete().eq("booking_id", bookingId);
  }, [bookingId, userId, isRecording, stopRecording]);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
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
    start,
    stop,
    toggleMic,
    toggleVideo,
    toggleScreenShare,
    startRecording,
    stopRecording,
    getRecordingBlob,
    restartConnection,
  };
}
