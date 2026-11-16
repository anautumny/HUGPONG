# HUGPONG 1.1.3

Status: Web/API and Firestore rules deployed, signed Android release published on 16 November 2026, Asia/Manila. Website: https://hugpong.org. Android: https://hugpong.org/downloads/android/1.1.3. Release: https://github.com/anautumny/HUGPONG/releases/tag/v1.1.3.

## Included changes

- Pending users appear in dashboard operational attention. Farm Managers can approve eligible members with immediate field assignment or assign later on Web and Android; the server atomically creates the field and initial cycle when requested.
- Android automatic synchronization is always enabled, with manual retry retained and existing offline drafts/outbox preserved.
- Notification eligibility follows the account, authorized role/farm and signed-in periods. Account switches/logout clean up native alerts; new accounts do not inherit historical broadcasts. Explicit assisted recovery remains available while signed out.
- Read reduction covers farm-scoped field summaries, filtered pending queues and active push devices, coalesced authorized requests, dependency-specific cache invalidation, targeted Web/Mobile refreshes, notification state reads and bounded background delivery/retention.
- Concise eight-section user manual updated against the reviewed workflows.

## Database and server

The private `notification_subscriptions` collection and `users.notificationStartedAt` support notification eligibility. Client rules deny direct access; server authorization remains authoritative. Existing accounts initialize eligibility lazily on authenticated use; no business-record backfill is needed. No new composite index is required by the read optimizations.

Expired notification metadata/device registrations join the existing bounded retention cleanup. This does not delete field/operation/audit business records or notification read/dismiss history.

## Web and Mobile

The existing Cloudflare Worker and same-origin Web assets for https://hugpong.org were updated. Android 1.1.3 uses `com.hugpong.app`, the existing signing certificate and remote version code **15**. The website download manifest was updated only after the APK identity, cryptographic signature and publication passed verification. Version 1.1.2 remains available on GitHub. Install with **Update** over the existing app; do not uninstall or clear local storage.

## Release verification and identity

- Android/source commit: `258ed796025412f053a551f4f0acdbb93dee3810` on main.
- Deployed Web/API/download manifest commit: `aadc0328b651faf69fa8b54bc108d5a90cc50841`.
- GitHub verification passed for source run `43833309835` and deployed download-metadata run `43835921281`. Local full release gate and final gate each passed **952 server tests and 75 Web tests**, security/configuration/client-binding audits, Web production build and Android production export.
- Audited EAS archive: 140 files, no excluded/private file violations; critical Mobile hashes match source.
- EAS build: `787fcfb0-a10c-42c7-8955-ac97eaa0e25a`, FINISHED, Android 1.1.3, version code 15.
- APK: 112,789,895 bytes; SHA-256 `be026a8b25a9f99671bb45c51556a934875a023f3cd8fb064a96a9cd1fef3f1e`.
- Cryptographic signature verified with Android apksigner. Signing-certificate SHA-256 `88cba6d11aa4e849639eb8ad2d0ed08e459703b50ba20d5389ac29d8bd5ab83d`, matching 1.1.2. APK inspection confirms the production origin and updated approval/notification feature code.
- GitHub release: `v1.1.3`, public stable release, with APK and checksum; uploaded asset digest matches the verified artifact.
- Firestore ruleset: `87af20dc-c1e3-4d97-aa8d-029db2ac0f2a`, successfully released to `hugpong-production`. All 32 required indexes were already ready.
- Active Cloudflare version: `8d9f2f00-0c24-407c-a876-617039124005`, 100 percent traffic. Previous version retained: `73b6611e-2bca-4450-a299-24e96f04c2df`.

Live verification passed for public pages and exact Web entry, dashboard, user-management, audit, PDF and login feature bytes. Health/readiness returned HTTP 200 in active mode; anonymous session/field/price API reads returned HTTP 401; `www` redirected to the canonical domain. The hosted APK returned correct attachment/length metadata, HTTP 206 for a byte-range request, and HTTP 200 for the complete download. All 112,789,895 downloaded bytes matched the independently verified APK checksum. Evidence: `output/release-1.1.3-live-after.json` and `output/release-1.1.3-live-verification.json`.

The final release record is `output/release-1.1.3-deployment.json`. The current user manual and copy-ready text now identify 1.1.3 as published; no application source changed during that documentation update.

No Android device was connected for the release smoke test. Physical installation, signed-in multi-role walkthroughs and push delivery remain device acceptance work. No production business records were created for a simulated test matrix, and no client drafts or queued work were cleared.
