import { describe, expect, it } from "vitest";
import { mapOpenInPersonRequests } from "./pendingInPersonRequests";

describe("mapOpenInPersonRequests", () => {
  it("adds a live in-person request to the pending list with its acceptance deadline", () => {
    const rows = mapOpenInPersonRequests([{
      request_group_id: "group-1",
      subject_name: "رياضيات",
      scheduled_at: "2026-10-22T13:00:00Z",
      status: "open",
      acceptance_deadline: "2026-10-21T13:00:00Z",
    }], Date.parse("2026-10-21T12:30:00Z"));

    expect(rows).toEqual([expect.objectContaining({
      id: "group-1",
      mode: "in_person",
      subject_name: "رياضيات",
      status: "open",
      expires_at: "2026-10-21T13:00:00Z",
    })]);
  });

  it("does not show completed or expired in-person requests as pending", () => {
    const rows = mapOpenInPersonRequests([
      { request_group_id: "expired", status: "open", acceptance_deadline: "2026-10-21T12:00:00Z" },
      { request_group_id: "accepted", status: "accepted", acceptance_deadline: "2026-10-21T13:00:00Z" },
    ], Date.parse("2026-10-21T12:30:00Z"));

    expect(rows).toEqual([]);
  });
});
