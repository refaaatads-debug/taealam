# Student phone privacy release

## Policy

Teachers must not receive student phone numbers, including confirmed or completed
bookings. Owners and authorized administration retain access. Communication
between teachers and students uses chat and internal calls.

## Server cutover

`20261028000700_deny_teacher_student_phone.sql` supersedes the held cutover in
`20261028000600_private_profile_read_cutover.sql`. It is in the verified production
migration manifest: four broad profile read policies are removed, the booking
contact RPC becomes owner/admin-only, and teacher call history excludes phone
numbers, provider identifiers and provider errors. Raw call records remain
available to the student owner and administration, not the teacher.

The `make-phone-call` and `twilio-call` entrypoints reject requests with HTTP 403
and `PHONE_CALLS_DISABLED` before provider access or wallet mutation. This is an
intentional withdrawal of telephone functionality, including for older clients;
legacy compatibility must not preserve phone disclosure.

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
