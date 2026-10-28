---
name: Shared profile read rollout
description: Coordinate restrictive profile access changes with mobile clients instead of treating a web deployment as a complete shared-API rollout.
---

**Rule:** Release additive public/contact read APIs and compatible client adapters before activating restrictive private-table policies. A successful web deployment alone does not establish that installed mobile clients have updated.

**Why:** Mobile messaging and telephone flows previously read other users' private profile rows directly. Tightening those tables immediately would break older mobile clients even when the updated source code type-checks.

**How to apply:** Keep the restrictive cutover separately gated, test its authorization in an isolated database, and require evidence of a compatible mobile release before adding it to automatic production migrations. Report the remaining broad access explicitly until cutover actually occurs.

**Exception:** Student-phone privacy overrides legacy compatibility: teacher phone
access must be revoked, not retained while waiting for older clients to update.
See [Student phone privacy](student-phone-privacy.md).
