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

The document ID is the stable eight-digit HUGPONG user ID.

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

Assignments are not stored on a user. A manager assignment is `block_farms.managerUserId`; a Member Farmer assignment is `fields.memberUserId`.

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

```js
{
  blockFarmId: string,
  memberUserId: string | null,
  areaHa: number,
  variety: string,
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

### `crop_cycles/{cycleId}`

```js
{
  fieldId: string,
  sequenceNumber: number,
  cropType: string,
  cropYear: string,
  currentStageNumber: 1 | 2 | 3 | 4 | 5 | 6,
  elapsedMonths: number,
  batchNumber: number,
  status: "ACTIVE" | "ARCHIVED",
  startedAt: string,
  updatedAt: string,
  archivedAt: string | null,
  archivedByUserId: string | null
}
```

Exactly one ACTIVE cycle may exist for a field, and `fields.currentCycleId` must point to it. A rollover archives that cycle, archives its ACTIVE operation logs, creates the next cycle, and changes only the field's `currentCycleId`.

### `operation_logs/{operationLogId}`

```js
{
  fieldId: string,
  cycleId: string,
  submittedByUserId: string,
  submissionSource: "MEMBER" | "MANAGER_TAKEOVER",
  operationDefinitionId: string,   // SRA catalogue ID or stable custom-operation ID
  operationName: string,           // historical label snapshot
  category: string,
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
  archivedByUserId: string | null
}
```

Only `operationName` is snapshotted from the operation definition because a historical ledger must remain intelligible if a custom plan label changes. No farm/member/actor display names are copied.

### `audit_reports/{auditReportId}`

```js
{
  blockFarmId: string,
  period: string,                   // YYYY-MM
  status: "PENDING" | "CERTIFIED",
  qrHash: string,
  compiledByUserId: string,
  compiledAt: string,
  operationSnapshots: Array<{
    operationLogId: string,
    fieldId: string,
    cycleId: string,
    operationDefinitionId: string,
    operationName: string,
    category: string,
    stageNumber: number,
    performedOn: string,
    areaHa: number,
    peopleCount: number,
    quantity: object | null,
    totalCost: number,
    lineItems: Array<object>
  }>,
  certificationNotes: string,
  certifiedByUserId: string | null,
  certifiedAt: string | null,
  createdAt: string,
  updatedAt: string
}
```

The operation snapshot is the one intentional denormalization: an audit certificate must preserve exactly what the SRA reviewed even if an ACTIVE source log is later amended. Counts, total area, total cost, stage breakdown, farm name, compiler name, and QR payload are derived for display and are not stored twice.

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
  fieldId: string | null,
  title: string,
  category: string,
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT",
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED",
  details: string,
  resolutionNotes: string,
  createdAt: string,
  updatedAt: string,
  resolvedAt: string | null,
  resolvedByUserId: string | null
}
```

### `terminal_diagnostics/{deviceId}`

```js
{
  userId: string,
  model: string,
  operatingSystem: string,
  appVersion: string,
  batteryPercent: number | null,
  pendingOperationCount: number,
  status: "OPTIMAL" | "DEGRADED" | "OFFLINE",
  lastSyncedAt: string | null,
  updatedAt: string
}
```

## 4. Required indexes

Create composite indexes only when the corresponding query is deployed:

- `operation_logs`: `fieldId ASC, cycleId ASC, status ASC, performedOn DESC`
- `audit_reports`: `blockFarmId ASC, period DESC, status ASC`
- `crop_cycles`: `fieldId ASC, sequenceNumber DESC`
- `support_tickets`: `createdByUserId ASC, createdAt DESC`

## 5. Atomic workflow requirements

- Field enrollment creates `fields/{fieldId}` and its first `crop_cycles/{cycleId}` in one server batch.
- Cycle rollover runs in one transaction/batch: archive the current cycle, archive only logs whose explicit `cycleId` matches it and whose status is ACTIVE, create the next cycle, and update `fields.currentCycleId`.
- Audit compilation creates one PENDING `audit_reports` document from an explicit list of ACTIVE logs. It does not modify those logs.
- Audit certification changes only the report and appends an `audit_logs` event. Only an SRA Admin may perform it.

## 6. Forbidden persisted aliases

The canonical writers reject or drop these historical aliases:

- IDs duplicated in fields: `id`, `employeeId`, `reportId`
- Relationship names: `member`, `memberName`, `blockFarm`, `blockFarmName`, `farmManagerName`, `loggedBy`, `certifiedBy`, `compiledBy`
- Log duplication: `activity`, `task`, `taskId`, `cost`, `costPerHa`, `date`, `period`, `isoDate`, `subItems`, `inputQty`, `inputUnit`
- Log pseudo-lifecycles: `isDeleted`, `isPastCycle`, `isArchived`, `approved`, `certified`, `compiled`, `approvalStatus`, `auditStatus`, `compiledReportId`
- Device/local sync state: `synced`, `isOffline`, `cloudQueueStatus`, `lastSync`, `syncLagDays`

Clients may derive compatibility-shaped view data in memory while the UI is incrementally cleaned up, but none of these aliases may be written to Firestore.
