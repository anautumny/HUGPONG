# Deployment recheck — 24 October 2026

**Decision: the local code passes automated release verification, but a full Web/Mobile rollout is not ready until the missing database indexes and Mobile release steps are completed.** No additional application defect was confirmed during this recheck. No deployment, record repair, migration, release publication, or APK build was performed.

## Rechecked evidence

| Check | Result |
| --- | --- |
| Full release verifier, run again | Passed, exit code 0 |
| Server tests | 605 passed, zero failures |
| Web tests | 44 passed, zero failures |
| Web production build | Passed |
| Android production export | Passed; an export is not an installable signed APK |
| Deployment identity | All 14 required values present; configured Server/Web/Mobile projects align |
| Actual local server credential project | Matches all three configured project identities |
| Configured Firestore data, read-only | 9 users, 9 account identifiers, 9 credential document IDs, 3 farms, 6 fields, 7 cycles, 8 operation logs |
| Existing integrity audit | Zero issues and zero required identifier backfills; `deploymentReady: true` for the checked data |
| Additional assignment/history checks | Zero duplicate manager assignments, inactive assigned managers, or eligible logs missing a stored farm identity |
| New Firestore indexes | Both required index definitions are absent from the returned operation-log inventory |
| Existing public website | Home returned HTTP 200; readiness returned HTTP 200 with `success: true, status: ready` on retry |
| Existing APK artifact | Manifest version 1.0.4; artifact URL returned HTTP 200 |
| Fresh production dependency audit | Server 0, Web 0, Mobile 4 high-severity package entries from one upstream node-forge advisory |
| node-forge local mitigation | Present and release-gated; signature regression tests passed |

The first public readiness request exceeded a 25-second deadline. A later request with the clients' 75-second startup allowance returned ready in approximately one second. This observation does not establish the cause of the initial delay or guarantee availability on every network. No authenticated browser/phone session or physical-device smoke test was performed.

The first index inventory request returned HTTP 400. Retrying without its pagination query succeeded, returned 28 operation-log indexes, and indicated no additional page. Missing-index findings below come from that successful inventory, not the failed request. Credential material, phone numbers, and password hashes are not included in the saved summary.

## Database / schema — deployment blocker

Deploy the repository's Firestore rules/index configuration, then wait for the new indexes to reach `READY` before rolling out the queries that depend on them:

1. `operation_logs`: `blockFarmId ASC`, `performedOn ASC`, implicit `__name__ ASC`.
2. `operation_logs`: `fieldId ASC`, `status ASC`, `__name__ ASC`.

The monthly report loader has an index-error fallback, but next-period discovery and paged operation reads must not be assumed to have that same fallback. Shipping first and waiting for errors is not the release plan. No business-record migration is indicated by this read-only inventory.

## Server / API — verified locally, hosting settings remain unverified

The source release gate passes. Repository configuration selects Node 24.22.1, and CI installs locked dependencies before verification. The active Render process/build runtime and its environment overrides were not inspected through a hosting account. Confirm them during deployment, including `NODE_VERSION`, the service root/build command, required environment values, and `/health/ready`. The local credential/project check does not independently prove which credentials are installed on Render.

The working tree still contains modified and untracked implementation files. A Git-based release must include all required source files, including the new policy, batching, notification, recovery, and Mobile mitigation modules. Deploying the existing remote commit alone would omit these local fixes.

## Web — build ready; download still selects the previous APK

The production build and tests pass. The Android manifest at `web/react-app/src/config/androidRelease.json` still selects the existing Beta 1.0.4 artifact. Keep that link valid until a new APK actually exists; after publishing the replacement, update the manifest to its real version/URL and verify the same-origin download endpoint. Run authenticated role/report smoke checks against the deployed API.

## Mobile — new installable build and device verification required

The Android Hermes export passes, but a signed APK containing the current fixes has not been built or tested during this recheck. `mobile/app.json` still has the existing 1.0.4 user-facing version; EAS uses remote build-version increments. Use a distinct new release version when preparing the replacement so users can identify it.

Verify at least fresh-install notification permission, QR camera/manual entry, logout/login acknowledgement persistence, offline-to-online recovery, draft submission after process termination, older price loading, selection/modal layout, and monthly compilation after archival on a real installation. Web deployment alone cannot update the installed Mobile binary.

## Dependency limitation

The [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) still has no listed patched release. The tested local postinstall mitigation addresses the reported nested DigestAlgorithm flaw and is enforced by the release gate. npm still reports the upstream affected version through Expo CLI/code-signing tooling. This is not a claim of zero dependency risk. Preserve postinstall execution and the mitigation check in APK build environments; do not apply npm's suggested downgrade to Expo 44.

## Release order

1. Include the complete local implementation in the intended release revision.
2. Deploy Firestore indexes/rules to the explicitly selected project and confirm index readiness.
3. Deploy Server/Web with the verified Node/environment configuration; check readiness and authenticated flows.
4. Build and device-test the new APK, publish it, then update and verify the Web download manifest.

Local evidence: `.tmp/deployment-recheck-2026-10-24/release.log`, `dependency-summary.json`, `live-preflight.json`, and `network-recheck.json`. Application remediation details remain in [the fix report](AUDIT_REMEDIATION_2026-10-24.md).
