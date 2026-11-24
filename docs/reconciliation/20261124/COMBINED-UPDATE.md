# Combined reconciliation update,24 November2026 08:45 Riyadh

Source-only review. No main merge or deployment authorized or performed.

## Completed since initial draft

- Production Vite build now passes with the original minification/config, using `NODE_OPTIONS='--max-old-space-size=1350 --max-semi-space-size=8'`. The earlier failures were local memory pressure. No application build setting was weakened.
- Preserved mounted function parity and added66 entitlement/account/daily-budget helper tests from the existing reviewed branch. Continuous conversation stays disabled.
- Preserved explicit rejected-teacher filtering/status and current conflict-aware approval/server balance behavior together.
- Added withdrawal search/KPIs without replacing the current earning ledger, atomic payout RPC, states or allocation detail.
- Added pending-teacher search while retaining the newer dashboard, support and certificate detail UI.
- Permission panel now stacks on narrow screens. Existing permission mutations/RLS are unchanged.
- Pair chat now uses live pair RPCs for large histories and falls back to current canonical equality filters with bounded100booking chunks. Live definitions were read from DB catalog, are participant-checked SECURITY DEFINER functions with fixed public search_path; catalog evidence retained as `.sql.review`, not an automatic migration. Fallback errors are not presented as empty successful history.
- Shared API Session deliveryMode preserved in OpenAPI, client type and all four generated validation shapes, with regression test. Current Zod4/Express/security overrides and pinned generator retained instead of downgrading to old VPS declarations.

## Legacy changes disposition

All20old tracked source deltas,6components and4old migrations remain captured. Sixteen initial textual conflicts are accounted for in evidence plus this note:

- ai-support/grade-assignment/live-ai-assistant/solve-homework: old provider/model constants superseded by current shared model/security helpers, not restored. Actual mounted ai-tutor-chat is the runtime source imported.
- StudentDashboard: VPS-only tracked delta removed unused pastClasses state. Current main already removed it; equivalent behavior, no old dashboard overwrite.
- TeacherDashboard: VPS-only query builds an unused local pMap, with no rendered state update. Not restored, avoids needless queries. Newer dashboard reads/errors retained.
- AdminSidebar/StudentProfiles/UserManagement/AdminTeacherProfile/ProtectedRoute/AdminUrgentTasks/CompleteProfile: reviewed ports retained, newer source behavior retained where overlapping.
- TeacherProfiles/WithdrawalRequests/AdminDashboard: useful live filters/search/KPIs/status ported selectively. Old cosmetic table/overview layout not copied wholesale over newer styling. This is feature reconciliation, not identical old markup.
- Schedule tables: hidden-schedule conversation links carried over while retaining historyOnly and collapsible behavior.
- Chat RPC optimization now carried over with safe canonical fallback.
- Four historical SQL files stay quarantined, not replayed. Corresponding soft-delete columns and approval constraint verified present live. Historical session trigger replacement and teacher approval backfill must never replace newer financial/status logic blindly.

## Verification and remaining limits

Web final full suite294tests, typecheck and production build required at current head; API72tests, API build/typecheck and shared-library typecheck required at current head. Logs and counts reported by execution, not this note alone. Inspected changed teacher/withdrawal/permissions screens at390px with synthetic fixtures, no overflow/page errors or external requests/mutations. Earlier blocked-account/table previews also inspected.

Not verified: authenticated production teacher/admin/soft-delete/restore actions, role-switch/read-error route guard behavior, real teacher calls, private attachment policies across every screen, complete migration history and rollback from a future database change. UI route guards do not enforce backend suspension/deletion. No claim of a fully completed security audit.

Source snapshots remain exact historical evidence. Combined source intentionally differs from live until a separately approved release. Compiled frontend source provenance remains unknown for the old served assets. No claim100%source/runtime equality before deployment and post-deploy verification.
