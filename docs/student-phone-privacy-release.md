# Student phone privacy release

## Policy

Teachers must not receive student phone numbers, including confirmed or completed
bookings. Owners and authorized administration retain access. Preserve masked
Twilio calls, their wallets, pricing, deductions and history alongside internal
calls and chat. The trusted server resolves both phones; neither party receives
the other's number.

## Server cutover

`20261028000700_deny_teacher_student_phone.sql` supersedes the held cutover in
`20261028000600_private_profile_read_cutover.sql`. It is in the verified production
migration manifest: four broad profile read policies are removed, the booking
contact RPC becomes owner/admin-only, and teacher call history excludes phone
numbers, provider identifiers and provider errors. Raw call records remain
available to the student owner and administration, not the teacher.

The temporary removal/disablement of Twilio is superseded by the user's correction.
Restore both entrypoints and controls, but accept participant/booking identifiers,
not a client-supplied destination number. Keep private-table and phone-RPC denial.
Expose only redacted call status/cost/duration to clients; never provider errors
that can contain numbers. Coordinate paid tests first; use mocked provider calls
for automated validation.

## Verification

The isolated production-schema database test covers anonymous, teacher, student,
unrelated-user and admin roles. It checks raw private tables, both phone RPCs,
confirmed and completed bookings, redacted call history, public identity and
teacher availability projections. Synthetic fixtures roll back. Web regression
tests exercise rejection before the old telephone implementation can execute.

Signed-in end-to-end rendering and real device call acceptance require separate
verification; passing schema tests does not establish either.

## Mobile distribution

The compatible source targets version 1.0.1, Android versionCode 192. Merge it on
`replit-dev` before requesting the existing `android-apk.yml` preview build. That
workflow creates an internally distributed EAS APK, not a Play Store or App Store
release. Confirm the resulting build actually completed before sharing its
installation URL. Store publication is not performed by that workflow.

The checked-in update policy alone does not establish an enforced remote minimum
version or an OTA distribution channel. Do not claim older devices updated
automatically. They may still display old telephone controls until the compatible
APK is installed, but server/RLS denial applies regardless of app version.

Keep names, messages, booking availability and internal-call identity on the public
projections. Owner-only phone/bank settings intentionally remain private-table
reads. Native build failure or exhausted EAS quota must be reported as a release
blocker, not as a released application.
