# VPS production snapshot, review only

Captured 24 November 2026, Riyadh time. This PR is an evidence snapshot, not an application merge or a deployable replacement. Nothing in this directory is imported into the app. Do not copy it wholesale onto main.

## Why this is separate

The VPS repository is at e28e8fc with local modifications. GitHub main is newer (131f4d2 at capture). A local modification on that old checkout is not automatically newer than main. The served frontend assets also cannot be proven to rebuild from that checkout. Publishing this snapshot preserves the live evidence without overwriting newer work.

## Contents

- `repository-source/`: tracked frontend/config/migration files from the VPS checkout, plus new source components and migrations. It is the checkout state, not proof of what its currently served binary contains.
- `running-functions/`: actual TypeScript/JSON files from the mounted functions directory. These are stronger evidence of backend execution than the checkout's separate `supabase/functions` directory.
- `served-web/`: actual served index and the new hide-only stylesheet. Existing compiled JS/CSS is represented by hashes in the manifest, not copied into this PR.
- `manifest.json`: repository identity, status and SHA-256 evidence.
- `differences.json`: comparisons with this branch's main base.

## Differences requiring review

112 captured repository paths differ from main. This includes old/new version differences, not 112 new fixes. The VPS reports 20 modified source files plus a changed nested checkout, six untracked frontend components and four untracked migrations. Main contains later fixes that must not be replaced with older VPS copies.

Frontend areas: blocked/deleted accounts, teacher approvals, admin dashboard/sidebar/permissions, student and teacher profiles, user management, withdrawals, schedules, chat, profile completion, student and teacher dashboards. New migrations cover subscription selection, teacher certificate uploads, teacher approval status and soft deletion. Their presence does not prove each migration was applied to the live database.

Only eight running backend paths differ from current main: ai-tutor-chat, ai-tutor-token and six shared voice-cap/access/TTS helpers. The actual token handler includes the owner-requested early live-voice disable. Text and TTS remain unchanged by the hide-only deployment.

The latest web patch adds one stylesheet link to `/var/www/html/index.html` and a new `assets/hide-live-voice-38387b8d9ae5.css`. It hides only the voice tab/panel using scoped selectors; text and read-aloud controls remain. Existing served assets were verified unchanged during this patch. Earlier existing assets had already received a direct voice-tab guard. The current index is the exact served document, not a Vite build template.

## Risks and exclusions

- Review required for auth/account access, financial/admin flows, withdrawals and migrations. Do not run migrations from this snapshot automatically.
- Do not replace newer main files with this old checkout snapshot. Reconcile each real VPS-only fix into current source with tests.
- No env files, credentials, databases, backups, customer records, recordings, bundled mobile checkout or provider secrets were captured. Pattern checks found no embedded private-key, provider-key or access-token formats in the captured source. This is a check, not a claim that historical source is safe to deploy.
- No merge, rebuild, release, model call, payment, plan change or database mutation was performed for this snapshot.
- Exact reproducible source-to-served-frontend parity is still unverified. This PR records the gap instead of claiming it is solved.

## Live hide-patch rollback

`python3 /root/backups/hide-live-voice-tab-20261124-001000/rollback.py`

The exact index restore was rehearsed before publishing. It atomically restores the prior index. Existing JS/CSS and backend files are untouched by this rollback.
