/**
 * Upload only the NEW part of a session recording each minute (instead of re-sending the
 * whole file). The final full file is still uploaded once at the end by the existing code.
 * Parts live under {userId}/parts/{bookingId}_{ts}/ and are only a safety copy.
 *
 * OFF by default. Turn on with VITE_RECORDING_PARTS_UPLOAD=1 at build time, or for testing
 * in one browser: localStorage.setItem("recording_parts_upload", "1").
 */

export const MAX_PART_BYTES = 24 * 1024 * 1024; // stays under the 50 MB gateway upload limit
export const PARTS_RECOVERY_MIN_AGE_MS = 3 * 60 * 60 * 1000; // never touch a possibly live session
export const BACKUP_EVERY_MS = 5 * 60 * 1000;

export function isRecordingPartsEnabled(): boolean {
  try {
    if (import.meta.env?.VITE_RECORDING_PARTS_UPLOAD === "1") return true;
    if (typeof localStorage !== "undefined" && localStorage.getItem("recording_parts_upload") === "1") return true;
  } catch {
    // ignore
  }
  return false;
}

/** "{user}/{booking}_{ts}.webm" -> "{user}/parts/{booking}_{ts}" */
export function partsFolderForFile(fileName: string): string | null {
  const m = /^([^/]+)\/([^/]+)\.webm$/.exec(fileName);
  return m ? `${m[1]}/parts/${m[2]}` : null;
}

export function partName(folder: string, segment: number, index: number): string {
  return `${folder}/${String(segment).padStart(2, "0")}-${String(index).padStart(6, "0")}.webm`;
}

/** Split [offset, size) into ranges no bigger than max. */
export function planRanges(size: number, offset: number, max = MAX_PART_BYTES): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let s = offset; s < size; s += max) out.push([s, Math.min(size, s + max)]);
  return out;
}

export interface PartsState {
  segment: number;
  offset: number; // bytes already safely uploaded in this segment
  nextIndex: number;
  source: string | null;
}

export const newPartsState = (): PartsState => ({ segment: 0, offset: 0, nextIndex: 1, source: null });

export type UploadFn = (name: string, body: Blob) => Promise<void>;

/**
 * Upload everything after state.offset. State moves forward only after each part is confirmed,
 * so a failure never skips bytes: the next call resends from the last confirmed byte.
 * If the recording source changed (or the blob shrank) a new segment starts.
 * Returns true when everything is uploaded.
 */
export async function uploadNewParts(
  blob: Blob,
  source: string | null,
  folder: string,
  state: PartsState,
  upload: UploadFn,
  retryDelays: number[] = [0, 2000, 6000],
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<boolean> {
  if (state.source !== null && (state.source !== source || blob.size < state.offset)) {
    state.segment += 1;
    state.offset = 0;
    state.nextIndex = 1;
  }
  state.source = source;
  for (const [start, end] of planRanges(blob.size, state.offset)) {
    const body = blob.slice(start, end, "video/webm");
    let ok = false;
    for (const delay of retryDelays) {
      if (delay) await sleep(delay);
      try {
        await upload(partName(folder, state.segment, state.nextIndex), body);
        ok = true;
        break;
      } catch {
        // try again
      }
    }
    if (!ok) return false;
    state.offset = end;
    state.nextIndex += 1;
  }
  return true;
}

/** Parts belonging to the segment with the most bytes, in order. Other segments are different streams. */
export function pickBestSegment<T extends { name: string; size: number }>(parts: T[]): T[] {
  const bySeg = new Map<string, T[]>();
  for (const p of parts) {
    const m = /^(\d{2})-(\d{6})\.webm$/.exec(p.name);
    if (!m) continue;
    bySeg.set(m[1], [...(bySeg.get(m[1]) ?? []), p]);
  }
  let best: T[] = [];
  let bestBytes = -1;
  for (const list of bySeg.values()) {
    const bytes = list.reduce((s, p) => s + p.size, 0);
    if (bytes > bestBytes) { best = list; bestBytes = bytes; }
  }
  return best.sort((a, b) => a.name.localeCompare(b.name));
}

/** Parts must be gapless (000001, 000002, ...). Returns the usable leading run. */
export function leadingContiguous<T extends { name: string }>(parts: T[]): T[] {
  const out: T[] = [];
  for (const p of parts) {
    const idx = Number(/-(\d{6})\.webm$/.exec(p.name)?.[1]);
    if (idx !== out.length + 1) break;
    out.push(p);
  }
  return out;
}

export function folderAgeMs(folderName: string, now = Date.now()): number | null {
  const m = /_(\d{10,})$/.exec(folderName);
  return m ? now - Number(m[1]) : null;
}

type StorageLike = {
  storage: {
    from: (bucket: string) => {
      list: (path: string, opts?: Record<string, unknown>) => Promise<{ data: any[] | null; error: any }>;
      download: (path: string) => Promise<{ data: Blob | null; error: any }>;
      upload: (path: string, body: Blob, opts?: Record<string, unknown>) => Promise<{ error: any }>;
      remove: (paths: string[]) => Promise<{ error: any }>;
      createSignedUrl: (path: string, ttl: number) => Promise<{ data: { signedUrl?: string } | null; error: any }>;
    };
  };
  functions: { invoke: (name: string, opts: { body: unknown }) => Promise<{ error: any }> };
};

/**
 * Teacher-side recovery: if a browser died before the final upload, rebuild the recording from
 * the saved parts, link it to the session, then delete the parts. Best effort, never throws,
 * never deletes parts unless the rebuilt (or already existing) final file is confirmed.
 */
export async function recoverOrphanedParts(client: StorageLike, userId: string, now = Date.now()): Promise<number> {
  let recovered = 0;
  try {
    const bucket = client.storage.from("session-recordings");
    const { data: folders, error } = await bucket.list(`${userId}/parts`, { limit: 100 });
    if (error || !folders) return 0;
    for (const f of folders) {
      const folderName: string = f?.name;
      if (!folderName) continue;
      const age = folderAgeMs(folderName, now);
      if (age === null || age < PARTS_RECOVERY_MIN_AGE_MS) continue;
      const folderPath = `${userId}/parts/${folderName}`;
      const finalName = `${userId}/${folderName}.webm`;
      try {
        const { data: items } = await bucket.list(folderPath, { limit: 1000 });
        const parts = (items ?? [])
          .filter((i) => i?.name && i?.metadata)
          .map((i) => ({ name: String(i.name), size: Number(i.metadata?.size ?? 0) }));
        const { data: existing } = await bucket.list(userId, { search: `${folderName}.webm`, limit: 5 });
        const finalExists = (existing ?? []).some((e) => e?.name === `${folderName}.webm`);
        if (!finalExists) {
          const usable = leadingContiguous(pickBestSegment(parts));
          if (usable.length === 0) continue;
          const blobs: Blob[] = [];
          for (const p of usable) {
            const { data, error: dErr } = await bucket.download(`${folderPath}/${p.name}`);
            if (dErr || !data) throw dErr ?? new Error("part download failed");
            blobs.push(data);
          }
          const merged = new Blob(blobs, { type: "video/webm" });
          const { error: upErr } = await bucket.upload(finalName, merged, { contentType: "video/webm", upsert: true });
          if (upErr) throw upErr;
          const bookingId = folderName.replace(/_\d+$/, "");
          const { data: signed, error: sErr } = await bucket.createSignedUrl(finalName, 60 * 60 * 24 * 7);
          if (sErr || !signed?.signedUrl) throw sErr ?? new Error("no signed url");
          const { error: linkErr } = await client.functions.invoke("save-session-recording", {
            body: { booking_id: bookingId, recording_url: signed.signedUrl },
          });
          if (linkErr) throw linkErr;
          recovered += 1;
        }
        // Final file confirmed (existing or just rebuilt + linked): parts are no longer needed.
        if (parts.length > 0) await bucket.remove(parts.map((p) => `${folderPath}/${p.name}`));
      } catch {
        // keep the parts; try again next time
      }
    }
  } catch {
    // ignore
  }
  return recovered;
}

/** Best-effort cleanup after the final upload is confirmed. */
export async function removePartsFolder(client: StorageLike, folder: string): Promise<void> {
  try {
    const bucket = client.storage.from("session-recordings");
    const { data } = await bucket.list(folder, { limit: 1000 });
    const names = (data ?? []).filter((i) => i?.name && i?.metadata).map((i) => `${folder}/${i.name}`);
    if (names.length > 0) await bucket.remove(names);
  } catch {
    // ignore
  }
}
