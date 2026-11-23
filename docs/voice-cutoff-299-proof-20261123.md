# Follow-up proof:299second isolated agent, 2026-11-23

Owner selected option2 and approved exactly one more call, no retries, no student data, SAR5cap. No further TTS. Publishing remains a separate decision.

## Passed cutoff/accounting proof

- New agent created directly from current production configuration with299maximum at creation, not a duplicate. One branch including archived, no600second local history. Auth and override security settings preserved.
- Agent agent_6201m83y5g4pfg492bs7qp92gbnp.
- Version agtvrsn_6101m83y5haaehvaxnttcne0e0yj.
- Branch agtbrch_7301m83y5h6ge2ysq7wpk78ep0cz.
- Conversation conv_7801m83y5ymcexn8dev733m1k4bd.
- Client measured299.572sec, provider terminal metadata300sec, maximum-duration termination, no error.315second watchdog did not fire.
- Authenticated terminal record matches expected agent/version/branch.
- Provider voice usage4.992870883548557min=299.5722530129sec. Conservative whole-second charge300 fits the existing reservation. Three such reservations fit900seconds.
- Fiat total0.3613193589032372USD, including0.0284613USD model usage. Nonburst. AboutSAR1.355 using3.75conversion for orientation only.
- Provider metadata cost3329credits, voice category3329credits. Do not infer fiat total from this credit field because total fiat includes model usage differently.

## Still-held substitution gate

A foreign production600sec branch paired with this new agent is rejected404 by agent configuration GET. However, signed-URL mint accepts the pair and returns a URL containing the new agent ID and that foreign branch ID. No connection was opened with that URL. The opaque signature does not expose signed claims. This is neither proof of a bypass nor proof of safety.

Staged issuance verifies one branch including archived, current main tip equals pinned version, all security fields, and returned branch matches expected main before returning a ticket. These checks catch configuration drift and unexpected mint output, but do not prove a client cannot alter a returned URL or initiation branch. Overall release remains held until that question is resolved by an authorized negative connection test, vendor assurance or a server-owned transport. No additional paid test is authorized.

## Production/rollback boundary

Production agent/default version, cap schema and live routes were not changed. Private evidence is in /root/backups/voice-cutoff-299-proof-20261123-101000/ on the VPS. Its rollback.sh documents no production routing change. The isolated agent is retained as proof, not activated.

Prepared production deployment script scripts/deploy-shared-voice-cap.sh is NOT RUN. Before its mutations it takes a full DB dump, copies scoped live files, writes a rollback script and installs automatic rollback-on-error. The scoped rollback restores original functions/cron and restarts edge functions while preserving the RLS-locked audit ledger. Intended command after an approved future deployment: sh /root/backups/shared-voice-cap-20261123/rollback.sh . That remote path does not exist yet; do not claim the prepared rollback has been installed.

Sources:
- https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get
- https://elevenlabs.io/docs/eleven-agents/api-reference/agents/create
- https://elevenlabs.io/docs/eleven-agents/api-reference/agents/branches/list
- https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-signed-url
