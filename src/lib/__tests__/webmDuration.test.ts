import { describe, expect, it } from "vitest";
import { withWebmDuration } from "../webmDuration";

describe("withWebmDuration", () => {
  it("leaves non-WebM blobs untouched", async () => {
    const blob = new Blob(["video"], { type: "video/mp4" });
    await expect(withWebmDuration(blob, 12_000)).resolves.toBe(blob);
  });

  it("leaves blobs untouched when duration is unavailable", async () => {
    const blob = new Blob(["video"], { type: "video/webm" });
    await expect(withWebmDuration(blob)).resolves.toBe(blob);
    await expect(withWebmDuration(blob, 0)).resolves.toBe(blob);
  });
});
