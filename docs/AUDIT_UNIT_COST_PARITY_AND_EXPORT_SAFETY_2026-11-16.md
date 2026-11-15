# Audit unit-cost parity and native export safeguards — 16 November 2026

Status: implemented locally; no deployment or APK release. This supersedes the earlier base-only unit-price display for plain operations.

## Confirmed root cause

A read-only trace of the actual Basal record and its compiled snapshot found selected quantity 4 ton, base cost PHP 4,000, attached labor PHP 1,440, and full operation cost PHP 5,440. The values matched between the saved operation and snapshot. The PDF projection divided base cost by quantity (PHP 1,000); the audit screen divided full cost by quantity (PHP 1,360). This was a presentation calculation mismatch, not lost expenditure or a missing stored quantity.

## Final calculation

For a plain operation with a recorded selected quantity, displayed Unit Cost is full recorded operation cost divided by selected quantity, including attached labor. The Basal report now displays **4 ton / PHP 1,360 / PHP 5,440** on Web and Mobile. Underlying base rates, expense rates, labor entries and exact totals remain intact. Itemized expense rows retain their own actual item rates; separately listed labor is not counted twice.

Repeated matching operations aggregate selected quantities separately for each unit, sum recorded work areas by month, and use quantity-weighted full-operation rates. Example:

| Quantity | Full unit cost | Saved operation cost |
| --- | --- | --- |
| 4 ton | PHP 1,360 | PHP 5,440 |
| 2 ton | PHP 1,180 | PHP 2,360 |
| 3 ton | PHP 1,500 | PHP 4,500 |
| **9 ton** | **PHP 1,366.67 (avg)** | **PHP 12,300** |

The displayed average is 12,300 / 9, but the total always sums original exact costs. It is never recomputed as 9 x the rounded 1,366.67, which would incorrectly produce 12,300.03. Different units do not share an average. Operations with real named children retain their child details. Missing historical quantities are not invented or silently included in the weighted-rate denominator. Summed operation work area is distinct from the report's unique audited land area.

## Database / server / Web / Mobile

- Database: no schema change, migration, record correction, snapshot rewrite or QR/hash change. Existing signed reports use their saved components.
- Server: `server/domain/auditReportLayout.js` defines the corrected read-only projection. It preserves base rates separately in the financial breakdown, including when different base rates result in the same full unit cost. Existing mutation authority and validation remain unchanged.
- Web: `web/react-app/src/utils/auditReportLayout.js` has the identical projection consumed by the existing jsPDF exporter and printable report. The current audit ledger already shows the full-cost rate in the reported case.
- Mobile: `mobile/src/utils/auditReportLayout.js` matches the canonical projection consumed by the native PDF renderer.
- Export safety: `mobile/src/services/pdfFileService.js` refuses to launch native print/picker/share activities while the app is backgrounded, including after asynchronous image capture. The previous shared QR/PDF export lock, duplicate-tap guard, cancellation handling, write cleanup and unrestricted folder selection remain.
- QR rendering: `mobile/src/components/OfflineQRCode.js` rejects an unavailable/empty SVG view before native capture and always supplies bounded integer bitmap dimensions (width at most 1200, height at most 2048), preserving the footer aspect ratio for normal report cards.

## Verification

Both final PDF previews were regenerated from the actual synchronized Basal report through Android native Expo Print and production Web jsPDF, reopened, text-extracted, rendered and visually inspected. Both contain QTY 4, UNIT ton, UNIT COST 1,360.00 and OPERATION COST 5,440.00, with unchanged full-cost summary rows. Evidence: `output/pdf-table-render-check-2026-11-16.json`; preview files: `output/pdf/HUGPONG_Audit_Table_Mobile_Preview.pdf` and `output/pdf/HUGPONG_Audit_Table_Web_Preview.pdf`.

Tests cover the reported Basal values, three-operation grouping/rounding, mixed units, preservation of source snapshots/base rates, labor counted once, unavailable native QR views, malformed/oversized bitmap dimensions, background export rejection, resume/retry, and existing PDF/QR concurrency/cancellation paths.

Final full gate: **912 server tests and 75 Web tests passed**, zero failures, including the three-record Basal example in the canonical projection and actual Web PDF. Configuration/secret/authority/client-binding checks, Web production build, and Android production JavaScript/Hermes export passed. No native release APK was built.

The initial full gate encountered an unrelated wall-clock synchronization-test timeout; that test passed in isolation and the subsequent full run passed. Evidence for that isolated recheck: `output/audit-inclusive-rate-realtime-recheck-2026-11-16.tap`. The initial log remains in `output/audit-inclusive-rate-native-guards-release-initial-2026-11-16.txt`. Final release checks and whitespace results are recorded in `output/audit-inclusive-rate-native-guards-release-gate-2026-11-16.txt` and `output/audit-inclusive-rate-native-guards-whitespace-2026-11-16.txt`.

## Remaining physical-device check

Only an emulator is connected. The previous QR save succeeded there and its actual saved PNG was independently decoded against the existing report. Native Android PDF rendering also succeeds with the corrected rate. These checks do not establish that every physical Android device is crash-free.

Before release, install the update over the existing app on the target phone without uninstalling or clearing storage. Save QR and PDF to a writable folder, cancel and retry each picker, tap Save repeatedly, and background/resume the app during preparation. Confirm navigation still works, PNG scans match the selected report, PDF costs match the ledger, and existing account/pending work remain. No physical-phone result or released-APK verification is claimed here.
