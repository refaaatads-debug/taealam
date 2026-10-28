---
name: Student phone privacy
description: Teachers must never receive student phone numbers, including confirmed or completed bookings.
---

Teachers must never receive a student's phone number. A booking, of any status,
does not authorize access. Teacher communication stays in chat and internal calls;
do not offer telephone or WhatsApp actions exposing the student number.

**Why:** The user explicitly revoked the previous booking-based phone disclosure
policy. Hiding the number in UI is insufficient: API, RPC, raw tables and historical
call records must also prevent extraction.

**How to apply:** Permit owners to read their own numbers and authorized
administration where needed. Do not preserve legacy teacher phone access for
backward compatibility. Test denial for teachers with confirmed/completed bookings,
including indirect records and server-side service-client responses.
