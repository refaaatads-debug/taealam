import { describe, it, expect } from "vitest";
import { promotedFirst } from "./teacherPromotions";

describe("promotedFirst", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  it("puts promoted teachers first in promotion order and keeps the rest in order", () => {
    expect(promotedFirst(list, (x) => x.id, ["c", "a"]).map((x) => x.id)).toEqual(["c", "a", "b", "d"]);
  });
  it("returns the list unchanged when nothing is promoted", () => {
    expect(promotedFirst(list, (x) => x.id, [])).toBe(list);
  });
  it("ignores promoted ids that are not in the results", () => {
    expect(promotedFirst(list, (x) => x.id, ["zzz", "d"]).map((x) => x.id)).toEqual(["d", "a", "b", "c"]);
  });
});
