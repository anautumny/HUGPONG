# Monthly audit PDF table layout — 16 November 2026

Status: local Web/Mobile source updated; no deployment or release APK build.

This note records the initial layout-only pass. Its per-hectare summary-total behavior was subsequently corrected at the user's request, and matching operations are now grouped. See `PDF_GROUPED_OPERATIONS_2026-11-16.md` for the final behavior and latest verification; it supersedes the summary-total and ungrouped-row descriptions below.

## Requested result

Saved monthly reports now omit the coverage paragraph, calendar-month/timeline explanation and expenditure footnote below the table. Direct cost, milling expense (when present) and production cost totals remain inside the table. Their labels occupy the Operation column and their existing values remain in the Cost Per Hectare column. Total, section and expense-group rows preserve the full column grid instead of merging the monthly cells. Crop-cycle headers, numeric monthly columns and continuation rules remain intact.

## Database / schema and server / API

No changes. Existing report snapshots, amounts, certification, QR integrity codes, actor names, access rules and records were preserved. This change neither consolidates operations nor recalculates the stored report or its financial basis. Existing cost-per-hectare formulas remain; the removed expenditure paragraph was a separate absolute-cost footnote.

## Web

`web/react-app/src/services/auditPdfService.js` removes the explanatory paragraphs and outside total, renders full-grid summary/section/group rows and compacts table padding without reducing the existing 7-point font. Signatures remain below the table, with pagination for longer reports.

`web/react-app/src/components/audit/PrintableAuditReport.jsx` matches the requested notes removal and total-row/grid layout for the existing preview/print action.

## Mobile

`mobile/src/services/auditPdfService.js` applies the matching HTML table changes, removes those notes and footnote, and compacts spacing. Its monthly exporter now supplies explicit native A4 landscape dimensions (842 × 595 at 72 PPI), or A3 landscape (1191 × 842) for timelines wider than 24 columns. The installed Android Expo Print renderer otherwise defaults to portrait Letter, even when HTML contains a landscape `@page` declaration.

`mobile/src/services/pdfFileService.js` forwards these page dimensions to native rendering and the existing print fallback. Crop-year compilation output retains its existing format because it does not supply monthly landscape dimensions. Folder saving, cancellation, export locking and error handling remain in use.

## Verification

- 50 focused PDF transport/layout/attribution and UI tests passed: `output/pdf-table-layout-checks-2026-11-16.tap`. Updated assertions verify absent explanations/footnote, complete total-row grids and unchanged cost values; the new native-dimensions check verifies landscape options reach Print.
- All 68 Web tests passed: `output/pdf-table-web-tests-2026-11-16.txt`. The first sandboxed run encountered a filesystem access restriction in the existing route-navigation bundler; the authorized unrestricted rerun passed.
- Web production build passed: `output/pdf-table-web-build-2026-11-16.txt`.
- Generated previews from an existing synchronized report already available to the signed-in emulator account. No mock business records or database mutations were used. The Android preview used the actual installed Expo Print renderer; the Web preview used the production jsPDF service. Both final PDFs were reopened with PDF.js, rendered to PNG and visually inspected. Each fits that 31-operation report, totals and signatures on one landscape page. Larger reports may still paginate.
- Text extraction confirmed the removed explanatory copy is absent and the production-cost total remains present. Native and Web geometry, sizes and rendered page paths are recorded in `output/pdf-table-render-check-2026-11-16.json`.
- Final previews: `output/pdf/HUGPONG_Audit_Table_Mobile_Preview.pdf` and `output/pdf/HUGPONG_Audit_Table_Web_Preview.pdf`.
- Visual QA script: `tmp/pdfs/verify_monthly_table_2026-11-16.mjs`. It reads an existing synchronized snapshot, renders local files and cleans up the native Print temporary file. It does not compile, certify, alter or upload any report.

The emulator source is updated. A fresh user-triggered folder save of this final layout and an installed release APK walkthrough have not been claimed. No deployment occurred.
