# Monthly audit PDF expenditure totals and grouping - 16 November 2026

Status: local Web/Mobile source and emulator updated. No deployment or release APK build.

Pricing follow-up: `PDF_SAVED_RATES_AND_AVERAGES_2026-11-16.md` supersedes this note's earlier `Varies`, synthetic quantity and unit-price descriptions. The final display uses saved base/expense/labor components with quantity-weighted averages per unit; original financial records and exact expenditure are retained.

## Final behavior

Monthly audit PDFs omit the coverage paragraph, calendar-month explanation and expenditure footnote below the table. Cost summaries remain inside the full table grid. Numeric months and crop-cycle continuation headers, report metadata, original QR codes and signatures remain in place.

Direct Cost, Milling Expenses and Production Cost summary rows show **full expenditure in PHP**, with no hectare division. Earlier templates incorrectly showed a per-hectare average as the final production-cost total; preserving that formula during the first layout-only change was the wrong assumption. Summary labels now explicitly include `(PHP)`.

The user subsequently clarified the beneficiary form's row formula as well: the column captioned **COST PER HECTARE** shows the extended recorded cost, **quantity multiplied by unit price**, without an additional hectare divisor. Plain operations show the approved recorded operation cost; named child/expense rows show their recorded subtotal. Grouped rows sum the contributing recorded costs. For mixed prices the rule is the sum of each contributing quantity-price result, while Unit Cost displays `Varies`. The form's requested caption is preserved. Existing approved costs are displayed; this does not rewrite report snapshots or invent new financial records.

Matching operations are combined under one numbered heading across fields and months. Compatible quantities and areas add into their recorded month columns. The checked existing report's 31 operation snapshots render as 10 operation headings, with detail rows where required, while retaining its **PHP 32,350.00** expenditure. The previous final value, PHP 4,313.33, was expenditure divided by 7.5 audited hectares.

Operations without recorded children or expense items produce one flat row per compatible unit. Different prices are combined without inventing child rows; the Unit Cost cell says `Varies`. Areas, quantities and recorded expenditure are summed. Rates are not added or averaged, and the final cost column has no work-area divisor. Incompatible units remain separate flat rows so unlike quantities are not added.

Actual named child operations and recorded expense items remain detail rows beneath the parent heading, even when only one actual child is included. Repeated records of the same child/material combine by compatible unit; different rates display `Varies` in that detail row too. For example, the existing Weeding catalogue defines Manual Weeding (1st Round), (2nd Round) and (3rd Round); when those children are recorded, those names appear beneath Weeding Operations. Price differences alone are never treated as children.

Different crop-cycle identities and stages stay separate; unknown cycle identities are handled conservatively. Monthly/row areas count recorded work occurrences, so repeating work on the same area contributes to each applicable month. The report's audited-area metadata still uses distinct source field areas and does not come from grouped work areas.

## Database / schema

Unchanged. No business records were added, deleted, consolidated or overwritten. Stored snapshots, amounts, certification and QR integrity codes remain authoritative. Group IDs are presentation-only and are never saved as operation IDs.

## Server / API

`server/domain/auditReportLayout.js` adds the canonical read-only `auditOperationGroups` print projection. Both clients carry the same implementation in their existing layout modules; parity tests compare its output. The projection uses recorded operation totals, adds quantities/areas and preserves differing line-item details. It does not mutate signed snapshots, remove repeated work records or add expense-line costs again to operation totals. Existing server-issued report costs and access controls remain authoritative. No endpoint, mutation, schema, QR hash or permission change was required.

## Web

- `web/react-app/src/utils/auditReportLayout.js`: matching grouping projection.
- `web/react-app/src/services/auditPdfService.js`: jsPDF uses grouped rows and their monthly area totals, the corrected quantity-price cost column, full PHP cost summaries and complete grid cells. Long reports still paginate with repeated headers.
- `web/react-app/src/components/audit/PrintableAuditReport.jsx`: preview/print matches grouping and expenditure summaries. One shared operation renderer handles direct and milling groups, including rate/item details. Original snapshots still supply distinct audited field areas.

## Mobile

- `mobile/src/utils/auditReportLayout.js`: matching grouping projection.
- `mobile/src/services/auditPdfService.js`: matching grouped HTML, monthly areas, corrected quantity-price cost values and full expenditure summaries. Explicit A4 landscape dimensions are used, with A3 landscape for timelines wider than 24 columns.
- `mobile/src/services/pdfFileService.js`: forwards page dimensions to the existing native renderer/save flow. Crop-year overview exports retain their separate existing format; this grouped operational matrix applies to monthly audit reports.

## Verification

- Full release verification passed after the quantity-price formula correction: **887 server tests and 72 Web tests**, zero failures, plus authority/configuration/client-binding/secret checks, Web build and Android production JavaScript/Hermes export. Evidence: `output/pdf-quantity-cost-release-gate-2026-11-16.txt`.
- Focused projection/PDF/component tests: **60 passed**. Evidence: `output/pdf-quantity-cost-formula-2026-11-16.tap`. Covered areas/quantities by month; immutable snapshots; crop/stage/unknown-cycle boundaries; incompatible units; mixed prices without false children; actual catalogue children; repeated expense materials without double-counting area; full expenditure without duplicate line-item addition; explicit zero cost; and actual Web print handling of direct/milling groups. The 10 Web PDF tests include golden quantity-price examples for plain operations, actual children and materials at multiple hectare values; all expected costs are independent of those hectare values.
- New `server/tests/audit-operation-grouping.test.js` verifies canonical/client projection parity. Updated `web/react-app/tests/audit-pdf-download.test.js` checks actual PDF grouped rows, monthly quantities/areas, full expenditure and long-report pagination. Existing native save tests remain in use.
- Existing synchronized report was read from the signed-in emulator account without mock business records or database writes. The installed Expo Print renderer generated the Android preview; the production jsPDF service generated the Web preview. Both final PDFs were reopened, text-extracted, rendered to PNG and visually checked. Each fits this report, totals and signatures on one landscape page.
- Render checks independently sum original operation snapshots and assert that **both extracted PDF totals equal PHP 32,350.00**. They also check that the no-child Planting title appears exactly once and mixed unit prices display `Varies` followed by **PHP 6,350.00** in the final cost column. That is `(4 x PHP 1,000) + (1 x PHP 2,350)`; it is not divided by the 7.50 HA field/work area. Results: `output/pdf-table-render-check-2026-11-16.json`.
- Final previews: `output/pdf/HUGPONG_Audit_Table_Mobile_Preview.pdf` and `output/pdf/HUGPONG_Audit_Table_Web_Preview.pdf`.
- QA script: `tmp/pdfs/verify_monthly_table_2026-11-16.mjs`. It reads an existing snapshot, renders local previews and deletes the native temporary Print file. It does not compile, certify, alter or upload reports.
- Whitespace checks passed: `output/pdf-quantity-cost-whitespace-2026-11-16.txt`.

A user-triggered folder save of the final grouped layout and a release APK walkthrough remain manual checks. Native rendering/build validation is not claimed as a new installed release or production deployment.
