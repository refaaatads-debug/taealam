---
name: Teacher location source of truth
description: How teacher-facing in-person location settings relate to the legacy fields used by booking and search.
---

Treat `teacher_service_locations` as the canonical in-person location because it is what teachers see and edit in settings. The in-person search and booking checks also read location copies on `teacher_profiles`, so any mismatch can make a teacher appear in the wrong city or at an incorrect distance.

**Why:** A student search showed a teacher at a few kilometers away even though the teacher settings map was in another city.

**How to apply:** Keep the legacy profile location fields synchronized whenever the service location changes. If reconciling a pre-existing mismatch, disable in-person availability and set approval to pending until an administrator reviews the displayed location.
