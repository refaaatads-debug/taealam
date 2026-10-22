---
name: GitHub Actions deployment scripts
description: GitHub Actions limits long embedded SSH scripts, and separate SSH actions do not share a working directory.
---

**Rule:** Keep each `appleboy/ssh-action` script below the GitHub parser limit of 21,000 characters. If a remote deployment is split across multiple SSH actions, explicitly pass the commit SHA and use absolute paths for staged artifacts; shell variables and the current working directory do not carry over.

**Why:** A 27 KB embedded script was rejected with HTTP 422. Splitting it allowed the workflow to run, but a relative `dist/` path then failed because the next SSH action started in its default directory.

**How to apply:** Measure each parsed `with.script`, split only at safe boundaries, pass required environment variables to every action, use absolute staging paths, and run YAML plus `bash -n` checks before dispatch.
