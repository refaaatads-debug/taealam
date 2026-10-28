import { describe, expect, it } from "vitest";
import { validateLearningMaterialDraft } from "./learningMaterialLinks";

describe("learning material links", () => {
  it("trims the name and description and normalizes a secure URL", () => {
    expect(validateLearningMaterialDraft({
      name: "  الكتب المدرسية - منهجي  ",
      description: "  مصدر للكتب الدراسية. ",
      url: "https://www.mnhaji.com/fsl2/",
    })).toEqual({
      name: "الكتب المدرسية - منهجي",
      description: "مصدر للكتب الدراسية.",
      url: "https://www.mnhaji.com/fsl2/",
    });
  });

  it("rejects non-HTTPS URLs", () => {
    expect(() => validateLearningMaterialDraft({
      name: "منهج",
      description: "وصف",
      url: "http://example.com",
    })).toThrow("https://");
  });

  it("rejects malformed links and embedded credentials", () => {
    expect(() => validateLearningMaterialDraft({
      name: "منهج",
      description: "وصف",
      url: "not a url",
    })).toThrow("https://");
    expect(() => validateLearningMaterialDraft({
      name: "منهج",
      description: "وصف",
      url: "https://user:password@example.com",
    })).toThrow("https://");
  });

  it("requires a name and description within their limits", () => {
    expect(() => validateLearningMaterialDraft({ name: " ", description: "وصف", url: "https://example.com" }))
      .toThrow("اسمًا");
    expect(() => validateLearningMaterialDraft({ name: "اسم", description: " ", url: "https://example.com" }))
      .toThrow("وصفًا");
    expect(() => validateLearningMaterialDraft({ name: "ن".repeat(121), description: "وصف", url: "https://example.com" }))
      .toThrow("120 حرفًا");
  });
});
