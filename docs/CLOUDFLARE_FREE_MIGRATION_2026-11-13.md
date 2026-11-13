# Cloudflare Free migration candidate — 2026-11-13

User constraint: **free hosting only**, leave Render, use the purchased `hugpong.org`, keep the existing HUGPONG workflows. The user explicitly chose **hugpong-production** and subsequently requested a stable **1.1.0** release. No paid services were activated. A restricted preflight Worker is now deployed; domain cutover and native rollout are tracked in [the current release report](RELEASE_1.1.0_2026-11-13.md). No Firestore business records were modified or deleted by preflight checks. The first health checks generated two legitimate operational diagnostic records through the existing error handler; expected preflight readiness now bypasses that writer.

## Database / schema

Firebase stays canonical. No business schema migration, reset, fixture insertion or business-record deletion. Existing private notification events gain optional operational fields `deliveryCursor`, `deliveryRetry`, and `deliveryAwaitingReceipt` so background fanout can resume in bounded pages. Existing pending-state/deadline indexes still apply. Durable Object SQLite storage contains only alarm/retention scheduling metadata, not a second copy of HUGPONG records, identities or queues.

## Server / API

- `server/server.js`: exports the same Express app, database, feed and readiness state; the normal `node server/server.js` entry still starts the existing Node server and background listeners. Importing it from the Worker does not start a standalone TCP server.
- `server/services/runtimePlatform.js` and `runtimeVersionPolicy.js`: detect the actual Workers runtime; the standalone Node 24.22.1 requirement remains enforced.
- `server/firebase-admin.js`: reads a server-only Firebase JSON secret in Workers, validates project identity, uses the existing Admin SDK with REST and identity content encoding. Node's existing credential resolution is preserved.
- `server/services/changeFeed.js`: optional single-writer mode restores revision metadata on object startup and fans out only after canonical revision persistence. The existing Node deployment keeps its Firestore snapshot listener. Clients still use the same authenticated, scoped SSE/API protocol, reconnect reset and revocation checks.
- `server/services/systemNotificationService.js`: bounded delivery pages checkpoint the cursor, retry state and receipt state in existing private Firestore event documents. Normal Node pagination/fanout remains supported.
- `server/services/durableRuntimeTasks.js`: durable alarms reuse existing delivery/lease/authorization/receipt and operational-retention services. One recipient per alarm bounds external calls. Pending events resume after eviction/restart; an empty queue sleeps until existing six-hour retention work rather than polling for synchronization.
- `server/services/httpSecurityHeaders.js`: same existing security headers shared by Node and Cloudflare asset responses.
- `cloudflare/src/entry.mjs`, `gateway.cjs`, `routing.mjs`: thin Worker serves static React assets, preserves legacy redirects, overwrites proxy metadata and routes all API traffic to one fixed named SQLite-backed object. Firebase/session/application initialization occurs inside the object lifecycle. Existing SDK protocol serializers and dependency wrappers are prepared at startup because Workers forbids request-time code generation. No record data is evaluated as code.
- `cloudflare/scripts/build.cjs`, package/lock and `wrangler.jsonc`: Node-compatible bundle, free-compatible SQLite migration, no Containers or paid activation. Current config intentionally leaves custom-domain attachment for the verified cutover.
- `.gitignore`: excludes Worker local secret/runtime files. `.github/workflows/verify.yml`: installs locked build tools and runs a deployment dry run after the existing release gate.

## Web

The same React application and relative `/auth`, `/api`, `/downloads` requests are served at the new origin. API permissions, HttpOnly secure sessions and origin checks are still enforced by the existing server. Static responses retain the server's existing security policy. No duplicate client datastore or new mutation API was introduced.

## Mobile

The existing preview/production EAS configuration already points to `https://hugpong.org`, and the splash's Beta footer was removed in the earlier domain preparation. The same bearer API, SSE revision protocol and account-owned offline outbox work with the new gateway. This migration adds no alternative Mobile authority, password format or queue. Previously installed APKs remain unchanged until a native rebuild and upgrade.

## Checks and evidence

- **770 server tests passed, 0 failed**: `output/release-1.1.0-server-tests.tap`. Includes existing authorization, offline conflict/outbox, synchronization, audit/QR, login, notifications and workflow coverage.
- **60 Web tests passed, 0 failed**: `output/cloudflare-web-tests.tap`.
- Web production build passed: `output/cloudflare-web-build.txt`.
- Worker deployment dry run passed, with Web assets and SQLite object binding: `output/cloudflare-worker-dry-run.txt`. Approximately 10.1 MiB uncompressed / 1.57 MiB gzip. This was not a deployment or authoritative remote startup validation.
- Local **real workerd** compatibility checks passed for existing scrypt password verification and wrong-password rejection, first-party Admin SDK REST document read, query, **read-only** transaction and custom-token signing: `output/cloudflare-sdk-readonly.json`. No token, private key or database payload was returned in that artifact. The token was never exchanged for a client session.
- Full imported Express gateway returned 200 for all three health probes in local workerd. Four simultaneous real HTTP/SSE connections received one identical revision and reset correctly after reconnect: `output/cloudflare-runtime-readonly.json`. Transport revisions were kept only in local Durable Object storage. The harness blocked actual `/api` requests and never started production background delivery/cleanup, so no Firebase write or live push was performed. This is transport coverage, not four real role logins.
- Seven focused behavioral tests cover request-lifetime isolation, trusted proxy routing, preflight rejection, durable revision restoration/fanout, bounded notification restart/receipt handling, alarm scheduling and duplicate-drain prevention: `server/tests/cloudflare-runtime.test.js`.
- Runtime authority and client-binding audits reported zero findings: `output/cloudflare-runtime-authority.json`, `output/cloudflare-client-bindings.json`.
- Secret exposure audit reported zero findings: `output/cloudflare-secrets.json`. The generated backend bundle was also compared against local server credential values without printing them; none appeared: `output/cloudflare-bundle-secrets.json`.
- Cloudflare tooling dependency installation: 0 npm vulnerabilities reported. Whitespace check passed.
- No Android source was changed during this hosting adaptation. The prior domain preparation's Android bundle export and its limitations remain recorded in `docs/DOMAIN_RELEASE_PREPARATION_2026-11-13.md`; no new signed APK was built here.

## Remaining issues / release blockers

1. **CLI authentication resolved:** after the user's browser authorization, `wrangler whoami` confirmed the connected account. A read-only API check found `hugpong.org` active with the Free Website zone plan, a registered Workers subdomain and no Worker scripts. Subscription inspection returned 403 because the OAuth scope could not read subscription details; the separate Workers plan must remain Free. No resources/subscriptions were created. Evidence: `output/cloudflare-account-readonly.json`.
2. The user superseded the staging choice and explicitly requested the existing production Firebase project. Hosted checks avoid business mutations. The live authorized role/device mutation matrix has not been run and must not be represented as completed.
3. Remote startup validation is now **passed**: Cloudflare accepted the deployed Worker, initially at 381 ms and later at 316 ms. The local profiler binding error is not a remaining deployment blocker.
4. Real Web sessions, Mobile bearer sessions/revocation, background alarm eviction/retry and physical Android FCM/Expo delivery still require live acceptance. EAS's separate FCM v1 sending credential is being checked for 1.1.0.
5. Bulk/report/analytics/backup/export/restore and APK streaming have not been exercised in the hosted Worker with representative data volume. Free Workers has 50 external subrequests per invocation and 128 MiB memory. A passing build does not establish workflow parity or production capacity under those limits.
6. Single-writer cutover is required: a simultaneously active old Render backend can write Firebase without broadcasting through the new object. Do not operate both as production writers. Existing APKs must be upgraded before retiring their compiled old API origin.
7. `hugpong.org` DNS/TLS, live Web release and native APK release are unchanged and unverified for this candidate.
8. `server/services/backgroundTasks.js` now binds existing immediate and aggregated diagnostic work to the originating Durable Object's `waitUntil`, preserving the original aggregation window and standalone Node behavior. Concurrent-context isolation is tested. Hosted delayed-write acceptance remains to be recorded.

Deployment steps and free-tier references are in [cloudflare/README.md](../cloudflare/README.md). The deployed backend remains **preflight**, not a completed production handover.
