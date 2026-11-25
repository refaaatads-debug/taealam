export async function withWebmDuration(blob: Blob, durationMs?: number): Promise<Blob> {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) return blob;
  if (blob.type.toLowerCase() !== "video/webm") return blob;

  try {
    const { default: fixWebmDuration } = await import("fix-webm-duration");
    return await fixWebmDuration(blob, Math.round(durationMs), { logger: false });
  } catch (error) {
    console.warn("[recording] WebM duration metadata could not be written; keeping original blob", error);
    return blob;
  }
}
