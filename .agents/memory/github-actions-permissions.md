---
name: GitHub Actions permissions
description: Distinguishes repository write access from permission to trigger the VPS deployment workflow.
---

**Rule:** GitHub repo-write access, the `workflow` permission needed to update `.github/workflows/*`, and permission to dispatch Actions are separate capabilities; verify the exact one required.

**Why:** A production code push once succeeded while workflow dispatch was rejected with 403; another GitHub OAuth connection could push source but rejected a commit changing the deployment workflow because it lacked `workflow`.

**How to apply:** Check the precise GitHub error before release. If Actions or workflow-file permission is denied, do not claim deployment; preserve the committed source and report the blocker instead of making unapproved manual production changes.
