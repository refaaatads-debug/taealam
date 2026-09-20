const requests = new Map<string, number[]>();

/**
 * Best-effort per-isolate limiter for expensive edge-function calls.
 * Authentication and database authorization remain mandatory; this only
 * reduces accidental bursts and abuse within a running function isolate.
 */
export function checkEdgeRateLimit(
  req: Request,
  scope: string,
  maxRequests: number,
  windowMs = 60_000,
): { allowed: boolean; retryAfterSeconds: number } {
  const client =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anonymous";
  const key = `${scope}:${client}`;
  const now = Date.now();
  const recent = (requests.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= maxRequests) {
    const oldest = recent[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  recent.push(now);
  requests.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}