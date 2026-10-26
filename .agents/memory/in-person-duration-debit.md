---
name: In-person duration and package debit
description: Admin-selected lesson duration and package-minute deduction for new in-person bookings.
---

For new in-person bookings, the admin-configured teaching duration is an integer from 15 to 180 minutes, and the package debit equals that duration. Snapshot the teaching duration and package minutes when the request/booking is created; changing the setting must not alter existing bookings or balances.

**Why:** The user explicitly chose a variable admin setting and specified that a 100-minute lesson deducts 100 package minutes.

**How to apply:** Keep request eligibility, reservation, attendance confirmation, completion timing, and package settlement consistent with the saved duration; never derive historical amounts from the current setting.
