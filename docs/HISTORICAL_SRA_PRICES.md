# Historical SRA prices and missing quotations

## Database / schema

The supplied CSV has 39 weekly records, 4 January–27 September 2026. Original bytes are retained in `server/data/SRA_Weekly_Prices_2026_By_Month_Week.csv`, with SHA-256 `09c7ce4ab02251e03b7addcc7125e94c7b6be18bcceffd6f42ef276cbc3ce82c`. Each date gets a deterministic price ID. Source URL, source-file hash, import batch, week-ending semantics, and the CSV's market provenance are retained. The product displayed to users is **Molasses**.

Raw Sugar and Molasses each have independent `REPORTED`, `NO_BIDDING`, `MILLING_ENDED`, or `NOT_REPORTED` status. A non-reported price is null, never zero. The source file is user-supplied historical data; its linked SRA document could not be independently retrieved during implementation. Retaining its URL does not claim independent source verification.

## Server / API

`priceAnalyticsService` owns averaging, weekly comparisons, extremes, last reported quotes, and bulletin freshness. Monthly means are arithmetic means of reported weekly quotes, not volume-weighted prices. Counts show how many supplied weeks contribute. A full month with no quotes has a null mean. Comparisons stop at unquoted/missing weeks and incompatible markets. The API projection is cached on clients for offline display and never becomes client mutation authority.

For June, the import yields Sugar PHP 2,239.58/Lkg from 3/4 reported weeks and Molasses PHP 19,887.50/MT from 2/4. July has one Sugar quotation, PHP 2,205.00 on 12 July. The last Molasses quote is PHP 21,250.00/MT on 21 June. August and September have no quoted prices. The latest bulletin says milling ended for both products, and no October bulletin is invented.

Import workflow:

```powershell
node server/scripts/importHistoricalPrices.js --replace-ids=PRC-03166D5FFE6A490AA622
node server/scripts/importHistoricalPrices.js --replace-ids=PRC-03166D5FFE6A490AA622 --execute --project=hugpong-production
```

The first command writes an ignored local plan/backup of current price records. The executor checks project identity, CSV hash, and unchanged selected replacement records; one transaction creates missing historical records, deletes only the named mock, and writes an audit event. Overlapping non-selected dates and changed target records block execution. Re-running without selected deletion IDs is safe for the same source dataset. Preserve the original replacement plan for rollback evidence; no automatic destructive rollback is included.

## Web

Dashboard/Prices show the latest bulletin date and each product's status. Older numeric values appear separately as “Last reported” with dates. Stale bulletins are labeled historical. History and CSV export preserve statuses and blank amounts/comparisons. Charts break at missing quotes. Monthly averages show reported-week counts. Publishing supports each product's status independently and submits no invented zero price.

## Mobile

Home and Market analytics share a status-aware bulletin card. Notifications and history render status text, not currency zeros. Monthly statistics use the API projection, include fifth weeks, and leave missing bars empty. Publishing supports the same statuses. Older APKs cannot interpret the nullable price schema; install the updated beta to view these records. Cached older data refreshes through the normal API synchronization flow.

## Verification and rollout

The complete release gate passes 542 server tests, 38 Web tests, the Web production build, and Android Hermes export. Eight behavioral regression tests cover CSV validation, independent product availability, monthly means, comparison gaps, atomic mock replacement/replay, and Web/Mobile contract parity. Native device acceptance remains required.

Deploy the updated API/Web before applying the import. Release the compatible Android APK alongside the schema change. Existing rules/indexes remain valid; no unrelated farm, user, audit-report, or operation record is changed.
