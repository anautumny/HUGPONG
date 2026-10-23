# Operation and Manager Takeover verification

Local verification: 2026-10-23. These fixes are not yet deployed or included in a new APK. Tests use isolated databases and mocked client runtimes, without altering live farm records.

## Database / schema

No schema changes or migration are required. Operations retain their field and Crop Year Cycle identity. Takeover does not transfer field ownership. The server sets the submitter, farm, lifecycle, and submission source. Amendments preserve the original submitter and add the correcting actor, reason, time, and authoritative before/after changes.

## Server / API

Existing operation routes enforce field ownership, manager assignment, signed field/actor-specific takeover grants, active cycles, stage-operation compatibility, field area, costs, lifecycle, and amendment history. Takeover grants expire after five minutes; manager reassignment revokes subsequent writes even with an otherwise valid signed grant.

Tightened grant parsing to require an exact 64-character hexadecimal signature and a bounded token length. Node's hexadecimal decoding previously ignored non-hexadecimal suffixes; malformed tokens are now rejected before signature comparison. Normal grants remain compatible with Web and Mobile.

Behavioral tests run the real operation route middleware and service transactions. They confirm invalid/expired/other-field/other-manager grants make no writes, the actual manager is stamped on takeover records, repeated creation with the same operation ID returns the existing record, and takeover amendments preserve the original member's attribution while recording the manager's correction exactly once.

## Web implementation

The separate `/takeover` page now records grant expiry, clears authorization when the field or account changes, expires the visible authorization after five minutes, and rechecks expiry at submission. A delayed authorization for another selected field is ignored. Its banner no longer claims takeover is active before authorization. Offline takeover submission is stopped, and a synchronous lock prevents duplicate confirmations while saving.

Both the normal operation modal and the separate takeover page now retain a stable operation ID when a request response is lost. Retrying the same submission while its form remains open reuses the ID, including after renewing an expired takeover grant. Concurrent submissions share one request. After confirmed success, a new operation gets a new ID.

If a previous request has an uncertain outcome, changing its details is blocked with an explanation to restore the details and retry or inspect the ledger. A definite initial validation rejection permits correction. This protection is held in the open form; Web does not gain a durable offline operation queue or resume an unfinished form after a full reload.

## Mobile implementation

No Mobile behavior change was needed for this check. Existing behavior uses explicit manager password verification, transient field-scoped authorization, expiry and field/account reset, and blocks offline takeover. Ordinary owner operations retain their local draft/outbox flow and stable operation identity. Takeover does not grant access to another member's personal drafts or Planner.

The shared API receives the same operation records and enforces the same server rules for both platforms. Existing Mobile regression checks cover submission locks, current-stage entry, supplemental work for completed stages, ownership preflight, amendments, offline boundaries, and durable retry identity.

## Remaining acceptance check

After deployment and APK installation, record one ordinary member operation, authorize a manager takeover, record and amend one member-field operation, and inspect the authoritative ledger. Confirm the field owner remains unchanged, manager attribution is visible, expiry requires reauthorization, and going offline blocks takeover. Test a lost response by inspecting the ledger before retrying. Automated tests do not establish physical-device rendering or deployed-account behavior.
