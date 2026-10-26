---
name: Production Supabase connector access
description: The Replit Supabase API connector may reject production REST requests through the site's custom domain.
---

When production API requests through the Supabase connector fail with a 403 that says the request was stopped because it leads to a private address or redirect, treat this as a network-policy block, not an expired or invalid Supabase credential. Do not attempt to bypass the restriction by extracting secrets or routing around the connector.

**Why:** The production Supabase REST API is proxied behind the platform's own domain; the connector rejected the request before it reached PostgREST.

**How to apply:** Report the production data as unverified, rely only on safe app-side evidence already available, and request an approved public/API access path or sanitized diagnostics before claiming row-level verification.
