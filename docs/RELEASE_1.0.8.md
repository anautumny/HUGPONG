# HUGPONG Beta 1.0.8

Release date: October 28, 2026, Asia/Manila.

Application source: `9a097a82df156bd170351eab7c6ca15145059ad7`, including its `UI UX FINALIZATION` parent commit.

## Database / schema

No schema migration, rule/index change, reseeding or business-record mutation is part of this release. The read-only production audit reports deployment readiness with zero relationship issues: 8 users, 1 Block Farm, 5 fields/cycles and 30 operations. Administrator accounts and published prices are retained. Beta-data maintenance commands remain explicit operator commands and are not executed during deployment.

## Server / API

The Express gateway remains authoritative for authentication, takeover grants, validation, scope and mutations. Mock-member SMS restrictions now follow current fixture ownership; removing the beta accounts releases their phone numbers for legitimate future use. The existing API and Web console deploy together on the configured Render service.

## Web

- Includes the UI/UX finalization, layout and typography updates.
- The console requires a live server connection. Browser changes are submitted directly to the API.
- Session checks cannot overwrite newer login/logout state.
- Farm affiliations, report periods and report counts use canonical response fields.
- The Android download selects this version only after the signed APK is verified and published.

## Mobile

- Includes the UI/UX finalization and the subsequent readable-text, compact badge, audit-card and Analytics-tab adjustments.
- Removes the Profile footer and its outdated version/cache notice in all supported languages.
- Preserves account-scoped offline queues and drafts across cache-version upgrades and temporary storage read failures.
- Paginates activity rankings, including custom activities.
- Corrects farm/manager labels, field scoping, pending-account details, audit totals/months, certification messages and historical compiler attribution.

Version 1.0.8 uses Android version code 10, package `com.hugpong.app`, the existing remote Android signing key and the hosted HTTPS API. Install over the previous beta to retain local application data.

## Verification and rollout

The local release gate passed 691 Server tests, 56 Web tests, configuration/secret/authority/identifier audits, the existing forge mitigation check, the Web production build and Android production export.

[GitHub verification](https://github.com/anautumny/HUGPONG/actions/runs/40617531576) independently passed for the application source. Live readiness returned HTTP 200, unsigned field access returned HTTP 401, and the actual deployed chunks contain the new online-only Web behavior. Asset filenames can differ between Windows and the hosted build; verification inspects the deployed assets and behavior.

[Android build](https://expo.dev/accounts/anautumny/projects/hugpong/builds/6467b7da-2191-47cf-a0e5-cc68ba11a574).

The cloud build completed successfully. Android SDK verification confirmed version 1.0.8, version code 10, package identity, camera/notification permissions and a valid signature matching the published 1.0.7 APK. Bundle inspection confirmed the production API, updated selector/storage messages and removal of the Profile footer.

APK size: **112,623,515 bytes**. SHA-256: `ce166922787d0f9b4925c9f30e9ab75a2628a24b6417d81bc680c4302df97690`.

Signing certificate SHA-256: `88cba6d11aa4e849639eb8ad2d0ed08e459703b50ba20d5389ac29d8bd5ab83d`.

The verified artifact is published as [HUGPONG Beta 1.0.8](https://github.com/anautumny/HUGPONG/releases/tag/Beta-1.0.8). GitHub's public size and digest match the signed local APK, the release tag points to the exact application source, and a public byte-range download matches the artifact. Previous release artifacts remain available.

The website download manifest selects `/downloads/android/1.0.8`. The final website attachment check runs after that manifest deploys; local rollout evidence is recorded in `output/deploy-1.0.8-*.json` and `tmp/release-1.0.8/download-verification.json`.

Installed-device rendering, upgrade and airplane-mode acceptance have not been performed in this deployment session. The previously disclosed Expo CLI/Zod tooling advisory remains open; no incompatible dependency override was introduced. The existing forge mitigation continues to pass.
