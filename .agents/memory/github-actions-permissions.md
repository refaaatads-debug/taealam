---
name: GitHub Actions permissions
description: Distinguishes repository write access from permission to trigger the VPS deployment workflow.
---

**Rule:** A credential that can push commits and modify workflow files may still lack permission to dispatch GitHub Actions.

**Why:** A production code push succeeded while workflow dispatch was rejected with 403, leaving the VPS on its prior deployed SHA.

**How to apply:** Verify workflow-run permission before relying on Actions for a production release. If triggering is denied, do not claim deployment; preserve the committed source and report the specific permission blocker before any manual production changes.
