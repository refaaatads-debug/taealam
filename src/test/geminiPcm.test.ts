import { describe, expect, it } from 'vitest';
import { decodePcm16, encodePcm16, VoiceResampler } from '../lib/geminiPcm';
describe('Gemini raw PCM pipeline', () => {
  it('encodes signed 16-bit little endian, clamps peaks, and decodes', () => {
    const encoded = encodePcm16(Float32Array.from([-2, -1, 0, .5, 1, 2]));
    expect(Array.from(decodePcm16(encoded))).toEqual([-1, -1, 0, .5, 32767/32768, 32767/32768]);
    expect(atob(encoded).charCodeAt(1)).toBe(128);
  });
  it('rejects odd or excessive PCM payloads', () => {
    expect(() => decodePcm16(btoa('a'))).toThrow('invalid_audio_chunk');
    expect(() => decodePcm16(btoa('a'.repeat(480002)))).toThrow('invalid_audio_chunk');
  });
  it('preserves 48k->16k stream duration across render blocks', () => {
    const r = new VoiceResampler(48000);
    let count = 0;
    for (let i=0;i<375;i++) count += r.push(new Float32Array(128).fill(.25)).length;
    expect(count).toBe(16000);
  });
  it('handles 44.1k and validates unsupported sample rate', () => {
    const r = new VoiceResampler(44100);
    expect(r.push(new Float32Array(44100)).length).toBe(16000);
    expect(() => new VoiceResampler(8000)).toThrow();
  });
  it('keeps silence silent without synthetic speech', () => {
    expect(Array.from(decodePcm16(encodePcm16(new Float32Array(1600))))).toEqual(Array(1600).fill(0));
  });
});
