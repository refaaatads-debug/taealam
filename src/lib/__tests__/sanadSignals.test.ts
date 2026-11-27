import { describe, expect, it } from "vitest";
import { hasSummaryContent, nextSanadSilenceState, shouldShowSanadToast } from "../sanadSignals";

describe("sanad signals", () => {
  it("Sanad suggests silence at the same 240 s level as the teacher warning, once per stretch", () => {
    expect(nextSanadSilenceState(239, false)).toEqual({ suggest: false, notified: false });
    expect(nextSanadSilenceState(240, false)).toEqual({ suggest: true, notified: true });
    expect(nextSanadSilenceState(280, true)).toEqual({ suggest: false, notified: true });
  });
  it("Sanad re-arms after the teacher speaks (clock drops)", () => {
    expect(nextSanadSilenceState(3, true)).toEqual({ suggest: false, notified: false });
  });
  it("empty summary has no content", () => {
    expect(hasSummaryContent(null)).toBe(false);
    expect(hasSummaryContent({ recommendation: "  ", summary_points: [] })).toBe(false);
    expect(hasSummaryContent({ recommendation: "", summary_points: ["", " "] })).toBe(false);
  });
  it("summary with text or points has content", () => {
    expect(hasSummaryContent({ recommendation: "ركز على الأمثلة" })).toBe(true);
    expect(hasSummaryContent({ summary_points: ["نقطة"] })).toBe(true);
  });
  it("toast is rate limited to one per 2 minutes and skipped when the panel is open", () => {
    expect(shouldShowSanadToast({ lastToastAt: 0, now: 60_000, panelOpen: false })).toBe(false);
    expect(shouldShowSanadToast({ lastToastAt: 0, now: 120_000, panelOpen: false })).toBe(true);
    expect(shouldShowSanadToast({ lastToastAt: 0, now: 500_000, panelOpen: true })).toBe(false);
  });
});
