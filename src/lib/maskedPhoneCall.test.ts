import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { callWalletAmount } from "../../supabase/functions/_shared/call-wallet-amount";

const teacher = "71000000-0000-4000-8000-000000000001";
const student = "71000000-0000-4000-8000-000000000002";
const bookingId = "71000000-0000-4000-8000-000000000003";
const callId = "71000000-0000-4000-8000-000000000004";
const studentPhone = "+966511111111";
const teacherPhone = "+966522222222";
const platformPhone = "+15005550006";
type Options = { unauthorized?: boolean; wrongTeacher?: boolean; balance?: number; failReservation?: boolean; failProviderAt?: number };
type Write = { table: string; action: string; payload: Record<string, unknown> };

function evaluate(name: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8").replace(/^import .*;\r?\n/gm, "");
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies));
}
function harness(options: Options = {}) {
  const writes: Write[] = [];
  const reservations: { name: string; args: Record<string, unknown> }[] = [];
  const provider: URLSearchParams[] = [];
  const providerCancellations: string[] = [];
  let profileReads = 0;
  class Query {
    action = "read";
    constructor(readonly table: string) {}
    select() { return this; }
    eq() { return this; }
    in() { return this; }
    order() { return this; }
    limit() { return this; }
    insert(payload: Record<string, unknown>) { this.action = "insert"; writes.push({ table: this.table, action: this.action, payload }); return this; }
    update(payload: Record<string, unknown>) { this.action = "update"; writes.push({ table: this.table, action: this.action, payload }); return this; }
    result() {
      let data: unknown = null;
      if (this.table === "site_settings") data = { value: "0.30" };
      if (this.table === "wallets") data = { balance: options.balance ?? 10 };
      if (this.table === "bookings") data = { id: bookingId, teacher_id: options.wrongTeacher ? student : teacher,
        student_id: student, duration_minutes: 30, status: "confirmed" };
      if (this.table === "profiles") { profileReads++; data = [{ user_id: teacher, phone: teacherPhone }, { user_id: student, phone: studentPhone }]; }
      if (this.table === "call_logs" && this.action === "insert") data = { id: callId };
      return { data, error: null };
    }
    maybeSingle() { return Promise.resolve(this.result()); }
    single() { return Promise.resolve(this.result()); }
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(this.result()).then(resolve, reject); }
  }
  const client = {
    auth: { getUser: async () => options.unauthorized ? { data: null, error: {} } : { data: { user: { id: teacher } }, error: null } },
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      reservations.push({ name, args });
      if (name === "deduct_wallet_balance" && options.failReservation) return { data: null, error: { message: "declined" } };
      return { data: name === "deduct_wallet_balance" ? 9.1 : 10, error: null };
    },
  };
  const environment: Record<string, string> = { TWILIO_ACCOUNT_SID: "AC_mock", TWILIO_AUTH_TOKEN: "mock-secret",
    TWILIO_PHONE_NUMBER: platformPhone, SUPABASE_URL: "https://mock.invalid", SUPABASE_ANON_KEY: "mock-public",
    SUPABASE_SERVICE_ROLE_KEY: "mock-service" };
  let handler!: (req: Request) => Promise<Response>;
  const capture = (value: typeof handler) => { handler = value; };
  evaluate("twilio-call", {
    Deno: { env: { get: (key: string) => environment[key] }, serve: capture },
    createClient: () => client, callWalletAmount, getCorsHeaders: () => ({}),
    checkEdgeRateLimit: () => ({ allowed: true }), crypto: webcrypto,
    fetch: async (url: string, init: RequestInit) => {
      const parameters = new URLSearchParams(init.body as URLSearchParams);
      if (url.endsWith("/Calls.json")) {
        provider.push(parameters);
        if (provider.length === options.failProviderAt) return Response.json({ code: 21219, message: `Cannot dial ${studentPhone}` }, { status: 400 });
        expect(reservations.some((item) => item.name === "deduct_wallet_balance")).toBe(true);
        return Response.json({ sid: `CA${String(provider.length).repeat(32)}` });
      }
      providerCancellations.push(parameters.get("Status") || "");
      return Response.json({ status: "completed" });
    },
  });
  const primary = handler;
  evaluate("make-phone-call", {
    Deno: { env: { get: (key: string) => environment[key] } }, serve: capture,
    getCorsHeaders: () => ({}), checkEdgeRateLimit: () => ({ allowed: true }),
    fetch: async (url: string, init: RequestInit) => {
      const forwarded = JSON.parse(String(init.body));
      expect(forwarded).not.toHaveProperty("studentPhone");
      expect(forwarded).not.toHaveProperty("teacherPhone");
      return primary(new Request(url, init));
    },
  });
  const legacy = handler;
  const request = (body: Record<string, unknown>) => new Request("https://mock.invalid", {
    method: "POST", headers: { Authorization: "Bearer mock-user-jwt", "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { primary, legacy, request, writes, reservations, provider, providerCancellations, profileReads: () => profileReads };
}

describe("masked Twilio conference (mock provider only; no billable calls)", () => {
  for (const entry of ["primary", "legacy"] as const) {
    it(`${entry} calls both server-resolved participants and preserves wallet reservation/history`, async () => {
      const h = harness();
      const response = await h[entry](h.request({ bookingId, studentId: student, estimatedMinutes: 3, studentPhone: "+966599999999" }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ success: true, callLogId: callId, cost: 0.9, newBalance: 9.1 });
      expect(h.provider).toHaveLength(2);
      expect(h.provider.map((item) => item.get("To"))).toEqual([studentPhone, teacherPhone]);
      for (const item of h.provider) {
        expect(item.get("From")).toBe(platformPhone);
        expect(item.get("TimeLimit")).toBe("180");
        expect(item.get("Twiml")).toContain("<Conference");
        expect(item.get("Twiml")).toContain("streamSignature");
        expect(item.get("Twiml")).not.toContain(studentPhone);
        expect(item.get("Twiml")).not.toContain(teacherPhone);
      }
      expect(h.provider[0].get("Twiml")).toBe(h.provider[1].get("Twiml"));
      expect(h.reservations[0]).toMatchObject({ name: "deduct_wallet_balance", args: { _user_id: teacher, _amount: 0.9, _reference_id: callId } });
      const visible = JSON.stringify({ body, writes: h.writes });
      expect(visible).not.toContain(studentPhone);
      expect(visible).not.toContain(teacherPhone);
      expect(visible).not.toContain("+966599999999");
    });
  }
  it("denies an unrelated caller before private phone lookup or provider access", async () => {
    const h = harness({ wrongTeacher: true });
    expect((await h.primary(h.request({ bookingId, estimatedMinutes: 3 }))).status).toBe(403);
    expect(h.profileReads()).toBe(0); expect(h.provider).toHaveLength(0); expect(h.reservations).toHaveLength(0);
  });
  it("rejects unauthenticated calls", async () => {
    const h = harness({ unauthorized: true });
    expect((await h.primary(h.request({ bookingId }))).status).toBe(401);
    expect(h.provider).toHaveLength(0);
  });
  it("does not dial on insufficient balance or failed reservation", async () => {
    for (const options of [{ balance: 0 }, { failReservation: true }]) {
      const h = harness(options);
      expect((await h.primary(h.request({ bookingId, estimatedMinutes: 3 }))).status).toBeGreaterThanOrEqual(400);
      expect(h.provider).toHaveLength(0);
    }
  });
  it("cancels the created leg and refunds when the second leg fails, without reflecting provider phone errors", async () => {
    const h = harness({ failProviderAt: 2 });
    const response = await h.primary(h.request({ bookingId, estimatedMinutes: 3 }));
    expect(response.status).toBe(500);
    expect(h.providerCancellations).toEqual(["completed"]);
    expect(h.reservations.filter((item) => item.name === "credit_wallet_balance")).toHaveLength(1);
    expect(h.reservations[1].args._amount).toBe(0.9);
    expect(JSON.stringify({ body: await response.json(), writes: h.writes })).not.toContain(studentPhone);
  });
});
