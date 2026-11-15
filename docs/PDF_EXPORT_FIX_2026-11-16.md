# Android PDF export follow-up — 16 November 2026

Status: local source and running emulator updated. No deployment or release APK build.

## Cause

The reported error was the native `ExpoSharing.shareAsync` rejection: "Another share request is being processed now." Android's installed Expo Sharing implementation permits only one pending share request until the chooser returns an activity result. An existing chooser request can remain pending while another export is attempted; JavaScript reload during an open native chooser can also leave its native promise pending after client state is reset. The screenshot confirms native sharing contention, rather than a report-generation or authorization failure; the exact preceding interaction was not captured.

Monthly and crop-year PDF paths previously used sharing as the only Android export destination, with separate screen loading flags. Crop-year export additionally copied a native Print cache URI, whereas monthly export already used Base64 to avoid protected-cache read failures.

## Database / schema and server / API

Unchanged. No records, schema, roles, queues or authorization rules were altered. Monthly PDFs still render the existing report snapshot. Crop-year export still retrieves HTML through the existing authenticated `/api/crop-year-compilations/:id/print` endpoint.

## Mobile

- `mobile/src/services/pdfFileService.js`: one shared PDF output path and export lock. Android renders to PDF and saves its Base64 bytes to a user-selected folder using the existing Expo FileSystem Storage Access Framework, without invoking Expo Sharing. Cancellation writes no file and releases the lock. Successful writes show PDF Saved. Failed writes remove only the newly created incomplete file and allow retry. Temporary renderer files are cleaned up. iOS retains its share sheet from app-owned cache; unavailable sharing retains the print fallback.
- `mobile/src/services/auditPdfService.js`: existing monthly HTML, signatures, QR and timeline stay intact; delegates output to the shared PDF exporter.
- `mobile/src/services/cropYearCompilationService.js`: existing authenticated HTML retrieval delegates to that same exporter, avoiding protected Print URI copying.
- `mobile/src/components/CropYearCompilationScreen.js`: Android button now says Save PDF; existing loading and errors remain.

Android may require a writable subfolder instead of the Downloads root. Users can create/select a HUGPONG folder. Android PDF export works independently of the previous stuck native share request.

## Web

No code change required. Web uses jsPDF and the browser download path, without Expo Sharing. Its five PDF generation/download tests passed, including immutable report snapshots, actual PDF output, numeric crop timeline headers, pagination and date-range compilation metadata.

## Validation

- 49 focused server-side runtime/component/PDF-layout tests passed, zero failures: `output/pdf-export-fix-2026-11-16.tap`. Seven new transport tests in `server/tests/mobile-pdf-export.test.js` cover Android saving despite an unavailable/busy share sheet, cancellation, competing exports, write/render failure recovery, URI-only renderer output and iOS sharing.
- Five Web PDF tests passed: `node --test tests/audit-pdf-download.test.js` in `web/react-app`.
- Android production JavaScript/Hermes export passed: `output/pdf-export-android-build-2026-11-16.txt`. This is not an APK build or deployment.
- Running emulator inspector confirmed the updated exporter was loaded. A native `expo-print` smoke check generated a 16,228-byte PDF with a valid PDF header and confirmed the native folder-picker API was available. The smoke document contained diagnostic text only, not business data, and its temporary file was deleted. Script: `tmp/pdf-export-emulator-check.cjs`.
- The user retried report export in the emulator and confirmed **PDF SAVED**. Opening and visually checking that report was requested but has not yet been confirmed; this document does not claim that inspection or a separate live crop-year export.
- Whitespace checks passed. No production data write, deployment or release APK occurred.
