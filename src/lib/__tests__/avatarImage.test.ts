import { describe, expect, it } from "vitest";
import { squareCrop, targetSide, validateAvatarInput, AVATAR_MAX_SIDE } from "../avatarImage";

describe("avatar helpers", () => {
  it("center-crops a landscape image to a square", () => {
    expect(squareCrop(1600, 900)).toEqual({ sx: 350, sy: 0, side: 900 });
  });
  it("center-crops a portrait image to a square", () => {
    expect(squareCrop(900, 1600)).toEqual({ sx: 0, sy: 350, side: 900 });
  });
  it("keeps a square as is", () => {
    expect(squareCrop(400, 400)).toEqual({ sx: 0, sy: 0, side: 400 });
  });
  it("never upsizes and caps at the max side", () => {
    expect(targetSide(300)).toBe(300);
    expect(targetSide(4000)).toBe(AVATAR_MAX_SIDE);
    expect(targetSide(0)).toBe(1);
  });
  it("rejects non-images and huge files", () => {
    expect(validateAvatarInput({ type: "application/pdf", size: 10 })).not.toBeNull();
    expect(validateAvatarInput({ type: "image/png", size: 20 * 1024 * 1024 })).not.toBeNull();
    expect(validateAvatarInput({ type: "image/jpeg", size: 2 * 1024 * 1024 })).toBeNull();
  });
});
