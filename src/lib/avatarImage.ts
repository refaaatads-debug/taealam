// Profile photo preparation, all on the device: center-crop to a square, shrink, save as a small WebP.
// No enhancement and no AI of any kind. The original file is never uploaded.
export const AVATAR_MAX_SIDE = 512;
export const AVATAR_QUALITY = 0.8;
export const AVATAR_MAX_BYTES = 300 * 1024; // matches the bucket limit
export const AVATAR_MAX_INPUT_BYTES = 15 * 1024 * 1024;

export function squareCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.max(0, Math.min(width, height));
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

export function targetSide(side: number, max = AVATAR_MAX_SIDE): number {
  return Math.max(1, Math.min(side, max));
}

export function validateAvatarInput(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith("image/")) return "الملف المختار ليس صورة";
  if (file.size > AVATAR_MAX_INPUT_BYTES) return "حجم الصورة كبير جداً";
  return null;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

// Returns a small WebP (or JPEG if the browser cannot write WebP). Lowers quality until it fits the size limit.
export async function prepareAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
  const out = targetSide(side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close?.();
  let quality = AVATAR_QUALITY;
  for (let i = 0; i < 5; i++) {
    let blob = await toBlob(canvas, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
    quality -= 0.15;
  }
  throw new Error("avatar too large");
}
