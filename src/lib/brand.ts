export const BRAND_NAME = "منصة أجيال المعرفة";
export const BRAND_TAGLINE = "تعلم بثقة";

export function normalizeBrandText(value: string, fallback: string) {
  const text = value.trim() || fallback;
  return text
    .replaceAll("تعلم المستقبل", BRAND_NAME)
    .replaceAll("Future Learn", BRAND_NAME);
}