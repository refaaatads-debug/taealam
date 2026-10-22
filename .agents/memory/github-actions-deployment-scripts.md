---
name: GitHub Actions deployment scripts
description: GitHub Actions limits long embedded SSH scripts, and separate SSH actions do not share a working directory.
---

**Rule:** Keep each `appleboy/ssh-action` script below the GitHub parser limit of 21,000 characters. If a remote deployment is split across multiple SSH actions, explicitly pass the commit SHA and use absolute paths for staged artifacts; shell variables and the current working directory do not carry over.

**Why:** A 27 KB embedded script was rejected with HTTP 422. Splitting it allowed the workflow to run, but a relative `dist/` path then failed because the next SSH action started in its default directory.

**How to apply:** Measure each parsed `with.script`, split only at safe boundaries, pass required environment variables to every action, use absolute staging paths, and run YAML plus `bash -n` checks before dispatch.

**Rule:** A migration must appear in the VPS transfer list, a non-empty staging-file check, the apply list, and post-apply fingerprint verification. Reject empty expected or stored hashes; otherwise a missing staged file can produce a false successful deploy.

**Why:** A deployment can report success while an omitted SQL file never reaches the VPS, if the verifier compares two empty values instead of requiring a recorded 64-character fingerprint.

**How to apply:** When adding a migration, trace it through change detection, transfer, required-file checks, idempotent apply, and a non-empty production fingerprint check; then verify the live database, not only the workflow conclusion.
