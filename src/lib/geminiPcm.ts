export function encodePcm16(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, i) => view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)), true));
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}
export function decodePcm16(base64: string): Float32Array {
  const raw = atob(base64);
  if (raw.length % 2 || raw.length > 48000 * 10) throw Error('invalid_audio_chunk');
  const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return Float32Array.from({ length: bytes.length / 2 }, (_, i) => view.getInt16(i * 2, true) / 32768);
}
// Streaming resampler preserves phase across input blocks. Box averaging reduces
// aliasing for voice, not intended for music-quality conversion.
export class VoiceResampler {
  private phase = 0;
  private total = 0;
  private count = 0;
  constructor(private inputRate: number, private outputRate = 16000) {
    if (!Number.isFinite(inputRate) || inputRate < outputRate) throw Error('unsupported_sample_rate');
  }
  push(samples: Float32Array): Float32Array {
    const output: number[] = [];
    for (const sample of samples) {
      this.total += sample; this.count++; this.phase += this.outputRate;
      if (this.phase >= this.inputRate) {
        output.push(this.total / this.count); this.phase -= this.inputRate;
        this.total = 0; this.count = 0;
      }
    }
    return Float32Array.from(output);
  }
}
