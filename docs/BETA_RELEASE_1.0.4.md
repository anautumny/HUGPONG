# Beta 1.0.4 release record

Release preparation: 18 October 2026 (Asia/Manila). Deployment and APK publication status will be recorded after verification.

## Database / schema

No schema migration or business-data mutation is part of this release. A read-only integrity audit precedes rollout.

## Server / API

Existing readiness, account authorization, and mutation validation remain authoritative. The versioned Android download endpoint will select 1.0.4 only after its signed APK has been published and checked.

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

The existing release gate covers production configuration alignment, tracked-secret patterns, runtime authority patterns, unresolved client identifiers, server/Web tests, the Web build, and Android bundle export. A native EAS APK build and post-deployment smoke checks are recorded below when complete. Physical-device acceptance is not automated here.

Predeployment checks passed: 551 server tests, 38 Web tests, production Web build, Android Hermes export, deployment identity checks, and the source audits. The read-only live Firestore integrity audit reported `deploymentReady: true` with no reported relationship, role, credential, or identifier issues. No data was migrated or repaired.
