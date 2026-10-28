import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("student phone confidentiality", () => {
  for (const name of ["make-phone-call", "twilio-call"]) {
    it(`keeps ${name} available without the temporary shutdown`, () => {
      const text = readFileSync(resolve(`supabase/functions/${name}/index.ts`), "utf8");
      expect(text).not.toContain("PHONE_CALLS_DISABLED");
    });
  }
  it("keeps telephone and internal actions without fetching contact numbers", () => {
    const text = readFileSync(resolve("src/components/teacher/CallStudentButton.tsx"), "utf8");
    expect(text).not.toMatch(/get_booking_contact|studentPhone/);
    expect(text).toContain("PhoneCallDialog");
    expect(text).toContain("startInternalCall");
    const dialog = readFileSync(resolve("src/components/teacher/PhoneCallDialog.tsx"), "utf8");
    expect(dialog).toContain("body: { studentId, bookingId, estimatedMinutes: minutes }");
    expect(dialog).not.toMatch(/get_booking_contact|studentPhone|student_phone|from\("profiles"\)|from\("call_logs"\)/);
  });
  it("teacher history uses a projection without even partial student numbers", () => {
    const text = readFileSync(resolve("src/pages/TeacherWallet.tsx"), "utf8");
    expect(text).toContain('from("teacher_call_history")');
    expect(text).not.toContain("student_phone");
  });
});
