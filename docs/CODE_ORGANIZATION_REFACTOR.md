# Code Organization Refactor

This refactor changes module boundaries only. It does not alter the canonical schema, API authority, role access, crop-cycle lifecycle, outbox behavior, or visible UI design.

> Historical note: the web `core-*` boundaries described below were the Phase 8 extraction checkpoint. Phase 9 subsequently migrated those responsibilities into `web/react-app/src/{services,domain,features}` and removed the legacy scripts. The mobile boundaries remain current.

## Module boundaries

- `web/shared/core-platform.js` owns web session persistence, authenticated API access, local replica initialization, Firestore read listeners, and shared platform UI utilities. `web/shared/core-dashboard.js` owns Super Admin overview and analytics rendering. `web/shared/core-operations.js` owns Farm Manager monitoring, takeover, operation editing, and field-plan controllers. `core.js` retains navigation and the remaining regulatory/administrative workspaces.
- `mobile/src/domain/dataRules.js` owns pure cross-entity transformations used by the mobile store: dates, log deduplication, stable field IDs, identity matching, price ordering, names, and SRA week labels. `dataStore.js` retains mutable replica state and server/outbox orchestration.
- `mobile/src/domain/fieldOperations.js` owns agronomy configuration, crop-stage derivation, field visibility rules, audit-month selection, and operation-log classification.
- `mobile/src/components/field-ops/CompactLogItem.js` owns the reusable operation-log card presentation.
- `mobile/src/screens/fieldOpsStyles.js` owns screen-specific styles. `FieldOpsScreen.js` retains screen state, event wiring, and composition.

## Baseline verification after each extraction

| Extraction | Server/security/lifecycle/outbox baseline | Client validation | Result |
| --- | --- | --- | --- |
| Web platform layer | 55/55 tests | Both web scripts passed `node --check`; every role page loads `core-platform.js` before `core.js` | Passed |
| Web dashboard/analytics | 58/58 tests | All three web scripts passed `node --check`; every role page preserves module load order | Passed |
| Web field operations | 58/58 tests | All four web scripts passed `node --check`; every role page preserves module load order | Passed |
| Mobile data rules | 55/55 tests | Android Expo production export | Passed |
| Field Operations domain | 55/55 tests | Android Expo production export | Passed |
| SRA operations catalogue | 58/58 tests | Android Expo production export | Passed |
| Compact log component | 55/55 tests | Android Expo production export | Passed |
| Field Operations styles | 55/55 tests | Android Expo production export; web scripts rechecked | Passed |

`git diff --check` also passed at every checkpoint. The characterization tests that inspect web source were updated to follow the new platform module rather than assuming all implementation remained in `core.js`.

## Manual-checklist boundary

Firestore remains deliberately empty following the controlled development reset, and the explicit development bootstrap was not run during this behavior-preserving refactor. Consequently, checklist scenarios requiring four live accounts, fields, operations, audit reports, prices, or two-device interaction were not repopulated or manually replayed. Their server-side invariants remain covered by the automated baseline. A full visual/role walkthrough requires the separate explicit development bootstrap documented in `DEVELOPMENT_AUTH_RBAC_TESTING.md`.
