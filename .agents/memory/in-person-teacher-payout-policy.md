---
name: In-person teacher payout policy
description: Product rule for how in-person earnings appear in teacher reporting and withdrawals.
---

Unpaid in-person lesson earnings belong in monthly earnings reporting only. The withdrawable balance is confirmed administrator-added teacher earnings, less their active allocations and withdrawals; `teacher_profiles.balance` is a legacy mirror, not a source of truth. A manual approval or reservation is not a payment: paid totals increase only when the platform records the actual payment. Keep existing financial ledger rows and withdrawal allocations intact; do not create historical allocations, payouts, or balance corrections to make screens agree.

**Why:** The user explicitly confirmed this accounting policy; reporting, available funds, reserved amounts, and paid amounts are separate states, and guessing historical entries risks changing a teacher's entitlement.

**How to apply:** Keep monthly in-person reporting separate from withdrawable funds. New withdrawal validation and allocation must use only confirmed administrator-added earnings after matching allocations; preserve historical records and treat actual payment records as the only paid source.
