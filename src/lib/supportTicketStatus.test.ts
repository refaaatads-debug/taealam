import { describe, expect, it } from "vitest";
import { normalizeSupportTicketStatus } from "./supportTicketStatus";

describe("normalizeSupportTicketStatus", () => {
  it.each(["closed", "resolved", "مغلقة", "منتهية"])("treats %s as ended", (status) => {
    expect(normalizeSupportTicketStatus(status)).toBe("closed");
  });

  it("keeps only recognized open statuses in the open bucket", () => {
    expect(normalizeSupportTicketStatus("open")).toBe("open");
    expect(normalizeSupportTicketStatus("legacy_status")).toBe("unknown");
  });
});
