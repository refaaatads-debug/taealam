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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const screenTransceiverRef = useRef<RTCRtpTransceiver | null>(null);

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

    const pc = new RTCPeerConnection(ICE_SERVERS);
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
    setRemoteStream(remote);

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        remote.addTrack(track);
      });
      const updated = new MediaStream(remote.getTracks());
      setRemoteStream(updated);
      onRemoteStreamRef.current?.(updated);
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
        if (pc.signalingState === "have-local-offer" && pc.localDescription) {
          await sendSignal("offer", { sdp: pc.localDescription.toJSON() });
          return;
        }
        if (pc.signalingState !== "stable") return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal("offer", { sdp: pc.localDescription?.toJSON() });
      } else if (signalType === "leave") {
        onRemoteLeaveRef.current?.();
      }
    } catch (err) {
      console.error("Signal handling error:", err);
    }
  }, [userId, sendSignal]);

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
      // Stop screen sharing - replace track with null
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      await transceiver.sender.replaceTrack(null);
      transceiver.direction = "sendrecv";
      setScreenSharing(false);
      sendDataMessage({ type: "screen-share-status", active: false });
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Use replaceTrack on the pre-created transceiver - no renegotiation needed
        await transceiver.sender.replaceTrack(screenTrack);
        transceiver.direction = "sendrecv";

        screenTrack.addEventListener("ended", async () => {
          await transceiver.sender.replaceTrack(null);
          setScreenSharing(false);
          screenStreamRef.current = null;
          sendDataMessage({ type: "screen-share-status", active: false });
        });

        setScreenSharing(true);
        sendDataMessage({ type: "screen-share-status", active: true });
      } catch {
        console.error("Screen share cancelled");
      }
    }
  }, [screenSharing, sendDataMessage]);

  // Recording
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

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    setIsRecording(false);
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
    start,
    stop,
    toggleMic,
    toggleVideo,
    toggleScreenShare,
    startRecording,
    stopRecording,
    getRecordingBlob,
    restartConnection,
    sendDataMessage,
  };
}
