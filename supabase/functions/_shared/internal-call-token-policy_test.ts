import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { internalCallTokenDenial } from "./internal-call-token-policy.ts";

const caller = "328ac5b7-c495-438d-bdaf-58bdd39cc7f1";
const callee = "00a39848-081c-499e-bc26-331bf3d4e55d";
const config = { agora_enabled: true, test_user_ids: [caller, callee] };
const call = {
  caller_id: caller,
  callee_id: callee,
  status: "connected",
  max_ends_at: "2030-01-01T00:00:00.000Z",
  transport_provider: "agora",
};
const beforeExpiry = new Date("2029-12-31T23:59:00.000Z").getTime();

Deno.test("allows only an authenticated participant in a pinned active Agora test call", () => {
  assertEquals(internalCallTokenDenial(caller, call, config, beforeExpiry), null);
  assertEquals(internalCallTokenDenial(callee, call, config, beforeExpiry), null);
});

Deno.test("denies users outside the call", () => {
  assertEquals(internalCallTokenDenial("not-a-participant", call, config, beforeExpiry), "not_participant");
});

Deno.test("denies a mixed or legacy provider", () => {
  assertEquals(internalCallTokenDenial(caller, { ...call, transport_provider: "webrtc" }, config, beforeExpiry), "provider_mismatch");
});

Deno.test("denies disabled flags and users outside the test allowlist", () => {
  assertEquals(internalCallTokenDenial(caller, call, { ...config, agora_enabled: false }, beforeExpiry), "agora_not_enabled");
  assertEquals(internalCallTokenDenial(caller, call, { ...config, test_user_ids: [caller] }, beforeExpiry), "agora_not_enabled");
});

Deno.test("denies calls that are not accepted, or have expired", () => {
  assertEquals(internalCallTokenDenial(caller, { ...call, status: "ringing" }, config, beforeExpiry), "call_not_active");
  assertEquals(internalCallTokenDenial(caller, call, config, Date.parse("2030-01-01T00:00:00.000Z")), "call_expired");
});
