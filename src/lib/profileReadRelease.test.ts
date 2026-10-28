import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared profile API rollout gate", () => {
  it("prioritizes teacher phone denial over legacy phone compatibility", () => {
    const manifest = readFileSync(resolve("scripts/security-migrations.list"), "utf8");
    const compatibility = readFileSync(resolve("supabase/migrations/20261028000500_private_profile_reads.sql"), "utf8");
    expect(manifest).toContain("20261028000500_private_profile_reads.sql");
    expect(manifest).toContain("20261028000700_deny_teacher_student_phone.sql");
    expect(manifest).not.toContain("20261028000600_private_profile_read_cutover.sql");
    expect(compatibility).toContain("FUNCTION public.get_booking_contact");
    expect(compatibility).not.toContain("DROP POLICY");
  });
});
