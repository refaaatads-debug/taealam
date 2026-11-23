const ALLOWED_ORIGINS = new Set([
  "https://ajyalalmaerifa.com",
  "https://www.ajyalalmaerifa.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const DEFAULT_ORIGIN = "https://ajyalalmaerifa.com";

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, " +
  "x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}

export function getAllowedOrigin(origin: string | null): string {
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN;
}