---
name: Minute package validity
description: Product policy for the validity of minute packages and their historical timestamps.
---

All minute packages, old and new, are open-ended. `user_subscriptions.ends_at` is retained for audit history only and must not block booking or minute usage. Preserve active/suspended/refunded state and balances. Low or depleted balance messages should describe minutes, not package expiry.

**Why:** the user explicitly confirmed this product policy.

**How to apply:** when changing subscription access checks, booking validation, scheduled notifications, or package wording, do not infer expiry from `ends_at`.
