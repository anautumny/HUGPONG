# Manager takeover and recovery-review corrections - 15 November 2026

Status: implemented and verified locally. Not deployed; no new APK built. The installed 1.1.1 APK and hosted backend do not yet contain these corrections. Mobile 1.1.2 metadata is prepared for the next release alongside the header indicator correction.

Follow-up: `BROWSING_AND_SYNC_AUDIT_2026-11-15.md` supersedes this report's initial read-budget adjustment. The pending implementation now removes default per-account browsing quotas and separates background bookkeeping from submissions.

## Root causes

- The former Mobile authorization modal had a tall, non-scrolling layout without keyboard avoidance. The keyboard could cover the password and actions. Its asynchronous authorization handler had no immediate busy state or repeat-tap guard.
- The active field card put a long field identifier beside a wide exit button, squeezing the identifier and takeover badge into a narrow column.
- Recovery-review refresh failures opened native alerts even when the user was doing unrelated work, including sharing an audit QR. Refresh invalidations could trigger overlapping reads, and retry cooldowns were not enforced by this component.
- A targeted, read-only diagnostic lookup confirmed screenshot reference `SECU-20261115-B4481068` was a `USER_RATE_LIMITED` response for `/api/recovery-reviews/*` on Mobile 1.1.1. This was a background read quota, not an incorrect password. The authenticated read quota used a five-minute window that normal sustained real-time reads could exhaust; the generic message incorrectly called these requests "attempts."
- Successful password checks consumed the same counter as incorrect checks. Authorization responses also needed guards against completing after the selected field or account changed.

## Changes by layer

### Database / schema

No schema, index or business-record migration. No records deleted. Existing security-counter storage remains in use.

### Server / API

- `server/middleware/abuseProtection.js`: authenticated read budgets now use one-minute windows (600 per user, 300 per user/address). Existing network burst and sustained limits, mutation limits, login, OTP and password-recovery protections remain.
- `server/routes/auth.js`: successful password verification resets its failed-check counter. The counter uses the authenticated account rather than a request-body identifier. Ten incorrect password checks per 15 minutes remain protected. Authorization infrastructure failures return a retryable service error rather than being described as wrong passwords.
- `server/services/diagnosticService.js`: distinguish request quotas from incorrect-password attempts in safe error messages.
- Existing role checks, live assignment validation, field-bound signed takeover grants, expiration and audit history remain authoritative on the backend.

### Web

- `web/react-app/src/components/operations/TakeOverAuthModal.jsx`: immediate repeat-submit guard, busy/close protection, password-manager attributes, responsive field summary and stale-response rejection after changing account or field. Password contents are sent unchanged.
- `web/react-app/src/components/users/RecoveryReviewQueue.jsx`: coalesce refreshes, respect server cooldowns, preserve previously loaded reviews, retry failed reads with backoff, clean up timers/subscriptions, and avoid a false empty state after errors.

### Mobile

- `mobile/src/components/TakeoverAuthorizationModal.js`: replaces the old inline modal with a safe-area, keyboard-avoiding, scrollable dialog. Focusing the password reveals its position; secure entry, show/hide and password-manager attributes are supported. Authorize immediately shows a spinner and "Authorizing..."; controls are disabled while pending.
- `mobile/src/screens/FieldOpsScreen.js`: one in-flight authorization, online guard, current account/field response fencing, pending-action cleanup when scope changes, and real server-error feedback. Active takeover cards give the field identifier full width and place Exit on a separate row.
- `mobile/src/data/dataStore.js`: opt-in propagation of authorization errors, preserving legacy callers' existing boolean behavior.
- `mobile/src/services/authService.js`: share simultaneous recovery-review reads for the same account/cursor; discard the sharing map on auth-generation changes. This is not a second persistent cache.
- `mobile/src/components/RecoveryReviewQueue.js`: background refresh errors stay inline and no longer interrupt other screens with alerts. Preserve loaded rows, coalesce invalidations, honor cooldowns and retry backoff, avoid offline requests, and clean up on unmount. User-initiated recovery decisions retain their confirmation/result workflow.
- The earlier duplicate top updating/offline row removal and single animated header indicator remain included; see `MOBILE_HEADER_SYNC_2026-11-15.md`.

## Verification and remaining checks

- Full local `npm run verify:release`: **823 server tests and 66 Web tests passed**, zero failures. Authority/configuration/binding/secret checks, Web production build and Android JavaScript/Hermes export passed.
- Focused final takeover/recovery/UI suites: **35 tests passed**, zero failures. They execute handlers/components using the existing harness and cover keyboard-scroll props and focus behavior, immediate busy feedback, repeated taps, raw passwords, changed field/account responses, pending-action cleanup, cooldowns, unmount cleanup, concurrent-read sharing and retained review rows.
- Backend regressions exercise repeated successful checks, the incorrect-password limit, body-identifier spoofing, expiry recovery, role rejection and sustained legitimate authenticated reads.
- `git diff --check` passed; Git emitted line-ending conversion notices only.
- Evidence: `output/takeover-recovery-release-gate-2026-11-15.txt`, `output/takeover-regression-tests-2026-11-15.tap`, and `server/tests/takeover-review-regressions.test.js`. Additional UI tests are in `server/tests/mobile-ui-pagination.test.js`; field-summary coverage is in `server/tests/takeover-field-summary.test.js`.
- No physical Android keyboard/rendering test or production takeover mutation is claimed. After the next APK/backend release, verify on the phone: open takeover with the keyboard visible, show/hide password, submit once and rapidly twice, try a wrong password then a correct one, change fields, exit takeover, and keep an audit QR open during a recovery-review refresh. Verify password visibility, action visibility, responsive card layout, busy feedback, no unrelated alerts and continued server permission checks.
- These corrections do not establish that every other unreported system issue is resolved.
