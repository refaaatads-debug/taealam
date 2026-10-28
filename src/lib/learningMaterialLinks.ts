export interface LearningMaterialDraft {
  name: string;
  description: string;
  url: string;
}

export function validateLearningMaterialDraft(draft: LearningMaterialDraft): LearningMaterialDraft {
  const name = draft.name.trim();
  const description = draft.description.trim();
  const rawUrl = draft.url.trim();

  if (!name || name.length > 120) {
    throw new Error("اكتب اسمًا للرابط لا يتجاوز 120 حرفًا.");
  }
  if (!description || description.length > 500) {
    throw new Error("اكتب وصفًا للرابط لا يتجاوز 500 حرف.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("أدخل رابطًا صحيحًا يبدأ بـ https://.");
  }
  if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
    throw new Error("يجب أن يكون الرابط آمنًا ويبدأ بـ https://.");
  }

  return { name, description, url: parsedUrl.toString() };
}
