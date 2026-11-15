# Saved report prices and weighted averages - 16 November 2026

Status: local Web/Mobile implementation and rendered previews updated. No deployment or release APK build.

Latest correction: [Audit unit-cost parity and export safeguards](AUDIT_UNIT_COST_PARITY_AND_EXPORT_SAFETY_2026-11-16.md) supersedes this document's base-only price display for plain operations. Their displayed rate now includes attached labor, matching the audit ledger (the actual Basal case is 4 ton at PHP 1,360, total PHP 5,440).

Follow-up: [Audit quantity integrity and full operation costs](AUDIT_QUANTITY_INTEGRITY_2026-11-16.md) documents the newer submission/compilation guards, removal of Mobile's invented direct-rate fallback, the final **Operation Cost** heading, and the latest 899-server/73-Web verification. The results below describe the earlier pricing correction.

## Root cause

The original report fallback assumed quantity 1 when an operation had no recorded quantity, assigned a default operation unit, and divided the full payment by that synthetic quantity to obtain a unit price. This incorrectly treated labor-only payments as a single HA purchase and treated a labor-inclusive operation total as its base unit price.

A read-only comparison of the checked report against the matching saved operation records found that four Planting entries were labor-only: each recorded 2 workers, 1 day, PHP 500 per worker-day and PHP 1,000 total, with no operation quantity. The other Planting entry recorded a base quantity of 1 HA costing PHP 1,000, plus 3 workers for 3 days at PHP 150 per worker-day, costing PHP 1,350. The report and saved operation values matched. The previous displayed price PHP 2,350 incorrectly included both the base charge and labor.

## Result and calculation

The user selected quantity-weighted averages separately for each selected operation/expense unit, then clarified that QTY and UNIT must show the values selected in the system and must not display worker-days. The final report uses the saved operation quantity/unit and actual expense-item quantity/unit. Labor worker-count/day calculations remain internal financial components and never populate those displayed selection fields. No operation quantity is fabricated when it is absent. Missing historical quantities/prices remain labelled Not recorded; a missing unit shows `-`.

For each selected unit, weighted average = sum of selected quantity times its recorded base/item rate / sum of selected quantity. Different selected units are not added or averaged together. Labor remains included in the original recorded operation/child/item costs and report totals. Its derived worker-day quantities and rates are excluded from the report's QTY, UNIT and selected-unit average cells. All ten existing selectable operation units are preserved; no unit enum was added or migrated.

The checked Planting row remains one operation row and now displays:

| Quantity | Unit | Unit Cost |
| --- | --- | --- |
| 1 | HA | PHP 1,000.00 |

Only one of the five underlying Planting records has a saved operation quantity/unit: 1 HA. The four labor-only records have no operation quantity/unit and do not contribute an invented quantity to that cell. The actual labor amount remains PHP 5,350, the Planting cost (base plus labor) remains **PHP 6,350**, and the report expenditure remains **PHP 32,350**. Financial totals continue to sum the original recorded amounts and are never recomputed from rounded display averages. The operation's full cost can include attached labor in addition to its selected base quantity-price amount.

Actual price/quantity/amount breakdowns, including labor, remain available in the read-only projection and original snapshots. The report no longer shows Varies or worker-days. A single selected-unit rate is shown directly; multiple selected prices for the same unit are labelled `(avg)`. Different selected units appear on separate lines within the same operation row. Actual named children and recorded expense items retain their own rows and source-based pricing. Explicit base costs and attached labor remain included in recorded costs without being added twice.

## Database / schema

Unchanged. No existing records, signed snapshots, QR codes, rates, quantities, assignments, operation-unit enums or payments were edited or migrated. All source record comparisons and preview generation were read-only against business data.

## Server / API

`server/domain/auditReportLayout.js` defines the canonical read-only `auditOperationPricing` and `auditPricingCells` helpers and integrates them into `auditOperationGroups`. These separate approved base costs, expense items and labor, derive worker-days, retain actual rate breakdowns and compute per-unit weighted averages. Original approved operation totals remain the monetary authority. Historical reports use their saved snapshot values, not today's operation-plan prices. Existing server validation, endpoints, mutations, RBAC and QR hashing remain unchanged.

## Web

- `web/react-app/src/utils/auditReportLayout.js`: same canonical projection and pricing helpers, checked by parity tests.
- `web/react-app/src/services/auditPdfService.js`: renders the source-based quantity, unit and weighted price labels on the existing grouped operation rows and actual child/item rows. Original exact costs remain in the final column and summary rows.
- `web/react-app/src/components/audit/PrintableAuditReport.jsx`: matching multiline quantities/units/rates in preview and print.

## Mobile

- `mobile/src/utils/auditReportLayout.js`: matching canonical projection and pricing helpers.
- `mobile/src/services/auditPdfService.js`: renders the same selected quantity/unit labels and recorded costs. QTY and price columns were widened so missing-value labels and `(avg)` remain legible without clipping.

## Validation and previews

Full local release verification passed after the selected-QTY/UNIT correction: **891 server tests and 73 Web tests**, zero failures, plus configuration/authority/client-binding/secret checks, Web production build and Android production JavaScript/Hermes export. Evidence: `output/pdf-selected-quantity-unit-release-gate-2026-11-16.txt`. Whitespace checks passed: `output/pdf-selected-quantity-unit-whitespace-2026-11-16.txt`.

Canonical/client parity, immutability, mixed prices, actual child operations, mixed units, missing quantities, labor-only records, attached labor, base-plus-item costs, and rounding protection are covered in `server/tests/audit-operation-grouping.test.js`. Tests cover all ten selected units with summed selected quantities independent of hectares or workers; missing quantities are not invented, and a legacy saved unit remains visible even when its quantity is missing. Actual Web print and jsPDF tests assert that the Planting example displays only selected QTY 1 / UNIT HA, without worker-days, while retaining its PHP 6,350 cost.

The final existing-report previews were generated by installed Android Expo Print and the production Web jsPDF service, reopened, text-extracted, rendered and visually checked. Both show one Planting row with selected QTY 1 / UNIT HA, no visible worker-days, explicit missing values on older labor-only records, and the original PHP 32,350 expenditure. Text extraction asserts that worker-days are absent. Evidence: `output/pdf-table-render-check-2026-11-16.json`; QA scripts: `tmp/pdfs/trace_unit_costs_2026-11-16.cjs` and `tmp/pdfs/verify_monthly_table_2026-11-16.mjs`. The trace logs monetary/quantity diagnostics only and does not print identifiers, credentials or account tokens.

Final previews: `output/pdf/HUGPONG_Audit_Table_Mobile_Preview.pdf` and `output/pdf/HUGPONG_Audit_Table_Web_Preview.pdf`.

The remaining manual check is saving/opening the updated PDF through the app's folder picker and checking the eventual installed release. No production deployment is claimed.
