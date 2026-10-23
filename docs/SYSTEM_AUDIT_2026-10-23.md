# HUGPONG system audit — 23 October 2026

**Result: eight reproducible application defects, one confirmed price-history access limitation, and an outstanding Mobile dependency risk.** Two application findings are high priority: unauthorized account-role transitions and exclusion of uncompiled operations after a field is archived. The release gate passes; it does not cover all of the failing scenarios reproduced here.

This is an audit of the current local working tree, including the notification, QR, operation/takeover, monthly-report, and Node changes prepared in this conversation. **No application fixes, dependency changes, data repairs, deployments, or signed APK builds were performed during this audit.** Only this report and ignored audit artifacts were added. The earlier [18 October audit](SYSTEM_AUDIT_2026-10-18.md) remains unchanged.

Five application findings from that earlier audit were rechecked and still reproduce. Three further application defects were confirmed in the current code. Production business records were not inspected to determine whether they already contain affected data. Behavioral probes use isolated in-memory Firestore fixtures or actual extracted client functions with mocked dependencies; they do not establish unauthenticated access or physical-device behavior.

## Verification

| Check | Current result |
| --- | --- |
| Full release verifier | Passed, exit code 0 |
| Server tests | 587 passed |
| Web tests | 41 passed |
| Web production build | Passed |
| Android production bundle export | Passed; not a signed APK or physical-device test |
| Deployment configuration | All 14 required values present; Firebase projects aligned |
| Tracked secret pattern scan | 520 scanned files; zero findings within this scan's coverage |
| Runtime authority pattern scan | 230 scanned files; zero findings within this scan's coverage |
| Unresolved client identifier scan | Zero findings |
| Installed Node runtime | v24.22.1, matching `.node-version` |
| Server production dependency audit | Zero advisory findings |
| Web production dependency audit | Zero advisory findings; development-only dependencies excluded |
| Mobile production dependency audit | 15 high-severity package entries propagated from two underlying advisories |

The npm advisory registry was initially inaccessible in the sandbox. The read-only advisory check was repeated with approved network access. No packages were installed or upgraded.

Artifacts: `.tmp/system-audit-2026-10-23/release.log`, `behavior-probes.cjs`, `behavior-results.json`, `extended-probes.cjs`, `extended-results.json`, `dependency-audit.cjs`, `dependency-summary.json`, and per-application dependency JSON. These artifacts are ignored by Git. Repeat the isolated reproductions from the repository root with:

```powershell
node .tmp/system-audit-2026-10-23/behavior-probes.cjs
node .tmp/system-audit-2026-10-23/extended-probes.cjs
```

The probe scripts intentionally demonstrate the current failures; their successful execution means the observations were reproduced, not that the application defects were fixed. The original probes exercise final route handlers directly after establishing synthetic actors. Role/path access is separately covered by the existing API permission tests and source review.

## Confirmed defects, in priority order

### A1. High — account updates allow unauthorized role transitions

**Locations:** [users.js](../server/routes/users.js#L467), [scope shortcut](../server/routes/users.js#L40).

The PATCH handler checks an SRA Admin's target **existing** role but does not constrain every requested new role. A Farm Manager's check constrains the **requested** role without also requiring the stored target to be a Farm Member. A retained farm affiliation can satisfy the manager's scope shortcut for an account with a higher role.

**Reproduced:** an authenticated synthetic SRA Admin changed an existing Farm Manager into an SRA Admin: HTTP 200, stored role `SRA_ADMIN`. A Farm Manager changed a synthetic Super Admin retaining affiliation to that manager's farm into a Farm Member: HTTP 200, stored role `MEMBER_FARMER`.

The second scenario requires the retained affiliation. No production account was checked for that condition. This is a target-policy defect inside an otherwise authenticated route, not an unauthenticated endpoint. Existing role changes preserve affiliation fields, so retained relationships are a reachable state.

**Recommended fix:** centralize the allowed actor/stored-role/requested-role transition matrix, validate live scope and both roles inside the write transaction, and prevent stale affiliations from granting authority over higher-privilege accounts. Client role selectors and actions should follow the server policy. Audit existing inconsistent relationships separately before repairing data.

### A2. High — archiving a field can exclude its uncompiled operations from monthly reports

**Locations:** [audit field selection](../server/routes/auditReports.js#L77), [monthly log selection](../server/routes/auditReports.js#L120), [field archival](../server/services/cropCycleOperations.js#L986).

Field archival is allowed without first compiling that field's operations. It archives the field, cycle, and active logs. Monthly audit loading then queries logs only for currently `ACTIVE` fields. Accepting archived operation status does not recover records belonging to an archived field.

**Reproduced:** readiness initially counted one eligible September operation costing ₱100. After the assigned manager archived its field, the operation still existed as `ARCHIVED`, but readiness counted zero operations and compilation returned HTTP 400: no eligible logs. Another idle field remained active, isolating this from the separate no-active-fields check.

This is reporting exclusion, not deletion. If a farm has other eligible operations, the same filtering can yield a report omitting the archived field's activity rather than rejecting the whole month.

**Recommended fix:** select reportable historical operations by their stored farm/cycle/date context independently of the field's current lifecycle, and construct field snapshots from the corresponding historical context. Alternatively, explicitly prevent archival until all eligible activity is covered, with a clear server error and matching Web/Mobile guidance. Preserve the relaxed rule that an idle field does not block compiling other available activity.

### A3. Medium — stale personnel edits overwrite newer values

**Locations:** [user update transaction](../server/routes/users.js#L537), [Web account form](../web/react-app/src/components/users/UserFormModal.jsx#L158).

The account transaction compares its live record against the snapshot fetched at the start of that same request. It ignores the editor's original `_mutation.baseVersion`. The Web form also omits its original displayed `updatedAt` when updating an account.

**Reproduced:** an explicitly stale base version returned HTTP 200 and replaced the newer stored name with the stale form's value.

**Recommended fix:** enforce the editor's expected version in the transaction, return HTTP 409 with the current safe projection, and preserve form values for conflict resolution. Apply the same contract to relevant Mobile account/status mutations without inventing a new Mobile editor.

### A4. Medium — retrying Block Farm creation can create duplicate farms

**Locations:** [creation identity](../server/routes/blockFarms.js#L79), [batch creation](../server/routes/blockFarms.js#L100), [Web create service](../web/react-app/src/services/blockFarmsService.js#L53).

The create handler issues a new farm ID per request and ignores mutation identity. It does not use the creation-receipt mechanism already used by field enrollment.

**Reproduced:** two identical requests with the same mutation/idempotency key both returned HTTP 201 and created two distinct farm IDs.

**Recommended fix:** atomically bind actor, mutation key, request fingerprint, and created farm using the existing private mutation-receipt collection. The Web create form must retain one logical key across an uncertain response and retry. Any Mobile API caller must use the same contract; Mobile currently does not expose farm creation.

### A5. Medium — farm creation allows inconsistent manager assignments

**Locations:** [create-time manager validation](../server/routes/blockFarms.js#L80), [stronger update validation](../server/routes/blockFarms.js#L149).

Creation checks that the account is a Farm Manager but does not enforce the active-account and existing-assignment policy used by update. Update clears a manager's other farm assignments; create leaves them in place.

**Reproduced:** creating another farm for an already assigned manager returned HTTP 201 and left two farms assigned to that manager.

**Recommended fix:** define one assignment rule for creation and update, enforce it transactionally under concurrency, and present already assigned managers accurately in Web choices. Mobile must consume the canonical resulting assignment. Existing duplicate assignments need a separate read-only inventory before any cleanup.

### A6. Medium — an interrupted Mobile draft submission can stay locked after restart

**Locations:** [draft hydration](../mobile/src/data/dataStore.js#L1015), [persisted claim](../mobile/src/data/dataStore.js#L1851), [Web claim helper](../web/react-app/src/services/localOperationDrafts.js#L73).

Claiming a Mobile draft persists `submitting: true`. Login/startup restore that flag without recovering an abandoned claim. The normal `finally` release cannot run after the app process terminates.

**Reproduced:** persisting a claim, restoring its draft into a new function instance, and submitting again threw `This draft submission is already in progress.` The draft remained stored; deletion was not demonstrated.

**Recommended fix:** recover abandoned claims at hydration, preserve the stable submitted operation ID, and reconcile with the authoritative operation/outbox before retrying. The analogous Web helper also lacks restart recovery, although no active Web caller was found. The recent operation/takeover checks cover normal completion and retry paths; this probe exposes the separate process-interruption path.

### A7. Medium — dismissing draft/sync alerts also suppresses future records' alerts

**Locations:** [sync alert ID](../mobile/src/screens/HomeScreen.js#L105), [draft alert ID](../mobile/src/screens/HomeScreen.js#L151).

These generated alert IDs are permanent constants: `notif-offline-sync` and `notif-unsubmitted-drafts`. Read and dismissed state now persists correctly per account, but the IDs do not distinguish new underlying drafts or pending operations from old ones.

**Reproduced:** after dismissing the alerts for one set of records, a different draft and different pending operation produced zero visible draft/sync alerts using the same dismissed-ID set. Reading the old alert similarly leaves later work represented as already read.

**Recommended fix:** use stable event/content-generation identities, retaining dismissal for the original alert while allowing a new set of pending work to create a fresh unread alert. Avoid timestamp-per-render IDs, which would make the original notifications reappear. Keep the server as authority for acknowledgement state; local-only drafts still require account-scoped identities on Mobile. Web consumers must use the same identity contract where applicable.

This finding does not mean the logout/read-state persistence fix failed. It identifies a different issue: distinguishing an old event from newly generated work.

### A8. Medium — operation history substitutes the editor's current role/name for historical attribution

**Location:** [amendment enrichment](../server/services/operationQueryService.js#L90).

The read service gives current user-directory name/role precedence over the name/role recorded in the amendment. A later role or name change can therefore change how an older correction appears in both clients.

**Reproduced:** a stored amendment attributed to `Historical Name / FARM_MANAGER` was returned as `Current Name / SRA_ADMIN`. The stored amendment was unchanged.

**Recommended fix:** use the amendment's stored historical identity first, with current directory data only as a fallback for legacy records missing the snapshot. If useful, show current profile information separately and label it clearly. Preserve current actor IDs and never rewrite historical amendment records merely to update display names.

## Confirmed access limitation and improvement opportunities

These are separate from the eight reproduced defects above.

1. **Price-history paging only covers the loaded window.** Both main clients load 52 prices; the API accepts at most 100 and does not implement a cursor. With 110 isolated stored prices, a 52-row request returned 52 rows, a request supplying its last ID as a cursor returned the same rows, and the maximum returned was 100. Older records remain stored but cannot be reached through that history API. See [prices route](../server/routes/prices.js#L17), [Web subscriptions](../web/react-app/src/services/pricesService.js#L34), and [Mobile refresh](../mobile/src/data/dataStore.js#L2651). Add real API cursor/date-range pagination and connect both clients' history controls to it; keep chart windows distinct from full history.
2. **Some local paging still loads the full source dataset.** `/api/logs` without a limit and audit next-period discovery can read entire scoped histories. Client-side pages improve rendering, but do not bound Firestore reads, API payload size, or cold-start work. Add server pagination/filtering and supporting indexes, measuring with large farm fixtures before changing contracts. No production latency or quota incident was established here.
3. **Monthly compilation needs a supported large-month path.** More than 500 eligible operations causes a hard rejection, without a batching workflow. Define how to split/version larger months using server-selected records and payload-size checks, while keeping report identities and source-log coverage consistent in both clients. This is a capacity limitation, not evidence that a current live month exceeds the threshold.
4. **Expose unresolved work and account for recovery.** Web operation retry identity currently survives only while the form stays open; a full reload loses that attempt. Notification offline intents retry silently and lack a visible pending-confirmation indicator. Consider durable account-scoped submission recovery on Web and clear acknowledgement status on Mobile, with API reconciliation. Also decide whether private notification state should be included in backup/restore; the current explicit backup collection list excludes it.

## Dependency risk

The live npm audit still reports **15 high-severity affected-package entries in Mobile**, arising from two underlying advisories, not fifteen independently demonstrated application exploits:

- Installed `braces@3.0.3`: deeply nested pattern handling can exhaust the stack. The [reviewed braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists affected versions through 3.0.3 and no patched version as checked on 23 October 2026.
- Installed `node-forge@1.4.0`: incomplete RSA PKCS#1 signature validation. The [reviewed node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) lists affected versions through 1.4.0 and no patched version as checked on 23 October 2026.

The observed dependency paths are in the installed Expo/Metro build-tooling tree. This audit did not demonstrate exploitation through a production API request or the installed APK. npm's suggested remedy targets an old major Expo version (`44.0.6`), so it is not a safe automatic upgrade plan. Track compatible upstream fixes and evaluate actual tooling inputs before changing overrides or the SDK. Upgrading the Node executable does not replace these package versions.

## Full-stack remediation map

| Finding | Database / schema | Server / API | Web | Mobile |
| --- | --- | --- | --- | --- |
| A1 Role transitions | Reuse users/assignments; inventory inconsistent relationships separately | Actor/current/requested-role policy, live transactional authorization | Allowed role choices/actions from policy | Same server policy for account mutations |
| A2 Archived-field reports | Preserve existing log farm/cycle identity; snapshot historical field context | Select eligible history independently of current field lifecycle, or explicitly gate archival | Accurate preview, archive guidance, and final totals | Same preview/report/archive behavior |
| A3 Stale account edits | Reuse version timestamps | Enforce expected version; return conflict projection | Submit original version; preserve entered values | Same version contract where accounts/status are mutated |
| A4 Farm retries | Reuse private creation receipts | Atomic key/fingerprint replay | Stable creation key across retries | Same API contract for applicable callers |
| A5 Manager assignments | Inventory duplicates before repairs; decide invariant | One transactional create/update policy | Eligible manager choices and explicit errors | Canonical assignment and matching errors |
| A6 Draft restart recovery | No canonical schema change; recover local claim metadata | Reconcile stable operation identity and retain idempotency | Equivalent recovery if claim helper is used | Recover abandoned claims without duplicate submission |
| A7 New-alert identity | Retain private acknowledgement state per account/event | Validate/acknowledge stable event identities | Same identity contract for applicable consumers | Distinguish new pending work from the dismissed event |
| A8 Historical attribution | Preserve stored amendment identity | Historical values first; directory fallback only | Render the returned historical attribution | Same historical attribution |
| Price history | Reuse prices; add indexes if query requires them | Cursor/date-range contract and bounded pages | Load older history pages | Load older history pages |

## Suggested work order and acceptance scope

Address A1 and A2 first. Then cover account conflict handling, farm creation/assignment integrity, draft restart recovery, notification event identity, and immutable history display with behavioral regression tests. Treat dependency mitigation as a separately reviewed compatibility change. Do not repair live accounts/farms based solely on synthetic fixtures; inspect affected records first.

After those fixes, repeat the release checks and run staging/physical-device acceptance: notification permission on a fresh Android installation, native QR acquisition, account switching, process termination during draft submission, uncertain network responses during operation saving, and monthly reporting after field archival. Check the deployed Node runtime separately; the local pin alone does not prove the hosting environment uses it.

**No audit finding in this report has been fixed as part of this audit.**
