# HUGPONG Performance and Firestore Usage Audit

Date: 2026-09-28

## Scope and constraints

This pass optimized the existing server, Web client, and Android client without changing roles, permissions, business rules, database relationships, offline outbox behavior, or canonical data ownership. No database migration or composite-index deployment is required.

## Primary causes found

1. Web resource subscriptions refreshed every 30 seconds and forced another request whenever the browser regained focus. The read cache was only five seconds.
2. Mobile canonical refresh ran every 60 seconds and fetched 7 to 11 role-scoped endpoints, including large field, operation, user, price, audit, and ticket result sets.
3. Every endpoint in a parallel refresh independently read the same authorization document. Web request bursts could also independently read the same Firestore session document.
4. The public `/health` probe was mounted after session middleware, so a connectivity check carrying a browser cookie could read the Firestore session even though health is public.
5. Session `touch` persisted on every store touch, and unchanged sync telemetry repeatedly produced the same write.
6. Each telemetry write first read its device document solely to decide whether to add `createdAt`.
7. System diagnostics loaded every Field and Crop Year Cycle document just to calculate counts and active Crop Year labels.
8. Dashboard price loading read the complete price history even though only the latest two prices are displayed.
9. Field member enrichment issued one Firestore RPC per member instead of one `getAll` RPC.
10. Mobile canonical refresh rewrote identical AsyncStorage/SecureStore values, increasing device I/O and render pressure.
11. Inactive mobile tabs remained eligible for updates, and large Web tables synchronously refiltered on every keystroke.
12. The Web audit route initially loaded QR generation and image-decoding libraries. Its production chunk was approximately 550 KB before optimization.

## Changes made

### Database and indexes

- No schema or relationship changes.
- No new composite indexes. The new price limit uses the automatic single-field `effectiveDate` index, and diagnostics uses existing single-field status/current-cycle queries.
- System diagnostics now uses Firestore aggregate counts and reads only active cycles plus legacy fallback fields that lack a stored Crop Year.

### Server and API

- Simultaneous reads of the same user authorization document are single-flight coalesced. The entry is removed immediately after Firestore settles; this is not a time-based security cache.
- Simultaneous reads of the same Web session are also single-flight coalesced and callers receive independent object copies.
- Session touch writes are capped to one per 15 minutes while explicit login/session changes still persist immediately.
- `/health` is mounted before session middleware, so connectivity probes perform zero Firestore session reads.
- Telemetry writes no longer perform a preceding document read.
- `GET /api/prices?limit=2` performs a bounded newest-first query for dashboards; the unbounded endpoint remains available for the existing full history screens.
- Field-member documents are fetched through one `getAll` call instead of N independent RPCs.

### Web

- Read cache: 5 seconds to 60 seconds.
- Default background subscription: 30 seconds to 5 minutes.
- Focus revalidation now honors freshness instead of always bypassing cache. Server mutation events still invalidate and force-refresh affected resources immediately.
- Connectivity probe: 30 seconds to 2 minutes and now costs no Firestore session read.
- Terminal diagnostics: 30 seconds to 2 minutes.
- Maintenance inventory: 60 seconds to 5 minutes.
- Dashboard prices request only the two records it displays.
- Identical sync-state reports are suppressed for 15 minutes; state changes and successful synchronization still report immediately.
- Large local searches use deferred filtering for audit events, users, price history, and operations.
- Audit compiler, history, printing, QR receiver, QR generator, and image decoder are lazy-loaded. Loading feedback is shown while action-specific code arrives.

### Mobile

- Canonical background refresh: 60 seconds to 5 minutes, with a two-minute freshness guard for rapid foreground/tab transitions.
- Reconnect still forces an authoritative refresh, and the durable outbox/manual synchronization behavior is unchanged.
- Sync Monitor refresh: 30 seconds to 2 minutes and remains focus-scoped with cleanup on blur/unmount.
- Inactive bottom tabs are lazy, detached, and frozen to avoid unnecessary React Native work.
- AsyncStorage and SecureStore skip exact unchanged writes after hydration.
- Identical sync telemetry is suppressed for 15 minutes; failures, state changes, and successful uploads remain reportable.

## Before/after comparison

These are deterministic cadence and query-shape comparisons from the implementation. Actual billed reads depend on each role's scoped document counts and should be confirmed in Firebase Usage after representative testing.

| Area | Before | After | Expected reduction |
| --- | --- | --- | --- |
| Web default subscription cycles | 120/hour | 12/hour | 90% |
| Mobile canonical scheduled cycles | 60/hour | 12/hour | 80% |
| Focus revisit within freshness window | forced network read | cached result | one full duplicate burst avoided |
| Mobile Sync Monitor cycles while focused | 120/hour | 30/hour | 75% |
| Web health probes | 120/hour with possible session read | 30/hour, zero session reads | 100% of health-related Firestore session reads |
| Parallel authorization reads | 1 per endpoint (typically 5–11 per burst) | 1 per overlapping user burst | typically 80–91% |
| Parallel Web session reads | 1 per endpoint | 1 per overlapping session burst | typically 80–86% |
| Dashboard price documents | complete history | 2 documents | `max(0, history size - 2)` per uncached dashboard load |
| Telemetry server operation | 1 read + 1 write | 1 write | 50% of Firestore operations per accepted report |
| Unchanged sync telemetry | could write on each trigger | at most once per 15 minutes | trigger-dependent |
| Session touch writes | potentially one per request | at most 4/hour per active session | workload-dependent, usually substantial |
| Diagnostics document reads | all Fields + all Cycles | aggregate counts + active cycles + exceptional fallback fields | scales with active exceptions instead of total history |
| Audit route initial JS | about 549.9 KB | about 26.1 KB | about 95.2% |

At the original mobile cadence, a scope containing `D` documents across the refreshed collections could cause roughly `60 × D` document reads per active hour. The new scheduled cadence reduces that component to roughly `12 × D`, before counting the additional savings from freshness guards and coalesced authorization reads.

## Verification

- Server contract/integration suite: 347 passed.
- Added performance regressions for in-flight session coalescing, session touch throttling, bounded queries, polling cadence, health placement, unchanged local writes, and telemetry query shape.
- Web production build: passed.
- Android Expo production export: passed (1,236 modules, 4.5 MB Hermes bundle).
- Web contract suite passed. Server-only security collections remain excluded from Web and Mobile database contracts.
- Existing flow contracts cover login/security, dashboards, Field Operations, planner/drafts, analytics, durable outbox and sync monitor, QR/audit lifecycle, support tickets, and SRA prices.

## Remaining high-volume candidates

- Audit-event history still preserves its existing complete-history behavior. Converting it to cursor pagination needs a coordinated Web/Mobile “Load more” flow because Farm Manager visibility merges actor and Block Farm scopes; truncating it silently would change functionality.
- Active operation data remains available offline in full because analytics, duplicate prevention, planner completion, audit compilation, and field lifecycle calculations depend on it. A future incremental-sync protocol would need server-owned change cursors and deletion tombstones to preserve accuracy.
- Firebase Console usage should be sampled for the same scripted role flows before and after deployment. Compare Firestore document reads/writes per hour, not only API request counts, and separate one-time cold cache loads from steady-state navigation.
