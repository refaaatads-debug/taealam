import { describe, expect, it, vi } from "vitest";
const sdkFixture = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("agora-rtc-sdk-ng", () => ({ default: sdkFixture }));

describe("on-demand Agora SDK", () => {
  it("shares the same in-flight load and keeps the existing SDK interface", async () => {
    const { loadAgoraSdk } = await import("./agoraSdk");
    const first = loadAgoraSdk();
    expect(loadAgoraSdk()).toBe(first);
    expect(await first).toBe(sdkFixture);
    expect((await loadAgoraSdk()).createClient).toBe(sdkFixture.createClient);
  });
});
