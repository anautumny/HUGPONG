# System-Generated ID Audit

Audit date: 2026-09-24

## Result

Block Farm and Field identities are now issued only by the server in production flows. Existing identifiers are preserved without migration. Web and Android creation forms display that the identifier will be generated automatically, do not compute a candidate, and do not submit one. Edit forms retain the existing identifier as read-only context.

The server uses 80 bits of cryptographic randomness with entity prefixes (`BF-` and `FLD-`) and Firestore create-only writes. This removes sequential client races and prevents a create request from overwriting an existing entity. Ordinary create and edit requests containing `id`, `fieldId`, `blockFarmId` identity aliases, or Block Farm `code` are rejected as applicable.

The only explicit-ID exception is the gated development bootstrap. It requires a non-production process, `HUGPONG_ALLOW_DEV_TEST_ACCOUNTS=true`, and the internal development-seed header. This preserves existing `DEV-*` fixtures without exposing a production manual-ID path.

## Classification inventory

| Identifier | Classification | Authority and behavior |
| --- | --- | --- |
| Block Farm ID / code | Internal system identifier | Server-issued on create; immutable thereafter |
| Field ID | Internal system identifier | Server-issued on create; immutable thereafter |
| Crop Year Cycle ID | Internal system identifier | Server-derived from the permanent Field ID and sequence |
| Operation/log ID | Internal idempotency identifier | Generated once by the offline-capable client, accepted by the server for replay safety, never editable in a form |
| Mutation/outbox ID | Internal idempotency identifier | Generated once on enqueue and reused for all retries |
| Audit report and ticket IDs | Internal offline/idempotency identifiers | Not editable; stable across retries |
| User account ID on provisioning | Internal system identifier | Server-issued for a new account; an existing pending account ID may be selected for approval; development fixtures use the gated seed exception |
| User ID at login/recovery | Legitimate user-entered credential | A user may identify their own account; this is not entity creation or relationship editing |
| Farm Member assignment | Relationship selector | Web and Android select an authorized member by name/contact; the stored relationship remains the stable user document ID |
| Block Farm assignment | Relationship selector | Web and Android select a scoped Block Farm; the stored relationship remains its document ID |

## Offline decision

Actual Android behavior previously allowed a new Field to be written locally and queued before it possessed a server-issued canonical identity. That path was unsafe because the temporary ID also became the Crop Year Cycle relationship. New Field enrollment is therefore explicitly online-only. The server response is reconciled into local Field and Cycle state before the UI reports success.

Existing Field edits and all existing operation/outbox retry flows retain their permanent identities and idempotency behavior. No temporary Field ID, later remapping step, or client-side `max + 1` sequence remains.

## Cross-platform parity matrix

| Surface | Create | Edit / relationship | Status |
| --- | --- | --- | --- |
| Server/API | Generates canonical ID; rejects client identity | Route identity is immutable; relationship IDs validated against scoped entities | Pass |
| Web Block Farm | Shows “Generated automatically”; submits no ID/code | Permanent ID is read-only; manager chosen from authorized options | Pass |
| Web Field | Shows server-generation notice; submits no ID | Existing ID read-only; Block Farm and Farm Member are selectors | Pass |
| Android Field | Requires connectivity and reconciles the returned server ID | Existing ID read-only; Block Farm and Farm Member are selectable entities | Pass |
| Offline operations/outbox | Not applicable to entity creation | Stable operation/mutation IDs survive retries and restart migration | Pass |

## Verification

Automated contracts cover generated format and concurrent uniqueness, manipulated identity rejection, immutable edit route contracts, Web/Android no-manual-ID surfaces, online-only Android enrollment, and unchanged operation/outbox idempotency identifiers.
