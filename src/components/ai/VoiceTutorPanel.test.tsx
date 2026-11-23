import { act, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceTutorOrb, VoiceTutorPanel } from "./VoiceTutorPanel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function animationFrames() {
  let callback: FrameRequestCallback | undefined;
  const request = vi.fn((cb: FrameRequestCallback) => { callback = cb; return 7; });
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  return { tick: () => act(() => callback?.(0)), request, cancel };
}

describe("audio-driven tutor orb", () => {
  it("reads output volume, rises with audio, settles in silence and resets on stop", () => {
    const frames = animationFrames();
    let volume = 0;
    const meter = vi.fn(() => volume);
    const { rerender, unmount } = render(<VoiceTutorOrb speaking getOutputVolume={meter} />);
    const orb = screen.getByTestId("voice-orb");
    frames.tick();
    expect(orb.style.getPropertyValue("--voice-level")).toBe("0");
    volume = 0.8;
    frames.tick();
    const loud = Number(orb.style.getPropertyValue("--voice-level"));
    expect(loud).toBeGreaterThan(0.4);
    volume = 0;
    frames.tick();
    expect(Number(orb.style.getPropertyValue("--voice-level"))).toBeLessThan(loud);
    rerender(<VoiceTutorOrb speaking={false} getOutputVolume={meter} />);
    expect(orb.style.getPropertyValue("--voice-level")).toBe("0");
    expect(frames.cancel).toHaveBeenCalledWith(7);
    unmount();
  });
  it("never polls when idle and cancels the frame on unmount", () => {
    const frames = animationFrames();
    const meter = vi.fn(() => 0.9);
    const { rerender, unmount } = render(<VoiceTutorOrb speaking={false} getOutputVolume={meter} />);
    expect(frames.request).not.toHaveBeenCalled();
    rerender(<VoiceTutorOrb speaking getOutputVolume={meter} />);
    unmount();
    expect(frames.cancel).toHaveBeenCalledWith(7);
  });
  it("clamps invalid samples and respects reduced motion", () => {
    const frames = animationFrames();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<VoiceTutorOrb speaking getOutputVolume={() => Number.NaN} />);
    frames.tick();
    expect(screen.getByTestId("voice-orb").style.getPropertyValue("--voice-level")).toBe("0");
  });
  it("renders RTL Arabic, transcript and supplied controls without starting a session", () => {
    animationFrames();
    render(<VoiceTutorPanel state="listening" getOutputVolume={() => 0} userText="سؤالي" assistantText="إجابتي"><button>إنهاء</button></VoiceTutorPanel>);
    expect(screen.getByRole("region").getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("status").textContent).toContain("أنا أستمع إليك");
    expect(screen.getByText("سؤالي")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إنهاء" })).toBeTruthy();
  });
});
