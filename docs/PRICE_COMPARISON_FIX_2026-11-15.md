# Effective-date price comparisons - 15 November 2026

Status: fixed and verified locally, included with the pending release changes. Not deployed; no new APK built for this correction.

## Cause and behavior

The shared server comparison helper required exactly seven days between records. The user's November 10, 12 and 15 publications were two or three days apart, so both the publication transaction and the API read projection returned null movements. Web correctly rendered those nulls as "No comparison"; this was a calculation rule rather than a refresh failure.

Effective-date records now compare with the immediately preceding record having an earlier effective date, regardless of the number of days between them. Ordering follows effective dates, not the sequence in which records were submitted. Same-date records are not compared against one another. Missing/unreported quotes and different molasses markets remain incomparable. Comparisons involving week-ending records still require exactly seven days, preserving historical missing-week safeguards.

For the supplied prices:

| Effective date | Sugar change (PHP/Lkg) | Molasses change (PHP/MT) | Compared with |
| --- | ---: | ---: | --- |
| November 12, 2026 | +50 | +600 | November 10, 2026 |
| November 15, 2026 | -350 | -1,600 | November 12, 2026 |

The earliest entry only has a comparison if an eligible earlier record exists in the returned history. The API's existing cursor/lookahead and bounded history window are unchanged.

## Layers and files

- Database/schema: no schema/index change, migration, rewrite or deletion. Existing records with stored null changes receive corrected read projections when requested through the API.
- Server/API: `server/services/priceAnalyticsService.js`. The existing `publishSraPrice` transaction and `/api/prices` projection reuse this helper; clients still cannot supply authoritative movements. New publications persist the derived changes. Existing audit, notification and idempotency workflows remain in use. No additional Firestore reads or polling.
- Web: `web/react-app/src/utils/pricePresentation.js`, `src/components/prices/PriceReferenceCard.jsx`, and `src/components/prices/PriceHistoryTable.jsx`. Effective-date movement says "vs previous dated publication" rather than "vs prior week". The ledger heading is "Price Change" and its description explains the basis.
- Mobile: `mobile/src/utils/pricePresentation.js`, `src/components/PriceReferenceCard.js`, and `src/components/PriceHistorySheet.js`. Uses the same labels and server-derived values. The history sheet now displays sugar and molasses movements for each entry.
- Tests: new `server/tests/price-publication-comparison.test.js`; extended actual Mobile history component coverage in `server/tests/mobile-ui-pagination.test.js`.

## Verification and limits

- Focused comparison/schema/history/Mobile UI suites: **48 passed, zero failures**. Covers the supplied dates and amounts, persisted authoritative changes, ignored client deltas, replay safety, old null read projections, out-of-order records, market/status restrictions, historical gaps, unchanged prices, Web/Mobile mapper parity and Mobile history movement rendering.
- Full `npm run verify:release`: **827 server tests and 66 Web tests passed**, zero failures. Configuration/authority/binding/secret checks, Web production build and Android JavaScript/Hermes export passed.
- `git diff --check` passed.
- Evidence: `output/price-comparison-regressions-2026-11-15.tap` and `output/price-comparison-release-gate-2026-11-15.txt`.
- No production price was created or changed for testing. Hosted display and physical Android presentation still require verification after releasing the pending backend, Web and APK updates. A build/export alone is not treated as a device test.
