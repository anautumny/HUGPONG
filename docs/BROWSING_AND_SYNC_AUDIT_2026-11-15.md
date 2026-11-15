# Browsing limits and synchronization audit - 15 November 2026

Status: implemented locally with the pending 1.1.2 changes. Not deployed; no new APK published. This report supersedes the earlier per-account read-budget adjustment in `TAKEOVER_AND_RECOVERY_REVIEW_FIXES_2026-11-15.md`.

## Findings and decisions

Normal browsing should not consume an account's sign-in or submission attempts. Keep failed-password, OTP, recovery, sensitive-action and network-flood protections; remove redundant account-level browsing quotas and fix unnecessary request amplification.

The audit found:

1. Background activity/sync telemetry and notification read/dismiss markers shared the business-mutation budget. On Web, a HTTP 429 from this bookkeeping could trigger the global submission-pause state even though the user had not submitted farm data.
2. Every `/auth/*` request, including ordinary GET session checks, consumed the early authentication allowance.
3. Account-level read quotas duplicated the network guard. The network thresholds also shared a relatively small allowance across everyone using one Wi-Fi address.
4. Web resource/loader refreshes and Mobile canonical refreshes scheduled exponential delays, but only the server's explicit Retry-After was stored as a not-before deadline. New change events arriving during a failed request could therefore bypass local backoff. The Mobile notification inbox had the same weakness.
5. Failed telemetry cleared its freshness signature immediately, allowing subsequent screen/state updates to repeat the same failing background work.
6. A Web retry timer that fired while its tab was hidden could be dropped. Returning to the tab did not retry if its last successful snapshot was less than ten minutes old, leaving stale data visible until another event.
7. The generic safe HTTP 429 copy still called ordinary requests "attempts."

## Database / schema

No schema/index change, migration, deletion or production record write. Existing account-scoped caches, offline queues, mutation identities, server authorization and change streams remain in use.

## Server / API

`server/middleware/abuseProtection.js`:

- Remove default per-account/per-account-and-address quotas for normal reads. Existing broad pre-routing network protection remains; RBAC and live account validation still run.
- Use independent background budgets for exact POST activity/sync telemetry, notification state markers, push registration/unregistration and Mobile session renewal paths. URL/body fields cannot opt a business write into this category. Read-only notification queries remain reads.
- GET session checks no longer consume the early authentication-action allowance. Actual credential submissions retain it.
- Tune shared-address flood protection to 600 requests per 10 seconds and 1,800 per minute. These are broad network limits rather than a user browsing allowance. Unknown-path, payload-size, backup, credential and business-write protections remain.
- Background bookkeeping is bounded separately (120/minute per authenticated user and user/address; early network background guard 300/minute). Business-write limits remain 60/5 minutes per account and 45/5 minutes per account/address, plus the existing early network mutation guard.

`server/services/diagnosticService.js`: generic rate-limit messages describe requests, while dedicated wrong-password/sign-in messages still describe their actual protected action.

## Web

- `web/react-app/src/services/apiClient.js`: background bookkeeping neither sets nor consumes the business-submission cooldown. Real writes retain cooldown handling. Resource and loader subscriptions store the full exponential/server retry deadline, so invalidations cannot shorten it. Returning to a tab retries failed refreshes after the deadline even when saved data is recent; healthy recent data retains its focus freshness optimization.
- `web/react-app/src/services/telemetryService.js`: defer repeated background reports after failure for at least 30 seconds, honoring longer server waits. Account reset clears the deadline, and a generation fence prevents a delayed failure from an old account from imposing its wait on the next account. No polling added.

## Mobile

- `mobile/src/data/dataStore.js`: canonical refresh deadlines now include exponential backoff, with queued resource invalidations preserved until the next retry. Existing offline replica, queue replay and scoped refresh behavior remain.
- `mobile/src/services/systemNotificationService.js`: inbox retries store and enforce the full deadline; repeated change events cannot shorten it. Successful refresh clears the deadline. Existing notification deduplication, offline catch-up and push workflow remain.
- `mobile/src/services/telemetryService.js`: same report cooldown and account-generation guards as Web, avoiding retries on every ordinary screen/state update.
- The prior batch already removes background recovery-review Alert dialogs, coalesces reads, honors review cooldowns, recovers sessions before upload, preserves queued work, guards genuine stage conflicts and fixes Sync Monitor navigation. See the linked prior correction reports for those modified files.

## Validation

- Focused browsing/sync/security suites: **83 passed, zero failures**. Includes 1,200 simulated sequential reads from eight account identities sharing an address, independent read/bookkeeping/submission budgets, retained flood and submission rejection, notification bookkeeping not pausing Web submissions, change-event storms during failed reads, delayed automatic recovery, hidden-tab recovery, Mobile inbox retry deadlines, telemetry cooldowns on both platforms, and an old account's delayed failure after a new login lifecycle.
- Existing stage queue/session recovery and successful/wrong-password regression suites are included in that focused run. The prior full stage/session/UI verification also remains part of the full release gate.
- Full local release verification: **843 server tests and 66 Web tests passed**, zero failures. Configuration/authority/binding/secret checks, Web production build and Android JavaScript/Hermes export passed. The final gate reports "Verification passed."
- `git diff --check` passed. No new permanent tests mirror only visual styling; added cases exercise budgets, timers, handlers and state transitions.
- Tests: `server/tests/browsing-sync-budgets.test.js`, extended `abuse-protection.test.js`, `realtime-synchronization.test.js` and `system-notification-clients.test.js`.
- Evidence: `output/browsing-sync-regressions-2026-11-15.tap` and `output/browsing-sync-release-gate-2026-11-15.txt`.

## Practical limits and remaining checks

The eight-account scenario is a deterministic middleware simulation, not a live physical-device or server-capacity test. Protection can still return HTTP 429 for actual excessive traffic; these changes do not make traffic unlimited. Genuine permission conflicts, revoked sessions and invalid offline changes remain visible for correction rather than being silently discarded or accepted.

The installed APK and hosted deployment still use their earlier code until the pending release is published. After updating, test actual Web/Android accounts on the presentation Wi-Fi: navigate rapidly, leave/reopen tabs, publish a price, record an operation and complete its stage, disconnect/reconnect with pending work, interrupt a refresh, and inspect recovery without repeated browsing popups. Physical-device smoothness and live cross-device results have not been claimed from a build or unit tests alone.
