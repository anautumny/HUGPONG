# QR image saving on Android — 16 November 2026

Status: fixed locally and confirmed in the emulator. No deployment or release APK build.

Follow-up: [Audit unit-cost parity and native export safeguards](AUDIT_UNIT_COST_PARITY_AND_EXPORT_SAFETY_2026-11-16.md) adds foreground-activity and native QR bitmap/view checks, and records the remaining physical-phone test.

## Findings

The user reported that Save QR immediately closed the app. The recent Android crash buffer identified the Android DocumentsUI process, rather than HUGPONG, failing with `IllegalArgumentException` while executing `TopResumedActivityChangeItem`. The old QR path forced an initial Downloads tree and ran separately from the working PDF exporter. It also relied on a React loading-state update without an immediate request lock, allowing rapid taps to race native picker requests. The log does not prove which of these conditions triggered the Android framework exception; both avoidable launch/request hazards have been removed.

## Database / server / Web

No database or server changes. Saving an existing QR image requires no mutation, re-compilation, new QR signature, or network connection. The existing report payload and verification contract remain unchanged. Web uses its browser canvas/download path, so no Android picker implementation is added there. Existing Web/Mobile QR parity and decode tests pass.

## Mobile changes

- `mobile/src/services/pdfFileService.js`: reuses the existing native export service for PNG and PDF, sharing one lock across rendering, folder selection, writing and sharing. Android requests a folder without forcing Downloads. Files have explicit `.png` extensions and `image/png` MIME type. Cancellation and render/write failures release the lock. Failed writes remove only the incomplete file from that request. iOS sharing retains the app-owned cache file for the receiving application.
- `mobile/src/screens/FieldOpsScreen.js`: Save QR delegates to that service, suppresses repeated taps immediately, preserves the selected QR while saving, and always releases the loading state. Errors remain actionable rather than silently failing.
- `mobile/src/components/AuditQrSheet.js`: disables competing actions and swipe dismissal while the image is being prepared or saved; the existing Saving spinner remains visible.
- `server/tests/mobile-pdf-export.test.js`: exercises QR saving, cancellation, timeout, unavailable views, native render failure, storage failure, retry, rapid taps, and cross-PDF/QR concurrency using the actual export functions and save handler.

## Results

- User confirmed **QR Image Saved** after retrying the updated flow in the emulator.
- Independently read the saved PNG from the emulator: **1200 × 1554**, **45,408 bytes**. ZXing decoded the actual image and its encoded payload exactly matched an existing synchronized report. No business record was written. Evidence: `output/qr-image-save-emulator-2026-11-16.json`; diagnostic: `tmp/verify-saved-qr-image.cjs`. No payloads, report identifiers, passwords or tokens are printed by that diagnostic.
- Targeted tests: **19 passed**, zero failures (`output/qr-image-save-targeted-2026-11-16.tap`).
- Full local verification: **905 server tests and 73 Web tests passed**, zero failures, plus configuration/security/authority/client-binding checks, Web production build, and Android JavaScript/Hermes export (`output/qr-image-save-release-gate-2026-11-16.txt`).
- Android crash buffer had no newer fatal entry after the successful retry. Whitespace verification passed (`output/qr-image-save-whitespace-2026-11-16.txt`).

The Windows computer-use helper was unavailable; the folder selection was tested by the user, and the saved file was independently verified through Android developer tooling. An installed release APK and physical-device save still need their release smoke test. Existing app data and pending queues were not cleared.
