---
name: Self-hosted storage origins
description: Internal Supabase API origins differ from browser-facing signed storage URLs on the VPS.
---

Treat the internal Supabase API origin and the canonical public reverse-proxy origin as distinct trusted configurations. Never require browser storage URLs to equal the server's internal origin, and never trust a host merely because it appears in the incoming request.

**Why:** A live lesson test uploaded recording bytes successfully, but linking rejected the public signed URL because the server used an internal Kong origin. Browser CORS symptoms alone did not identify the actual failed operation.

**How to apply:** Keep explicit HTTPS public-host allowlists and strict private bucket/object ownership checks. Diagnose upload, URL signing, and database linking separately. A stored object or successful upload alone does not prove a recording is linked, complete, or playable.
