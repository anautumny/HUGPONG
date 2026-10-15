# HUGPONG Beta 1.0.1 — 15 October 2026

## Database / schema

Firestore rules and indexes were deployed to the existing production project. All 28 composite indexes reported `READY`. The read-only legacy integrity audit reported `deploymentReady: true`, zero issues, and no required identifier backfills. No business records were reset or migrated.

## Server / API

The verified fixes are on GitHub `main`, which automatically deploys the existing Render service at `https://hugpong-beta.onrender.com`. The API requires Node.js 22+. The deployed readiness endpoint returned HTTP 200. The live Web QR receiver was checked for image attachments and manual code entry, with browser scanning absent.

## Web

The Android download button reads the published artifact in `web/react-app/src/config/androidRelease.json` before any older host environment fallback. This prevents an existing `VITE_ANDROID_APK_URL` from pinning the previous beta. The release-link change passed all 38 Web tests and a production build; pushing it to `main` triggers the Web/API deployment. Confirm the public landing page serves the Beta 1.0.1 APK URL after Render completes that deployment.

## Mobile

- Version: **1.0.1**, Android version code **2**, application ID `com.hugpong.app`.
- Build source: `46a1f9d3be3199bc91eb1fa003e68728ff245743`.
- [Successful Expo build](https://expo.dev/accounts/anautumny/projects/hugpong/builds/285a8acc-5a1c-4ea5-8d0a-fd070b5b207b), using the existing signing key.
- [Published beta release](https://github.com/anautumny/HUGPONG/releases/tag/Beta-1.0.1).
- [Download APK](https://github.com/anautumny/HUGPONG/releases/download/Beta-1.0.1/HUGPONG-Beta.apk).
- APK size: **116,484,740 bytes**.
- SHA-256: `b7036b60e523a70a5797c80c2bc940b50a4f11edd008c95e3ea89a776712c857`.

The downloaded APK contains the Android manifest and application bundle, and the bundle includes the intended HTTPS beta API origin. GitHub's uploaded asset size and SHA-256 match the downloaded Expo artifact. Install over the previous beta using Android's update flow; do not uninstall or clear app storage as part of the routine upgrade.

## Validation and limits

The complete release gate passed before cloud build submission: **534 server tests, 38 Web tests, Web production build, and Android export**. GitHub verification also passed for the release commit. The native Expo Android build completed successfully.

Physical-device upgrade, real SMS, camera, offline/reconnect, and multi-role acceptance tests remain operator checks. The dependency findings described in [the remediation report](BETA_FIXES_2026-10-15.md) remain open; this controlled beta is not a claim of zero defects.
