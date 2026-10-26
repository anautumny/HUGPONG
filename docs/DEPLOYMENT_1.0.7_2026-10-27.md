# HUGPONG Beta 1.0.7 deployment status

Released on 27 October 2026 (Asia/Manila). Web and API rollout is confirmed. The signed Android APK is verified and publicly published. The website download manifest selects 1.0.7.

Source revision: `ef65d857cde3cf21c2b38a8c58fca1f18f8b013c`, pushed to `main`.

## Database / schema

No migration, rule change, index creation, or business-record mutation is required or performed. The production read-only integrity audit reports `deploymentReady: true` and zero issues. All 30 required indexes are ready.

## Server / API

Existing authentication, validation, scope enforcement, and authoritative mutations remain unchanged. The production readiness endpoint returned HTTP 200 with `success: true` and `status: ready`. Unauthenticated session, operation-history, and notification-state requests returned HTTP 401 in the final live check.

Local release verification passed 644 server tests, 46 Web tests, configuration/secret/authority/binding checks, the mobile dependency mitigation check, Web production build, and Android production export. [GitHub verification](https://github.com/anautumny/HUGPONG/actions/runs/40358372389) passed independently for the source revision.

## Web

Render's dashboard screenshot confirms a successful automatic deployment of `ef65d85`, with a 1 minute 6 second duration. The deployed Node runtime is 24.22.1. The new source applies archive searches as the input changes.

The corrected live verifier parsed the deployed `OperationsView-B1c9Z5Oh.js` and confirmed that the exact-record-ID input directly applies the search filter from its change handler. The deployed operation bundle SHA-256 is `ce68d8339b7c7ac8a2d2723ee46fb7e508ac71f2fddef579f19a4b648b032dc3`. The homepage and required chunks returned HTTP 200.

An earlier verifier incorrectly required the deployed bundle filename to match the Windows build filename `OperationsView-zc_juIuV.js`, and incorrectly classified the successful deployment as pending. Filename differences alone do not establish an old release. That check was replaced with inspection of the actual release behavior in the compiled code. No additional Render login or manual deployment is required for this source revision.

After signature and public artifact verification, the download manifest was updated to select 1.0.7 through `/downloads/android/1.0.7`. Final live website attachment verification is recorded in `.tmp/deployment-2026-10-27/download-verification.json` after the manifest deployment finishes. Previous GitHub release artifacts remain available.

## Mobile

Expo accepted the signed Android preview build for version 1.0.7, version code 9, package `com.hugpong.app`, SDK 58, and the source revision above. The existing remote signing key is selected.

[Build status](https://expo.dev/accounts/anautumny/projects/hugpong/builds/ca2e8ddb-a4c7-4ed7-8c3b-81b24559b89f).

The build finished successfully at 01:33:44 on 27 October 2026 (Asia/Manila), after approximately 54 minutes in the build queue. Android SDK tools verified package identity, version 1.0.7, version code 9, camera and notification permissions, and the APK signature. The signing certificate matches 1.0.6, permitting an in-place update. Bundle inspection verified the production API origin and expected application strings.

APK size: `112572498` bytes. SHA-256: `d90aa281824a22bd8b1f5d46d0e487065f4c95cc65e1b20df87e8e1d1cab0d08`.

The APK is published as [HUGPONG Beta 1.0.7](https://github.com/anautumny/HUGPONG/releases/tag/Beta-1.0.7). Public metadata, uploaded digest and size, source tag, and byte-range download were independently verified. No device installation or signed-in acceptance was performed. Install over the previous beta to retain existing local application data; physical-device upgrade acceptance remains manual.

## Download verification

All six download-route and Web download-button tests passed for the new manifest. The website attachment is verified by `verify-download.cjs`, which parses the actual compiled button target, checks API readiness, and compares the attachment's bytes and total length against the signed artifact. A successful run records `websiteSelectsNewApk: true`, HTTP 206, and `attachmentVerified: true` in `.tmp/deployment-2026-10-27/download-verification.json`.

Local evidence and helper scripts are in `.tmp/deployment-2026-10-27/`; release-gate and database logs are in `output/deploy-1.0.7-*.log`. Existing unrelated screenshots and audit files were left uncommitted.
