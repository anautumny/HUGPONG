# Audit PDF download and month layout

Implemented the user's final clarification: month columns remain **numeric calendar months**. February is 2. The first displayed column is the earliest included operation's month, and the final column is the last included operation's month. Intermediate months remain visible, including empty gaps. No fixed January start, full 12-month block or three-month continuation is added.

For February 2027 through April 2028, the header therefore contains:

- Crop Year Cycle 2027-2028: **2 through 12**.
- Crop Year Cycle 2028-2029: **1 through 4**.

Cycle captions follow the recorded source cycle. Continuation headers describe the timeline; exporting does not roll over the underlying crop. Mixed recorded crop cycles retain their own cycle captions. Historical operation dates and cycle metadata take precedence over today's year or stale aggregate metadata.

The reporting-month metadata uses a month name and year, such as **October 2026**. It does not change the machine-readable `periodKey` stored in the database.

## Database / API

No migration, record rewrite, or change to audit hashes is required. Server layout derivation is in `server/domain/auditReportLayout.js`. Normalized audit API responses expose the derived reporting-month label and timeline in `server/routes/auditReports.js`. Crop-year compilation printouts format their monthly/source-report dates through the same formatter in `server/services/cropYearCompilationService.js`.

Report coverage remains the records included in that authorized report. Monthly reports remain monthly snapshots; this change does not silently insert other months' operations, uncertified work, or locally queued submissions into a financial audit.

## Web

Added **Download PDF** alongside the existing print actions in the audit dossier and printable preview. Saved crop-year compilations also have distinct Download PDF and Print buttons. PDF creation uses the authorized report snapshots, creates an actual PDF file directly, retains the QR seal and actor attribution, and does not open a print dialog. Text and tables remain selectable.

The PDF table repeats its headers across pages. Every page includes its report ID and page number, and the signature block is kept together. Wide timelines use landscape A3 after 24 month columns; typical reports use landscape A4. PDF dependencies load only when requested.

Web changes:

- `web/react-app/src/services/auditPdfService.js` (new)
- `web/react-app/src/utils/auditReportLayout.js`
- `web/react-app/src/components/audit/PrintableAuditReport.jsx`
- `web/react-app/src/components/audit/AuditDossierCard.jsx`
- `web/react-app/src/components/audit/CropYearCompilationModal.jsx`
- `web/react-app/package.json` and `package-lock.json` (`jspdf` and `jspdf-autotable`)

## Mobile

The existing Android PDF export/share workflow remains in place. Its HTML renderer now uses the same numeric month span, crop-cycle groups and reporting-month formatter as Web and the server. Changes are in `mobile/src/utils/auditReportLayout.js` and `mobile/src/services/auditPdfService.js`.

## Verification

- Server suite: **725 passed, 0 failed** (`output/audit-pdf-server-tests.tap`).
- Web suite: **60 passed, 0 failed** (`output/audit-pdf-web-tests.tap`).
- Web production build and Android development export passed (`output/audit-pdf-web-build.txt`, `output/audit-pdf-android-export.txt`).
- Client binding and runtime authority audits returned zero findings (`output/audit-pdf-client-bindings.json`, `output/audit-pdf-authority.json`).
- Whitespace check passed (`output/audit-pdf-whitespace.txt`).
- Tests cover February starts, non-fixed continuation lengths, one-month and multi-year reports, mixed cycles, historical metadata, immutable source records, actual PDF bytes, page orientation, repeated headers, and separate download/print controls.
- Generated a clearly marked test-data preview plus a six-page stress document. Extracted their PDF text and rendered pages with pypdfium2 to visually inspect headers, numeric cells, units, signatures, QR placement and page footers.

The deliverable preview is `output/pdf/HUGPONG_Audit_Layout_Preview.pdf`. It is explicitly labelled as test data and is not a real beneficiary audit. No production records were changed. The active user-manual PDF was not replaced; this request changes the audit-document output shown in the attached screenshots.

These are local changes. Deployment and a rebuilt Android installation remain necessary, and native device export has not been claimed as tested. npm audit still reports existing issues in Vite and Firebase's re2js dependency; neither PDF package was reported vulnerable in that audit. See `output/audit-pdf-dependencies.json`.

Implementation references: [jsPDF](https://github.com/parallax/jsPDF), [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable).
