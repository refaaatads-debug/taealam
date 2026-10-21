export interface PendingInPersonRequest {
  id: string;
  mode: "in_person";
  subject_id: string;
  subject_name: string;
  scheduled_at: string;
  status: "open";
  expires_at: string;
}

export function mapOpenInPersonRequests(
  rows: Array<Record<string, unknown>>,
  now = Date.now()
): PendingInPersonRequest[] {
  return rows.flatMap((row) => {
    const deadline = String(row.acceptance_deadline || "");
    const deadlineTime = new Date(deadline).getTime();
    const id = String(row.request_group_id || "");
    if (row.status !== "open" || !id || !deadline || deadlineTime <= now) return [];

    return [{
      id,
      mode: "in_person",
      subject_id: "",
      subject_name: String(row.subject_name || "حصة حضورية"),
      scheduled_at: String(row.scheduled_at || ""),
      status: "open",
      expires_at: deadline,
    }];
  });
}
