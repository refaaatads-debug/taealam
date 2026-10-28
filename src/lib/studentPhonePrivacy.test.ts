import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("student phone confidentiality", () => {
  for (const name of ["make-phone-call", "twilio-call"]) {
    it(`rejects ${name} before provider access or wallet mutation`, async () => {
      const text = readFileSync(resolve(`supabase/functions/${name}/index.ts`), "utf8");
      const body = text.slice(text.indexOf("  const corsHeaders ="), text.indexOf("  const rate ="));
      const handler = new Function("getCorsHeaders", `return async (req) => {${body}}`)(() => ({}));
      const response = await handler(new Request("https://test.invalid", { method: "POST" }));
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe("PHONE_CALLS_DISABLED");
    });
  }
  it("does not fetch contact numbers or offer telephone calling in the teacher action", () => {
    const text = readFileSync(resolve("src/components/teacher/CallStudentButton.tsx"), "utf8");
    expect(text).not.toMatch(/get_booking_contact|studentPhone|PhoneCallDialog|اتصال هاتفي/);
    expect(text).toContain("startInternalCall");
  });
  it("teacher history uses a projection without even partial student numbers", () => {
    const text = readFileSync(resolve("src/pages/TeacherWallet.tsx"), "utf8");
    expect(text).toContain('from("teacher_call_history")');
    expect(text).not.toContain("student_phone");
  });
});
