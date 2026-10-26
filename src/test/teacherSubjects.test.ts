import { describe, expect, it } from "vitest";
import { toggleTeacherSubjectSelection } from "@/lib/teacherSubjects";

describe("toggleTeacherSubjectSelection", () => {
  it("keeps existing subjects when adding another", () => {
    expect(toggleTeacherSubjectSelection(["math"], "science")).toEqual(["math", "science"]);
  });

  it("removes only the selected subject", () => {
    expect(toggleTeacherSubjectSelection(["math", "science", "arabic"], "science"))
      .toEqual(["math", "arabic"]);
  });

  it("does not add the same subject twice", () => {
    expect(toggleTeacherSubjectSelection(["math"], "math")).toEqual([]);
  });
});
