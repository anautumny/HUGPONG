# HUGPONG Web/Mobile Parity Audit

Audit date: 2026-09-24

## Executive result

- Total findings: **23**
- Fixed or verified: **22**
- Needs live-data verification: **1**
- Data migration required: **NO**

No authorization rule, Takeover security rule, operation lifecycle, sync/outbox behavior, analytics formula, or persisted Firestore enum was changed. The implementation adds response-only presentation metadata and equivalent client presentation contracts. No historical record was relabeled or migrated.

The remaining verification item is an inventory of live historical operation records that may predate explicit `submissionSource`, `isSupplemental`, or `amendments` metadata. The repository has no production dataset with which to count those records. Missing Takeover provenance is not guessed: the presentation contract emits no Takeover badge, and Web identifies missing provenance as unavailable rather than treating it as a Farm Member entry. If the live inventory finds incomplete records, deterministic reconstruction must be assessed separately before any migration.

## Canonical terminology

- Roles: **Farm Member**, **Farm Manager**, **SRA Admin**, **Super Admin**. Persisted constants such as `MEMBER_FARMER` remain unchanged.
- Annual cycle: **Crop Year Cycle**, displayed independently from Field filters.
- Stage field: **Current Stage**. The six labels are **Land Preparation**, **Planting**, **Basal**, **Weeding**, **Top-Dress**, and **Harvest**.
- Operation catalogue: the same 14 identifiers, names, categories, stages, and cost-per-hectare values are used by Web and Mobile.
- Operation lifecycle: `ACTIVE` → **Active**, `ARCHIVED` → **Archived**. Approval states are not operation lifecycle values.
- Sync: **Synced**, **Unsynced**, **Retrying**, **Failed**, and **Conflict**. “Pending” remains valid only in unrelated domains such as approval or support workflows.
- SRA price units: raw sugar **₱/Lkg** and molasses **₱/MT**.

## Canonical operation provenance

The dimensions are independent and can coexist:

| Dimension | Canonical source | Canonical condition | Display |
| --- | --- | --- | --- |
| Classification | `isSupplemental` | exactly `true` | Supplemental |
| Takeover provenance | `submissionSource` | exactly `MANAGER_TAKEOVER` | Manager Takeover |
| Amendment history | `amendments` | non-empty canonical array | Amended |
| Lifecycle | `status` | `ACTIVE` or `ARCHIVED` | Active or Archived |
| Author identity | `submittedByUserId` / amendment actor metadata | explicit stored actor | Recorded By / Last Modified |

The server sets `submissionSource` from the authorized mutation path, not from a client badge or current viewer role. Amendments preserve the original `submissionSource`. Author identity is displayed separately and never substitutes for provenance.

Badge order is classification, provenance, history, lifecycle. Compact surfaces can omit nonessential badges, but cannot replace one dimension with another. Detail/history surfaces expose all applicable dimensions. Web and Mobile both resolve combinations such as **Supplemental + Manager Takeover**, **Supplemental + Amended**, and all four dimensions without overwriting a label.

## Required parity matrix

| # | Domain/state | Canonical source | Web before | Mobile before | Final canonical display/behavior | Status |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Farm Member role | `MEMBER_FARMER` display mapping | Mixed “Member Farmer”/“Block Member” | Mixed legacy labels | Farm Member | Fixed |
| 2 | SRA Admin role | `SRA_ADMIN` display mapping | Mixed “SRA Administrator”/“SRA Officer” | Mixed legacy labels | SRA Admin | Fixed |
| 3 | Annual crop cycle | stored `cropYear` / `cropYearCycle` | Mixed Crop Year/Crop Cycle wording | Mixed Crop Year/Crop Cycle wording | Crop Year Cycle | Fixed |
| 4 | Current stage | canonical stage number | Longer/nonmatching stage names | Longer/nonmatching stage names | Six approved labels under Current Stage | Fixed |
| 5 | Operation lifecycle | `status` | Inconsistent casing/context labels | Inconsistent labels | Active / Archived only | Fixed |
| 6 | Normal entry provenance | explicit `submissionSource === MEMBER` | Farm Member fallback could hide missing metadata | No equivalent explicit fallback | Farm Member Entry only when explicit; otherwise unavailable/no invented badge | Fixed |
| 7 | Manager Takeover | `submissionSource === MANAGER_TAKEOVER` | Manager Takeover | Could be presented as Amended | Manager Takeover on both | Fixed |
| 8 | Genuine amendment | non-empty `amendments` | Not consistently exposed with other provenance | Could be conflated with Takeover | Amended on both | Fixed |
| 9 | Supplemental | `isSupplemental === true` | Omitted on operation surfaces | Supplemental chip | Supplemental on both | Fixed |
| 10 | Combined provenance | three explicit fields above | One/fewer labels | One label could replace another | Independent coexisting badges | Fixed |
| 11 | Operation SRA-08 name | canonical catalogue ID | Weeding Operations (Hilamon & Herbicides) | Different wording | Exact Web/server name | Fixed |
| 12 | SRA-09/SRA-10 category | canonical catalogue metadata | Fertilizer / weeding categories | Different categories | Same category semantics | Fixed |
| 13 | Operation detail | canonical record fields | Missing some provenance/detail metadata | Different detail emphasis | Recorded By, Last Modified, labor, materials/activity count, classification, provenance, history, lifecycle | Fixed |
| 14 | Sync presentation | durable outbox/server acknowledgment | Title-case varied | “Pending Sync”, “Recorded”, or “Saved Offline” in equivalent states | Synced / Unsynced / Retrying / Failed / Conflict | Fixed |
| 15 | Analytics field filter | `selectedParcelId` + authorized fields | No Field control | Control existed but only one selector honored it | All Fields or one independent Field across all four metric groups | Fixed |
| 16 | Analytics values | shared canonical scope and dataset | Selector-specific field handling | Selector-specific field handling | Equal crop progress, production cost, cost breakdown, and farm operations | Fixed |
| 17 | SRA units | price contract | Longer “per Lkg/MT” labels | Different unit presentation | ₱/Lkg and ₱/MT | Fixed |
| 18 | Domain errors | server error code | Generic/raw fallbacks varied | Different fallback handling | Same friendly mappings for configuration, closed cycle, Takeover expiry, conflict, and offline | Fixed |
| 19 | Status badge casing | canonical status value | Raw/all-capital values possible | Screen-specific labels | Canonical title-case display | Fixed |
| 20 | Historical records lacking explicit provenance | live Firestore documents | Cannot be determined from repository | Cannot be determined from repository | Do not infer or migrate; inventory live data first | Needs verification |
| 21 | Field ID | server/domain ID generator | Client-derived sequential candidate shown read-only | Client-derived sequential candidate shown read-only | Server-generated; omitted from create payload and read-only after creation | Fixed |
| 22 | Block Farm ID | server/domain ID generator | Editable code/ID | No Android Block Farm creation workflow | Server-generated and immutable; Web shows reference only, Android remains not applicable | Fixed |
| 23 | Crop Year Cycle ID | server cycle creation | Resolved internally from selected Field | Resolved internally from selected Field | Internal/system-generated; users select or see the Crop Year Cycle value, never type its ID | Verified |

## Identifier authority

Field and Block Farm IDs now have the same authority boundary as their records: ordinary clients submit descriptive properties and scoped relationship selections, while the server assigns the canonical identity. The server rejects create/edit identity overrides. Existing historical and `DEV-*` identities are unchanged; reserved development fixtures use a separately gated non-production seed path.

Android Field enrollment was confirmed to be an administrative online workflow. It now waits for the server response and reconciles the returned permanent Field and Crop Year Cycle IDs. Existing operation, audit-report, ticket, mutation, idempotency, and outbox IDs remain system-generated and stable for offline replay; none is exposed as editable record identity.

## Analytics

- Labels aligned: Production Cost, Cost Breakdown, Farm Operations, Crop Progress, and SRA Price Reference use matching meaning and canonical units.
- Values verified: a cross-platform fixture exercises the same role scope, Block Farm, Field, Crop Year Cycle/period, fields, cycles, and operation records. Web and Mobile return deep-equal values for all four operational metric groups.
- Filtering: Crop Year Cycle and Field remain separate dimensions. The selected Field is now applied to crop progress, production cost, cost breakdown, and farm-operations selectors on both platforms.
- Formulas: unchanged. Only scope handling and a Web-only presentation property were aligned.

## Filters and ordering

- Crop Year Cycle: canonical `YYYY-YYYY` storage; display formatting may use an en dash. A Field ID is never appended to the year option.
- Field: independent **All Fields**/single-field choice.
- Operation: independent **All Operations**/single canonical operation choice in archives.
- Archive: both clients use server-scoped, paged reads with Crop Year Cycle, Field, operation, and exact-ID search semantics. **Clear View** only hides the displayed page; **Show Records** returns to page one without deleting or re-archiving data.
- Ordering: operation history and archives are newest-first using domain timestamps and deterministic IDs; time-series data remains chronological and stage lists remain domain-ordered.
- Dates: “Operation Date” is sourced from `performedOn`/the canonical operation date, not `createdAt`. Platform-specific visual formatting remains allowed.

## UI states

- Loading: existing Web and Mobile loading/progress surfaces were retained; no silent mutation path was introduced.
- Empty: equivalent operation, archive, cycle, stage, analytics, and SRA-price empty states retain the same domain meaning even when sentence length differs.
- Error: known server codes now use equivalent friendly client mappings while preserving the code for logs/diagnostics.
- Sync: durable outbox state remains authoritative on Mobile. Offline-save confirmations now say **Unsynced**; server acknowledgments resolve to **Synced**.

## Route/feature inventory

Only equivalent domain functionality is compared; layout and route count are intentionally platform-specific.

| Domain | Web | Android Mobile | Parity note |
| --- | --- | --- | --- |
| Authentication/session | Login and guarded routes | Login, registration, recovery, onboarding, guarded root | Same canonical roles/session meaning |
| Role home/dashboard | Role-aware dashboard | Role-specific Home views | Different layouts, same role vocabulary |
| Field registry/detail | Field registry and detail modal | Field Ops/Home field cards and detail flows | Same Field, Farm Member, area, cycle-owned variety, cycle, and stage semantics |
| Operations | Farm Manager operations and Takeover routes | Farm Member/Farm Manager Field Ops | Same canonical records within role permissions |
| Archive/history | Operations archive tab | Field Ops archive/history | Same filters, ordering, paging, Clear View, and Show Records semantics |
| Analytics | Analytics route | Analytics screen | Same selectors, scope, labels, and units |
| SRA prices | SRA price administration/reference | SRA role home and analytics/reference surfaces | Same canonical fields and units; permissions unchanged |
| Audit/QR | Audit Center, compilation, verifier | QR compilation, display, and scanner | Same audit identity/provenance contract |
| Sync monitoring | Sync route for allowed roles | Sync Monitor | Same sync vocabulary; Mobile retains offline outbox controls |
| Governance/support | Users, support, maintenance | Role-home/profile capabilities only | Platform-specific feature coverage is allowed |

## Database/schema

- Persisted role constants, collection names, and lifecycle enums are unchanged.
- No destructive schema change and no migration.
- Existing explicit fields remain authoritative: `submissionSource`, `isSupplemental`, `amendments`, `status`, `submittedByUserId`, and amendment actor/timestamp fields.
- `presentation` is computed response metadata and is not persisted.
- Direct-read normalizers preserve a missing `submissionSource` instead of manufacturing `MEMBER` provenance. New server-authorized records continue to receive an explicit source.

## Server/API

- `cropCycleOperations` remains the authority for assigning and preserving provenance.
- Operation and archive query services add the same response-only presentation metadata.
- Role/stage/lifecycle/sync display contracts are pure mappings; they do not modify authorization or mutation validation.
- Archive scope, pagination, exact search, and newest-first ordering are unchanged and covered by the server suite.

## Files changed

### Web

- Canonical domain contract: `web/react-app/src/domain/presentationContract.js`
- Provenance and operation detail: `OperationsView.jsx`, `RecentOperationsTable.jsx`
- Analytics/filter parity: `AnalyticsView.jsx`, `AnalyticsFilters.jsx`, `analyticsSelectors.js`
- Role/stage/status/error/unit presentation: auth routing/context, Firestore schema mapper, UI badge, field/audit/user/auth/layout views, price components, and stage constants under `web/react-app/src`

### Mobile

- Canonical domain contract: `mobile/src/domain/presentationContract.js`
- Provenance, archive, details, and sync wording: `FieldOpsScreen.js`, `ManagerHomeView.js`, `HomeScreen.js`, `SyncMonitorScreen.js`
- Analytics/filter parity: `AnalyticsScreen.js`, `AnalyticsComponents.js`, `analyticsSelectors.js`
- Catalogue, role/session normalization, stage/status/error/unit presentation: data store/schema, auth service, navigation, UI components, i18n, and role/auth/profile/planner screens under `mobile/src`

### Server

- Canonical presentation contract: `server/domain/presentationContract.js`
- Response serialization: `operationQueryService.js`, `archiveQueryService.js`
- Provenance authority: `cropCycleOperations.js`
- Canonical role wording and test/support surfaces: schema, routes, resource scope, bootstrap script, and affected tests under `server`

### Shared/domain documentation

- Equivalent Web/Mobile/server contracts are locked by a cross-platform test because React, React Native, and CommonJS cannot safely consume one source file without build coupling.
- Six-stage JSON contracts were aligned in server, Web, and Mobile.
- Existing system/schema/auth/mutation/checklist documentation was updated to the approved role vocabulary.

### Tests

- Added `server/tests/presentation-parity.test.js` with normal, Supplemental, Manager Takeover, Amended, combined, Archived, all-dimensions, and missing-provenance fixtures.
- Strengthened operation-catalogue parity to compare name/category/stage/cost metadata.
- Existing Phase 6, Phase 7, auth, query, runtime, outbox, Crop Year Cycle, archive, and analytics tests remain in the full suites.

## Test results

| Verification | Result |
| --- | --- |
| Server | **PASS — 162/162** |
| Web | **PASS — 20/20** |
| Mobile semantic tests | **PASS — exercised from the server cross-platform suite** |
| Phase 6 parity | **PASS — existing Web/Android serialization and analytics parity tests** |
| Phase 7 security | **PASS — runtime security, scoped reads, role guards, and no client mutation regressions** |
| Sync/outbox | **PASS — durable queue, conflict, retry, acknowledgment, and field sync badge tests** |
| Runtime stabilization | **PASS — cache, date, ordering, stage, submission, and reconciliation tests** |
| Crop Year Cycle | **PASS — renewal, integrity, filtering, display, and stage contract tests** |
| Analytics parity | **PASS — equal Web/Mobile values for identical canonical field scope** |
| Web production build | **PASS — Vite, 1,772 modules** |
| Android Expo export | **PASS — Android bundle, 1,137 modules** |
| `git diff --check` | **PASS** (line-ending conversion warnings only) |
