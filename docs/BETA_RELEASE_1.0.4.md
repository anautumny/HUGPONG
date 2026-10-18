# Beta 1.0.4 release record

Released 18 October 2026 (Asia/Manila). Source commit: `2b7168c2a33797548ed77582589b1ed98368a165`. Web rollout and native APK publication are verified below.

## Database / schema

No schema migration or business-data mutation is part of this release. A read-only integrity audit precedes rollout.

## Server / API

Existing readiness, account authorization, and mutation validation remain authoritative. The release manifest selects the published and verified 1.0.4 APK for the existing versioned Android attachment endpoint.

## Web

- Dialog backdrops no longer dismiss dialogs, including account recovery. Close and Cancel controls remain available.
- Readiness checks and login allow a suspended host more time to start; unsuccessful readiness checks retry after 15 seconds.
- SRA Admins no longer see Farm Member profile Edit or Disable/Reactivate actions that the API rejects. Those directory rows are labeled read-only.

## Mobile

- Bottom-sheet backdrops no longer dismiss their contents; explicit close controls and platform back navigation remain available.
- Readiness checks share an in-flight request and verify the JSON readiness response before enabling synchronization.
- Login waits for the newest network result when checks overlap. Recovery timers pause during a pending readiness check.
- The release continues to use the hosted HTTPS API and the existing Android application ID/signing key.

## Scope and validation

This release contains the prepared connectivity and dialog fixes. Separate system-audit findings remain open and are not claimed as resolved by this release.

The existing release gate covers production configuration alignment, tracked-secret patterns, runtime authority patterns, unresolved client identifiers, server/Web tests, the Web build, and Android bundle export. Physical-device acceptance is not automated here.

Predeployment checks passed: 551 server tests, 38 Web tests, production Web build, Android Hermes export, deployment identity checks, and the source audits. The read-only live Firestore integrity audit reported `deploymentReady: true` with no reported relationship, role, credential, or identifier issues. No data was migrated or repaired.

GitHub CI passed for the source commit. Live readiness returned HTTP 200, and deployed bundle checks verified the startup timeout, SRA directory changes, and absence of outside-click handlers on both the shared dialog and account-recovery backdrops.

## Android artifact

EAS build `65eee0d6-df12-4dda-80b5-92da3cddbd25` finished successfully for version 1.0.4, Android version code 6, package `com.hugpong.app`, and the source commit above. It reused the existing remote Android signing key. APK size: `116486816` bytes. SHA-256: `1ed89090d7aa6d23b696b3cd4b4d635dd1255ff62b43f5f8d04cae44d14f944e`.

APK bundle inspection verified the hosted HTTPS API, new startup configuration, removal of the old bottom-sheet close-backdrop label, and absence of local-IP API URLs. GitHub's uploaded artifact size and digest matched the local APK before the release was published.

- [Published release](https://github.com/anautumny/HUGPONG/releases/tag/Beta-1.0.4)
- [Website APK download](https://hugpong-beta.onrender.com/downloads/android/1.0.4)

Install over the previous beta using the same application ID/signing key to retain the existing installation. Physical-device installation and interactive acceptance remain manual checks.
