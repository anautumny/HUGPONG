# Audit quantity integrity and full operation costs — 16 November 2026

Status: implemented locally; no deployment, APK release, or live business-record migration.

Latest pricing clarification: [Audit unit-cost parity and native export safeguards](AUDIT_UNIT_COST_PARITY_AND_EXPORT_SAFETY_2026-11-16.md) documents labor-inclusive rates for all plain operations. Quantity integrity guards remain in effect.

## Confirmed calculation

The final PDF column is **Operation Cost**, containing full saved expenditure. An operation costing PHP 6,500 across 5 HA displays PHP 6,500. There is no percentage column or additional total-cost column. Report totals sum saved operation costs, independently of rounded weighted averages or covered area. Quantity remains the total quantity entered in the operation form, using the selected operation/expense unit.

Different recorded prices for one selected unit use a quantity-weighted display average. Different units remain separate. Attached labor is included in expenditure without displaying worker-days as the selected operation unit. A labor-only operation with an explicitly selected reporting quantity can display its full labor cost per selected unit; financial components are counted once.

## Root cause and historical limits

Older labor-only records contain worker/day costs but no selected operation quantity or unit. The previous print fallback invented quantity 1 and a default unit, which made older printouts appear complete. Their missing original selections cannot be recovered from those defaults. Old signed snapshots and QR integrity data are preserved. Historical missing values are shown honestly and require an authorized correction through the existing amendment/report workflow.

The Mobile itemized-to-direct input shortcut also supplied a PHP 1,000 fallback when the calculated rate was zero or missing. That shortcut now preserves actual entered values and leaves missing quantities/rates blank.

## Database / schema

No schema changes, backfill, deletion, or modification of live records. Existing operation quantity/unit and expense-item quantity/unit fields remain authoritative. Already-committed legacy request receipts still replay without creating or rewriting records.

## Server / API

- `server/domain/auditReportLayout.js`: shared quantity readiness and read-only pricing/grouping projection.
- `server/services/cropCycleOperations.js`: validates required selected quantities/units on new operations and amendments before writes. Invalid submissions return `OPERATION_QUANTITY_REQUIRED`; existing work is unchanged.
- `server/routes/auditReports.js`: readiness identifies incomplete operations in the exact compilation batch. New compilation returns `AUDIT_QUANTITY_INCOMPLETE` before saving an incomplete report. Historical report replay remains intact; missing details in an older certified report do not block a separate, complete supplemental batch.

Labor-only work uses Direct Input with the actual operation quantity/unit and direct rate 0 when its payment is recorded separately in labor. Actual expense items require their own quantities and units.

## Web

AddOperationModal, EditOperationModal, and TakeOverView explain the labor-only input path; submissions validate the required details. AuditMemberReview identifies incomplete source operations before compilation. The shared projection, jsPDF service, and PrintableAuditReport use saved quantities/units and the Operation Cost heading.

## Mobile

FieldOpsScreen removes the invented PHP 1,000 direct-rate fallback and explains the labor-only input path. dataStore validates draft content before submission while preserving incomplete local drafts. AuditMemberReviewSheet lists incomplete source operations and prevents continuing compilation. The shared projection and auditPdfService match the Web calculation and heading. Existing offline queues are not cleared; a legacy queued submission missing quantity/unit may require correction before it can be accepted.

## Validation

- Full local release gate: **899 server tests and 73 Web tests passed**, zero failures; configuration, secret-exposure, authority and client-binding checks passed; Web production build and Android production JavaScript/Hermes export passed. Evidence: `output/audit-quantity-integrity-release-gate-2026-11-16.txt`.
- Regression coverage includes rejection before writes, amendment preservation, legacy idempotent receipt replay, incomplete audit rejection, valid supplemental batches after old certified reports, selected units, weighted prices, labor-only reporting quantities, disabled compilation controls, and Mobile mode-switch value preservation.
- Both previews were regenerated from an existing synchronized report through Android native Expo Print and production Web jsPDF, reopened, rendered to PNG, and visually inspected. Each contains 31 source operations grouped into 10 rows; the PDF grand total equals saved expenditure **PHP 32,350**. Both show Operation Cost, no worker-day selection or removed explanatory paragraphs. Evidence: `output/pdf-table-render-check-2026-11-16.json`.
- Whitespace verification passed: `output/audit-quantity-integrity-whitespace-2026-11-16.txt`.
- The local API was restarted with the updated code and working Firestore connectivity. A read-only authenticated emulator readiness check succeeded with `quantityGuardPresent: true`, `quantityReady: false`, `missingQuantityCount: 30`, and `canCompile: false`. This confirms that actual missing historical quantities are detected; it does not repair those records or exercise a live write.

Remaining manual checks: correct genuine missing historical quantities through authorized workflows; enter a new complete operation and compile/export it in the emulator; verify the eventual installed APK after a separately authorized release. No live submission/compilation was performed solely to test these guards.
