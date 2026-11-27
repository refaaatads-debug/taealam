import { describe, expect, it } from "vitest";
import {
  folderAgeMs, leadingContiguous, newPartsState, partName, partsFolderForFile, pickBestSegment,
  planRanges, recoverOrphanedParts, uploadNewParts,
} from "./recordingParts";

const noSleep = async () => {};
const blobOf = (n: number, fill = 1) => new Blob([new Uint8Array(n).fill(fill)]);

describe("recording parts", () => {
  it("derives the parts folder from the final file name", () => {
    expect(partsFolderForFile("u1/b1_123.webm")).toBe("u1/parts/b1_123");
    expect(partsFolderForFile("bad")).toBeNull();
    expect(partName("u1/parts/b1_123", 0, 7)).toBe("u1/parts/b1_123/00-000007.webm");
  });

  it("splits ranges without gaps or overlaps", () => {
    expect(planRanges(10, 0, 4)).toEqual([[0, 4], [4, 8], [8, 10]]);
    expect(planRanges(10, 10, 4)).toEqual([]);
    expect(planRanges(10, 6, 4)).toEqual([[6, 10]]);
  });

  it("uploads only new bytes each time (total = file size, not a sum of growing files)", async () => {
    const state = newPartsState();
    const sent: number[] = [];
    const up = async (_n: string, b: Blob) => { sent.push(b.size); };
    await uploadNewParts(blobOf(100), "canvas", "u/parts/b_1", state, up, [0], noSleep);
    await uploadNewParts(blobOf(250), "canvas", "u/parts/b_1", state, up, [0], noSleep);
    await uploadNewParts(blobOf(250), "canvas", "u/parts/b_1", state, up, [0], noSleep);
    expect(sent).toEqual([100, 150]);
    expect(sent.reduce((a, b) => a + b, 0)).toBe(250);
  });

  it("never skips bytes after a failure: next call resends from the last confirmed byte", async () => {
    const state = newPartsState();
    let fail = true;
    const names: string[] = [];
    const sizes: number[] = [];
    const up = async (n: string, b: Blob) => { if (fail) throw new Error("net"); names.push(n); sizes.push(b.size); };
    expect(await uploadNewParts(blobOf(100), "c", "f", state, up, [0, 1], noSleep)).toBe(false);
    expect(state.offset).toBe(0);
    fail = false;
    expect(await uploadNewParts(blobOf(180), "c", "f", state, up, [0], noSleep)).toBe(true);
    expect(sizes).toEqual([180]);
    expect(names).toEqual(["f/00-000001.webm"]);
  });

  it("starts a new segment if the recording source changes", async () => {
    const state = newPartsState();
    const names: string[] = [];
    const up = async (n: string) => { names.push(n); };
    await uploadNewParts(blobOf(50), "canvas", "f", state, up, [0], noSleep);
    await uploadNewParts(blobOf(80), "direct", "f", state, up, [0], noSleep);
    expect(names).toEqual(["f/00-000001.webm", "f/01-000001.webm"]);
  });

  it("recovery picks the biggest segment and only a gapless run", () => {
    const parts = [
      { name: "00-000001.webm", size: 10 }, { name: "01-000001.webm", size: 100 },
      { name: "01-000002.webm", size: 100 }, { name: "01-000004.webm", size: 100 },
    ];
    const best = pickBestSegment(parts);
    expect(best.map((p) => p.name)).toEqual(["01-000001.webm", "01-000002.webm", "01-000004.webm"]);
    expect(leadingContiguous(best).map((p) => p.name)).toEqual(["01-000001.webm", "01-000002.webm"]);
  });

  it("age of a parts folder comes from its timestamp", () => {
    expect(folderAgeMs("b_1000000000000", 1000000005000)).toBe(5000);
    expect(folderAgeMs("nonsense")).toBeNull();
  });

  function fakeClient(opts: { finalExists?: boolean; linkFails?: boolean }) {
    const removed: string[] = [];
    const uploaded: string[] = [];
    const store: Record<string, Blob> = {
      "u/parts/b_1000000000000/00-000001.webm": new Blob(["AA"]),
      "u/parts/b_1000000000000/00-000002.webm": new Blob(["BB"]),
    };
    const bucket = {
      list: async (path: string, o?: any) => {
        if (path === "u/parts") return { data: [{ name: "b_1000000000000" }], error: null };
        if (path === "u/parts/b_1000000000000")
          return { data: Object.keys(store).map((k) => ({ name: k.split("/").pop(), metadata: { size: 2 } })), error: null };
        if (path === "u") return { data: opts.finalExists ? [{ name: "b_1000000000000.webm" }] : [], error: null };
        return { data: [], error: null };
      },
      download: async (p: string) => ({ data: store[p] ?? null, error: store[p] ? null : new Error("x") }),
      upload: async (p: string) => { uploaded.push(p); return { error: null }; },
      remove: async (ps: string[]) => { removed.push(...ps); return { error: null }; },
      createSignedUrl: async () => ({ data: { signedUrl: "https://x/y?token=t" }, error: null }),
    };
    const client: any = {
      storage: { from: () => bucket },
      functions: { invoke: async () => ({ error: opts.linkFails ? new Error("link") : null }) },
    };
    return { client, removed, uploaded };
  }

  it("recovery rebuilds, links, then deletes parts", async () => {
    const { client, removed, uploaded } = fakeClient({});
    const n = await recoverOrphanedParts(client, "u", 1000000000000 + 4 * 3600_000);
    expect(n).toBe(1);
    expect(uploaded).toEqual(["u/b_1000000000000.webm"]);
    expect(removed.length).toBe(2);
  });

  it("recovery keeps the parts if linking fails", async () => {
    const { client, removed } = fakeClient({ linkFails: true });
    expect(await recoverOrphanedParts(client, "u", 1000000000000 + 4 * 3600_000)).toBe(0);
    expect(removed).toEqual([]);
  });

  it("recovery leaves recent (maybe live) sessions alone", async () => {
    const { client, removed, uploaded } = fakeClient({});
    expect(await recoverOrphanedParts(client, "u", 1000000000000 + 60_000)).toBe(0);
    expect(removed).toEqual([]);
    expect(uploaded).toEqual([]);
  });
});
