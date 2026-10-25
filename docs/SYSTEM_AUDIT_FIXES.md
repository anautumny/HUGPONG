# System audit fixes — 24 October 2026

This implements the ten findings in `output/HUGPONG_SYSTEM_UI_AUDIT_2026-10-24.md` and the subsequent manager-takeover/offline-queue finding. The work is local source implementation; it has not deployed the API, web application, or mobile builds, and has not changed production data.

Latest release assessment: [25 October deployment readiness](DEPLOYMENT_READINESS_2026-10-25.md). The complete release gate and Android/iOS production exports now pass using the EAS HTTPS API configuration, superseding the earlier development-origin limitation below. Physical-device acceptance and mobile dependency review remain outstanding.

## Database and schema

No collection migration or new index is required. Optional server-owned fields are added incrementally:

- `crop_cycles.operationWriteRevision`: a counter updated inside each operation-creation transaction. A missing counter means zero. Concurrent manager/member creates contend on the same cycle document and repeat duplicate checks on transaction retry.
- `operation_logs.auditLockReportId`: set atomically with new audit compilation and cleared when its matching report is returned. Legacy reports are also checked on the server, so they do not depend on a backfill.
- `operation_logs.reconciliation`: the matching record versions, explicit separate-work reason, authenticated reviewer, and server timestamp. Clients cannot establish the reviewer or timestamp.
- `analyticsEligible`: an API read projection, not a new persisted client authority. Corrected crop-year records contribute to analytics; abandoned reset records remain excluded.

Certified report snapshots and original operation attribution are preserved. Existing missing stage metadata is resolved from the original operation stage on its next permitted correction. This does not rewrite historical certified snapshots or silently repair previously corrupted data.

## Server and API

| Finding | Implemented behavior |
| --- | --- |
| F01 request parser | Override resolves `body-parser` 1.20.9; both JSON parsers explicitly reject compressed bodies with `inflate: false`. Registry audit after installation reports zero server vulnerabilities. |
| F02 certified-source divergence | Operations included in a compiled, pending, or certified report are read-only. A returned report permits source corrections. Compilation rechecks source contents and writes lock pointers atomically; operation read APIs derive legacy lock pointers from reports. |
| F03 corrected analytics | The authoritative operation projection includes `CROP_YEAR_CORRECTED` records and excludes `CROP_YEAR_RESET`. Both clients recognize the same eligibility, including cached legacy records. |
| F04 legacy stage | Amendments persist the resolved original stage instead of the current cycle stage. Repeated corrections after stage advancement remain valid. |
| F05 missing versions | HTTP updates covered by version guards require valid preconditions, including a version for each batch member. Missing/malformed preconditions return 428; stale versions return 409. `UNVERSIONED` is explicit and matches only a record without a stored version. Trusted internal maintenance calls remain separate from HTTP request validation. |
| F06 QR expansion | Client streaming inflation stops above 1 MiB, matching the server's existing inflated-data limit. Encoded envelopes, multipart counts, part sizes, transfer IDs, encodings, and aggregate input are bounded. |
| Takeover/offline collision | Cross-user matching work for the same field/cycle/stage/operation/component and work date, or shared planned-work ID, returns `OPERATION_RECONCILIATION_REQUIRED`. The queued entry retains its identity. Explicit separate-work review must acknowledge the current matching record versions and supply a reason. Normal same-ID retries remain idempotent. |

The takeover rule is a collision check, not a permanent field lock. A manager cannot inspect work that has never left another device. The API reconciles that work when it arrives. Standard predefined components retain their existing single-component replay policy; general/custom work supports explicitly reviewed separate entries. Different actual work dates remain possible without a collision unless they reference the same planned task.

## Web

- Existing record versions are sent for operation edits/archives, field edits/archives, stage changes, cycle approvals, pending-user approval, and audit transitions. Other existing account/farm update guards enforce version checks as well.
- Reported operations expose no edit/archive actions. The server independently enforces the lock.
- Filter draft changes preserve keyboard focus. Escape uses the latest callback/loading state, and closing restores focus to the opener.
- A matching-work conflict survives reload in the saved submission. The user can compare server records, remove the redundant saved copy, or explain separate work. The same submission ID is retained during reconciliation. Successful/replayed responses reconcile using the server's actual record ID.
- Web QR upload/manual lookup uses the same bounded decoder. The web verifier already explains that live camera scanning is available in mobile.

## Mobile

- Versioned writes continue through the durable per-account outbox. Online SRA actions also send a transient version envelope; takeover credentials remain absent from durable storage.
- Sync Monitor retains rejected/conflicting work for review. Matching-work conflicts show saved server records and separate-work review. Other definitively rejected operation changes can be explicitly removed after ledger review. Removing a queued create blocks its dependent edits instead of silently applying them elsewhere.
- Queue review waits for an in-flight drain, preserves concurrent enqueues, and restores the previous queue if a review save fails. Same-ID retry and acknowledged dependency versions remain intact.
- Android Back follows the ledger, operation editor, field selector, assignment form, pending list, stage editor, cycle form, and audit-history views. Editor Back uses the same unsaved-work confirmation as the on-screen button. Native modals retain their own dismissal handlers.
- Permanently denied camera access exposes Open Settings. Returning to the app refreshes camera permission; upload remains available.
- QR-share/archive-filter text and review actions use English, Tagalog, and Hiligaynon dictionaries. Existing camera layouts, compact back controls, single filter entry points, and report-year corrections are retained.

## Validation

- Server: **644 passed, 0 failed** after the second 25 October integration recheck. Includes report immutability, legacy repeated amendments, mandatory/stale versions, takeover collisions, reviewed repeats, compressed-body rejection, bounded client QR decoding, analytics parity, queue save failure/concurrent enqueue, command serialization, current-scope receipt authorization, mobile approval preconditions, planting-stage receipt versions, atomic account approval, and atomic phone verification.
- Web: **46 passed, 0 failed**, including durable conflict/reconciliation tests.
- Production web build: passed.
- Android and iOS development exports: passed after the final source changes.
- Runtime-authority audit: 242 files, zero findings. Secret-exposure audit: 564 files, zero findings. Local non-production configuration audit: passed.
- Physical-device rendering, camera hardware, Android navigation, iOS settings return, and exported-document appearance have not been visually verified in this environment.
- A mobile release export is blocked by the existing development API origin. The release-environment validator remains enabled; development exports validate bundling without claiming a release build.

Logs are under `output/audit-fixes-*.log`; new behavioral regressions are in `server/tests/system-integrity-regressions.test.js`, `server/tests/mobile-ui-pagination.test.js`, and `web/react-app/tests/operation-submission.test.js`.

## Release coordination

Release the matching API/web/mobile changes together. Older clients that omit required versions will receive a reload/upgrade error rather than overwrite a newer record. Preserve their offline queues during upgrades; do not regenerate operation IDs or silently replace their version metadata. Review genuine conflicts after refreshing server records. A production API origin and device smoke checks are still required before distributing a release APK/IPA.

## Integration recheck — 25 October 2026

The second review found four additional gaps that the previous suites did not cover. They were reproduced in isolated fixtures, fixed, and covered with behavioral regressions.

| Issue | Correction |
| --- | --- |
| Mobile cycle approval omitted mandatory version metadata and received HTTP 428 | The mobile approval request now includes its field version and a transient mutation envelope. The web approval path already supplied the version. |
| First Planting submission updated the cycle's variety/version, making the web's following stage update stale | Operation receipts now include server-derived `cycleVersion`. Both web operation-entry paths use that version for the explicit stage request and display a partial-success notice if another change still prevents advancement. Mobile retains its existing canonical refresh flow. |
| A sync started during queue review could join the review promise and return `undefined` | Drains now wait for the distinct review command and return their own sync result. Tests verify that the queued operation is actually sent and acknowledged after review. |
| Same-ID create retries could return a previous operation after its creator lost field access | Receipt replay now checks current field/farm read scope before returning data. An assigned manager may still retrieve an existing receipt after the temporary write grant expires; a reassigned member or manager cannot. The API rule applies to both clients. |

No database migration was needed for these follow-up fixes. `cycleVersion` is response metadata from the existing cycle record, not a client-owned stored field. No production data was changed or code deployed.

Final evidence: `output/recheck-server-tests.log` (636/636), `output/recheck-web-tests.log` (46/46), production web build, Android/iOS development exports, runtime-authority audit, secret-exposure audit, configuration audit, and `git diff --check`. Logs use the `output/recheck-*` prefix. `output/recheck-reproductions.json` records the pre-fix reproductions, not the final behavior.

These checks establish the tested behavior of the local source tree. They do not establish that every possible defect is absent. Release builds, deployed-runtime checks, and physical-device smoke tests remain outstanding.

## Second integration recheck — 25 October 2026

The review of account workflows reproduced a race in pending approval: changing an account to `DISABLED` just before the old approval batch committed still resulted in an `ACTIVE` account. It also reproduced a receipt leak: the manager who originally approved an account could retrieve that account's approval receipt after losing farm scope. The pre-fix evidence is in `output/recheck2-approval-baseline.json`.

The same inspection identified unguarded already-verified phone receipts and phone-verification writes that did not bind the review to an inspected account version. These paths were hardened together.

| Layer | Follow-up changes |
| --- | --- |
| Database/schema | No migration or new persisted fields. Existing user versions and Firestore document update preconditions protect account writes. Farm reads participate in the transaction. |
| Server/API | Approval now rechecks pending status, account version, farm availability, and current manager assignment inside its transaction. Its receipt replay rechecks account scope. Phone verification checks role/scope before returning any receipt, requires the inspected account version before a new verification, and verifies/writes the current account and farm in one transaction. A concurrent change returns 409 without committing a stale approval/verification or its audit event. |
| Web | Phone review sends the selected account's version. Existing API error handling keeps stale/rejected requests unsuccessful and requires refreshed details. |
| Mobile | Phone review sends an explicit version envelope. Approval/verification continue to use server acknowledgement before updating local account state. |

Eight additional behavioral regressions cover account disablement at commit, stale approval versions, manager reassignment, authorized/unauthorized receipt retries, stale/missing phone versions, a phone number changing at commit, and farm reassignment during verification.

Final rerun: **644/644 server tests**, **46/46 web tests**, production web build, Android/iOS development exports, authority/secret/configuration scans, and `git diff --check` all passed. Logs use `output/recheck2-*`. No code was deployed and no production data was changed. Physical-device and deployed-runtime checks remain unperformed.
