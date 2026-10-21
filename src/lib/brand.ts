export const BRAND_NAME = "منصة أجيال المعرفة";
export const BRAND_TAGLINE = "تعلم بثقة";

export function normalizeBrandText(value: string, fallback: string) {
  const text = value.trim() || fallback;
  return text
    .replace(/تعلم المستقبل/g, BRAND_NAME)
    .replace(/Future Learn/g, BRAND_NAME);
}