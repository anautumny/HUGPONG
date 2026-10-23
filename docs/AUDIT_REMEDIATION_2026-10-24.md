# HUGPONG audit remediation — 24 October 2026

The eight application defects in [the 23 October audit](SYSTEM_AUDIT_2026-10-23.md) have been addressed in the local working tree. This document records the implementation and its limits. The original audit remains a record of the earlier state. No production data repair, deployment, push, or signed APK build was performed.

## Application fixes

| Finding | Result | Regression evidence |
| --- | --- | --- |
| A1: unauthorized role changes | The API checks actor, existing role, and requested role before and inside the transaction. SRA can edit existing Farm Managers without promoting them; managers can edit existing Farm Members within their live assignment. Web edit actions and role choices consume the same policy. | Full role matrix; forbidden promotion and demotion leave the database unchanged. |
| A2: archived plots excluded from monthly reports | The API selects eligible operations by their stored Block Farm and reporting month, independently of current plot status. Archived activity and original recorded cycle remain reportable. Idle fields still do not block compilation. | Compilation after every assigned plot is archived; mixed active/archived records; historical-cycle preservation. |
| A3: stale personnel edits overwrite changes | The account transaction enforces the displayed `_mutation.baseVersion` and returns HTTP 409 with a safe current projection. Web edits and status changes send their displayed version. | A stale edit causes no writes; a matching version succeeds. |
| A4: duplicate farms after retry | Farm creation uses an atomic actor/key/fingerprint receipt. Web retains that request key across uncertain responses and reloads. Same key/details return the original farm; changed details under that key return 409. | Concurrent retries create one farm and replay its original ID. |
| A5: inconsistent manager assignments | Creation requires an active Farm Manager with no existing assignment. Explicit editing can reassign the manager transactionally. Assignment writes touch the manager record so competing assignments participate in transaction conflict detection. Web creation choices disable already assigned managers. | Two competing creates leave one assigned farm; disabled managers are rejected. |
| A6: draft remains locked after restart | Mobile hydration releases abandoned process claims while preserving draft contents and `submittedOperationId`. Web local claims distinguish a live process claim from a restored one. Server/outbox stable operation IDs remain the duplicate boundary. | Restored claims can submit again; an active claim still blocks a second submission. |
| A7: old dismissal suppresses future work | Draft and pending-sync alerts use deterministic event identities based on their underlying records. The same event retains acknowledgement; different work generates a different event. API acknowledgement ownership is unchanged. | Stable IDs across repeated reads and Web/Mobile parity; changed work produces fresh IDs. |
| A8: historic editor attribution changes with the directory | Stored amendment name/role take precedence; the current directory supplies missing legacy values only. Both clients receive this API projection. | Historical name/role remain unchanged after the editor's current profile changes. |

## Additional delivery

- **Complete price history:** `/api/prices` supports bounded cursor pages with a deterministic document-ID tie breaker. Web offers “Load older price records”; Mobile's market screen offers a separate published-history browser with local page controls and remote older-record loading. Recent chart windows remain server projections. A 110-record fixture reaches all records in three pages, with no overlap and correct price differences at page boundaries. Mobile ignores late responses after closing its browser or switching accounts.
- **Operation transport:** current Web and Mobile reads follow `/api/logs?paged=1&limit=100` until complete, then publish the full authorized projection for existing analytics. Each API response is bounded; field scopes are merged without losing ties. Account changes or a non-advancing cursor abort the read. A 1,205-record fixture completes in 13 transport pages. This bounds individual requests, not total history size: clients still retain the complete authorized operation dataset for current analytics.
- **Audit queries:** monthly source selection uses a farm/month range query; next-period discovery scans the farm's recorded history in 200-record query pages and includes archived/moved plots through their stored operation farm identity. Finding the oldest unresolved period still requires examining relevant historical records; paging does not eliminate that total work.
- **Large monthly reports:** compilation selects deterministic batches of at most 500 operations and a 700 KiB serialized snapshot budget. Remaining activity is reported as `remainingOperationCount`. Complete review of the current version, then compile the next version. Certified source-log IDs prevent recapture. Both clients explain remaining activity. A 650-operation fixture produces disjoint 500- and 150-operation versions; oversized individual records fail before saving a report.
- **Web uncertain-write recovery:** operation/takeover attempts persist their original payload and ID in browser storage scoped to account and plot, before sending. Reopening exposes a reviewable “Retry saved operation” action. Grants/passwords are not stored; takeover recovery requires current authorization. Storage failure blocks the write rather than losing its retry identity. The server remains authoritative for permission, validation, and idempotent replay.
- **Notification recovery:** Mobile displays how many local read/delete changes await server confirmation. Offline intents remain persisted until acknowledged. Encrypted backups now include notification state; both older backup manifests remain readable.

## Database / schema

- No business-record migration or destructive repair is required for the code changes.
- Deploy the committed `operation_logs` indexes before enabling the new queries: farm/date range and field/status/document-ID ordering. The latter supports paged scope reads.
- Reuse private `mutation_receipts`, with a separate Block Farm creation namespace. Field enrollment receipt identity remains compatible.
- Manager account records may gain `farmAssignmentUpdatedAt` as transaction coordination metadata. Canonical assignment remains `block_farms.managerUserId`.
- New report metadata `remainingOperationCount` defaults to zero for old reports and is preserved by Server, Web, and Mobile serializers.
- Backup schema is `2026-10-24`; `2026-09-28` and `2026-10-15` archives retain checksum verification and gain empty collections only after verification. Recovery still creates missing documents without overwriting existing ones.
- Existing duplicate assignments or inconsistent accounts were not silently repaired. Determine any affected live records through a separate read-only inventory before choosing corrections.

## Server / API

Authorization, assignment checks, version checks, creation receipts, report selection/batching, attribution, and acknowledgement persistence remain centralized on the API/database. Cursors convey position only; every page re-evaluates the authenticated account's scope.

For installed older APK compatibility, `/api/logs` without `paged=1` keeps its previous response contract, including explicit newest-N reads. Older no-limit consumers therefore retain their earlier full-history cost until updated. Current clients opt into bounded pages. Block Farm creation requires a stable mutation key; Web supplies it. Mobile has no Block Farm creation or general personnel-edit screen to update.

## Web implementation

Personnel actions/roles and expected versions, retained farm creation intents, operation cursor assembly, historical farm report previews, complete price history, report batch notices, and durable uncertain-write recovery are implemented. Existing server mutations continue to invalidate authorized read caches. Administrative backup controls consume the revised manifest without adding a Mobile backup interface.

## Mobile implementation

Draft hydration recovery, event-specific alert identity, pending notification acknowledgement display, bounded operation page assembly, archived report-source previews, complete price-history browsing, and batch notices are implemented. Mobile receives canonical assignment and amendment attribution from the same API. Its existing account approval/status mutations already send expected versions; no unsupported general account editor or farm-creation UI was introduced.

## Dependency status

The [braces advisory was withdrawn on 23 October](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) as not practically exploitable. It no longer appears in the successful current npm audit. The [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) still lists affected releases through 1.4.0 with no patched release. npm currently reports **four high-severity affected-package entries from that one underlying advisory**, in the Expo CLI/code-signing dependency path.

`mobile/scripts/patchForgeVerification.cjs` supplies a temporary, version-guarded mitigation for the reported nested DigestAlgorithm validation flaw. Mobile postinstall applies it; the release gate verifies it is present. Tests accept ordinary signatures, accept valid SHA-256 algorithm identifiers with omitted or NULL parameters, and reject extra nested elements and nonempty NULL parameters, using a low-exponent RSA key. The current lockfile resolves one deduplicated node-forge copy for both affected tooling consumers.

This is a local mitigation, **not an upstream patched release or a clean npm audit**. It does not establish that every possible cryptographic weakness in the dependency is fixed. Replace it with a verified compatible upstream release when available. Do not use npm's suggested Expo 44 downgrade for this Expo 57 project, and do not disable install scripts: builds deliberately fail if this mitigation is missing or the dependency version changes without review. Server/Web dependencies were not changed for this mitigation because this affected installed path is Mobile tooling.

## Validation and release boundary

Full release verification covers deployment configuration, secret-pattern and authority audits, unresolved client bindings, Server/Web tests, Web production build, Android Hermes export, and the dependency-mitigation check. Logs are local under `.tmp/audit-remediation-2026-10-24/`.

Final verification passed with exit code 0: **605 Server tests and 44 Web tests**, zero failures, successful Web production build, and successful Android production export. The final log is `.tmp/audit-remediation-2026-10-24/release-final.log`. The Git whitespace check also passed with Windows line endings accounted for.

The export is not a signed APK or physical-device acceptance test. Before a release, check fresh-install notification permission, QR camera acquisition, account switching, process termination during submission, uncertain-response recovery, older price loading, and archival followed by monthly compilation on staging/devices. Hosting's active Node runtime must also be verified when deployed. These checks have not been represented as completed device or production tests.
