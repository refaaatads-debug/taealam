import { describe, expect, it } from "vitest";
import { hasSummaryContent, isTeacherVoiceSilent, shouldShowSanadToast } from "../sanadSignals";

describe("sanad signals", () => {
  it("silence needs 4 minutes without teacher voice, not 2", () => {
    expect(isTeacherVoiceSilent(0, 120_000)).toBe(false);
    expect(isTeacherVoiceSilent(0, 239_000)).toBe(false);
    expect(isTeacherVoiceSilent(0, 240_000)).toBe(true);
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
