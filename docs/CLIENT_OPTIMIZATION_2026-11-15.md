# Web and Mobile performance improvements

15 November 2026. Implemented and verified locally with the pending release changes. No deployment or APK publication was performed. This is a focused optimization pass, not a claim that every possible performance issue has been eliminated.

## Findings and changes

### Web startup and navigation

The user directory and its imported dialogs/services were eagerly imported by the root application even on the public landing page. `web/react-app/src/App.jsx` now loads UsersView through the existing lazyWithRecovery mechanism, registered for `/users`. Existing route-level loading feedback, error boundaries, RBAC and intent-based module preloading remain in place. Opening a route does not preload or bypass authorization for its API data.

Measured against the immediately preceding local production build:

| Initial JavaScript | Before | After |
| --- | ---: | ---: |
| Entry module, bytes | 476,742 | 357,256 |
| Entry module, gzip bytes | 144,837 | 110,153 |
| Entry and required static JS dependencies, bytes | 525,180 | 405,694 |
| Entry and required static JS dependencies, gzip bytes | 156,108 | 121,424 |

The initial JavaScript gzip payload decreased approximately 22.2%. Measurements follow the built HTML entry/preloads and static JS imports; they exclude deferred routes, CSS, fonts and images. This is an asset-size comparison, not a measured reduction in real-device startup time. The complete application still downloads code for deferred features when needed.

Evidence: `output/optimization-web-before-2026-11-15.json`, `output/optimization-web-after-2026-11-15.json`. The new UsersView chunk is independently emitted by Vite. Existing DOM navigation tests exercise immediate loading feedback, keeping the shell mounted, cached-route navigation, and rejecting a late route module after navigating elsewhere.

### Web request reuse

`web/react-app/src/services/apiClient.js` previously detached every pending request and invalidated the cache-write revision for every response on any resource change. A price update could therefore duplicate an unrelated field request and stop that field result from warming the navigation cache.

Invalidation now detaches only the affected resource's pending reads and advances a resource-specific revision. An older affected response cannot replace a newer cached response. Unaffected requests remain shared and may still populate the existing cache. Global resets, reconnection, session invalidation and account switches continue invalidating all applicable work. Cache lifetimes, server scope, mutation bodies, idempotency keys, authentication generation fences, retry delays and the change stream remain unchanged. No polling or second cache was introduced.

Runtime tests demonstrate one shared pending field request during a price invalidation, reuse of its completed value without another GET, rejection of stale pre-change cache writes, correct ordering of older/newer field responses, complete reset/session invalidation and rejection of an old account response. The full suite also covers refresh failures, empty results, Retry-After, queued invalidations and reconnection.

### Mobile operation-screen calculations

`mobile/src/screens/FieldOpsScreen.js` rebuilt field permissions, farm lists, audit filters and archive projections during input/dialog renders. A newly allocated accessibleFields array also invalidated downstream memoized log calculations even when store data was unchanged.

These projections now use the screen's existing dataRevision plus identity, role and connectivity dependencies. New store data invalidates them; typing and unrelated local UI state reuse them. This deliberately does not memoize by the mutable global arrays' references alone, which would leave live changes stale.

A fixture with 1,000 fields, 2,000 crop cycles and 200 reports executes the real screen's seven derived-data declarations. Initial calculation plus 50 input renders performed 357 calculations without memo reuse and 7 with reuse. Every subsequent input render reused those projections. The test also proves recalculation after a field is added, certification changes, role changes, offline manager scope and reassignment of a farm. Diagnostic elapsed times are local calculation timings only, not Android frame rates or end-to-end response times. Evidence: `output/optimization-mobile-tests-2026-11-15.tap`.

### Mobile projection subscriptions and selection

The operation screen had two overlapping store subscriptions. Both copied logs and selected-field data on each notification. One also captured the initial farm list, so later farm assignments could be evaluated against stale relationships.

The screen now has one projection subscription, copies logs/drafts once per notification, updates the existing revision once, and looks up current farm relationships inside the callback. Selected-field updates and stage projections still run on real store changes. Pending operation queues and cloud listeners were not removed or delayed.

The runtime test also exposed a selection defect: missing member names could compare as equal and falsely match unrelated fields in the legacy callback. Selection now uses assigned account/field IDs rather than names, and preserves a manager's own personal field. The existing offline manager restriction to personal fields remains in place. These are client display/selection guards; the server remains the authority for all reads and writes.

## Database and server/API

No database/schema, migration, Firestore index, session policy or mutation controller change was needed for this pass. API authorization and validation remain centralized on the existing server. The optimization reduces redundant client work and avoids duplicate reads without changing the records returned, cache TTL or offline replay semantics. Existing server caches, coalesced session/account reads and the single revision listener were inspected and retained.

Web gains resource-specific request reuse; Mobile already uses an affected-resource replica loader and retains that implementation. Both clients continue receiving the same server change feed, with full account-boundary invalidation and real-time updates. Mobile gains projection memoization and a single screen subscription; Web retains its existing memoized view selectors and route loading feedback.

## Changed files

- `web/react-app/src/App.jsx`
- `web/react-app/src/services/apiClient.js`
- `mobile/src/screens/FieldOpsScreen.js`
- `server/tests/client-performance-regressions.test.js` (new calculation/selection tests)
- `server/tests/realtime-synchronization.test.js` (new runtime cache tests)
- `server/tests/react-key-uniqueness.test.js` (existing source assertion accepts memoized canonical deduplication; ID/key assertions remain)

## Verification

- Full `npm run verify:release`: **861 server tests and 67 Web tests passed**, zero failures or skipped tests. Deployment configuration parity, tracked-secret exposure, runtime authority, client identifiers, Web production build and Android production JavaScript/Hermes export passed. Evidence: `output/optimization-release-gate-2026-11-15.txt`.
- Focused request-cache and synchronization tests passed: `output/optimization-cache-tests-2026-11-15.tap`.
- Focused Mobile calculation, live-update and subscription tests passed: `output/optimization-mobile-tests-2026-11-15.tap`.
- `git diff --check` passed. No production accounts, records or notification states were mutated by these tests.

## Remaining measurements

The published site and installed APK still contain their previous code. No new APK was built or installed. Actual cold-start time, tab-switch latency, scrolling/keyboard frame rates, memory use and slow-network behavior must still be measured on a physical phone and the deployed site. Large dataset fixtures and build/export success do not prove performance on a particular Android device. Verify live price changes, stage completion, offline queue replay, account switching and navigation with those deployed clients before presentation. These changes preserve that behavior in local tests and do not claim a completed live device/role synchronization matrix.
