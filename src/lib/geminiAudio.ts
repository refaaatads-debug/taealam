import { decodePcm16, encodePcm16, VoiceResampler } from './geminiPcm';

export async function createGeminiAudio(send: (pcm: string) => void, onSpeaking: (speaking: boolean) => void, onFailure: () => void = () => {}) {
  let stream: MediaStream | undefined;
  let input: AudioContext | undefined;
  let output: AudioContext | undefined;
  let worklet: AudioWorkletNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let mute = false;
  let closed = false;
  let nextStart = 0;
  const sources = new Set<AudioBufferSourceNode>();
  let analyser: AnalyserNode | undefined;
  let levelBytes: Uint8Array<ArrayBuffer> | undefined;
  const interrupt = () => {
    for (const item of sources) { item.onended = null; try { item.stop(); } catch { /* already ended */ } item.disconnect(); }
    sources.clear(); nextStart = 0; onSpeaking(false);
  };
  const close = () => {
    if (closed) return; closed = true;
    interrupt(); worklet?.disconnect(); source?.disconnect();
    if (worklet) worklet.port.onmessage = null;
    stream?.getTracks().forEach(track => track.stop());
    void input?.close().catch(() => {}); void output?.close().catch(() => {});
  };
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Error('secure_microphone_required');
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => { if (!closed) { close(); onFailure(); } }, { once: true }));
    input = new AudioContext(); output = new AudioContext({ sampleRate: 24000 });
    await Promise.all([input.resume(), output.resume()]);
    const resampler = new VoiceResampler(input.sampleRate);
    // Local worklet only. No remote script or raw microphone logging.
    const code = `class AjyalPcm extends AudioWorkletProcessor { process(inputs) { const channel = inputs[0]?.[0]; if (channel) this.port.postMessage(channel.slice()); return true; } } registerProcessor('ajyal-gemini-pcm', AjyalPcm);`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try { await input.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    source = input.createMediaStreamSource(stream);
    worklet = new AudioWorkletNode(input, 'ajyal-gemini-pcm');
    const silent = input.createGain(); silent.gain.value = 0;
    source.connect(worklet); worklet.connect(silent); silent.connect(input.destination);
    let pending: number[] = [];
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (closed || mute) { pending = []; return; }
      pending.push(...resampler.push(event.data));
      // 100ms network chunks. Worklet render blocks never become separate requests.
      while (pending.length >= 1600) {
        const chunk = Float32Array.from(pending.splice(0, 1600));
        try { send(encodePcm16(chunk)); } catch { close(); onFailure(); }
      }
    };
    analyser = output.createAnalyser(); analyser.fftSize = 256; analyser.connect(output.destination);
    levelBytes = new Uint8Array(analyser.fftSize);
    return {
      close, interrupt,
      setMuted(value: boolean) { mute = value; pending = []; },
      level() {
        if (!analyser || !levelBytes || closed || !sources.size) return 0;
        analyser.getByteTimeDomainData(levelBytes);
        const sum = levelBytes.reduce((n, value) => n + ((value - 128) / 128) ** 2, 0);
        return Math.min(1, Math.sqrt(sum / levelBytes.length) * 4);
      },
      play(base64: string, mimeType = 'audio/pcm;rate=24000') {
        if (closed || !output || !analyser) return;
        if (!/^audio\/pcm(?:;rate=24000)?$/.test(mimeType)) throw Error('unsupported_output_audio');
        const samples = decodePcm16(base64);
        // Bound queued output to avoid runaway latency/memory on a stalled device.
        if (nextStart - output.currentTime > 8 || sources.size >= 100) throw Error('audio_queue_overflow');
        const buffer = output.createBuffer(1, samples.length, 24000); buffer.copyToChannel(samples, 0);
        const item = output.createBufferSource(); item.buffer = buffer; item.connect(analyser); sources.add(item);
        item.onended = () => { item.disconnect(); sources.delete(item); if (!sources.size) onSpeaking(false); };
        const at = Math.max(output.currentTime, nextStart); nextStart = at + buffer.duration;
        onSpeaking(true); item.start(at);
      },
    };
  } catch (error) { close(); throw error; }
}
export type GeminiAudio = Awaited<ReturnType<typeof createGeminiAudio>>;
