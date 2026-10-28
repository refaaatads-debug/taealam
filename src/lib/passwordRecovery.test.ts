import { describe, expect, it, vi } from "vitest";
import { createClient, type Session } from "@supabase/supabase-js";
import { saveRecoveryPassword, shouldDetectAuthCallback, verifyPasswordRecovery } from "./passwordRecovery";

const user = { id: "recovery-owner", email: "owner@example.com" };
const session = { user, access_token: "test-access-not-real", refresh_token: "test-refresh-not-real" } as Session;
function fakeAuth() {
  return {
    exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session, user, redirectType: "PASSWORD_RECOVERY" }, error: null }),
    setSession: vi.fn().mockResolvedValue({ data: { session, user }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
  };
}
const verifiedRecovery = { session, userId: user.id, email: user.email };

describe("password recovery link verification", () => {
  it("matches the installed SDK's actual PKCE recovery redirect contract", async () => {
    const key = "password-recovery-contract";
    const memory = new Map([[`${key}-code-verifier`, JSON.stringify("test-verifier/PASSWORD_RECOVERY")]]);
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      access_token: session.access_token, refresh_token: session.refresh_token,
      token_type: "bearer", expires_in: 3600, user,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createClient("https://example.supabase.co", "test-publishable-key", {
      global: { fetch: fetchMock },
      auth: {
        storageKey: key, flowType: "pkce", autoRefreshToken: false, detectSessionInUrl: false,
        storage: {
          getItem: (name: string) => memory.get(name) ?? null,
          setItem: (name: string, value: string) => { memory.set(name, value); },
          removeItem: (name: string) => { memory.delete(name); },
        },
      },
    });
    const { data, error } = await client.auth.exchangeCodeForSession("test-code-not-real");
    expect(error).toBeNull();
    expect(data).toMatchObject({ redirectType: "PASSWORD_RECOVERY", user });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(memory.has(`${key}-code-verifier`)).toBe(false);
  });
  it.each(["/reset-password", "/reset-password/"])("prevents auto-consumption on %s", (path) => {
    expect(shouldDetectAuthCallback(path)).toBe(false);
  });
  it.each(["/", "/login", "/forgot-password"])("keeps other OAuth callback routes working: %s", (path) => {
    expect(shouldDetectAuthCallback(path)).toBe(true);
  });
  it("requires a real recovery link even with an existing valid login", async () => {
    const auth = fakeAuth();
    const clear = vi.fn();
    await expect(verifyPasswordRecovery(auth, "https://example.com/reset-password", clear)).rejects.toThrow();
    expect(clear).toHaveBeenCalledOnce();
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("exchanges PKCE once and validates the returned account against the auth server", async () => {
    const auth = fakeAuth();
    expect(await verifyPasswordRecovery(auth, "https://example.com/reset-password?code=test-only", vi.fn())).toEqual(verifiedRecovery);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith("test-only");
    expect(auth.getUser).toHaveBeenCalledWith(session.access_token);
  });
  it("does not fall back to an old login when the code is expired or verifier is missing", async () => {
    const auth = fakeAuth();
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null, user: null }, error: new Error("expired") });
    await expect(verifyPasswordRecovery(auth, "https://example.com/reset-password?code=expired", vi.fn())).rejects.toThrow();
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.getUser).not.toHaveBeenCalled();
  });
  it.each([null, "SIGNED_IN", undefined])("rejects non-recovery PKCE redirect type %s", async (redirectType) => {
    const auth = fakeAuth();
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session, user, redirectType }, error: null });
    await expect(verifyPasswordRecovery(auth, "https://example.com/reset-password?code=test-only", vi.fn())).rejects.toThrow();
  });
  it.each(["#type=recovery", "#type=signup&access_token=a&refresh_token=b", "?error=access_denied"])("rejects invalid or non-recovery callback %s", async (suffix) => {
    const auth = fakeAuth();
    await expect(verifyPasswordRecovery(auth, "https://example.com/reset-password" + suffix, vi.fn())).rejects.toThrow();
    expect(auth.setSession).not.toHaveBeenCalled();
  });
  it("supports verified legacy recovery tokens, not a mere recovery marker", async () => {
    const auth = fakeAuth();
    expect(await verifyPasswordRecovery(auth, "https://example.com/reset-password#type=recovery&access_token=test-only&refresh_token=test-only", vi.fn())).toEqual(verifiedRecovery);
    expect(auth.setSession).toHaveBeenCalledOnce();
  });
  it("rejects an account mismatch in the server's validation result", async () => {
    const auth = fakeAuth();
    auth.getUser.mockResolvedValue({ data: { user: { ...user, id: "other-account" } }, error: null });
    await expect(verifyPasswordRecovery(auth, "https://example.com/reset-password?code=test-only", vi.fn())).rejects.toThrow();
  });
});

describe("password save account binding", () => {
  it("writes using isolated recovery credentials, never the shared client's active login", async () => {
    const current = fakeAuth(), isolated = fakeAuth();
    await saveRecoveryPassword(current, isolated, verifiedRecovery, "test-password-not-real");
    expect(isolated.setSession).toHaveBeenCalledWith({ access_token: session.access_token, refresh_token: session.refresh_token });
    expect(isolated.updateUser).toHaveBeenCalledExactlyOnceWith({ password: "test-password-not-real" });
    expect(current.updateUser).not.toHaveBeenCalled();
  });
  it("blocks a different browser login before any password write", async () => {
    const current = fakeAuth(), isolated = fakeAuth();
    current.getUser.mockResolvedValue({ data: { user: { ...user, id: "other-account" } }, error: null });
    await expect(saveRecoveryPassword(current, isolated, verifiedRecovery, "test-password-not-real")).rejects.toThrow("تغيّر الحساب");
    expect(isolated.setSession).not.toHaveBeenCalled();
    expect(isolated.updateUser).not.toHaveBeenCalled();
  });
  it("rejects a mismatching recovered token owner", async () => {
    const current = fakeAuth(), isolated = fakeAuth();
    isolated.setSession.mockResolvedValue({ data: { user: { ...user, id: "other-account" }, session }, error: null });
    await expect(saveRecoveryPassword(current, isolated, verifiedRecovery, "test-password-not-real")).rejects.toThrow();
    expect(isolated.updateUser).not.toHaveBeenCalled();
  });
  it("checks the isolated account again before saving", async () => {
    const current = fakeAuth(), isolated = fakeAuth();
    isolated.getUser.mockResolvedValue({ data: { user: { ...user, email: "changed@example.com" } }, error: null });
    await expect(saveRecoveryPassword(current, isolated, verifiedRecovery, "test-password-not-real")).rejects.toThrow();
    expect(isolated.updateUser).not.toHaveBeenCalled();
  });
  it("does not report success when the update is rejected", async () => {
    const current = fakeAuth(), isolated = fakeAuth();
    isolated.updateUser.mockResolvedValue({ data: { user: null }, error: new Error("update failed") });
    await expect(saveRecoveryPassword(current, isolated, verifiedRecovery, "test-password-not-real")).rejects.toThrow("update failed");
  });
});
