import { useEffect, useRef, useState, useCallback } from "react";

export interface ConnectionQuality {
  level: "excellent" | "good" | "fair" | "poor" | "disconnected";
  rtt?: number;        // round-trip time (ms)
  packetLoss?: number; // 0-1
  bitrate?: number;    // kbps
  jitter?: number;     // ms
  reason?: string;
}

interface Options {
  /** Called when quality changes (e.g. drop to poor/disconnected). */
  onQualityChange?: (q: ConnectionQuality) => void;
  /** Called once after sustained disconnection (default 30s). */
  onSustainedDisconnect?: (durationMs: number) => void;
  /** Sustained disconnect threshold ms (default 30000). */
  disconnectThresholdMs?: number;
  /** Polling interval ms (default 3000). */
  intervalMs?: number;
}

/**
 * Monitors a WebRTC peer connection's audio/video quality.
 * Uses getStats() to compute RTT, packet-loss %, jitter, bitrate.
 * Triggers alerts on sustained disconnection (>30s by default).
 */
export const useConnectionQuality = (
  pc: RTCPeerConnection | null,
  opts: Options = {},
) => {
  const {
    onQualityChange,
    onSustainedDisconnect,
    disconnectThresholdMs = 30000,
    intervalMs = 3000,
  } = opts;

  const [quality, setQuality] = useState<ConnectionQuality>({ level: "good" });
  const lastBytesRef = useRef<{ bytes: number; ts: number }>({ bytes: 0, ts: 0 });
  const disconnectStartRef = useRef<number | null>(null);
  const alertedRef = useRef(false);

  const computeLevel = useCallback((rtt: number, loss: number): ConnectionQuality["level"] => {
    if (rtt > 500 || loss > 0.1) return "poor";
    if (rtt > 250 || loss > 0.05) return "fair";
    if (rtt > 150 || loss > 0.02) return "good";
    return "excellent";
  }, []);

  useEffect(() => {
    if (!pc) return;
    let mounted = true;

    const tick = async () => {
      if (!mounted || !pc) return;
      // Connection state check
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.iceConnectionState === "disconnected") {
        if (disconnectStartRef.current === null) {
          disconnectStartRef.current = Date.now();
        }
        const downFor = Date.now() - disconnectStartRef.current;
        const q: ConnectionQuality = { level: "disconnected", reason: "ICE disconnected" };
        setQuality(q);
        onQualityChange?.(q);

        if (downFor >= disconnectThresholdMs && !alertedRef.current) {
          alertedRef.current = true;
          onSustainedDisconnect?.(downFor);
        }
        return;
      }

      // reset disconnect tracking when we reconnect
      if (disconnectStartRef.current !== null) {
        disconnectStartRef.current = null;
        alertedRef.current = false;
      }

      try {
        const stats = await pc.getStats();
        let rtt = 0;
        let loss = 0;
        let jitter = 0;
        let bytes = 0;
        let packetsReceived = 0;
        let packetsLost = 0;

        stats.forEach((report: any) => {
          if (report.type === "candidate-pair" && report.state === "succeeded" && report.currentRoundTripTime != null) {
            rtt = Math.max(rtt, report.currentRoundTripTime * 1000);
          }
          if (report.type === "inbound-rtp" && (report.kind === "audio" || report.kind === "video")) {
            packetsReceived += report.packetsReceived || 0;
            packetsLost += report.packetsLost || 0;
            jitter = Math.max(jitter, (report.jitter || 0) * 1000);
            bytes += report.bytesReceived || 0;
          }
        });

        if (packetsReceived + packetsLost > 0) {
          loss = packetsLost / (packetsReceived + packetsLost);
        }

        const now = Date.now();
        let bitrate = 0;
        if (lastBytesRef.current.ts > 0) {
          const dt = (now - lastBytesRef.current.ts) / 1000;
          if (dt > 0) bitrate = ((bytes - lastBytesRef.current.bytes) * 8) / dt / 1000; // kbps
        }
        lastBytesRef.current = { bytes, ts: now };

        const level = computeLevel(rtt, loss);
        const q: ConnectionQuality = { level, rtt: Math.round(rtt), packetLoss: loss, bitrate: Math.round(bitrate), jitter: Math.round(jitter) };
        setQuality(q);
        onQualityChange?.(q);
      } catch (e) {
        console.warn("getStats failed:", e);
      }
    };

    const id = setInterval(tick, intervalMs);
    tick();
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [pc, intervalMs, disconnectThresholdMs, onQualityChange, onSustainedDisconnect, computeLevel]);

  return quality;
};
