# HUGPONG Canonical Firestore Schema

Status: **Final for the schema phase**  
Authority: approved HUGPONG workflows, `AGENTS.md`, and the implemented web/mobile/server features  
Compatibility policy: existing records must pass the Phase 4 legacy-data audit and safe identifier backfill; production records are never assumed disposable.

## 1. Invariants

1. A Firestore document ID is the entity ID. The same ID is not repeated in an `id`, `reportId`, `employeeId`, or similar document field.
2. Relationships use stable document IDs. Display names, role labels, farm names, and field names are resolved at read time and are not copied into related documents.
3. All timestamps named `*At` are UTC ISO-8601 strings. Calendar dates use `YYYY-MM-DD`; report periods use `YYYY-MM`.
4. Submitted operation logs have exactly one lifecycle field: `status: ACTIVE | ARCHIVED`.
5. A log is archived only by an explicit archive/rollover mutation. Neither its ID, operation date, cycle sequence, report membership, nor any boolean flag determines lifecycle.
6. Archiving never changes `fieldId` or `cycleId`. The original crop-cycle identity is permanent.
7. `isDeleted`, `isPastCycle`, `isArchived`, `approved`, `certified`, `compiled`, and approval/certification status values are forbidden on `operation_logs`.
8. Farm Managers record, monitor, amend, and compile operations; they do not approve operation logs.
9. SRA certification exists only on `audit_reports`. Certification never mutates an operation log's lifecycle.
10. Unsaved drafts and offline outbox state are client-local data, not Firestore collections or fields.
11. Authentication is server-authoritative. Public `users` documents never contain passwords, password hashes, salts, reset tokens, or other credential material.
12. Password hashes exist only in `user_credentials`, which is accessible through Firebase Admin on the server and denied to all Firestore client SDKs.
13. User, Block Farm, Field, and Crop Year Cycle document IDs are server-issued and immutable. Relationship forms select scoped entities; they never accept a new canonical document ID as user input.
14. Offline-capable operation, report, ticket, and mutation IDs are non-editable idempotency identifiers. A client may generate them once, but every retry must reuse the same value.
15. Every account carries an `authVersion`. Password, phone, role, and status changes increment it so old server and Firebase credentials are rejected immediately.
16. `account_identifiers`, `server_sessions`, `security_rate_limits`, `password_recovery_challenges`, `diagnostic_events`, and `backup_operations` are server-only operational collections. Web and Mobile never read or write them directly.
17. A normalized phone number is reserved atomically in `account_identifiers` when an account is created or its phone changes. This prevents concurrent requests from creating duplicate login identifiers.
18. Every Firestore collection is client-denied. Web and Mobile access application data only through the authenticated Express API; Firebase Admin is the sole database authority.
19. Request objects are never written directly. The server validates transport structure first and then constructs each Firestore document through collection-specific canonicalizers; unknown fields are discarded or rejected before persistence.

## 2. Relationship model

```text
users/{userId}
   +---- server-only ---- user_credentials/{userId}
   +---- server-only ---- account_identifiers/{sha256(normalizedPhone)}
   ^                    ^
   | memberUserId       | managerUserId
fields/{fieldId} --> block_farms/{blockFarmId}
   |
   | fieldId                         actorUserId
   +--> crop_cycles/{cycleId}        users/{userId}
          ^       ^                         ^
          |       | cycleId                 | compiledByUserId / certifiedByUserId
          |       +-- operation_logs/{operationLogId}
          |                         |
          +-------------------------+ operation snapshot
                                    v
                              audit_reports/{auditReportId}
```

`crop_cycles` is necessary because rollover and historical cycle identity are implemented workflows. Other formerly referenced persistence names—`draft_logs`, `assignment_requests`, `sync_operations`, and `system_history`—are not canonical Firestore collections.

## 3. Collections

### `users/{userId}`

The document ID is the stable eight-digit HUGPONG user ID issued by the server. Supplying an ID is valid only when approving an existing pending account; provisioning a new account does not accept a caller-chosen ID.

```js
{
  firstName: string,
  middleName: string | null,
  lastName: string,
  suffix: string | null,
  displayName: string,
  phone: string,                    // normalized Philippine mobile number
  role: "MEMBER_FARMER" | "FARM_MANAGER" | "SRA_ADMIN" | "SUPER_ADMIN",
  status: "PENDING" | "ACTIVE" | "DISABLED",
  requestedBlockFarmId: string | null,   // member-supplied request during registration
  affiliatedBlockFarmId: string | null,  // SRA-confirmed farm affiliation; not a field assignment
  phoneVerifiedAt: string | null,
  requiresPasswordChange: boolean,
  passwordChangedAt: string | null,
  authVersion: number,                // starts at 1; incremented on security changes
  credentialsUpdatedAt: string,
  disabledAt: string | null,
  approvedByUserId: string | null,
  approvedAt: string | null,
  createdAt: string,
  updatedAt: string
}
```

The server derives `displayName` from the structured name fields. Legacy documents may temporarily contain only `displayName`; clients preserve those records until an administrator updates the structured identity.

`affiliatedBlockFarmId` records the Block Farm confirmed during onboarding so the responsible Farm Manager can see the member before a plot exists. It does not grant access to farm records and is not a field assignment. A manager assignment remains `block_farms.managerUserId`; a Farm Member plot assignment remains `fields.memberUserId`.

`GET /api/users` resolves those canonical relationships after applying the caller's visibility scope. Its response adds a non-persisted `assignment` projection (`status`, type, Block Farm identity, Field identities, and display label). Web and Mobile consume that projection; it is never written back to `users` and does not create a role-specific copy of assignment data.

### `user_credentials/{userId}` — server only

This is the credential companion collection. Its document ID matches `users/{userId}`.

```js
{
  passwordHash: string,             // versioned scrypt hash with random salt
  credentialsUpdatedAt: string,
  createdAt: string,
  updatedAt: string
}
```

Clients cannot read, list, create, update, or delete this collection. Express/Firebase Admin is the only authority for credential verification and mutation.

### `account_identifiers/{identifierHash}` — server only

This collection holds atomic uniqueness claims. Phone document IDs are one-way SHA-256 digests of the normalized number and never expose the phone itself.

```js
{
  type: "PHONE",
  userId: string,
  createdAt: string,
  updatedAt: string
}
```

The claim is created in the same batch as `users`, `user_credentials`, and the account audit event. Phone changes replace the claim in the same transaction as the user update.

Accounts created before this invariant are handled by the dry-run-first Phase 4 migration. It creates only missing, unambiguous claims and refuses duplicate phones, conflicting claims, malformed phones, and orphaned reservations. See `PHASE_4_LEGACY_DATA_MIGRATION.md`.

### `server_sessions/{sessionId}` — server only

Production browser sessions are stored here by Express. Records contain the serialized HttpOnly session, an expiry timestamp/epoch, and an update timestamp. Firestore client access is always denied. The production server's bounded operational cleanup removes records whose `expiresAt` has passed.

### `security_rate_limits/{limitId}` — server only

Authentication, OTP, password-verification, account-creation, and SMS throttles are persisted here so multiple API instances enforce one shared limit. Verification-code send records include `count`, `windowEndsAtMs`, and `lastAcceptedAtMs`; registration, first-login verification, and password recovery allow at most three accepted code requests with at least 60 seconds between sends. The third accepted send starts a full one-hour lock. IDs are SHA-256 digests of the limiter namespace and normalized request key; raw passwords and OTP values are never stored.

Login throttle records use the same server-only collection. Independent
15-minute windows limit an IP to 30 attempts, a normalized account identifier
to 10 attempts, and an IP/account pair to 5 attempts. A successful credential
verification clears the account and pair records but does not erase the IP
traffic budget. Web and Mobile may cache the server-issued lock expiry only to
restore enforcement after restart; user-facing surfaces do not reveal the
remaining lock duration. High-volume generic request limits are deliberately
kept in a bounded in-memory gateway store so rejected bot traffic does not
produce a Firestore read/write for every request.

Each persistent limiter record has a server-owned `deleteAfter` value. The
production cleanup removes it after the enforcement window and one-day
retention period have elapsed.

### `password_recovery_challenges/{challengeId}` — server only

Forgot-password codes and reset grants are persisted here so recovery remains authoritative across API instances and restarts. Raw SMS codes and reset tokens are never stored; the server stores HMAC digests, expiry/attempt state, the account's issuance-time `authVersion`, and one-time-use status. Successful recovery atomically updates `user_credentials`, increments the user's `authVersion`, consumes the challenge, and writes an audit event. Firestore client access is always denied. The production cleanup removes challenges after their server-owned `deleteAfter` value has passed.

### `block_farms/{blockFarmId}`

`blockFarmId` is issued by the server as `BF-` plus a cryptographically random suffix. `code` is the same permanent public reference for new records. Existing IDs/codes remain unchanged.

```js
{
  code: string,
  name: string,
  location: string,
  declaredAreaHa: number,
  managerUserId: string | null,
  status: "ACTIVE" | "ARCHIVED",
  createdAt: string,
  updatedAt: string,
  archivedAt: string | null
}
```

### `fields/{fieldId}`

`fieldId` is issued by the server as `FLD-` plus a cryptographically random suffix. Existing IDs remain unchanged. Android enrollment is online-only so no temporary Field or Cycle relationship is persisted before the permanent ID exists.

```js
{
  blockFarmId: string,
  memberUserId: string | null,
  areaHa: number,
  currentCycleId: string,
  status: "ACTIVE" | "ARCHIVED",
  customStages: Array<CustomStage>,
  customOperations: { [stageNumber: string]: Array<CustomOperation> },
  operationSchedule: Array<{
    id: string,
    cycleId: string,
    operationDefinitionId: string,
    operationName: string,
    childOperationDefinitionId: string | null,
    childOperationName: string,
    stageNumber: 1 | 2 | 3 | 4 | 5 | 6 | null,
    plannedDate: "YYYY-MM-DD",
    estimatedLabor: number,
    estimatedMaterials: number,
    estimatedOther: number,
    estimatedTotal: number,
    notes: string,
    createdByUserId: string,
    createdAt: string,
    updatedAt: string,
    completedOperationLogId: string | null,
    completedAt: string | null
  }>,
  createdAt: string,
  updatedAt: string,
  archivedAt: string | null
}
```

`soilType` is no longer part of the Field contract. New writes omit it, API reads exclude legacy values, and the server removes a legacy value when that Field is next updated.

Custom plan objects retain their stable catalogue/custom operation IDs. They are embedded because they are field-specific configuration and have no independent workflow.

`operationSchedule` stores planning records, not actual work. New Planner rows are intentionally free-form: they use `operationDefinitionId: "CUSTOM"`, a required `operationName`, and no fixed `stageNumber`. The crop stage is selected later when the user turns the plan into a Field Operations draft and records what actually happened. Every row remains linked to the Crop Year Cycle in which it was planned. The active planner displays only rows for the Field's `currentCycleId`; rows from earlier cycles remain immutable history after rollover. Older catalogue-based schedule rows remain readable for compatibility but are no longer offered by the Planner. Estimated labor, materials, and other amounts are optional planning values and never populate actual operation costs. When an ACTIVE operation log is created, the server atomically marks the nearest matching incomplete schedule row with `completedOperationLogId` and `completedAt`; custom operations must also match by activity name. Completed schedule history cannot be edited, removed, or reassigned through the planner endpoint.

The Planner and its reminders are Mobile-only conveniences and do not add a second database record or mutation authority. Mobile derives today, tomorrow, and overdue reminders from the same server-validated `operationSchedule`. It schedules grouped local device alerts for 6:00 PM on the preceding day and 7:00 AM on the planned day, then replaces those alerts whenever the authoritative schedule changes. Completed and removed plans are excluded automatically. Web does not expose a Planner route or reminder interface.

Legacy field documents may still contain `variety`. It is read-only compatibility data: new field writes do not create or update it, and no migration copies it into a new Crop Year Cycle.

### `crop_cycles/{cycleId}`

```js
{
  fieldId: string,
  blockFarmId: string,
  farmMemberId: string | null,
  sequenceNumber: number,
  cropType: string,
  variety: string,                 // empty until established by a Planting operation
  cropYear: string,
  cropYearStart: number,
  cropYearEnd: number,
  currentStageNumber: 1 | 2 | 3 | 4 | 5 | 6,
  elapsedMonths: number,
  batchNumber: number,
  status: "ACTIVE" | "ARCHIVED",
  startedAt: string,
  updatedAt: string,
  archivedAt: string | null,
  archivedByUserId: string | null,
  completedAt: string | null
}
```

Exactly one ACTIVE cycle may exist for a field, and `fields.currentCycleId` must point to it. The server generates `cropYear` from the server year only when creating a cycle; stored historical values are never recalculated on January 1. `completedAt` is set by the authoritative stage endpoint only when Stage 6 is explicitly completed; clients may display an offline completion as pending until that mutation is accepted. A rollover requires Harvest, rejects duplicate `fieldId + cropYear`, archives the old cycle and its ACTIVE operation logs, creates the next cycle at Stage 1, and atomically changes the field pointer.

Sugarcane variety is owned by the Crop Year Cycle. A new cycle starts with an empty value. Its first Planting-stage operation establishes the value atomically from the system's authoritative PHIL variety catalogue; a later correction requires an operation amendment and never changes an archived or later cycle.

### `operation_logs/{operationLogId}`

```js
{
  fieldId: string,
  cycleId: string,
  blockFarmId: string | null,
  cropYearCycle: string | null,    // immutable display/offline snapshot
  stageNumberAtRecord: number | null,
  submittedByUserId: string,
  submissionSource: "MEMBER" | "FIELD_OWNER" | "MANAGER_TAKEOVER",
  operationDefinitionId: string,   // parent SRA catalogue ID (for example SRA-08) or stable custom-operation ID
  parentOperationDefinitionId: null, // retained only for reading legacy flattened child records
  childOperationDefinitionId: string | null, // selected child under the parent, or CUSTOM
  childOperationName: string,      // child label snapshot; parent title remains operationName
  operationName: string,           // historical label snapshot
  category: string,
  variety: string,                 // required only for Stage 2 Planting records
  stageNumber: 1 | 2 | 3 | 4 | 5 | 6,
  performedOn: string,              // YYYY-MM-DD
  areaHa: number,
  peopleCount: number,
  quantity: { value: number, unit: string, inputName: string } | null,
  baseCost: number,                // direct operation cost; excludes itemized expenses and labor
  totalCost: number,
  lineItems: Array<{
    lineItemId: string,
    itemType: "MATERIAL" | "EXPENSE" | "EQUIPMENT",
    description: string,
    quantity: number,
    unit: string,
    unitCost: number,
    subtotal: number
  }>,
  laborEntries: Array<{
    laborEntryId: string,
    workerCount: number,
    days: number,
    rate: number,
    subtotal: number               // workerCount * days * rate
  }>,
  isSupplemental: boolean,
  amendments: Array<{
    amendmentId: string,
    amendedByUserId: string,
    reason: string,
    amendedAt: string,
    changes: { [fieldName: string]: { before: unknown, after: unknown } }
  }>,
  status: "ACTIVE" | "ARCHIVED",
  createdAt: string,
  updatedAt: string,
  archivedAt: string | null,
  archivedByUserId: string | null,
  archivedReason: "CYCLE_COMPLETED" | null
}
```

`cycleId` is the authoritative agricultural-year relationship. New operations also preserve the server-derived `cropYearCycle`, `stageNumberAtRecord`, `blockFarmId`, and Planting `variety` context so offline synchronization and historical analytics never reattach a record to a later cycle. In Itemized Costs mode, each material or expense row is submitted or drafted as a separate log under the unchanged parent operation title. The record stores the parent `operationDefinitionId`, the selected row ID in `childOperationDefinitionId`, the row description in `childOperationName`, exactly one matching `lineItems` entry, and any labor details attached to that selected row in `laborEntries`; `baseCost` is zero for that itemized record. Labor is never submitted as a separate child. Direct Input remains one whole-operation submission without child metadata. Legacy IDs such as `SRA-08-1` remain readable for existing records, but new records never rename the parent SRA title. `totalCost` must equal `baseCost + lineItems subtotals + laborEntries subtotals`; each labor subtotal is `workerCount * days * rate`, and labor is never counted again as an expense line. New inputs use the standardized units `ha`, `m²`, `bag`, `kg`, `L`, `ton`, `lac`, `pass`, `day`, `worker`, and `trip`, while legacy aliases are normalized at the API boundary.

### `audit_reports/{auditReportId}`

```js
{
  rootReportId: string,             // stable Block Farm + period identity
  reportVersion: number,
  previousVersionId: string | null,
  blockFarmId: string,
  blockFarmName: string,            // snapshot display name
  periodKey: string,                // YYYY-MM
  status: "COMPILED" | "PENDING_SUBMISSION" | "PENDING_REVIEW" | "RETURNED" | "CERTIFIED",
  integrityHash: string,
  qrHash: string,                   // compatibility alias for integrityHash
  qrSchemaVersion: 3,
  integrityAlgorithm: "SHA-256",
  compiledByUserId: string,
  compiledByName: string,
  compiledAt: string,
  operationCount: number,
  fieldCount: number,
  memberCount: number,
  hectaresAudited: number,
  totalCost: number,
  sourceLogIds: Array<string>,
  operationSnapshots: Array<{
    operationLogId: string,
    fieldId: string,
    cycleId: string,
    operationDefinitionId: string,
    operationName: string,
    category: string,
    variety: string,
    stageNumber: number,
    performedOn: string,
    areaHa: number,
    peopleCount: number,
    quantity: object | null,
    totalCost: number,
    lineItems: Array<object>
  }>,
  fieldSnapshots: Array<{
    fieldId: string,
    memberId: string | null,
    memberName: string | null,
    areaHa: number,
    cropYearCycle: string | null,
    cycleId: string | null,
    operationLogIds: Array<string>,
    operationCount: number,
    totalCost: number
  }>,
  deliveryMethod: "CLOUD" | "QR" | null,
  deliveryStatus: "READY" | "SUBMITTED" | "RECEIVED",
  submittedAt: string | null,
  submittedByUserId: string | null,
  submissionMethod: "CLOUD" | "QR" | null,
  submissionMethods: Array<"CLOUD" | "QR">,
  returnReason: string,
  returnedByUserId: string | null,
  returnedAt: string | null,
  certificationNotes: string,
  certifiedByUserId: string | null,
  certifiedByName: string,
  certifiedAt: string | null,
  certifiedReportVersion: number | null,
  certifiedIntegrityHash: string | null,
  createdAt: string,
  updatedAt: string
}
```

The operation and field snapshots intentionally preserve exactly what the SRA reviewed even if an ACTIVE source log or assignment is later amended. Summary values are stored with the immutable snapshot for bounded Inbox and History list reads. The QR image itself is not stored: clients regenerate a compressed version-3 single-QR transfer containing the complete canonical report. If the compressed report exceeds safe QR capacity, QR generation is blocked and Cloud delivery is required; data is never truncated. `PENDING` is read as legacy `PENDING_REVIEW`; new writes use only the canonical statuses above.

### `audit_logs/{auditEventId}`

```js
{
  eventType: string,
  actorUserId: string,
  entityType: "USER" | "BLOCK_FARM" | "FIELD" | "CROP_CYCLE" | "OPERATION_LOG" | "AUDIT_REPORT" | "SRA_PRICE" | "SUPPORT_TICKET",
  entityId: string,
  details: string,
  outcome: "SUCCESS" | "FAILURE",
  createdAt: string
}
```

### `sra_prices/{pricePublicationId}`

```js
{
  effectiveDate: string,
  weekLabel: string,
  sugarPricePerLkg: number,
  sugarPriceChange: number,
  molassesPricePerMetricTon: number,
  molassesPriceChange: number,
  circularNumber: string,
  source: string,
  publishedByUserId: string,
  publishedAt: string
}
```

For new publications, `sugarPriceChange` and `molassesPriceChange` are calculated by the server transaction from the preceding persisted record by `effectiveDate`. Client-supplied change values are ignored. The earliest chronological record uses `0` for both values.

### `support_tickets/{ticketId}`

```js
{
  createdByUserId: string,
  requesterName: string,
  requesterRole: "MEMBER_FARMER" | "FARM_MANAGER" | "SRA_ADMIN",
  blockFarmId: string | null,
  fieldId: string | null,
  operationId: string | null,
  auditReportId: string | null,
  title: string,
  category: string,
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT",
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED",
  details: string,
  messages: Array<{
    messageId: string,
    authorUserId: string,
    authorName: string,
    authorRole: string,
    visibility: "PUBLIC",
    content: string,
    createdAt: string
  }>,
  statusHistory: Array<{
    from: string | null,
    to: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED",
    changedByUserId: string,
    changedByRole: string,
    changedAt: string
  }>,
  resolutionNotes: string,
  createdAt: string,
  updatedAt: string,
  resolvedAt: string | null,
  resolvedByUserId: string | null,
  closedAt: string | null,
  closedByUserId: string | null
}
```

`PENDING_SUBMISSION` is deliberately not a Firestore ticket status. It exists only in a client cache while the stable-ID create mutation remains in that client's Outbox. Canonical persistence changes the client copy to `OPEN`.

### `terminal_diagnostics/{deviceId}`

```js
{
  schemaVersion: 2,
  userId: string,
  deviceId: string,                 // server-derived owner/platform/install hash
  platform: "WEB" | "MOBILE",
  model: string,
  os: string,
  appVersion: string,
  lastLoginAt: string | null,       // server ISO timestamp; activity only
  lastActiveAt: string | null,      // server ISO timestamp; activity only
  lastPlatform: "WEB" | "MOBILE",
  activityReportedAt: string | null,
  lastSuccessfulSyncAt: string | null,
  pendingMutationCount: number,
  failedMutationCount: number,
  syncState: "UP_TO_DATE" | "PENDING_SYNC" | "SYNCING" | "SYNC_FAILED" | "OFFLINE" | "UNKNOWN",
  connectionState: "ONLINE" | "OFFLINE" | "UNKNOWN",
  syncReportedAt: string | null,
  telemetryReportedAt: string | null,
  deleteAfter: timestamp,             // 14 days after the latest report
  createdAt: string,
  updatedAt: string
}
```

`lastActiveAt` and `lastSuccessfulSyncAt` are intentionally independent. A
login/heartbeat never changes sync fields. Pending counts are the last device
reports received by the server; an offline device's unreported AsyncStorage
Outbox cannot be observed remotely. Legacy v1 fields (`cachedLogs`, `status`,
`lastSyncedAt`, `operatingSystem`, and `pendingOperationCount`) are read only as
device-history metadata and never promoted to a successful canonical sync.

### `diagnostic_events/{referenceId}` — server only

```js
{
  referenceId: string,
  timestamp: string,
  level: "ERROR" | "WARN" | "INFO",
  module: string,
  userRole: string,
  platform: "web" | "mobile" | "unknown",
  appVersion: string,
  deviceModel: string,
  deviceOs: string,
  syncStatus: string,
  endpoint: string,                 // sanitized path; identifiers replaced
  method: string,
  statusCode: number,
  errorCode: string,
  source: "SERVER" | "CLIENT" | "CLIENT_TELEMETRY",
  technicalError: string,           // sanitized; no stack trace or secrets
  deleteAfter: timestamp            // 14 days after the event
}
```

This collection is separate from `audit_logs`: the Audit Ledger records meaningful
business and security actions, while Diagnostics records technical failures, sync
issues, database/API problems, and QR failures. Only Firebase Admin writes it and
only the Super Admin web API may read it. Passwords, keys, tokens, credentials,
session secrets, private keys, and unnecessary personal data are prohibited.

Expired sessions, recovery challenges, persistent rate limits, device telemetry,
and diagnostic events are removed by the production server every six hours in
bounded pages. This free-tier cleanup is the active retention mechanism; managed
Firestore TTL is not required.

### `backup_operations/{backupOperationId}` — server only

This collection stores metadata about manual encrypted export, validation, and
missing-record recovery operations. It never stores an archive, encryption
passphrase, password, credential hash, session, or raw diagnostic log.

```js
{
  operation: "EXPORT" | "VALIDATION" | "RESTORE_MISSING",
  status: "READY" | "VALIDATED" | "USED" | "SUCCESS" | "FAILED",
  actorUserId: string,
  createdAt: string,
  completedAt: string | null,
  expiresAt: string | null,          // validation receipt only
  schemaVersion: string,
  documentCount: number,
  archiveByteSize: number,
  archiveSha256: string,             // encrypted archive fingerprint only
  collectionCounts: object | null,
  plan: object | null,
  result: object | null,
  referenceId: string,
  errorCode: string | null
}
```

Backup contents are returned once to the authenticated Super Admin as an
AES-256-GCM encrypted `.hpbak` archive. The logical archive allowlists business
collections and excludes credentials, account-identifier hashes, sessions,
rate limits, recovery challenges, telemetry, diagnostics, and backup metadata.
Recovery is create-only: it recreates documents that are missing and never
overwrites, merges into, or deletes a current document.

## 4. Required indexes

Create composite indexes only when the corresponding query is deployed:

- `terminal_diagnostics` currently requires no composite index; role-scoped
  aggregation uses the automatic single-field `userId` index and bounded `in`
  queries.

- `operation_logs`: `fieldId ASC, cycleId ASC, status ASC, performedOn DESC`
- `audit_reports`: `blockFarmId ASC, compiledAt DESC`
- `audit_reports`: `status ASC, submittedAt DESC`
- `audit_reports`: `status ASC, certifiedAt DESC`
- `crop_cycles`: `fieldId ASC, sequenceNumber DESC`
- `support_tickets`: `status ASC, updatedAt DESC`
- `support_tickets`: `createdByUserId ASC, status ASC, updatedAt DESC`
- `support_tickets`: `category ASC, status ASC, updatedAt DESC`
- `support_tickets`: `createdByUserId ASC, category ASC, status ASC, updatedAt DESC`
- `support_tickets`: `requesterRole ASC, status ASC, updatedAt DESC`
- `support_tickets`: `blockFarmId ASC, status ASC, updatedAt DESC`

## 5. Atomic workflow requirements

- Field enrollment first generates `fieldId` on the server, then creates `fields/{fieldId}` and its first `crop_cycles/{cycleId}` at Stage 1 in one create-only server batch. Variety, a user-selected initial stage, and a client-supplied Field ID are not field-enrollment inputs.
- Cycle rollover requires the caller's `previousCycleId` and runs in one transaction: verify it is still `fields.currentCycleId`, archive that cycle, archive only logs whose explicit `cycleId` matches it and whose status is ACTIVE, create the next cycle at stage 1 with zero elapsed months, and update `fields.currentCycleId`.
- Operation creation, amendment, and stage updates validate the field pointer, cycle status, and canonical stage-operation relation inside their write transaction. Planting variety is written to both the operation snapshot and owning active cycle. A stale device cannot create against, amend, reactivate, or advance an ARCHIVED cycle or operation.
- Field archival is also transactional with archival of its ACTIVE cycle and ACTIVE submitted operations; submitted records remain present with their original `fieldId` and `cycleId`.
- Audit compilation resolves the authenticated manager's canonical Block Farm, re-queries eligible ACTIVE logs, and creates one deterministic `COMPILED` version. It does not submit or modify source logs. If a prior version is certified, only newly eligible operation IDs are included in the next version; the certified snapshot is never overwritten or duplicated.
- Submission is a separate idempotent transition from `COMPILED` to `PENDING_REVIEW`; Cloud and QR update the same report identity.
- Return changes `PENDING_REVIEW` to `RETURNED` with a required reason. Recompilation creates the next version and preserves the returned snapshot.
- Certification revalidates the snapshot integrity hash, changes only `PENDING_REVIEW` to `CERTIFIED`, and appends an `audit_logs` event. Only an SRA Admin may perform it, and final certification requires server acknowledgement.
- Support ticket creation accepts only Farm Member, Farm Manager, and SRA Admin identities. The server snapshots requester identity, canonical tickets start `OPEN`, messages and status changes append history, and only Super Admin may advance `OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED`.

## 6. Forbidden persisted aliases

The canonical writers reject or drop these historical aliases:

- IDs duplicated in fields: `id`, `employeeId`, `reportId`
- Relationship names outside immutable snapshots: `member`, `memberName`, `blockFarm`, `farmManagerName`, `loggedBy`, `certifiedBy`, `compiledBy`
- Log duplication: `activity`, `task`, `taskId`, `cost`, `costPerHa`, `date`, `period`, `isoDate`, `subItems`, `inputQty`, `inputUnit`
- Log pseudo-lifecycles: `isDeleted`, `isPastCycle`, `isArchived`, `approved`, `certified`, `compiled`, `approvalStatus`, `auditStatus`, `compiledReportId`
- Device/local sync state: `synced`, `isOffline`, `cloudQueueStatus`, `lastSync`, `syncLagDays`
- Device/browser-local operation drafts are account-scoped working data. They are never Firestore documents, outbox mutations, sync-count items, analytics inputs, or audit records. Submission revalidates canonical Field ownership and reuses one stable operation ID.

Clients may derive compatibility-shaped view data in memory while the UI is incrementally cleaned up, but none of these aliases may be written to Firestore.
