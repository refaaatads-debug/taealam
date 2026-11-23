// Handles OAuth callback from Lovable broker on full-redirect flow.
// When the broker redirects back to the app, tokens are passed in the URL
// (as hash or query params). This module reads them, sets the Supabase
// session, then cleans the URL — BEFORE the app mounts.

import { supabase } from "@/integrations/supabase/client";

const TOKEN_KEYS = ["access_token", "refresh_token"];

function extractTokens(): { access_token: string; refresh_token: string } | null {
  // Try hash first (#access_token=...&refresh_token=...)
  if (window.location.hash && window.location.hash.length > 1) {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const access = hashParams.get("access_token");
    const refresh = hashParams.get("refresh_token");
    if (access && refresh) return { access_token: access, refresh_token: refresh };
  }
  // Try query params (?access_token=...&refresh_token=...)
  if (window.location.search) {
    const queryParams = new URLSearchParams(window.location.search);
    const access = queryParams.get("access_token");
    const refresh = queryParams.get("refresh_token");
    if (access && refresh) return { access_token: access, refresh_token: refresh };
  }
  return null;
}

function cleanUrl() {
  try {
    const url = new URL(window.location.href);
    // Remove auth-related params from query
    TOKEN_KEYS.forEach((k) => url.searchParams.delete(k));
    url.searchParams.delete("expires_in");
    url.searchParams.delete("expires_at");
    url.searchParams.delete("token_type");
    url.searchParams.delete("provider_token");
    url.searchParams.delete("state");
    // Always clear hash (used for tokens)
    const newUrl = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "");
    window.history.replaceState({}, document.title, newUrl);
  } catch {
    /* ignore */
  }
}

export async function handleOAuthCallback(): Promise<boolean> {
  const tokens = extractTokens();
  if (!tokens) return false;

  try {
    const { error } = await supabase.auth.setSession(tokens);
    if (error) {
      console.error("[oauth-callback] setSession failed:", error);
      return false;
    }
    cleanUrl();
    return true;
  } catch (e) {
    console.error("[oauth-callback] error:", e);
    return false;
  }
}
