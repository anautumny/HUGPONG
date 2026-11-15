# Emulator refresh failure and local testing

15 November 2026. The local API and Metro are running for emulator testing. No hosted deployment or signed APK publication was performed.

## Confirmed cause

The running emulator was using https://hugpong.org, which still had the older deployed backend. The current account had an expired API bearer session. A diagnostic captured this actual request sequence without exposing credentials or records:

1. GET /api/fields on hugpong.org returned 401.
2. Firebase's secure-token refresh returned 200.
3. POST /auth/mobile-session on hugpong.org returned 429, code HOURLY_CODE_LIMIT, with Retry-After metadata.

The endpoint used a persistent 60-request/15-minute allowance keyed by network address before Firebase verification. Successful automatic renewals therefore consumed the same allowance as unsuccessful requests. Its generic rate-limit defaults also incorrectly described this as an hourly verification-code limit. The Mobile refresh catch printed only the generic deferred warning, hiding the actual status and code. Retrying or clearing caches would not fix the active server quota.

## Database / schema

No new collection, index, migration, mock application records or record deletion. The existing failed-token rate-limit documents remain in use; no quota documents were manually reset. The local API still uses the existing hugpong-production Firebase project. Local hosting does not make the database an isolated test database. User-created test operations and other saves are real changes.

## Server / API

- `server/routes/auth.js`: successful Firebase-verified session renewals no longer consume or consult the failed-token allowance. Missing or definitively invalid Firebase tokens still use the existing persistent limiter. Temporary Firebase/network/database/signing failures remain retryable 503 responses. Live account status, authVersion, platform and role validation remain authoritative.
- Invalid-session throttling now uses code MOBILE_SESSION_RATE_LIMITED and a session-specific message. Login and takeover/password protections remain unchanged. Existing network burst/sustained/background flood guards still run before this endpoint.
- `server/services/diagnosticService.js`: the new session-limit code receives a safe user-facing explanation rather than a verification-code message.
- The verified local HUGPONG server process was restarted to load these changes. It is listening on port 3000. No Render or Cloudflare service was activated or deployed.

## Web

Existing same-origin session and API handling remains in use. Web does not call the Mobile Firebase-renewal endpoint. The updated server error envelope remains usable by both clients.

The actual local Web route http://localhost:3000 returned HTTP 200 with application HTML. An OPTIONS preflight for its login request returned 204 and allowed the local origin. This proves local routing/CORS availability, not a completed Web role/login workflow.

## Mobile

- `mobile/src/data/dataStore.js`: partial-refresh failures retain their causes for diagnostics. The deferred warning now includes only safe HTTP status/code/reference, affected resources and retry timing. It does not log tokens, account records, request bodies or raw server messages. Stopped listeners no longer report a late failure against a new listener lifecycle. Retry-After, coherent field replicas and account-scoped outboxes remain intact.
- `mobile/.env.development.local` (uncommitted): sets the public development API origin to http://10.0.2.2:3000. This is the Android Emulator's host-computer alias, documented by [Android](https://developer.android.com/studio/run/emulator-networking-address). It is not a production fallback or runtime host-probing mechanism.
- Metro was restarted on port 8081 and the existing HUGPONG debug app reloaded. The active emulator runtime confirmed the local origin. Release profiles still target https://hugpong.org; the development-only environment file is not loaded for production exports. See [Expo environment file precedence](https://docs.expo.dev/guides/environment-variables/).
- The emulator reached sign-in after the environment switch. The user signed in with an existing Member account. No password was requested or exposed, and app data was not manually cleared or uninstalled.

## Actual emulator results

Verified through the running Android app and its actual services, rather than only a build:

- Connected to http://10.0.2.2:3000 with connectivity ONLINE and account setup complete.
- Cloud-data state READY with a saved snapshot.
- Session, block farms, fields, crop cycles, operation logs, prices and both ticket reads returned HTTP 200. A coincident account-owned notification-state query also returned 200.
- A forced read refresh completed successfully and remained READY.
- A full app reload restored the Member account automatically, returned to READY and preserved the same visible counts: 1 field, 5 operations, 43 price records and 0 pending changes. No further sign-in was needed for that reload.
- No application business records were created, edited, archived, submitted or deleted by these automated live checks. Authentication/session bookkeeping and normal background reads/state reconciliation continued through the real app.

Evidence contains safe metadata and counts only:

- `output/emulator-local-refresh-2026-11-15.json`
- `output/emulator-before-reload-2026-11-15.json`
- `output/emulator-after-reload-2026-11-15.json`

## Automated verification

- Full release gate: **863 server tests and 67 Web tests passed**, zero failures or skipped tests. Deployment configuration, secret exposure, runtime authority and client-binding checks, Web production build and Android production JavaScript/Hermes export passed. This does not publish anything.
- Regression tests demonstrate 65 verified renewals cannot be blocked by a failed-token allowance, invalid/missing tokens still receive the limiter, temporary infrastructure failures remain 503, expired/revoked tokens remain 401, inactive accounts remain 403, and safe deferred-refresh diagnostics preserve HTTP/retry metadata without private payloads.
- Modified tests: `server/tests/mobile-session-resilience.test.js` and `server/tests/realtime-synchronization.test.js`.
- Evidence: `output/emulator-session-refresh-tests-2026-11-15.tap`, `output/emulator-predeployment-release-gate-2026-11-15.txt`. `git diff --check` passed.

## Continuing local tests

Use the existing HUGPONG app in the emulator and http://localhost:3000 for the local Web console. Keep the local API and Metro processes running. If they are stopped later, run `npm start` from the repository root, and `npm start -- --clear` from mobile in another terminal. Use the existing debug HUGPONG app connected to Metro on port 8081. Do not launch duplicate servers on these ports.

The hosted domain still serves its deployed version. Test locally to exercise the pending backend and Web changes. Use authorized test records in the existing Firebase project and preserve any queued changes when switching accounts or testing connectivity.

Only the signed-in Member read/refresh and reload flow was verified live during this task. Actual disconnected queue submissions/reconnection, conflicts, manager takeover, SRA certification and date-range exports, all four role workflows and cross-device changes remain user acceptance tests. The emulator's installed native binary reports 1.0.0/debug while Metro supplies the current JavaScript; native plugin/logo/FCM changes require a matching rebuilt native app to validate. Physical device behavior and the production signed-APK upgrade are not proven by this emulator check.

## Loading spinner, cloud icon and offline checks

The startup screen now uses a large loading circle without the visible restoring-account sentence. Its screen-reader label uses the existing translated Loading your data text. Saved-session verification, restoration, retries and error actions remain in use. File: `mobile/src/screens/auth/SplashScreen.js`.

The shared header now mounts the rotating syncing symbol and the static status cloud in separate native view branches with separate keys. A cloud cannot inherit the animated wrapper's last partial rotation when a refresh completes. The Home header's upright Synced cloud was visually checked on the running emulator after an actual refresh. File: `mobile/src/components/AppHeader.js`.

These are Mobile presentation changes. Database/schema and server/API contracts require no changes; Web keeps its existing route/data loading indicators. The actual Mobile component, cold-start and loading suites passed 46 focused tests. Evidence: `output/mobile-spinner-cloud-checks-2026-11-15.tap`, `output/mobile-cloud-live-refresh-2026-11-15.json`. Client-binding audit and whitespace checks passed.

To test offline behavior manually:

1. Sign in as a Member while online, keep Auto Sync enabled and open the assigned field in Operation. Wait for Synced. Keep the local API and Metro running and the app open for this first test.
2. In the emulator's Android Quick Settings, enable Airplane mode and ensure Wi-Fi is also off. If needed, use the emulator's More controls, Cellular, Data status Unregistered option and disable Wi-Fi. See [Android emulator network controls](https://developer.android.com/studio/run/emulator-extended-controls). Verify the HUGPONG header actually changes to Offline before proceeding.
3. Record and submit one authorized test operation. Expect it to stay saved locally with a Pending Sync count; it must not claim successful cloud synchronization while offline.
4. Restore connectivity. With Auto Sync enabled, the pending item should upload without logging out, restarting or manually refreshing. Confirm the pending count returns to zero and the header becomes Synced.
5. On the authorized local Web account, verify that the operation appears once. Use approved test fields: the current Firebase project contains real records.

A Member's own field is the simplest first test. Farm Manager offline work is restricted to their personal plot; takeover and SRA administrative changes require connectivity. A completely offline cold launch should also be tested using a standalone APK with bundled JavaScript, because the present development app obtains JavaScript from Metro. Do not confuse an unavailable Metro bundle with failure of the app's cached-data/outbox behavior.
