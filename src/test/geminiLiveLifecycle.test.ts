import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ connect: vi.fn(), close: vi.fn(), send: vi.fn() }));
vi.mock('@google/genai', () => ({
  Modality: { AUDIO: 'AUDIO' },
  GoogleGenAI: class { live = { connect: mocks.connect }; },
}));
import { connectGeminiPilot } from '../lib/geminiLivePilot';
beforeEach(() => { vi.useRealTimers(); vi.clearAllMocks(); mocks.connect.mockResolvedValue({ close: mocks.close, sendRealtimeInput: mocks.send }); });
const ticket = () => ({ allowed: true as const, provider: 'gemini' as const, model: 'gemini-3.8-live' as const, token: 'auth_tokens/test', expiresAt: new Date(Date.now()+300000).toISOString(), newSessionExpiresAt: new Date(Date.now()+60000).toISOString(), maxSeconds: 300 as const });
const callbacks = () => ({ onmessage: vi.fn(), onclose: vi.fn(), onerror: vi.fn() });
describe('Gemini pilot mocked lifecycle, no network', () => {
  it('closes idempotently and never sends after stop', async () => {
    const handle = await connectGeminiPilot(ticket(), callbacks());
    handle.sendPcm16('AAAA'); expect(mocks.send).toHaveBeenCalledTimes(1);
    handle.stop(); handle.stop(); handle.sendPcm16('AAAA');
    expect(mocks.close).toHaveBeenCalledTimes(1); expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('closes at absolute expiry without reconnecting', async () => {
    vi.useFakeTimers(); const handle = await connectGeminiPilot(ticket(), callbacks());
    await vi.advanceTimersByTimeAsync(300001); handle.sendPcm16('AAAA');
    expect(mocks.close).toHaveBeenCalledTimes(1); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.connect).toHaveBeenCalledTimes(1);vi.useRealTimers();
  });
  it('does not forward messages after close/error', async () => {
    const cb=callbacks();const handle=await connectGeminiPilot(ticket(), cb);
    const passed=mocks.connect.mock.calls[0][0].callbacks;
    passed.onerror();passed.onmessage({serverContent:{}});
    expect(cb.onerror).toHaveBeenCalledTimes(1);expect(cb.onmessage).not.toHaveBeenCalled();handle.stop();
  });
});
