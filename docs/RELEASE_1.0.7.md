# HUGPONG Beta 1.0.7

Release prepared on 27 October 2026 (Asia/Manila).

## Database / schema

No schema, rule, index, or business-record changes are required. The read-only production integrity audit reports `deploymentReady: true`, with zero issues. All 30 required indexes are ready.

## Server / API

The existing Express gateway remains authoritative for authentication, validation, permissions, and data mutations. No API contract changes are required.

## Web

Archived operation record searches apply when the search text changes, using the existing server filtering contract.

## Mobile

Updates archive filters, searchable selection controls, authentication and OTP layouts, loading placeholders, bottom-sheet animation, analytics layouts, and QR scanner feedback. Adds vibration feedback and recognizes Expo Go's execution environment before initializing native notifications. Upgrades the mobile runtime to Expo SDK 58, React Native 0.88, and React 19.3.

The Android preview release uses the existing application ID, remote signing key, and production HTTPS API. Install over the previous beta to retain local application data. The website download manifest is updated only after the signed APK is verified and published.

## Verification

The local release gate passed 644 server tests, 46 Web tests, deployment configuration, authority, secret, identifier and mitigation audits, the Web production build, and Android production export. Production database checks are read-only. Signed APK verification, cloud CI, and live deployment evidence are recorded separately during rollout. Physical-device and signed-in acceptance remain manual.
