// Personal-info detector shared by the browser (chat + teacher voice) and the server functions.
// Pure TypeScript, no Deno or browser APIs, so the same file is tested with vitest and imported by edge functions.

export type PersonalInfoType =
  | "contact_sharing"
  | "address_sharing"
  | "social_media_attempt"
  | "platform_mention"
  | "external_link"
  | "email"
  | "phone_number";

export interface PersonalInfoHit {
  type: PersonalInfoType;
  kind: string; // short machine reason, e.g. "phone_digits", "address_phrase"
  matched: string; // the matched fragment (for admin evidence)
}

export interface PersonalInfoResult {
  detected: boolean;
  type: PersonalInfoType | null; // most serious type found
  hits: PersonalInfoHit[];
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

// Spelled digits (Arabic dialects + English). Longest first so "تلاتة" wins over "تلات".
const SPELLED: Array<[string, string]> = [
  ["صفر", "0"], ["zero", "0"],
  ["واحد", "1"], ["one", "1"],
  ["اتنين", "2"], ["اثنين", "2"], ["إثنين", "2"], ["two", "2"],
  ["تلاتة", "3"], ["ثلاثة", "3"], ["ثلاثه", "3"], ["تلاته", "3"], ["three", "3"],
  ["اربعة", "4"], ["أربعة", "4"], ["اربعه", "4"], ["أربعه", "4"], ["four", "4"],
  ["خمسة", "5"], ["خمسه", "5"], ["five", "5"],
  ["ستة", "6"], ["سته", "6"], ["six", "6"],
  ["سبعة", "7"], ["سبعه", "7"], ["seven", "7"],
  ["تمانية", "8"], ["ثمانية", "8"], ["تمانيه", "8"], ["ثمانيه", "8"], ["eight", "8"],
  ["تسعة", "9"], ["تسعه", "9"], ["nine", "9"],
];

// "Page 12 question 4" style school talk is not a phone number.
const SCHOOL_CONTEXT = /(?:رقم\s*(?:الصفحة|السؤال|التمرين|الدرس|الوحدة|الفصل)|صفحة\s*رقم|page\s*number|question\s*number|exercise)/i;

export function normalizeDigits(text: string): string {
  let out = "";
  for (const ch of text) {
    const a = ARABIC_INDIC.indexOf(ch);
    const p = PERSIAN.indexOf(ch);
    out += a >= 0 ? String(a) : p >= 0 ? String(p) : ch;
  }
  return out;
}

// Replace spelled-out digits by digits, only when at least 6 appear in a row
// (so a normal sentence containing "one" or "واحد" is untouched).
export function replaceSpelledDigits(text: string): string {
  const tokens = text.split(/(\s+)/);
  const map = new Map(SPELLED.map(([w, d]) => [w, d]));
  const out: string[] = [];
  let run: Array<{ idx: number; digit: string }> = [];
  const flush = () => {
    if (run.length >= 6) for (const r of run) out[r.idx] = r.digit;
    run = [];
  };
  for (const t of tokens) {
    const idx = out.length;
    out.push(t);
    if (/^\s+$/.test(t)) continue;
    const clean = t.toLowerCase().replace(/[.,،\-_]/g, "");
    const d = map.get(clean);
    if (d !== undefined) run.push({ idx, digit: d });
    else if (/^\d$/.test(clean)) run.push({ idx, digit: clean });
    else flush();
  }
  flush();
  return out.join("");
}

export function normalizeForDetection(text: string): string {
  const t = normalizeDigits(text || "").replace(/[\u0640\u064B-\u065F]/g, ""); // tatweel + diacritics
  return replaceSpelledDigits(t);
}

export function maskDigits(s: string): string {
  const digits = s.replace(/\D/g, "").length;
  let seen = 0;
  return s.replace(/\d/g, (d) => {
    seen++;
    return digits - seen < 2 ? d : "•";
  });
}

const PLATFORM_WORDS = [
  "واتساب", "واتس اب", "واتس", "whatsapp", "whats app",
  "تلجرام", "تليجرام", "تلغرام", "telegram",
  "سناب", "سنابي", "snapchat", "snap chat",
  "انستقرام", "انستغرام", "انستا", "instagram",
  "فيسبوك", "facebook", "تيك توك", "tiktok", "ديسكورد", "discord", "imo", "ايمو",
];

const CONTACT_INTENT = [
  /تواصل\s*(?:معي|معايا)/, /كلمني/, /كلّمني/, /اتصل\s*(?:بي|فيني|عليا)/, /رقمي/, /نمرتي/, /رقمك/, /نمرتك/,
  /ضيفني/, /أضفني/, /اضفني/, /ابعتلي/, /ابعت\s*لي\s*(?:رقم|حساب)/,
  /contact\s*me/i, /call\s*me/i, /text\s*me/i, /my\s*number/i, /your\s*number/i, /add\s*me/i, /dm\s*me/i,
  /خارج\s*المنصة/, /برا\s*(?:المنصة|الموقع)/, /outside\s*(?:the\s*)?platform/i,
];

// Strong address phrases: one is enough.
const ADDRESS_STRONG = [
  /عنواني/, /عنوان\s*(?:بيتي|منزلي|سكني)/, /(?:اسكن|أسكن|ساكن|ساكنة|بسكن)\s*(?:في|ف)/, /(?:بيتي|منزلي)\s*(?:في|ف)/,
  /(?:ابعتلك|ارسل\s*لك|هبعتلك)\s*(?:الموقع|اللوكيشن|العنوان)/, /(?:لوكيشن|موقعي|لوكيشني)/,
  /my\s*address/i, /i\s*live\s*(?:in|at|on)/i, /my\s*(?:home|house)\s*(?:is|at)/i, /share\s*(?:my\s*)?location/i,
  /(?:maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|google\.com\/maps)/i,
];
// Weak address terms: two different ones together count.
const ADDRESS_WEAK = [/شارع/, /حي\s+\S+/, /عمارة/, /برج/, /شقة/, /فيلا/, /الدور\s*\d*/, /مجمع/, /(?:street|apartment|building|floor)\s*\d*/i];

const URL_RE = /(?:https?:\/\/\S+|www\.\S+|\b(?:t\.me|wa\.me|bit\.ly|instagram\.com|facebook\.com|snapchat\.com|tiktok\.com)\/?\S*)/i;
const EMAIL_RE = /[\w.+-]+\s?@\s?[\w-]+(?:\.[\w-]+)+/;
const SPOKEN_EMAIL_RE = /[\w.-]{3,}\s*(?:at|ات|آت)\s*[\w-]{2,}\s*(?:dot|دوت|\.)\s*(?:com|net|org|كوم)/i;
const HANDLE_RE = /(?:^|\s)@[\w.]{3,}/;
// Digits split by spaces, dots, dashes or commas: 0 5 5 1 2 3 ...
const SPACED_DIGITS_RE = /(?:\+?\d(?:[\s.\-_,/()]{0,3}\d){7,})/;

const SEVERITY_RANK: Record<PersonalInfoType, number> = {
  platform_mention: 1,
  external_link: 2,
  email: 3,
  phone_number: 3,
  contact_sharing: 3,
  social_media_attempt: 3,
  address_sharing: 3,
};

export function detectPersonalInfo(rawText: string): PersonalInfoResult {
  const text = normalizeForDetection(rawText || "");
  const lower = text.toLowerCase();
  const hits: PersonalInfoHit[] = [];
  const add = (type: PersonalInfoType, kind: string, matched: string) => hits.push({ type, kind, matched });

  // Phone: 8+ digits, even when spaced, dotted or spelled out.
  const phone = text.match(SPACED_DIGITS_RE);
  if (phone) {
    const digitCount = phone[0].replace(/\D/g, "").length;
    if (digitCount >= 8 && !(SCHOOL_CONTEXT.test(text) && digitCount < 10)) {
      add("phone_number", "phone_digits", phone[0].trim());
    }
  }
  const email = text.match(EMAIL_RE) || text.match(SPOKEN_EMAIL_RE);
  if (email) add("email", "email", email[0]);
  const url = text.match(URL_RE);
  if (url) add("external_link", "link", url[0]);
  const handle = !email ? text.match(HANDLE_RE) : null;
  if (handle) add("social_media_attempt", "handle", handle[0].trim());

  for (const w of PLATFORM_WORDS) {
    if (lower.includes(w.toLowerCase())) { add("platform_mention", "platform_word", w); break; }
  }
  for (const re of CONTACT_INTENT) {
    const m = text.match(re);
    if (m) { add("contact_sharing", "contact_intent", m[0]); break; }
  }

  const strong = ADDRESS_STRONG.map((re) => text.match(re)).find(Boolean);
  if (strong) {
    add("address_sharing", "address_phrase", strong[0]);
  } else {
    const weak = ADDRESS_WEAK.map((re) => text.match(re)).filter(Boolean) as RegExpMatchArray[];
    if (weak.length >= 2) add("address_sharing", "address_terms", weak.map((m) => m[0]).join(" "));
  }

  let top: PersonalInfoType | null = null;
  for (const h of hits) if (!top || SEVERITY_RANK[h.type] > SEVERITY_RANK[top]) top = h.type;
  // A platform name together with a number/handle/intent is contact sharing, not a mere mention.
  const hasContactSignal = hits.some((h) => ["phone_number", "email", "contact_intent", "handle"].includes(h.kind));
  if (hasContactSignal && hits.some((h) => h.type === "platform_mention") && top !== "address_sharing" && top !== "phone_number" && top !== "email") {
    top = "contact_sharing";
  }
  return { detected: hits.length > 0, type: top, hits };
}

const KIND_LABEL: Record<string, string> = {
  phone_digits: "رقم هاتف",
  email: "بريد إلكتروني",
  link: "رابط",
  handle: "حساب تواصل",
  platform_word: "منصة تواصل",
  contact_intent: "عبارة تواصل",
  address_phrase: "عنوان",
  address_terms: "عنوان",
};

// Hide most of the fragment but keep enough for an admin to recognise the kind of data.
export function redactFragment(h: PersonalInfoHit): string {
  const m = h.matched;
  switch (h.kind) {
    case "phone_digits":
      return maskDigits(m).replace(/[\s.\-_,/()]+/g, "");
    case "email": {
      const at = m.indexOf("@");
      if (at > 0) return `${m.slice(0, Math.min(2, at))}•••@${m.slice(at + 1, at + 2)}•••`;
      return `${m.slice(0, 2)}•••`;
    }
    case "handle": {
      const t = m.replace(/^@/, "");
      return `@${t.slice(0, 2)}•••`;
    }
    case "link":
      return `${m.slice(0, 12)}•••`;
    default:
      return m; // platform names, contact phrases and address keywords carry no identifying detail
  }
}

// What is stored and shown: the kinds found and redacted fragments only. Never the surrounding sentence,
// so a street name or number spoken next to an address phrase is not kept.
export function maskedEvidence(result: PersonalInfoResult, fallbackText = ""): string {
  if (result.hits.length === 0) return maskDigits(normalizeForDetection(fallbackText)).slice(0, 80);
  return result.hits.map((h) => `${KIND_LABEL[h.kind] || "بيانات"}: ${redactFragment(h)}`).join(" | ").slice(0, 200);
}
