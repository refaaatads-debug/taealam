const PUBLIC_STORAGE_ORIGINS = new Set([
  "https://ajyalalmaerifa.com",
  "https://www.ajyalalmaerifa.com",
]);
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RECORDING_PATH = new RegExp(
  `^/storage/v1/object/sign/session-recordings/(${UUID})/(${UUID})_([0-9]+)\\.webm$`,
  "i",
);

// The self-hosted server uses an internal API origin; browsers use the public
// proxy. Never derive trusted storage hosts from an incoming request or URL.
export function parseSessionRecordingUrl(value: unknown, supabaseUrl: string) {
  if (typeof value !== "string" || value.length > 16384) return null;
  try {
    const url = new URL(value);
    const configuredOrigin = new URL(supabaseUrl).origin;
    const rawAddress = value.split(/[?#]/, 1)[0];
    if (
      url.protocol !== "https:" || url.username || url.password || url.hash ||
      (!PUBLIC_STORAGE_ORIGINS.has(url.origin) && url.origin !== configuredOrigin) ||
      !url.searchParams.get("token") ||
      // Reject encoded separators/traversal rather than normalizing them.
      rawAddress.includes("%") || /\/\.\.?\//.test(rawAddress)
    ) return null;
    const match = RECORDING_PATH.exec(url.pathname);
    if (!match) return null;
    return {
      url: url.href,
      ownerId: match[1].toLowerCase(),
      bookingId: match[2].toLowerCase(),
    };
  } catch {
    return null;
  }
}
