import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CheckResult {
  domain: string;
  https_enabled: boolean;
  status_code: number | null;
  cert_valid: boolean | null;
  cert_issuer: string | null;
  cert_subject: string | null;
  cert_valid_from: string | null;
  cert_valid_to: string | null;
  days_until_expiry: number | null;
  protocol: string | null;
  response_time_ms: number | null;
  error_message: string | null;
}

async function checkDomain(rawDomain: string): Promise<CheckResult> {
  const domain = rawDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  const result: CheckResult = {
    domain,
    https_enabled: false,
    status_code: null,
    cert_valid: null,
    cert_issuer: null,
    cert_subject: null,
    cert_valid_from: null,
    cert_valid_to: null,
    days_until_expiry: null,
    protocol: null,
    response_time_ms: null,
    error_message: null,
  };

  // 1. Test HTTPS reachability
  const start = Date.now();
  try {
    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    result.https_enabled = true;
    result.status_code = res.status;
    result.response_time_ms = Date.now() - start;
  } catch (e) {
    result.error_message = `HTTPS unreachable: ${(e as Error).message}`;
    result.https_enabled = false;
  }

  // 2. Cert details via SSL Labs–free public endpoint (ssl-checker.io style via crt.sh fallback)
  // Use built-in TLS via Deno.connectTls when available
  try {
    // @ts-ignore - Deno global available in edge runtime
    const conn = await Deno.connectTls({ hostname: domain, port: 443 });
    // @ts-ignore
    const handshake = await conn.handshake?.();
    const certs = handshake?.peerCertificates ?? [];
    if (certs.length > 0) {
      const cert = certs[0];
      result.cert_valid = true;
      result.cert_issuer = cert.issuer || null;
      result.cert_subject = cert.subject || null;
      if (cert.validFrom) result.cert_valid_from = new Date(cert.validFrom).toISOString();
      if (cert.validTo) {
        const exp = new Date(cert.validTo);
        result.cert_valid_to = exp.toISOString();
        result.days_until_expiry = Math.floor((exp.getTime() - Date.now()) / 86400000);
        if (result.days_until_expiry < 0) result.cert_valid = false;
      }
      result.protocol = "TLS";
    }
    conn.close();
  } catch (e) {
    if (!result.error_message) {
      result.error_message = `TLS check: ${(e as Error).message}`;
    }
    // Fallback: rely on the fetch success for cert validity
    if (result.https_enabled && result.cert_valid === null) {
      result.cert_valid = true;
      result.protocol = "TLS (verified via HTTPS)";
    }
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin role
    const admin = createClient(supabaseUrl, supabaseService);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const domains: string[] = Array.isArray(body.domains) && body.domains.length > 0
      ? body.domains
      : ["ajyalaap.lovable.app"];

    const results = await Promise.all(domains.map(checkDomain));

    // Persist
    const rows = results.map((r) => ({ ...r, checked_by: user.id }));
    const { error: insertErr } = await admin.from("domain_ssl_checks").insert(rows);
    if (insertErr) {
      console.error("Insert error:", insertErr);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-ssl-status error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
