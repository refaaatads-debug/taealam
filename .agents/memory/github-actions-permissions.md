---
name: GitHub Actions permissions
description: Distinguishes repository write access from permission to trigger the VPS deployment workflow.
---

**Rule:** GitHub repo-write access, the `workflow` permission needed to update `.github/workflows/*`, and permission to dispatch Actions are separate capabilities; verify the exact one required.

**Why:** A production code push once succeeded while workflow dispatch was rejected with 403; another GitHub OAuth connection could push source but rejected a commit changing the deployment workflow because it lacked `workflow`.

**How to apply:** Check the precise GitHub error before release. If Actions or workflow-file permission is denied, do not claim deployment; preserve the committed source and report the blocker instead of making unapproved manual production changes.

**Rule:** A `git push` may update the remote branch but exit nonzero when the workspace cannot update its local remote-tracking ref; verify the remote SHA and Actions run before retrying.

**Why:** The remote accepted a deployment commit before Replit's Git safety guard blocked writing a `.git/refs/remotes/...lock` file.

**How to apply:** When push output confirms a remote ref update followed by a local lock error, inspect the GitHub branch and workflow state first; do not repeat the push or bypass the guard unless the remote is still stale.
