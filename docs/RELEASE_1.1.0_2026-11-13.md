# HUGPONG 1.1.0 release

**Rollout update:** `hugpong.org` and `www.hugpong.org` are connected; Web and API are deployed in active mode. The user confirmed Render was suspended with auto-deploy disabled, and its old readiness endpoint returned 503. The session secret was matched to preserve token validation. The notification refresh correction and latest tests are recorded in [NOTIFICATION_RATE_LIMIT_FIX_2026-11-13.md](NOTIFICATION_RATE_LIMIT_FIX_2026-11-13.md). Preparation details below referring to preflight or pending domain cutover are historical.

The EAS Android build finished: **1.1.0**, code **12**, package `com.hugpong.app`, source `bc79bf6fe693098504dd3ab83e27771989dee31c`. Passive manifest/domain, size/hash and certificate metadata checks passed; the certificate fingerprint matches EAS's existing signing identity. Independent cryptographic signature verification was not run because the user declined installing the local verification tools. APK SHA-256: `8e70c6d2b91bee9f72b7fd4b02faa8a991792e09535a9b22440b38a1c04f1d00`. The APK and checksum are uploaded to a GitHub draft; public distribution remains pending until publication and route checks.

Expo FCM v1 credentials are now configured for the existing Firebase project. Google's validate-only request passed; no physical notification delivery was tested. Installed phones need an in-place APK upgrade for the new API domain/native configuration; retain app data and pending offline submissions. Physical role/device acceptance and representative bulk/report/backup capacity tests remain outstanding.

The user requested Web and Android deployment of the accumulated changes and a stable **1.1.0** APK, with Beta branding removed. The final backend uses the existing **hugpong-production** Firebase project and **https://hugpong.org**. Free hosting only; no paid service or plan upgrade was activated.

## Included application changes

- Real-time revision/SSE subscriptions and canonical cache refresh across Web and Android, retaining scoped authorization and account-owned offline queues.
- Durable price and phone-verification notifications, reconnect catch-up and bounded Worker alarm delivery.
- Credential-first login acknowledgement and numeric account identifiers.
- Beneficiary units, PDF download and dynamic crop-cycle audit layouts from the earlier requested changes.
- Mobile splash Beta footer removed. Web APK attachment and button names use the actual release version, with the canonical `anautumny/HUGPONG` release repository.
- App and package metadata aligned to **1.1.0**. Android keeps `com.hugpong.app` and the existing signing credentials; upgrades should preserve app data rather than require uninstalling.

## Database / server / Web / Mobile

Firebase business records and identities remain in place. The owner created the two required indexes after the backend service account received permission denied for index creation. The index readiness check now reports **32 required, 0 missing, 0 pending**.

The shared Express app is hosted inside one SQLite-backed Cloudflare Durable Object. A thin Worker serves the same React build and existing API paths. Background jobs, password formats, API authorization, QR verification and durable mutation semantics reuse the existing server services. The Render session secret was copied by the user into the local server environment and updated in Cloudflare's encrypted Worker secrets.

Android preview/production profiles target `https://hugpong.org`. The native Firebase client configuration is included; server service-account credentials remain outside the Mobile archive. `.easignore` excludes server/Web/report/cache folders and old APKs. The inspected 1.1.0 archive contains 162 files / approximately 6.2 MB, including the app and public Android configuration, with zero forbidden-file findings. An earlier superseded 1.0.9 upload was stopped before a new build was created; its archive included cached historical APKs, which are now excluded.

## Verification so far

- Server: **770 tests passed**, `output/release-1.1.0-server-tests.tap`.
- Web: **60 tests passed**, `output/release-1.1.0-web-tests.tap`.
- Real workerd password/Firestore read/query/read-only transaction/token-signing checks and four-client SSE/reconnect transport checks passed in the earlier runtime investigation.
- Real Cloudflare deployment accepted the preflight backend; remote startup was below one second. Public page and backend liveness pass, readiness deliberately reports preflight, and submissions are rejected before mutation routing.
- Runtime authority, client binding and credential-exposure audits report zero findings. Expo account plan verified **Free**.
- Existing remote Android signing credentials are reused with credential changes frozen. A signed **1.1.0** artifact and its metadata/hash/signature still need to be verified before publication.

## Release state

This document records preparation, not completed rollout. The Worker remains in `GATEWAY_MODE=preflight`; `hugpong.org` has not yet been connected and Render remains unchanged. GitHub release/updated APK publication and single-writer handover are pending. Do not activate two production API writers against the same Firebase project.

After the APK is published, verify its real version/code/signing identity, update and test the Web download endpoint, attach the custom domain, coordinate retirement of old mutation traffic, and activate the Worker. Installed phones require an in-place APK upgrade to receive the new API origin and native notification configuration. Physical Android notification delivery and the real multi-role/device create/update/assign/submit/archive/delete matrix remain unverified; successful builds alone do not establish them.
