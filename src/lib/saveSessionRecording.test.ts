import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { parseSessionRecordingUrl } from "../../supabase/functions/_shared/session-recording-url";

const teacher = "71000000-0000-4000-8000-000000000001";
const student = "71000000-0000-4000-8000-000000000002";
const booking = "71000000-0000-4000-8000-000000000003";
const other = "71000000-0000-4000-8000-000000000004";
const recordingUrl = (owner = teacher, id = booking) =>
  `https://ajyalalmaerifa.com/storage/v1/object/sign/session-recordings/${owner}/${id}_1793200000000.webm?token=test-only`;

type Options = { caller?: string; existing?: boolean; active?: boolean; duration?: number };
function harness(options: Options = {}) {
  const writes: { table: string; value: Record<string, unknown> }[] = [];
  class Query {
    writing = false;
    constructor(readonly table: string) {}
    select() { return this; }
    eq() { return this; }
    update(value: Record<string, unknown>) { this.writing = true; writes.push({ table: this.table, value }); return this; }
    insert(value: Record<string, unknown>) { this.writing = true; writes.push({ table: this.table, value }); return this; }
    result() {
      if (this.writing) return { data: null, error: null };
      const data = this.table === "bookings"
        ? { id: booking, teacher_id: teacher, student_id: student }
        : this.table === "sessions"
          ? { id: "test-session", started_at: "2026-10-28T15:00:00Z", ended_at: options.active ? null : "2026-10-28T15:06:00Z", duration_minutes: options.duration ?? 6 }
          : this.table === "session_materials"
            ? options.existing ? { id: "test-material" } : null
            : { full_name: "معلم تجريبي" };
      return { data, error: null };
    }
    single() { return Promise.resolve(this.result()); }
    maybeSingle() { return Promise.resolve(this.result()); }
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(this.result()).then(resolve, reject);
    }
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: options.caller ?? teacher } }, error: null }) },
    from: (table: string) => new Query(table),
  };
  let handler!: (request: Request) => Promise<Response>;
  const source = readFileSync("supabase/functions/save-session-recording/index.ts", "utf8")
    .replace(/^import .*;\r?\n/gm, "");
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("serve", "createClient", "getCorsHeaders", "parseSessionRecordingUrl", "Deno", javascript)(
    (callback: typeof handler) => { handler = callback; },
    () => client,
    () => ({}),
    parseSessionRecordingUrl,
    { env: { get: (name: string) => name === "SUPABASE_URL" ? "http://kong:8000" : "test-key-not-real" } },
  );
  const call = (url = recordingUrl()) => handler(new Request("https://ajyalalmaerifa.com/functions/v1/save-session-recording", {
    method: "POST", headers: { authorization: "Bearer test-only", "content-type": "application/json" },
    body: JSON.stringify({ booking_id: booking, recording_url: url }),
  }));
  return { call, writes };
}

describe("save-session-recording handler", () => {
  it("links a public proxy recording and creates materials after a completed qualifying session", async () => {
    const h = harness();
    const response = await h.call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, material_created: true, linked_to_materials: true });
    expect(h.writes.map((write) => write.table)).toEqual(["sessions", "session_materials"]);
    expect(h.writes[1].value).toMatchObject({ recording_url: recordingUrl(), teacher_id: teacher, student_id: student });
  });
  it("updates the existing material instead of creating a duplicate", async () => {
    const h = harness({ existing: true });
    expect(await (await h.call()).json()).toMatchObject({ material_updated: true, material_created: false });
    expect(h.writes[1].value).toEqual({ recording_url: recordingUrl() });
  });
  it.each([{ active: true }, { duration: 4 }])("does not publish materials before the existing duration/end gate", async (options) => {
    const h = harness(options);
    expect(await (await h.call()).json()).toMatchObject({ linked_to_materials: false });
    expect(h.writes.map((write) => write.table)).toEqual(["sessions"]);
  });
  it("allows the student participant to link this booking's recording", async () => {
    expect((await harness({ caller: student }).call()).status).toBe(200);
  });
  it.each([
    { options: { caller: other }, url: recordingUrl() },
    { options: {}, url: recordingUrl(teacher, other) },
    { options: {}, url: recordingUrl(other) },
  ])("rejects unauthorized callers or another booking/owner without writes", async ({ options, url }) => {
    const h = harness(options);
    expect((await h.call(url)).status).toBe(403);
    expect(h.writes).toEqual([]);
  });
  it("rejects an arbitrary URL without database writes", async () => {
    const h = harness();
    expect((await h.call(recordingUrl().replace("ajyalalmaerifa.com", "evil.invalid"))).status).toBe(400);
    expect(h.writes).toEqual([]);
  });
  it("does not clear local recovery or mark sync success before the link response is checked", () => {
    const source = readFileSync("src/pages/LiveSession.tsx", "utf8");
    expect(source).toMatch(/if \(saveRecordingError\) throw saveRecordingError;\s+await clearRecordingBackup/);
    expect(source).toMatch(/if \(saveRecordingError\) throw saveRecordingError;\s+uploadFailureCountRef\.current = 0/);
  });
});
