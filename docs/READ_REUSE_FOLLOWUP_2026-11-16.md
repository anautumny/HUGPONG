# History and reconnect read reuse

16 November 2026. Follow-up to the reported 3,500 reads during approximately one hour of Web and Mobile use. The usage graph alone cannot attribute those reads to individual queries, devices, console activity, or the currently installed client version.

## Database / schema

No schema, document, index, or rule changes. No historical records are deleted or truncated to meet a read budget. Complete operation history remains available. No production scans or traffic simulations were used for verification.

## Server / API

Each operation-history page previously queried all reports in its relevant farms again to derive display lock pointers for legacy records. The API now shares these pointers between pages and clients for up to sixty seconds, with at most one hundred farm keys and approximately four MiB of retained pointer data per database instance. Concurrent reads share the same query. Canonical audit-report changes invalidate the cache before acknowledgement, along with the existing dependency invalidation. Runtime hydration also clears it. Explicit no-cache requests refresh it, errors are not retained, and invalidated in-flight results cannot repopulate it.

This cache contains display pointers only. Operation scope is resolved independently, and mutation validation remains authoritative and unchanged. Internal service callers default to uncached report reads. No permission or ownership cache lifetime has been increased.

A local fixture containing five hundred operations and two hundred audit reports in one farm was fetched through all five pages. The old path consumed 1,504 modeled returned-document reads; the cached path consumed 704, returning identical records and lock pointers. This saves 800 reads (53.2%) in that scenario, rather than predicting an equivalent reduction across all production traffic. The fixture counts the lookahead documents used by pagination. It does not model every possible Firestore billing component.

## Web

The change stream resumes from the revision whose cache invalidation has already been applied. Returning to a visible tab with an unchanged server revision no longer triggers another global reset. A changed revision still resets, including changes missed while hidden or disconnected. Events waiting for the debounce flush cannot suppress a reset. Login/logout clears the revision and every cached authenticated response.

Assignment/session invalidation still discards scoped datasets and any other cached resource except prices and tickets. Those two datasets are reusable within their existing short lifetime because prices are global and ticket access is account/role based. Explicit price or ticket changes still invalidate them. Account and role boundaries still clear both. Unaffected pending reads remain shared; older affected reads cannot replace newer cached results.

## Mobile

The same server-side report-pointer reuse benefits existing Android clients, including the published 1.1.3 APK, without an app reinstall. The shared stream parser remains identical across Web and Mobile; its optional initial revision defaults to no seed. Mobile retains its existing startup, foreground, reconnect, complete-history, offline outbox, and account isolation behavior. Mobile does not seed a revision merely observed before replica refresh. No new Android binary is required for these server/Web changes.

## Verification and limits

Targeted tests cover the measured read budget, identical pagination results, concurrent report reads, invalidation, explicit refresh, expiry, failed reads, ownership reassignment, cross-farm scope, in-flight invalidation, cache/account boundaries, applied versus pending revision handling, and stream reset parity.

Initial loading and offline catch-up still cost reads proportional to the authorized records needed. These changes cannot guarantee that every workload fits the free tier. Daily totals include other clients and development/console activity. Compare subsequent settled idle periods separately from navigation and submissions; do not extrapolate a startup burst into continuous consumption.

The full local release gate passed 962 server tests and 79 Web tests, deployment configuration, secret exposure, runtime authority and client binding audits, the Web production build, and Android production bundle export. The Cloudflare test emulator requires access to its local AppData registry; the gate was rerun successfully with that access. Evidence: `output/read-reuse-release-gate-2026-11-16.txt` and `output/read-reuse-targeted-2026-11-16.txt`.

Deployed from source commit `650e6bd7` to the existing `hugpong` Cloudflare service. Active version: `89681537-47e0-4796-8724-0728464f04f7`; previous version `a73af002-a0c8-4743-9a12-2098e95c11eb` remains available for rollback. The live entry `/assets/index-BQF4vt-H.js` matches the tested build byte for byte; readiness returns HTTP 200 and anonymous field access returns HTTP 401. No production record mutations or workload scans were performed for verification. Evidence: `output/read-reuse-cloudflare-deploy-2026-11-16.txt` and `output/read-reuse-live-verification-2026-11-16.json`.

An initial automatic approval review rejected the source push because it could not verify the destination. Read-only checks confirmed `origin` is `https://github.com/anautumny/HUGPONG`, matching the published Android release repository, and `main` tracks `origin/main`. The retry with that evidence was approved and completed; deployment was then approved and completed.
