---
name: In-person duration and package debit
description: Admin-selected lesson duration and package-minute deduction for new in-person bookings.
---

For in-person bookings, keep actual teaching time separate from the package debit. The user's current policy is 60 minutes of teaching and 100 minutes deducted from the student's balance. Admin settings expose these as separate values. Snapshot both when a request/booking is created; changing settings must not alter existing bookings or balances.

**Why:** The user explicitly set the business rule that a 60-minute in-person lesson deducts 100 package minutes.

**How to apply:** Use teaching duration for availability, calendar blocks, and meeting length; use package debit for balance checks, reservation, and settlement. Never derive historical amounts from current settings.
