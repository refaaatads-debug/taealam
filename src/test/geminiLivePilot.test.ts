import { describe, it, expect, vi } from 'vitest';
import { geminiTokenConfig, issueGeminiPilotTicket } from '../../supabase/functions/_shared/gemini-live-pilot';
import { validateGeminiPilotTicket } from '../lib/geminiLivePilot';
const now = Date.parse('2026-11-23T19:00:00Z');
const fixture = () => {
  const reserve = vi.fn(async () => ({ allowed: true, reservation_id: 'r', max_seconds: 300 }));
  const mint = vi.fn(async (c: ReturnType<typeof geminiTokenConfig>) => ({ name: 'auth_tokens/test', expireTime: c.expireTime }));
  return { now: () => now, reserve, mint };
};
describe('disabled/unwired Gemini pilot contract', () => {
  it('locks model, Arabic instruction, one use and absolute deadline; no resumption/tools', () => {
    const c = geminiTokenConfig(now);
    expect(c.uses).toBe(1);
    expect(Date.parse(c.expireTime) - now).toBe(300000);
    expect(Date.parse(c.newSessionExpireTime) - now).toBe(60000);
    expect(c.liveConnectConstraints.model).toBe('gemini-3.8-live');
    expect(c.liveConnectConstraints.config.systemInstruction).toContain('بالعربية');
    expect(c.liveConnectConstraints.config).not.toHaveProperty('sessionResumption');
    expect(c.liveConnectConstraints.config).not.toHaveProperty('tools');
    expect(c).not.toHaveProperty('lockAdditionalFields');
  });
  it('does not mint on ledger denial', async () => {
    const f = fixture(); f.reserve.mockResolvedValue({ allowed: false } as never);
    await expect(issueGeminiPilotTicket(f)).resolves.toEqual({ allowed: false });
    expect(f.mint).not.toHaveBeenCalled();
  });
  it('rejects a partial unsafe reservation before mint', async () => {
    const f = fixture(); f.reserve.mockResolvedValue({ allowed: true, reservation_id: 'r', max_seconds: 50 });
    await expect(issueGeminiPilotTicket(f)).rejects.toThrow('unsafe_reservation');
    expect(f.mint).not.toHaveBeenCalled();
  });
  it('returns only an ephemeral credential with bounded deadlines', async () => {
    const result = await issueGeminiPilotTicket(fixture());
    expect(result).toMatchObject({ provider: 'gemini', token: 'auth_tokens/test', maxSeconds: 300 });
    validateGeminiPilotTicket(result as never, now);
  });
  it.each(['not-a-token', ''])('rejects malformed provider credential %s', async name => {
    const f = fixture(); f.mint.mockResolvedValue({ name, expireTime: geminiTokenConfig(now).expireTime });
    await expect(issueGeminiPilotTicket(f)).rejects.toThrow('unsafe_ephemeral_token');
  });
  it('rejects longer provider expiry and keeps the debit on ambiguous failure', async () => {
    const f = fixture(); f.mint.mockResolvedValue({ name: 'auth_tokens/test', expireTime: new Date(now + 301000).toISOString() });
    await expect(issueGeminiPilotTicket(f)).rejects.toThrow('unsafe_ephemeral_token');
    expect(f.reserve).toHaveBeenCalledTimes(1);
  });
  it('uses the immutable requested deadline when provider omits expiry', async () => {
    const f = fixture();
    const result = await issueGeminiPilotTicket({ ...f, mint: async () => ({ name: 'auth_tokens/test' }) });
    expect(result).toMatchObject({ expiresAt: geminiTokenConfig(now).expireTime });
  });
  it.each(['', 'not-a-date', new Date(now - 1).toISOString()])('rejects invalid or expired returned expiry %s', async expireTime => {
    const f = fixture(); f.mint.mockResolvedValue({ name: 'auth_tokens/test', expireTime });
    await expect(issueGeminiPilotTicket(f)).rejects.toThrow('unsafe_ephemeral_token');
  });
  it('does not accept expired client tickets', () => {
    expect(() => validateGeminiPilotTicket({ allowed: true, provider: 'gemini', model: 'gemini-3.8-live', token: 'auth_tokens/test', expiresAt: new Date(now).toISOString(), newSessionExpiresAt: new Date(now).toISOString(), maxSeconds: 300 }, now)).toThrow();
  });
});
