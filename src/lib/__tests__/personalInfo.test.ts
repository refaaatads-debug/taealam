import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { detectPersonalInfo, maskedEvidence, normalizeForDetection } from "../personalInfo";

const type = (s: string) => detectPersonalInfo(s).type;

// Synthetic messages only. No real user text.
describe("personal info detector", () => {
  it("catches plain, Arabic-digit and spaced phone numbers", () => {
    expect(type("كلمني على 0551234567")).toBe("phone_number");
    expect(type("رقمي ٠٥٥١٢٣٤٥٦٧")).toBe("phone_number");
    expect(type("0 5 5 1 2 3 4 5 6 7")).toBe("phone_number");
    expect(type("05.51.23.45.67")).toBe("phone_number");
    expect(type("+966 55 123 4567")).toBe("phone_number");
  });
  it("catches spelled-out digits (Arabic dialect and English)", () => {
    expect(type("صفر خمسة خمسة واحد اتنين تلاتة اربعة خمسة ستة سبعة")).toBe("phone_number");
    expect(type("zero five five one two three four five six seven")).toBe("phone_number");
  });
  it("catches email, spoken email, handle and links", () => {
    expect(type("mail me at sara.t@example.com")).toBe("email");
    expect(type("sara99 at gmail dot com")).toBe("email");
    expect(detectPersonalInfo("my insta @sara_t99").hits.some((h) => h.kind === "handle")).toBe(true);
    expect(type("https://wa.me/966551234567")).not.toBeNull();
  });
  it("catches addresses with a strong phrase or two weak terms", () => {
    expect(type("عنواني في الرياض")).toBe("address_sharing");
    expect(type("انا ساكن في حي النسيم")).toBe("address_sharing");
    expect(type("شارع الملك عمارة 5 شقة 3")).toBe("address_sharing");
    expect(type("I live in building 4, my address is 12 Palm street")).toBe("address_sharing");
    expect(type("https://maps.google.com/?q=21.5,39.2")).toBe("address_sharing");
  });
  it("platform name alone is medium, with contact intent it is contact sharing", () => {
    expect(type("هل عندك واتساب؟")).toBe("platform_mention");
    expect(type("ضيفني على واتساب")).toBe("contact_sharing");
  });
  it("does not flag normal lesson talk", () => {
    expect(type("افتح صفحة 12 وحل السؤال 4")).toBeNull();
    expect(type("رقم الصفحة 123456")).toBeNull();
    expect(type("الناتج واحد اتنين تلاتة")).toBeNull();
    expect(type("one plus two equals three")).toBeNull();
    expect(type("الشارع في الخريطة اسمه ايه؟")).toBeNull();
    expect(type("حل التمرين ١٢ صفحة ٤٥")).toBeNull();
  });
  it("evidence keeps only kinds and redacted fragments, never the sentence", () => {
    const e1 = maskedEvidence(detectPersonalInfo("my mail is sara.t@example.com thanks"));
    expect(e1).toBe("بريد إلكتروني: sa•••@e•••");
    expect(e1).not.toContain("example");
    const e2 = maskedEvidence(detectPersonalInfo("عنواني شارع الملك عمارة 5 شقة 3 حي النسيم"));
    expect(e2).not.toContain("النسيم");
    expect(e2).not.toContain("5");
    expect(maskedEvidence(detectPersonalInfo("insta @sara_t99"))).toContain("@sa•••");
    expect(maskedEvidence(detectPersonalInfo("صفر خمسة خمسة واحد اتنين تلاتة اربعة خمسة ستة سبعة"))).toBe("رقم هاتف: ••••••••67");
  });
  it("masks digits in evidence, keeping the last two", () => {
    const r = detectPersonalInfo("0551234567");
    expect(maskedEvidence(r)).toBe("رقم هاتف: ••••••••67");
    expect(normalizeForDetection("٠١")).toBe("01");
  });
});

describe("detector copies", () => {
  it("the edge-function copy is identical to the web copy (apart from the header note)", () => {
    const strip = (t: string) => t.split("\n").filter((l) => !l.startsWith("// CANONICAL") && !l.startsWith("// Personal-info detector")).join("\n");
    const web = readFileSync("src/lib/personalInfo.ts", "utf8");
    const fn = readFileSync("supabase/functions/_shared/personalInfo.ts", "utf8");
    expect(strip(web)).toBe(strip(fn));
  });
});
