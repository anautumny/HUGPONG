# Notification refresh and false submission cooldown

## Root cause

Web's notification inbox subscriber reads account-owned read/dismiss state using `POST /api/notifications/state/query`. The API client treated every POST as a mutation, including this read. A successful query invalidated the inbox, which queried state again, creating a feedback loop without a user submission. The server charged those reads to its 45-per-account/network, five-minute mutation budget. The resulting 429 activated Web's global submission cooldown, explaining the screenshots showing roughly 200–265 seconds remaining during browsing.

## Database / server / Web / Mobile

- Database: no schema changes, record removal, or data migration.
- Server: `server/middleware/abuseProtection.js` recognizes the exact authenticated notification query as a read in both early and per-account budgets. Network/read limits and real mutation limits remain enabled. Query ownership/authentication checks are unchanged. Client flags cannot exempt writes.
- Web: `web/react-app/src/services/apiClient.js` matches that endpoint classification for invalidation, idempotency envelopes and cooldowns. Read queries no longer announce mutations or pause submissions. Both subscription implementations respect Retry-After, including focus/reconnect/invalidation events. `notificationService.js` skips state requests for empty inboxes.
- Mobile: inspected `authService.js` and the notification controller. Notification API paths already exclude local mutation callbacks, and empty inboxes skip state queries. The shared server correction applies to Android without an APK change. Existing account guards, cached inbox, offline queue and server change stream are retained.

## Verification and deployment

Full suites before the final Android regression addition: **775 server tests and 60 Web tests passed**. Focused tests also execute the actual Android API client and confirm that querying state makes one request and no local mutation announcement, while a business write still announces its mutation. Other regressions cover the inbox feedback loop, actual state-write refresh, false versus real submission cooldown, empty inboxes, Retry-After event suppression and read/write budget separation.

Web production compilation completed. Cloudflare deployed the corrected Web and API in active mode to `https://hugpong.org`, version `4c0d4081-71a8-454f-abda-3c15cec315ec`. Health/readiness returned 200; protected unauthenticated API/session probes returned 401. The live entry asset `/assets/index-DeDFPofZ.js` matched the local build byte-for-byte.

Browsers already running old JavaScript need one page reload to load the deployed code. Logout, storage clearing and reinstalling are unnecessary. This fix changes no Mobile application source.

## Remaining validation

No physical Android phone or signed-in browser session was available for acceptance testing. The real role/device mutation and offline/reconnect matrix remains unverified. Automated transport/client tests do not establish physical push delivery. Mobile's general exponential retry remains unchanged; this patch fixes Web's loop/cooldown and the shared server's misclassification.
