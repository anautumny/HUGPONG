# Audit QR and manual reference verification

Local verification: 2026-10-23. These changes have not been deployed or included in a new APK.

## Database and API

No schema migration or API behavior change is required. A current QR contains the report ID and integrity hash, not the complete report. Manual entry accepts an AUD-/RPT- report ID or HUG- hash (case insensitive, surrounding whitespace ignored). Both inputs resolve the authoritative server report. The Farm Manager must synchronize the compiled report first; the SRA receiver needs a working server connection.

Verification opens a preview without writing. Confirming import moves a compiled report to PENDING_REVIEW. Import is atomic and idempotent, and certification remains a separate SRA action. Unknown reports, changed hashes, forged legacy report bodies, corrupted stored hashes, and non-SRA receivers are rejected.

## Web

Receive Audit Report supports QR image upload and manual code entry. Camera scanning is provided by Mobile. Existing manual-entry handlers were exercised through invalid input, normalized lookup, preview, explicit import, and the existing-report action. No Web behavior change was needed.

## Mobile

The scanner uses Expo Camera inside HUGPONG with QR-only detection, camera permission handling, flashlight, image upload, and manual entry in the receive menu. Offline capture saves a reference for later server verification; it does not import or certify offline.

Fixed scanner lifecycle recovery after React effect cleanup/setup replay, prevented simultaneous live-camera processing during image selection, and discarded delayed image results after closing or reopening the scanner. Old asynchronous results cannot unlock a newer scanner session.

## Automated checks

- Web, Mobile, and Server QR encoders produce the same payload.
- An actual QR pixel image generated with qrcode is decoded using ZXing, the decoder underlying Web upload.
- Real API middleware and handlers resolve QR, report ID, and HUG hash against an isolated in-memory database.
- Concurrent QR/manual imports produce one transition and one audit event.
- Actual Mobile scanner callbacks cover duplicate suppression, invalid-code recovery, reopening, image upload without camera permission, and late image cancellation.
- Actual Web manual handlers and the Mobile receive handler cover preview/confirmation, integrity rejection, and offline reference capture.

These are software tests. Native camera acquisition, autofocus, lighting, Android/iOS permission dialogs, gallery integration, and the installed APK have not been exercised on physical hardware in this verification.

## Device acceptance check

1. Using a synchronized Farm Manager report, display or save its QR and copy its report ID.
2. Sign in as SRA Admin on a phone. Open Receive Audit Report > Scan QR, allow camera access, and scan the entire square. Confirm the correct report opens without importing automatically.
3. Confirm Import Report, then scan again. The existing report should open without duplication; it must remain uncertified until explicitly certified.
4. Enter the copied report ID through Input Code and confirm the same report appears. Repeat with a typo and check the failure message.
5. Upload the QR from the gallery, including with camera permission denied. Test an unrelated QR, permission denial, close/reopen, and reconnecting after saving an offline reference.
6. On Web, repeat QR image upload and manual entry for the same report. Check that both clients show the same status.
