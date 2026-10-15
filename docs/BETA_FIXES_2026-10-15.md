# Beta audit remediation — 15 October 2026

The application fixes from the earlier beta audit are implemented locally. The release verification command passes. These changes have not been deployed, and no live database writes or SMS sends were performed.

## Finding status

| Earlier finding | Result |
|---|---|
| Fabricated legacy audit imports | Fixed. All QR versions resolve an existing canonical server report; missing records return 404. Embedded fields are never persisted or presented as server-verified data. Legacy decompression on the server is capped at 1 MiB. |
| Mobile concurrent synchronization crash | Fixed. The response-version helper is exported/imported correctly. Dependent changes enqueued during an upload inherit the acknowledged server version and remain queued until their own acknowledgement. The related undefined `fields` fallback in operation/draft ID generation was also removed. |
| Process-local OTP state | Fixed. Purpose/subject-bound challenges, digests, attempt limits, expiry, verification, and consumption are stored in server-only Firestore documents. Verification/consumption use transactions across server instances. Late failed SMS delivery cannot revoke a newer challenge. |
| Release API configuration | Fixed in the build configuration. EAS preview and production use `https://hugpong-beta.onrender.com`. Release configuration rejects missing, HTTP, private/local, and placeholder origins and missing Firebase client values. The supplied server's readiness endpoint returned 200 during a read-only check. |
| Duplicate field/cycle creation on retries | Fixed. Both clients persist an account-scoped creation key before sending. The server atomically stores an actor/key receipt with the field, first cycle, and audit event. Replays return the original result; reuse with different input returns 409. |
| Hidden recovery reviews | Fixed. Database queries filter live expiry, target role, and manager farm scope before limiting. Web and Mobile expose cursor-based Load More controls. The generic response cache no longer serves these actionable review lists. |
| Web QR input mismatch | Corrected to the intended platform behavior: Web accepts QR image attachments and manual report codes; camera scanning stays in Mobile. Browser camera access remains denied by `camera=()`. |
| Failing layout contract/release gate | Fixed. Two-line mobile labels and shrink behavior were restored where the assertions identified missing constraints; the test now accepts the intended 28-pixel minimum tab-label height. |
| Dependency advisories / SDK drift | Partially resolved. Server and Web audits are clean. All recommended Expo SDK 57 patch versions are aligned. Mobile retains 15 inherited high findings from two currently unpatched build-tool libraries; see below. |

## Database / Schema

- `otp_challenges/{sha256(purpose, subject)}`: phone, purpose, nonce/challenge identity, HMAC code digest, issue/expiry times, attempt count, status, and `deleteAfter`. Raw OTP codes are never persisted. Used/revoked/locked challenges clear the digest. Retention is expiry plus 24 hours.
- `mutation_receipts/{sha256(operation, actor, key)}`: actor, canonical input fingerprint, original field/cycle result, creation time, and `deleteAfter`. Retention is 90 days. The receipt is created in the same transaction as the business records and audit event.
- Both collections are client-denied, excluded from logical backups, and included in bounded operational cleanup.
- Recovery review indexes cover `status`, `expiresAtMs`, and document ID, with role/farm fields for scoped queries. Existing review documents already carry these fields; no backfill or reset is required.

## Server / API / Controller

- QR verify/import always require stored authority, including historical full-transfer formats. A report removed between lookup and import is rejected again inside the transaction.
- OTP calls in registration, first-login verification, phone-change, review selection, and failed-delivery cleanup now await shared storage. Storage failures return safe errors.
- New field enrollment requires valid `_mutation` metadata for normal clients. Replay results return HTTP 200 with `replayed: true`; first creation returns HTTP 201. Canonical IDs remain server-generated.
- Recovery lists return `hasMore` and `nextCursor`; scopes exceeding 30 manager farms fail explicitly rather than silently dropping farms.
- Firebase Admin was updated to 14.5, using modular SDK entry points through a local compatibility adapter for existing routes/scripts. Node.js 22+ is required and recorded in `.node-version` and server package engines. The [official release notes](https://firebase.google.com/support/release-notes/admin/node) describe the namespace removal and Node requirement.
- `verify:release` validates the production Mobile environment before testing/building and runs a client unresolved-identifier audit so bundling cannot silently pass missing helper references.

## Web

- Audit reception accepts QR image attachments and manual report-code lookup. Browser camera scanning is removed; native Mobile retains its scanner and lookup options. Both Web input methods require server verification.
- Legacy QR previews now retrieve and show the server-owned report before claiming verification.
- Field enrollment persists only a hashed intent key and mutation metadata in account-scoped local storage, reusing it after a lost response/reload. Success removes the pending intent. Cached remaining-area estimates no longer prevent retrying an already-committed request; the server still enforces the area limit transactionally.
- Recovery queues show additional authorized pages, deduplicating appended entries.
- Firebase was aligned with Mobile's current client major and its pinned vulnerable gRPC dependency overridden with a patched compatible 1.x version.

## Mobile

- QR transfers are server-verified before opening an authoritative dossier. Offline legacy transfers save a reference for later verification, rather than treating embedded data as verified.
- Field enrollment persists its intent before networking. Concurrent taps share one intent; app restarts reuse the stored key. Successful replay reconciles the canonical field/cycle IDs without duplicating the local replica. New enrollments remain online-only.
- Outbox acknowledgement/version reconciliation is repaired and behaviorally tested with edits arriving during an in-flight upload.
- Recovery queues support pagination; tab/profile/admin labels have explicit wrapping/scaling constraints.
- EAS build origins are set in `eas.json`. `app.config.js` validates release configuration during Expo/EAS configuration evaluation. The Expo SDK package check passes. Development can still use the existing local development environment.

## Dependency findings still open

Current complete npm audits: **Server 0, Web 0, Mobile 15 high / 0 critical / 0 moderate**. The 15 Mobile entries are parent/transitive effects of two libraries:

- `braces` 3.0.3 via micromatch and Metro tooling: excessive nested pattern recursion. The [advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched release; 3.0.3 remains the registry's latest version.
- `node-forge` 1.4.0 via Expo CLI code-signing tooling: malformed RSA signature verification. The [advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) lists affected releases; 1.4.0 remains the latest registry version.

These paths are build/development tooling in this application; they are not proof of an exploitable path in the shipped Android runtime. That reachability assessment is an inference from the installed dependency tree and app imports. The risk is not claimed to be eliminated. Do not expose the Metro/dev server publicly or process untrusted build inputs. Track upstream fixes before wider release. npm's force suggestions would downgrade Expo/React Native by several major versions and were not applied.

Compatible fixes applied include patched gRPC 1.14.6 and UUID 11.1.1 for Xcode's v4 generator. The consuming UUID API was smoke-tested. The server no longer carries the earlier vulnerable node-forge/UUID chain.

## Validation and deployment

- `node server/scripts/verifyRelease.js`: passed, including configuration checks, secret/authority/unresolved-identifier audits, **534 server tests and 38 Web tests (zero failures)**, Web production build, and Android Hermes export.
- `server/tests/beta-regressions.test.js`: forged/missing-source QR rejection, authoritative legacy lookup, concurrent durable OTP consumption and expiry/attempt/cooldown behavior, guarded revocation, duplicate enrollment prevention, recovery visibility/pagination, concurrent outbox reconciliation, release URL validation, and Web/Mobile intent persistence.
- Expo `install --check`: dependencies are up to date for SDK 57.

Deploy the updated Firestore indexes/rules and Node 22+ API, and release both updated clients together. An older client without enrollment mutation metadata will receive an explicit enrollment error instead of creating unprotected duplicate records. Update the installed beta APK; an existing APK retains its old embedded API configuration. No live deployment or native APK signing/build was performed here.

After deployment, exercise real SMS, Mobile camera permissions/scanning, Web QR image attachments, PDF sharing, OTP across an API restart, recovery pagination, and lost-response enrollment on a physical device and browser. Browser/device UI automation was unavailable in this session; bundle export and mock-backed regression tests do not replace those acceptance checks.
