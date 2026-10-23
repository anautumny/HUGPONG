# HUGPONG 1.0.5 deployment

The user authorized deployment on October 24, 2026 (Asia/Manila). Application revision `26c0e1773c4b52123112ebfba548e1d4d28e7642` was pushed to `main` and passed [GitHub release verification](https://github.com/anautumny/HUGPONG/actions/runs/40002013305).

## Database / schema

All 30 required Firestore indexes were confirmed ready after the two missing definitions were created manually. The production Firestore rules compiled and were released successfully at `2026-10-23T18:21:04Z`. The new `notification_states` collection remains accessible only through the server API. No business-record repair, migration, deletion, or IAM change was performed.

## Server / API

The release is served at <https://hugpong-beta.onrender.com>. The production readiness probe returned HTTP 200 with `success: true` and `status: ready`. Unauthenticated session, operation-history, and notification-state requests returned HTTP 401. The runtime policy requires Node `>=24.22.1 <25`.

The local release gate passed 612 Server tests, 44 Web tests, the Web production build, configuration/secret/authority/binding checks, the Mobile dependency mitigation check, and the Android production export. GitHub CI passed independently for the pushed revision.

## Web

The deployed stylesheet matched the verified production build by SHA-256. The production report and operation chunks loaded successfully and contained the new member-review and saved-operation-retry interfaces. The login route and APK byte-range download were checked through the public host.

These HTTP checks verify rollout and access boundaries. They do not replace signed-in acceptance of every role and workflow.

## Mobile

The signed Android 1.0.5 build (version code 7) uses the existing Expo project, preview environment, production API origin, and remote Android keystore. Its source revision is `26c0e1773c4b52123112ebfba548e1d4d28e7642`.

Build: <https://expo.dev/accounts/anautumny/projects/hugpong/builds/133ed5f1-3b5a-4f27-b4a5-1a33317df4f3>.

The cloud build completed successfully. Android SDK tools verified package `com.hugpong.app`, version `1.0.5`, version code `7`, camera permission, notification permission, and the APK signature. The signing certificate matches the published 1.0.4 APK, permitting an in-place update.

APK SHA-256: `8d7240202518e95e0616cec18d7efa75e3f6ffac5a9ca34e02068e6143e8c9f6` (116,521,700 bytes).

The replacement APK is published as [HUGPONG Beta 1.0.5](https://github.com/anautumny/HUGPONG/releases/tag/Beta-1.0.5). The download manifest selects this version through `/downloads/android/1.0.5` on the HUGPONG host. Previous GitHub release artifacts are retained.

No Android device was connected. Fresh-install notification prompts, native camera scanning, and visual acceptance still require a physical-device check.
