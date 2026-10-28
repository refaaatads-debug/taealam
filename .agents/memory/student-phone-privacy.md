---
name: Student phone privacy
description: Teachers must never receive student phone numbers, including confirmed or completed bookings.
---

Teachers must never receive a student's phone number. A booking, of any status,
does not authorize disclosure. Keep the integrated Twilio telephone system,
including its buttons, wallets, pricing, deductions and call history. Twilio hides
both participants' numbers; only the trusted server resolves the actual phones.

**Why:** The user explicitly clarified that preventing number disclosure must not
remove the existing masked Twilio calling system. Hiding the number in UI is
insufficient: API, RPC, raw tables and visible call records must prevent extraction.

**How to apply:** Permit owners to read their own numbers and authorized
administration where needed. Keep phones out of client call requests/responses and
visible logs; resolve authorized booking participants on the server. Do not preserve
legacy phone disclosure for compatibility. Test hidden calling with a mocked provider;
never place paid test calls without coordinating with the user. Keep the other
security fixes intact.
