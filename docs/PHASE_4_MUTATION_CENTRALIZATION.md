# Phase 4 — Server-Authoritative Mutation Boundary

Status: complete as of 2026-09-16.

## Boundary

All canonical Firestore writes are performed by the Express server through the Firebase Admin SDK. Web and mobile retain authenticated Firestore listeners for realtime reads, but the browser and mobile Firebase SDKs have no canonical write permission and no runtime mutation calls.

Local UI cache updates are not authoritative. Mobile offline actions are retained in the existing persistent outbox and replayed through the Express API. Unsaved local drafts may still be discarded locally.

## Client mutation inventory and API destination

| Client workflow previously writing Firestore | Authoritative API |
| --- | --- |
| Field creation and initial crop cycle | `POST /api/fields` |
| Field assignment/profile changes | `PATCH /api/fields/:id` |
| Field archival, including its ACTIVE cycle and logs | `POST /api/fields/:id/archive` |
| Custom field stages | `PUT /api/fields/:id/custom-stages` |
| Custom field operations/full plan | `PUT /api/fields/:id/custom-operations` |
| Crop-stage progression | `PATCH /api/crop-cycles/:id/stage` |
| Crop-cycle rollover and ACTIVE log archival | `POST /api/crop-cycles/:fieldId/rollover` |
| Submitted member or manager-takeover operation | `POST /api/logs` |
| Operation amendment | `PATCH /api/logs/:id` |
| Operation archival | `POST /api/logs/archive` |
| Audit report compilation | `POST /api/audit-reports` |
| SRA report certification | `POST /api/audit-reports/:id/certify` |
| SRA price publication | `POST /api/prices` |
| Support-ticket creation/triage/closure | `POST /api/tickets`, `PATCH /api/tickets/:id` |
| User approval/provisioning/profile/status | `POST /api/users/approve`, `PATCH /api/users/:userId` |
| Block-farm creation/update/manager assignment | `POST /api/block-farms`, `PUT /api/block-farms/:id` |
| System audit event | `POST /api/audit-events` |
| Mobile terminal health | `PUT /api/terminal-diagnostics/:deviceId` |

The removed write sites covered the web database-wide background uploader and individual web handlers, plus mobile `dataStore`, `FieldOpsScreen`, `syncEngine`, and terminal telemetry. The web Firebase surface now exports read/listener primitives only.

## Server enforcement

- Member Farmers can record, amend, or archive only their own submitted operations on their assigned ACTIVE field and current ACTIVE crop cycle.
- Farm Managers can mutate fields, crop cycles, operations, reports, and Member Farmer accounts only inside their assigned block farm.
- SRA Admin owns price publication and audit-report certification. Audit certification remains separate from operation lifecycle.
- Super Admin owns support-ticket triage and may perform the explicitly permitted registry administration workflows.
- Field assignment rejects an ACTIVE Member Farmer assignment crossing block-farm scope.
- Support tickets with a `fieldId` are validated against the actor's field scope.
- Submitted operations have only `ACTIVE` and `ARCHIVED`; the API exposes archival, not deletion or purge.
- Client retries use stable IDs. Operation creation/amendment, fields, prices, tickets, audit events, reports, and crop-cycle rollover have replay handling to avoid duplicate server mutations.

## Firestore writes that remain

No direct client Cloud Firestore write intentionally remains.

Firebase Admin SDK writes remain in Express route handlers for the collections they own. They are the intended centralized persistence mechanism and bypass client rules only after API authentication, role checks, validation, and resource-scope checks.

`firestore.rules` denies client create/update/delete/write access for every canonical collection, including `users`, `block_farms`, `fields`, `crop_cycles`, `operation_logs`, `audit_reports`, `audit_logs`, `sra_prices`, `support_tickets`, and `terminal_diagnostics`. `user_credentials` remains completely inaccessible to clients.

## Offline behavior

This paragraph records the Phase 4 checkpoint behavior and is superseded by [Phase 6 — Explicit Mutation Outbox](./PHASE_6_MUTATION_OUTBOX.md). Mobile now persists an explicit mutation before attempting the API call; reconnect sync flushes only those envelopes. Realtime listeners replace local replicas and never infer uploads from cached records.

## Verification

- `npm test` in `server`: 13/13 passing.
- Android Expo production export: passed (1,120 modules bundled).
- JavaScript syntax checks: passed for modified web, mobile service/data, and server files.
- Repository search: no invocation of `setDoc`, `addDoc`, `updateDoc`, `deleteDoc`, or `writeBatch` under `web` or `mobile/src`.
- Regression tests now fail if a direct client Firestore mutation call is reintroduced or if a canonical Firestore collection permits client writes.
