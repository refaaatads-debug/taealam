# BACKLOG / قائمة المهام

Order = priority. Update this file in a PR when something changes.

## Before real payments
- [ ] Stripe live mode: live keys, products/prices synced to plans (currently test mode, 82 test sessions, 0 completed)
- [ ] Live webhook with signature check that marks the payment completed and activates the plan
- [ ] End-to-end test with a small real payment and a refund; invoices/receipts (ZATCA table is empty)
- [ ] Alert for failed or stuck payments

## Security
- [ ] Turn email confirmation on (GOTRUE_MAILER_AUTOCONFIRM is true), test Gmail SMTP delivery first
- [ ] Add Content-Security-Policy (start in Report-Only mode) and Referrer-Policy in nginx
- [ ] Remove the committed `.env` from the repo safely: deploy script `git reset --hard` would delete the live `/root/taealam/.env`; move it out of the repo and change the deploy path first
- [ ] Optional: bind the API server (port 8081) to 127.0.0.1 and run it as a non-root user
- [ ] 32 non-security OS package updates (unattended-upgrades is active)

## Reliability and monitoring
- [ ] Error tracking (Sentry or similar) in web and app: needs a new account
- [ ] External uptime check from outside the server
- [ ] Publish the app OTA heartbeat (branch `release/ota-heartbeat-20261125` in the app repo)
- [ ] Push notifications: only 3 of 76 users have a device token; re-prompt users to allow notifications
- [ ] Make lint pass (1375 existing errors), then make the lint check required

## Product and support
- [ ] 18 open support tickets
- [ ] Teachers waiting for approval (3 at last check)
- [ ] Hosting renewal on 1 December
