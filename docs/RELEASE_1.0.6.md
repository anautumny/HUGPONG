# HUGPONG Beta 1.0.6

The user authorized deployment on 25 October 2026 (Asia/Manila) after reviewing the [readiness report](DEPLOYMENT_READINESS_2026-10-25.md). This release contains the mobile interface improvements, report-year corrections, and subsequent integrity/security fixes documented in [the audit fix record](SYSTEM_AUDIT_FIXES.md).

## Database / schema

All 30 required indexes were confirmed ready. No migration is required. New optional operation lock, reconciliation, and cycle revision metadata is server-owned and populated incrementally. Certified historical snapshots remain preserved.

## Server / API

Operation/report locks, version preconditions, takeover collision review, scoped idempotent receipts, atomic account approval, and atomic phone verification are enforced centrally. Backend dependency audit reports zero advisories. The full release gate passed 644 backend and 46 web tests, static audits, the web production build, and Android production export. A separate iOS production export also passed.

## Web

Filters are consolidated, modal focus is stable, matching-work conflicts remain reviewable, versioned writes use inspected records, and report columns use actual report/source years. The verified signed 1.0.6 APK is published and selected by the replacement download manifest. See [deployment evidence](DEPLOYMENT_1.0.6_2026-10-25.md).

## Mobile

Version 1.0.6 includes compact headers/back controls, swipe-dismissable filter sheets, fewer analytics filter entry points, a compact QR share card, responsive scanner framing, camera-permission recovery, and durable queue conflict review. In-place upgrades must preserve existing operation IDs and queues. Older mobile clients that omit mandatory versions may require upgrading before those writes succeed.

## Known verification limits

No physical device was available for camera, visual, gesture, report-export, or upgrade acceptance. npm reports five high-severity mobile dependency entries through the Expo tooling graph; node-forge has a verified local mitigation, while Zod exposure remains under review. A production bundle/export is not a signed APK/IPA. Deployment evidence and artifact verification will be recorded separately as the rollout completes.
