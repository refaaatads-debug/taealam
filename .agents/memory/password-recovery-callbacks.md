---
name: Password recovery callbacks
description: Supabase PKCE callback ownership and a runtime-versus-types recovery distinction.
---

Recovery callbacks must have one consumer; an existing login or a generic signed-in event is not proof of password recovery.

**Why:** The installed Supabase SDK's automatic PKCE initialization discards the recovery redirect distinction when notifying subscribers. Explicit code exchange retains the verifier's `PASSWORD_RECOVERY` redirect type at runtime, although the public TypeScript response type omits that field. Relying on ordinary session presence can authorize a reset screen for the wrong browser account.

**How to apply:** When changing auth initialization or upgrading Supabase, retain a contract test against the actual SDK for recovery code exchange. Fail closed if recovery provenance is absent; never replace failed callback verification with an existing Google or email login.
