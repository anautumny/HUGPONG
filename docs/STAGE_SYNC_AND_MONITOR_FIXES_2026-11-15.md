# Stage synchronization, session recovery and Sync Monitor navigation

15 November 2026. Status: implemented and verified locally with the pending 1.1.2 release changes. Not deployed; no new APK built or installed for these corrections.

## Findings

The screenshots show a pre-upload authorization failure: queued entries have zero attempts. Previously every sync forced a Firebase token refresh, even when the existing API bearer session could still be validated against the live account. All preflight failures except HTTP 403 were labeled authentication recovery and described as requiring sign-in; connectivity, server outages and rate limits were therefore indistinguishable from revoked credentials. Preflight failures did not schedule continuation. Normal authenticated requests also cleared saved credentials immediately on a current HTTP 401 rather than first trying the persisted Firebase session.

A separate code path can produce false stage conflicts: recording the first sugarcane variety changes the crop-cycle `updatedAt` revision. Completing the stage from an earlier screen then fails the whole-document version check, although stage progress itself has not changed. The supplied screenshots alone do not establish the exact underlying Firebase/server error on that phone; no production diagnostic reference was supplied for this failure.

The reconnect dialog navigated directly into a nested Home Sync Monitor. When Home had not mounted, the monitor could be its first screen, leaving no local route to pop. The Back button used only `goBack()`, which can resolve to parent tab history rather than return to the local root. The Member field card separately placed a long field ID and sync status on one unconstrained horizontal row.

## Database / schema

No persistent schema/index migration, record deletion, or production data writes. An additive `expectedStage` command precondition contains the stage state actually observed by the client. Existing queued mutation identities, account ownership and dependency chains remain in use.

## Server / API

`server/services/cropCycleOperations.js` validates the observed stage number, elapsed months and completion timestamp. Within the existing authorized transaction, a stale whole-cycle revision may proceed only when all three observed stage values still match the authoritative cycle. Changes to stage progress still conflict. Missing version preconditions, assignment/takeover checks, inactive/current-cycle checks, closure locks and audit writes remain enforced. Older callers without the additive precondition retain strict version checks.

## Web

`web/react-app/src/services/cropStageService.js`, `src/components/operations/AddOperationModal.jsx`, and `src/views/operations/TakeOverView.jsx` send the observed stage precondition through the existing API. This covers standalone completion and stage advancement after recording an operation, including takeover. Web continues using its existing authenticated server session; it has no Mobile Firebase refresh dependency.

## Mobile

- `src/services/authService.js`: sync first validates/renews the existing API session against the live account. An expired bearer can recover through Firebase without prematurely deleting those credentials. Concurrent HTTP 401 requests share one recovery; original requests retry at most once, keeping the original mutation body/key. Temporary recovery failures preserve saved credentials. Definitive rejection still clears credentials, and account/generation fences prevent an old response from replacing a newer login. Successful API preflight does not force a Google token exchange.
- `src/data/dataStore.js`: capture the pre-edit stage state before optimistic updates and queue it with the command. Preflight results distinguish revocation, permission rejection, rate limiting, connectivity and temporary authorization failure. They report zero failed uploads when no item was attempted. Temporary failures schedule a paced retry (at least 30 seconds and honoring a longer server wait) through the existing foreground/account-scoped continuation scheduler; Auto Sync preferences remain respected.
- `src/domain/syncPresentation.js`: temporary session verification failures no longer incorrectly instruct users to sign in again. Definitive authentication failures retain the sign-in instruction.
- `src/services/syncEngine.js`: existing stage conflicts expose their proposed values in diagnostics. After explicit review, a queued stage command can use the displayed server stage/version and retry under server validation. This preserves its mutation identity and dependent work, rejects regressions/skipped stages and completion reversal, and rolls back failed local persistence. No queued item is silently discarded or rebased.
- `src/screens/SyncMonitorScreen.js`: show current/proposed stage and explicit review/retry for eligible older conflicts. Back uses local stack history, with a root-screen fallback; Android Back handles rootless entry too. The button has a 48px touch target. A synchronous guard blocks repeated Sync taps, errors stay inline, and a result alert is suppressed after navigating away.
- `src/navigation/RootNavigator.js`: explicit Home initial route and nested navigation `initial: false` retain Home underneath a newly opened monitor.
- `src/screens/FieldOpsScreen.js`: Member field identifier and sync status occupy separate rows, with width and text-shrink constraints.
- `src/screens/HomeScreen.js`: use the shared detailed sync-result explanation instead of a count-only failure alert; View Sync Details remains available.

## Verification

- Focused session/stage/queue/navigation suites: **91 passed, zero failures**. Covers temporary preflight failures preserving pending work, cooldown scheduling, one recovery for concurrent expired requests, stable mutation keys on retry, definitive revocation, genuine stage conflicts, benign variety revisions, permission rejection, legacy-stage review persistence rollback, sequential dependency revisions, local-root/normal/Android Back, repeat taps and suppressing alerts after leaving.
- Full `npm run verify:release`: **836 server tests and 66 Web tests passed**, zero failures. Deployment/configuration, authority, binding and secret checks, Web production build and Android JavaScript/Hermes export passed. `git diff --check` passed.
- Tests: `server/tests/stage-sync-recovery.test.js`, `audit-recovery-regressions.test.js`, `crop-cycle-renewal.test.js`, `mobile-ui-pagination.test.js`, and updated `authentication-performance.test.js`.
- Evidence: `output/stage-sync-regressions-2026-11-15.tap`, `output/stage-sync-release-gate-2026-11-15.txt`.

## Remaining device checks

The phone is still running the previous APK. These changes do not retroactively update it. Keep its pending work intact; do not uninstall or clear app storage to resolve this symptom.

After releasing/installing the next APK and backend/Web updates, verify: queue an operation and stage completion offline, reconnect, confirm both persist exactly once, interrupt connectivity during recovery and retry, change a stage from another device and confirm a genuine conflict stays reviewable, enter Sync Monitor from the reconnect popup before opening Home, and use its arrow/Android Back to return. Verify the full field ID and pending status at the phone's font size. These physical-device and live cross-device results have not been claimed from local tests or a successful build.
