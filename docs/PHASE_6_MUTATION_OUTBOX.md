# Phase 6 — Explicit Mutation Outbox

Status: implemented and verified on 2026-09-17.

## Authority boundary

- Firestore is the canonical cloud state.
- Express is the only authority that accepts persistent client mutations.
- Firestore listeners are read-only replica feeds. A document missing from a snapshot is never interpreted as an upload request.
- Mobile AsyncStorage contains a local replica, local drafts, and the explicit mutation outbox. Replica records and drafts do not enter the outbox automatically.
- The web client continues to send explicit online commands to Express. It does not upload cached records or write directly to Firestore.

## Mobile mutation flow

1. A user action creates one mutation envelope and persists it to `@hugpong_outbox` before any network request.
2. The envelope contains a stable `mutationId`/`idempotencyKey`, mutation type, canonical payload, entity key, base version, dependency ID, and retry/conflict state.
3. The UI may apply an optimistic local view. Pending submitted operations are overlaid only from explicit queued create mutations.
4. `flushOutboxToApi` sends the exact queued mutation through the matching authenticated Express endpoint.
5. Successful mutations are removed from the outbox. Retryable failures remain with the same idempotency key. HTTP 409 responses remain as explicit conflict records and are not retried automatically.
6. A realtime Firestore snapshot replaces the corresponding canonical local replica. It never creates a mutation.

Reconnect and manual sync call only the outbox flusher. The former broad `/api/crop-cycles`, `/api/fields`, and `/api/logs` whole-state refresh in `performMobileSync` was removed.

## Ordering and conflict rules

- Mutations for the same entity are FIFO dependencies. A dependent mutation waits for its predecessor.
- After a predecessor succeeds, its authoritative `updatedAt` becomes the dependent mutation's `baseVersion`.
- Express compares supplied base versions inside the protected field, crop-cycle, operation-log, and audit-certification paths.
- A stale base version returns HTTP 409 with the current server version/state.
- Operation creation uses a stable operation ID. Amendments use stable amendment IDs. New Field enrollment is deliberately outside the outbox because no canonical Field/Cycle relationship exists until the server responds; existing Field updates and archives continue to use their permanent ID.
- An `ARCHIVED` operation cannot be amended, recreated as `ACTIVE`, or targeted through a stale archived crop cycle.

## Outbox mutation types

The mobile outbox dispatches explicit field update/archive, crop-stage update, crop-cycle rollover, operation create/amend/archive, price publication, custom stage/operation changes, ticket creation, audit event/report/certification, and user approval commands. New Field enrollment requires connectivity and directly reconciles the server-issued Field and Cycle IDs. Authentication, OTP, session, and telemetry transport are not offline domain mutations and are not persisted in the mutation outbox.

## Verification

Automated coverage verifies:

- offline envelope creation;
- restart migration with the same idempotency key;
- failed mutation retention and reconnect success;
- successful outbox cleanup;
- duplicate-key deduplication and idempotent server replay;
- FIFO dependency version propagation;
- stale-cache exclusion;
- two-device base-version conflict rejection;
- crop-cycle archive persistence and archived-operation resurrection rejection;
- absence of broad lifecycle refresh/upload logic and `localOnly` reconciliation.
