import { supabase } from "@/integrations/supabase/client";

const PRIVATE_BUCKETS = ["chat-files", "support-files"] as const;
const PUBLIC_RE = /\/storage\/v1\/object\/(?:public|sign)\/(chat-files|support-files)\/([^?#]+)/i;

/** Split a stored URL/path into bucket + object path, or null if it is not one of our buckets. */
export function parseStorageRef(stored: string): { bucket: string; path: string } | null {
  const value = (stored || "").trim();
  const m = value.match(PUBLIC_RE);
  if (m) return { bucket: m[1].toLowerCase(), path: decodeURIComponent(m[2]) };
  if (/^https?:\/\//i.test(value)) return null;
  const bare = value.replace(/^\/+/, "");
  for (const b of PRIVATE_BUCKETS) {
    if (bare.startsWith(`${b}/`)) return { bucket: b, path: bare.slice(b.length + 1) };
  }
  return null;
}

const cache = new Map<string, { url: string; exp: number }>();

/** Returns a short-lived signed URL for chat-files/support-files; other URLs are returned unchanged. */
export async function getSignedUrl(stored: string, ttlSeconds = 3600): Promise<string> {
  const ref = parseStorageRef(stored);
  if (!ref) return stored;
  const key = `${ref.bucket}/${ref.path}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, ttlSeconds);
  if (error || !data?.signedUrl) return stored;
  cache.set(key, { url: data.signedUrl, exp: Date.now() + ttlSeconds * 1000 });
  return data.signedUrl;
}
