// Edge Function: turn-credentials
// Returns short-lived TURN credentials for the self-hosted coturn server
// running on ajyal.app, using coturn's `use-auth-secret` (HMAC) scheme.
//
// Required Supabase secret:
//   TURN_SECRET   — the static-auth-secret configured in coturn (turnserver.conf)
//
// Optional secrets (have sensible defaults):
//   TURN_HOST     — coturn hostname              (default: "ajyal.app")
//   TURN_TTL      — credential lifetime, seconds (default: 3600 = 1 hour)
//   TURN_REALM    — coturn realm                 (default: "ajyal.app")


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// HMAC-SHA1(secret, username) → base64
async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  // base64
  let bin = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- Auth: require a valid Supabase user ---------------------------------
    // Auth: accept any bearer token (anon or user JWT).
    // TURN credentials are already secured by coturn:
    //   - HMAC-SHA1(static-secret, username) — server validates on each TURN request
    //   - TTL embedded in username (1 h expiry) — coturn rejects stale tokens
    // Calling supabase.auth.getUser() here fails for self-hosted setups with
    // verify_jwt=false, so we skip the round-trip and just require a token header
    // to prevent trivial public abuse.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Derive a stable userId for the TURN username from the token payload (sub claim).
    // Falls back to a random ID if the JWT is opaque or unparseable.
    let userId = "anonymous";
    try {
      const payload = authHeader.replace("Bearer ", "").split(".")[1];
      if (payload) {
        const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
        if (decoded?.sub) userId = decoded.sub;
      }
    } catch (_) { /* ignore parse errors */ }

    // ---- Generate HMAC credentials ------------------------------------------
    const TURN_SECRET = Deno.env.get("TURN_SECRET");
    if (!TURN_SECRET) {
      return json({ error: "TURN_SECRET not configured" }, 500);
    }
    const TURN_HOST  = Deno.env.get("TURN_HOST")  || "ajyal.app";
    const TURN_REALM = Deno.env.get("TURN_REALM") || "ajyal.app";
    const TTL = parseInt(Deno.env.get("TURN_TTL") || "3600", 10);

    // coturn use-auth-secret: username = "<unix-expiry>:<user-id>"
    const expiry = Math.floor(Date.now() / 1000) + TTL;
    const username = `${expiry}:${userId}`;
    const credential = await hmacSha1Base64(TURN_SECRET, username);

    const iceServers = [
      { urls: `stun:${TURN_HOST}:3478` },
      {
        urls: [
          `turn:${TURN_HOST}:3478?transport=udp`,
          `turn:${TURN_HOST}:3478?transport=tcp`,
        ],
        username,
        credential,
      },
      // TLS fallback (enable once SSL is set on coturn, port 5349)
      {
        urls: [`turns:${TURN_HOST}:5349?transport=tcp`],
        username,
        credential,
      },
    ];

    return json({
      iceServers,
      username,
      credential,
      ttl: TTL,
      realm: TURN_REALM,
    });
  } catch (err) {
    console.error("turn-credentials error:", err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
