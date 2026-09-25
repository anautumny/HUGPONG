# HUGPONG Canonical Firestore Schema

Status: **Final for the schema phase**  
Authority: approved HUGPONG workflows, `AGENTS.md`, and the implemented web/mobile/server features  
Compatibility policy: existing Firestore documents are disposable development data and are not a schema constraint

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

## 2. Relationship model

```text
users/{userId}
   +---- server-only ---- user_credentials/{userId}
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
  displayName: string,
  phone: string,                    // normalized Philippine mobile number
  role: "MEMBER_FARMER" | "FARM_MANAGER" | "SRA_ADMIN" | "SUPER_ADMIN",
  status: "PENDING" | "ACTIVE" | "DISABLED",
  phoneVerifiedAt: string | null,
  requiresPasswordChange: boolean,
  passwordChangedAt: string | null,
  approvedByUserId: string | null,
  approvedAt: string | null,
  createdAt: string,
  updatedAt: string
}
```

Assignments are not stored on a user. A manager assignment is `block_farms.managerUserId`; a Farm Member assignment is `fields.memberUserId`.

`GET /api/users` resolves those canonical relationships after applying the caller's visibility scope. Its response adds a non-persisted `assignment` projection (`status`, type, Block Farm identity, Field identities, and display label). Web and Mobile consume that projection; it is never written back to `users` and does not create a role-specific copy of assignment data.

### `user_credentials/{userId}` — server only

This is the one security-mandated companion collection. Its document ID matches `users/{userId}`.

```js
{
  passwordHash: string,             // versioned scrypt hash with random salt
  createdAt: string,
  updatedAt: string
}
```

Clients cannot read, list, create, update, or delete this collection. Express/Firebase Admin is the only authority for credential verification and mutation.

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
  soilType: string,
  currentCycleId: string,
  status: "ACTIVE" | "ARCHIVED",
  customStages: Array<CustomStage>,
  customOperations: { [stageNumber: string]: Array<CustomOperation> },
  createdAt: string,
  updatedAt: string,
  archivedAt: string | null
}
```

Custom plan objects retain their stable catalogue/custom operation IDs. They are embedded because they are field-specific configuration and have no independent workflow.

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

Exactly one ACTIVE cycle may exist for a field, and `fields.currentCycleId` must point to it. The server generates `cropYear` from the server year only when creating a cycle; stored historical values are never recalculated on January 1. A rollover requires Harvest, rejects duplicate `fieldId + cropYear`, archives the old cycle and its ACTIVE operation logs, creates the next cycle at Stage 1, and atomically changes the field pointer.

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
  operationDefinitionId: string,   // SRA catalogue ID or stable custom-operation ID
  operationName: string,           // historical label snapshot
  category: string,
  variety: string,                 // required only for Stage 2 Planting records
  stageNumber: 1 | 2 | 3 | 4 | 5 | 6,
  performedOn: string,              // YYYY-MM-DD
  areaHa: number,
  peopleCount: number,
  quantity: { value: number, unit: string, inputName: string } | null,
  totalCost: number,
  lineItems: Array<{
    lineItemId: string,
    description: string,
    quantity: number,
    unit: string,
    unitCost: number,
    subtotal: number
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

`cycleId` is the authoritative agricultural-year relationship. New operations also preserve the server-derived `cropYearCycle`, `stageNumberAtRecord`, `blockFarmId`, and Planting `variety` context so offline synchronization and historical analytics never reattach a record to a later cycle. The server rejects canonical operation IDs whose stage does not match `stageNumber`; custom operations must be explicitly configured for that field/stage (or use the generic `CUSTOM` ID).

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
  qrSchemaVersion: 1,
  integrityAlgorithm: "SHA-256",
  compiledByUserId: string,
  compiledByName: string,
  compiledAt: string,
  operationCount: number,
  fieldCount: number,
  hectaresAudited: number,
  totalCost: number,
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

The operation snapshot is the intentional denormalization that preserves exactly what the SRA reviewed even if an ACTIVE source log is later amended. Summary values are stored with the immutable snapshot for bounded Inbox and History list reads. The QR image itself is not stored: clients regenerate it from a compact, versioned transport payload. `PENDING` is read as legacy `PENDING_REVIEW`; new writes use only the canonical statuses above.

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
