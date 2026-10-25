# HUGPONG Beta 1.0.6 deployment

The user authorized deployment on 25 October 2026 (Asia/Manila) after receiving the readiness findings. Application revision `f692960eda392e9f0fe9bbe6525aebcf7583e8e2` was pushed to `main` and passed [GitHub release verification](https://github.com/anautumny/HUGPONG/actions/runs/40200494043).

## Database / schema

All 30 required Firestore indexes were confirmed ready during the final read-only check. This deployment requires no migration, index creation, rule change, or business-record repair. Optional lock, reconciliation, and cycle revision metadata is maintained by the server.

## Server / API

The API is live at <https://hugpong-beta.onrender.com>. Readiness returned HTTP 200 with `success: true`, `status: ready`. Unauthenticated session, operation-history, and notification-state requests returned HTTP 401. A compressed JSON request to the protected operation endpoint returned HTTP 415, confirming the hardened parser behavior before authorization or mutation.

The complete local release gate passed 644 backend tests, 46 web tests, configuration/authority/secret/binding audits, the mobile mitigation check, the web production build, and Android production export. A separate iOS production export passed during readiness assessment. GitHub CI passed independently for the pushed revision.

## Web

Live production assets contain the new matching-work reconciliation and stage-advancement notice code. The stylesheet SHA-256 matches the verified local production build: `03c4ca55dd5851cc2b323f10327140a6b45a0a49e4a909350001eb6c4868ebd9`. The existing 1.0.5 APK byte-range download remained available while its replacement was being prepared.

HTTP checks establish release presence and unauthenticated boundaries. Signed-in acceptance of every role, report, and queue workflow has not been completed in this deployment pass.

## Mobile

The signed Android 1.0.6 build (version code 8) uses the existing Expo project, preview environment, production HTTPS API origin, and remote Android keystore. Its source revision is `f692960eda392e9f0fe9bbe6525aebcf7583e8e2`.

Build: <https://expo.dev/accounts/anautumny/projects/hugpong/builds/8804332b-a488-4748-8b80-1dbdee2711c2>.

The cloud build completed successfully. Android SDK tools verified package `com.hugpong.app`, version `1.0.6`, version code `8`, camera permission, notification permission, and the APK signature. Its certificate matches the published 1.0.5 APK, allowing an in-place update. The extracted Android bundle contains the production API origin and new conflict-review code. Cloud logs confirm the required node-forge postinstall mitigation ran.

APK SHA-256: `d121b81a233506284462cb2cb22428bb36140321edf2ce094f298195061d758e` (116,543,548 bytes).

The APK is published as [HUGPONG Beta 1.0.6](https://github.com/anautumny/HUGPONG/releases/tag/Beta-1.0.6). Public release metadata, uploaded digest/size, source tag, and byte-range download were verified against the local signed artifact. Previous release artifacts are retained. The replacement download manifest selects 1.0.6 through `/downloads/android/1.0.6`. The final live download check is recorded separately in `.tmp/deployment-2026-10-25/download-verification.json` after the manifest revision finishes deployment.

Install over the existing beta to preserve local data and pending queues. No app data was cleared during this deployment. This signature check establishes update compatibility with the published 1.0.5 APK; it does not establish preservation on every physical device.

## Remaining acceptance limits

No physical phone is connected. Device camera/permission, gesture, visual, exported-report, and offline-queue upgrade acceptance remain outstanding. An Android emulator was discovered during deployment; its existing app/data has not been removed. No iOS signed binary or App Store release is included in this Android beta rollout.

The fresh dependency audit reports zero server/web advisories and five high-severity mobile package entries in Expo tooling. The local node-forge mitigation passed; Zod exposure remains under review. The deployment does not represent these findings as resolved.

Evidence: `output/deploy-1.0.6-release-gate.log` and `.tmp/deployment-2026-10-25/{release-status,web-verification,android-build}.json`.
