# Saved login, APK download size and certified date-range compilations

15 November 2026. Implemented locally with the pending changes for Mobile 1.1.2. No deployment, APK publication, production account changes or production business-data writes were performed for this work. The published download manifest still identifies the existing 1.1.1 APK.

## Findings and behavior

1. Mobile restoration previously treated a missing Firebase client identity as a missing login even when the encrypted API token and account were intact. The existing server session can now verify that saved owner and re-establish Firebase authentication. Online startup also reuses the existing API-first sync authorization path instead of requiring an unnecessary Firebase token exchange. Account and authentication-generation guards reject delayed responses from older logins. A mismatched verified owner remains an authentication rejection. Missing identity in an otherwise successful recovery response is a temporary verification failure and does not delete the saved login.
2. If Firebase identity is unavailable while offline, restoration keeps the stored credentials, drafts and account-owned outbox and explains that one connection is required to verify the saved account. Splash retries on connectivity restoration, including when the connection returns before the deferred restoration result arrives. Ordinary offline startup with an intact previously authenticated Firebase identity continues using saved data. Genuine revoked credentials still require sign-in; this does not make sessions permanent or bypass verification.
3. The hosted APK's HEAD response had a size, but its actual GET stream did not: the Cloudflare Node HTTP bridge emitted a chunked stream. The server now retains trusted artifact length metadata, including ranges and the versioned release manifest fallback. The final Worker wraps only successful APK GET streams in FixedLengthStream. Full and resumed responses advertise their actual byte lengths without buffering the APK. Other API responses and change streams use their existing paths. The landing button also displays the measured current release size, 112.7 MB (112,694,343 bytes). Future APK publication must update the version, URL and measured size together.
4. The previous PDF layout began at the first recorded month. Following the latest instruction, the first displayed block now contains months 1-12; later blocks continue through the actual final recorded month. For example, February 2027 through April 2028 produces 1-12 under 2027-2028, then 1-4 under 2028-2029. These are calendar-month labels. Reporting month remains a month name plus year. Headers are presentation only and never change the recorded crop identity, snapshots or signatures.
5. Crop-year compilation already allowed certified reports to date without closing the cycle. Both clients now explicitly offer all certified operations to date or a selected inclusive start/end activity-date range. The server intersects that range with the selected operations' recorded crop-year identity and optional Block Farm. It excludes uncertified reports and other crop cycles. This uses the operation activity date, not its certification date. Missing, impossible and reversed selection dates are rejected; missing source activity dates are never invented from a report month. Existing source integrity checks, deduplication, authorization and transaction boundaries remain authoritative. Farm Managers continue compiling monthly reports through their existing workflow; the additional certified compilation option remains SRA Admin-only.

## Database / schema

No migration, new collection, index or existing-record rewrite is required. Selected-date compilations use the existing crop-year compilation collection and add startDate/endDate, coverage CERTIFIED_DATE_RANGE and schemaVersion 2. The selected dates participate in the existing deterministic content hash: repeating an identical compilation returns the same saved snapshot, while different coverage creates a separate snapshot. Existing all-to-date records retain their original schema/hash behavior. Historical compilations remain viewable and exportable with their saved date labels. Creating a compilation does not close or advance a crop cycle.

## Server / API / Worker files

- `server/services/cropYearCompilationService.js`: selected-date validation/filtering, immutable coverage metadata and server-rendered export labels; existing endpoints and SRA authorization retained.
- `server/domain/auditReportLayout.js`: full first-year numeric grid and actual continuation.
- `server/routes/androidDownload.js`: correct HEAD, trusted full/range length metadata, existing pinned artifact validation and streaming behavior retained.
- `cloudflare/src/routing.mjs`, `cloudflare/src/entry.mjs`: fixed-length APK stream at the final Worker response boundary; existing single canonical API Durable Object retained.

## Web files

- `web/react-app/src/components/audit/CropYearCompilationModal.jsx`: coverage selection, start/end date inputs, valid-range preview/compile guards and saved coverage labels. Changing scope clears the previously selected export snapshot.
- `web/react-app/src/services/cropYearCompilationService.js`: pass coverage and dates through the existing API.
- `web/react-app/src/services/auditPdfService.js`: compilation PDF date coverage; pure construction helper for inspecting the actual generated PDF before saving.
- `web/react-app/src/utils/auditReportLayout.js`: same month layout as the server and Mobile.
- `web/react-app/src/config/androidRelease.json`, `web/react-app/src/views/LandingView.jsx`: measured size of the published artifact. No unbuilt APK advertised.

Web authentication continues using its existing server session and does not depend on Mobile's Firebase identity persistence. The download flow is the hosted Web endpoint used by Android's browser/download manager; it does not add a separate Mobile updater.

## Mobile files

- `mobile/src/services/authService.js`: server-verified restoration of missing Firebase identity, owner validation and existing authentication-generation fencing.
- `mobile/src/data/dataStore.js`: restore from intact encrypted credentials before clearing a missing Firebase replica; preserve credentials and queued work on temporary/offline failures; API-first online validation.
- `mobile/src/screens/auth/SplashScreen.js`: automatic deferred restoration on reconnect, including the handshake timing race; unsubscribe on exit.
- `mobile/src/components/CropYearCompilationScreen.js`: matching coverage/date controls, validation feedback, preview/compile scope and saved coverage labels.
- `mobile/src/services/cropYearCompilationService.js`: same coverage/date API contract. PDF sharing continues retrieving the authorized saved compilation's server HTML.
- `mobile/src/utils/auditReportLayout.js`: matching full first-year grid and actual continuation for Mobile-generated audit documents.

## Tests and evidence

- Full local release gate: 856 server tests and 67 Web tests passed, zero failures or skipped tests. Includes deployment configuration parity, tracked-secret exposure, runtime authority, client bindings, Web production build and Android production JavaScript/Hermes export. Evidence: `output/remaining-work-release-gate-2026-11-15.txt`.
- Local Cloudflare Worker build and Wrangler deploy --dry-run passed; no upload/deployment performed. Evidence: `output/remaining-work-worker-dry-run-2026-11-15.txt`.
- The actual local Workers runtime test confirms Content-Length and received bytes for both full and partial download streams. The five download route tests cover HEAD, upstream lengths, manifest fallback, ranges, unsafe destinations and failure behavior. These run in the full gate; separate focused evidence is `output/download-length-worker-regressions-2026-11-15.tap`.
- Restoration tests execute the real storage/authentication paths across fresh runtimes: retained account/assignments/drafts/outbox, missing Firebase identity recovery, mismatched owner, malformed response, offline/temporary failures and stale refresh races. The Splash component test covers delayed reconnect and reconnect during the first check, no polling and subscription cleanup.
- Server compilation tests cover inclusive activity dates, exclusion of other cycles and uncertified records, totals, source integrity, idempotent saved snapshots, old all-to-date compatibility, invalid ranges and undated source rejection. Web and Mobile component tests exercise the actual controls and ensure scope changes cannot export the previously selected snapshot. PDF tests verify full first-year/continuation headers, pagination and selected-date labels without mutating source data.
- Regression files: `server/tests/mobile-cold-start.test.js`, `server/tests/audit-recovery-regressions.test.js`, `server/tests/mobile-ui-pagination.test.js`, `server/tests/android-download.test.js`, `server/tests/cloudflare-download-length.test.js`, `server/tests/crop-year-compilation.test.js`, `server/tests/audit-report-layout.test.js`, `web/react-app/tests/audit-pdf-download.test.js`.
- Generated and visually inspected the actual audit PDF renderer's one-page layout preview: `output/pdf/HUGPONG_Audit_Layout_Preview_2026-11-15.pdf`. Numeric month blocks, operation placement, totals, headers and footer fit without overlap. It is explicitly labeled for layout verification only and contains no valid production audit. Rendering evidence: `output/remaining-work-pdf-render-2026-11-15.json`.
- `git diff --check` passed. Non-failing tooling warnings include the existing Node module-type notice, Vite empty vendor chunk and Expo color-environment notice.

## Remaining release and device verification

The installed/public APK has not changed. These local checks do not prove an Android package installation or live cross-device behavior. When releasing, use the same Android package and signing certificate, install over the existing app with Update, and confirm account, fields and offline queues survive. Test both connected startup and offline startup, then reconnection; do not uninstall or clear app storage as a workaround. Definitive server revocation remains an expected sign-in boundary.

After a future deployment, verify the actual hosted GET and resumed APK response length and Android download-manager progress. After building the next APK, replace the manifest size with that APK's measured size. Also verify selected-range compilation with authorized accounts on Web and Android, inclusive boundary operations, exported dates, a still-open crop cycle and source-report traceability. Physical device installation, hosted GET after deployment and the live Web/Android role synchronization matrix remain unverified. Previous pending fixes are documented separately in the November 15 sync, browsing, takeover, price, notification and audit-footer reports; this gate includes those local changes too.
