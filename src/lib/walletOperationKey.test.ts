import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { walletOperationKey } from "./walletOperationKey";

describe("wallet retry keys", () => {
  const input = { action: "credit" as const, userId: "target", amount: 10, note: "private note" };
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal("crypto", webcrypto);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("keeps the same key after an unknown network outcome", async () => {
    const first = await walletOperationKey("actor", input);
    const retry = await walletOperationKey("actor", input);
    expect(retry.operationId).toBe(first.operationId);
    expect(sessionStorage.getItem("admin-wallet-pending:actor")).not.toContain(input.note);
  });
  it("starts a new operation only after confirmed success", async () => {
    const first = await walletOperationKey("actor", input);
    first.acknowledge();
    expect((await walletOperationKey("actor", input)).operationId).not.toBe(first.operationId);
  });
  it("does not reuse a key for changed input or another administrator", async () => {
    const first = await walletOperationKey("actor", input);
    expect((await walletOperationKey("actor", { ...input, amount: 11 })).operationId)
      .not.toBe(first.operationId);
    expect((await walletOperationKey("other", input)).operationId).not.toBe(first.operationId);
  });
});
