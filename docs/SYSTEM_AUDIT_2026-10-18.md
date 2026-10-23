# HUGPONG system audit — 18 October 2026

The scan found **five reproducible application defects and an outstanding Mobile dependency risk**. The highest priority is the account-update authorization policy. The existing release gate passes, so these findings also identify gaps in its behavioral coverage.

This assessment includes the uncommitted connectivity, modal, and SRA directory fixes already prepared in this conversation. This scan added this report and local audit artifacts only; it did not fix the newly reported defects, change dependencies, query or mutate live business data, send SMS, build a signed APK, or deploy anything. Behavioral probes call real route handlers against an isolated in-memory Firestore replacement, or exercise extracted Mobile draft functions with mocked persistence. They do not demonstrate unauthenticated access or confirm existing production records are affected.

## Verification

| Check | Result |
| --- | --- |
| Full `npm run verify:release` | Passed |
| Server tests | 551 passed |
| Web tests | 38 passed |
| Web production build | Passed |
| Android production bundle export | Passed; not a native APK or physical-device test |
| Production release configuration parity | Passed; 14 required values present and Firebase projects aligned |
| Tracked secret exposure scan | 495 files scanned; zero findings within its pattern coverage |
| Runtime authority pattern scan | 223 files scanned; zero findings within its pattern coverage |
| Unresolved client identifiers | Zero findings |
| Server production dependency audit | Zero advisory findings |
| Web production dependency audit | Zero advisory findings; development dependencies excluded |
| Mobile production dependency audit | 15 high-severity affected-package entries, originating in two advisories |
| Expo package compatibility check | Passed using local/offline metadata; Expo warns offline validation is limited |

The audit artifacts are in `.tmp/system-audit-2026-10-18/`: `release.log`, `behavior-probes.cjs`, `behavior-results.json`, per-application dependency JSON files, and `dependency-summary.json`. Run `node .tmp/system-audit-2026-10-18/behavior-probes.cjs` to repeat the six isolated behavioral scenarios. These artifacts are ignored by Git.

## Findings

### 1. High — account updates permit unauthorized role transitions

**References:** `server/routes/users.js:467`, `server/routes/users.js:469`, `server/routes/users.js:479`, `server/routes/users.js:482`; the stale-affiliation scope shortcut is at `server/routes/users.js:38`.

The update handler does not validate the actor against both the stored role and requested role as a single transition policy:

- An SRA Admin can send a role update for an existing Farm Manager that changes that account into an SRA Admin. The handler blocks a requested Super Admin role, but accepts this SRA promotion even though SRA account provisioning permits only Farm Members and Farm Managers.
- A Farm Manager is checked against the **requested** role being `MEMBER_FARMER`, rather than also requiring the target's **existing** role to be a Farm Member. If a higher-privilege account retains an affiliation to that manager's Block Farm, the affiliation shortcut permits its update. The probe used a Super Admin with a retained affiliation and successfully changed it to a Farm Member. This depends on that relationship being present; the audit did not inspect production for such accounts. Role changes currently preserve affiliation fields, so retained relationships are a reachable condition.

Both isolated requests returned HTTP 200 and persisted the unauthorized role change. The middleware already permits authenticated SRA/Farm Manager access to this PATCH route; the missing protection is the target-specific policy inside the handler. Hiding buttons does not close this API path.

**Remediation:** define the allowed actor/current-role/requested-role transitions centrally, reject unauthorized transitions before writing, and recheck the live target and assignment in the transaction. The Web role selector and directory actions should reflect server-provided capabilities. Mobile must use the same server policy; its current lack of a profile editor is not an API safeguard. Audit existing role/relationship inconsistencies separately before any repair of live data.

### 2. Medium — stale personnel edits overwrite newer changes

**References:** `server/routes/users.js:458`, `server/routes/users.js:537`, `web/react-app/src/components/users/UserFormModal.jsx:149`, `web/react-app/src/components/users/UserFormModal.jsx:158`.

The personnel PATCH handler ignores `_mutation.baseVersion`. Its transaction only compares against the snapshot loaded at the beginning of that same request. This does not protect an administrator who opened a form before another administrator saved a change. The Web form also does not submit its original `updatedAt` as the expected version.

**Confirmed:** the server accepted an explicitly older base version, returned HTTP 200, and replaced the newer stored name with the stale form's name.

**Remediation:** pass the displayed record's version from Web, validate it inside the server transaction, and return HTTP 409 with the current record when it differs. Preserve entered form values while the user resolves the conflict. Apply the same version contract to any Mobile account-edit/status operation; no new Mobile profile editor is required.

### 3. Medium — retrying Block Farm creation creates duplicate farms

**References:** `server/routes/blockFarms.js:73`, `server/routes/blockFarms.js:79`, `server/routes/blockFarms.js:99`, `web/react-app/src/services/blockFarmsService.js:65`.

The create handler generates a new farm ID on every request and does not use the supplied mutation key to deduplicate creation. Field creation already has a mutation-receipt mechanism, but Block Farm creation does not.

**Confirmed:** two identical requests carrying the same mutation/idempotency key both returned HTTP 201 and created two separate farms. This can occur after the server commits but the response is lost and the user retries.

**Remediation:** use the existing server-only mutation-receipt collection to atomically bind actor, key, request fingerprint, and created farm. Web must retain one key for a logical create across retries, and generate a new key when the input changes. Any Mobile caller of this endpoint must follow the same contract; the current Mobile UI does not expose Block Farm creation.

### 4. Medium — new farms can duplicate an existing manager assignment

**References:** `server/routes/blockFarms.js:80`, `server/routes/blockFarms.js:83`; compare the update checks at `server/routes/blockFarms.js:151` and reassignment at `server/routes/blockFarms.js:179`.

Block Farm creation checks that the chosen account is a Farm Manager, but does not check whether the manager already has a farm. The update path deliberately clears the manager's other farm assignments. Creation and update therefore apply different relationship policies. Creation also omits the active-account check used by update.

**Confirmed:** creating a second farm for an already assigned manager returned HTTP 201 and left both farms assigned to that manager. The Web candidate list includes all active managers, so it does not prevent this case.

**Remediation:** establish one server-side assignment rule and enforce it transactionally for both creation and update, including manager activity and concurrent requests. Web should identify already assigned managers and explain an authorized reassignment. Mobile should display the resulting canonical assignment and consume the same API errors for relevant account/assignment actions. Inspect existing duplicate assignments before repairing them; the scan did not change any.

### 5. Medium — interrupted Mobile draft submission can remain locked after restart

**References:** `mobile/src/data/dataStore.js:1015`, `mobile/src/data/dataStore.js:1851`, `mobile/src/data/dataStore.js:1857`, `mobile/src/data/dataStore.js:3406`; submitting callers are in `mobile/src/screens/FieldOpsScreen.js:4160` and `mobile/src/screens/FieldOpsScreen.js:4412`.

Claiming a draft for submission persists `submitting: true`. Startup and login restore that flag unchanged. If the app closes before its `finally` block releases the claim, the restored draft cannot be submitted again because it is still considered in progress. The submission timestamp has no restart/expiry recovery policy.

**Confirmed:** after persisting a claim and restoring the stored draft into a new function instance, a submission attempt threw `This draft submission is already in progress.` The draft data remained present; this finding is a stuck workflow, not demonstrated deletion of the draft.

**Remediation:** recover abandoned claims during Mobile hydration, preserve the stable submitted operation ID, and reconcile against the authoritative server before retrying. Avoid replaying an already accepted operation. Web has a similar claim helper, although no active Web caller was found in this scan; apply equivalent recovery when that helper is used. No canonical database schema change is required.

### 6. Dependency risk — Mobile retains two unpatched tooling advisories

The live npm audit reported 15 affected-package entries, mostly propagated through Expo/Metro dependency chains. These are not 15 independently demonstrated application vulnerabilities. Installed versions and chains were checked with `npm ls node-forge braces --all`:

- `expo → @expo/cli → node-forge@1.4.0`, also through Expo code-signing certificates. The [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) concerns malformed RSA signature verification and lists no patched version as checked during this audit.
- `expo → @expo/metro → metro-file-map → micromatch → braces@3.0.3`. The [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) concerns stack exhaustion from deeply nested patterns and likewise lists no patched version.

The observed dependency paths are build/development tooling. This scan did not demonstrate exploitation through the installed APK or production API. npm's proposed automatic remedies include major downgrades of Expo/React Native; those were not applied and should not be treated as a safe fix. Track compatible upstream patches and assess the tooling's input exposure before changing overrides or SDK versions.

## Full-stack remediation map

| Area | Database / schema | Server / API | Web | Mobile |
| --- | --- | --- | --- | --- |
| Role transitions | Reuse user/assignment records; separately audit inconsistent existing relationships | Validate both current and requested roles and live scope | Consume allowed actions and restrict role choices | Same server policy; retain current editor availability |
| Stale edits | Reuse `updatedAt` | Enforce base version inside transaction; HTTP 409 on conflict | Send original version and preserve form on conflict | Same contract for applicable account mutations |
| Farm retries | Reuse server-only mutation receipts | Atomic idempotent create with payload fingerprint | Retain one logical creation key across retry | Same key contract for any API caller |
| Manager assignment | Reuse manager/farm relationship; audit duplicates before repair | One transactional create/update assignment policy | Show assignment eligibility and errors | Show canonical assignment and matching errors |
| Draft recovery | Keep business data server-authoritative; recover only local claim state | Preserve operation idempotency/reconciliation | Add abandoned-claim recovery if claim helper is used | Recover and reconcile persisted submission claims |
| Tooling advisories | None | No server package advisory findings in this scan | No production package advisory findings in this scan | Review compatible upstream/tooling updates; no automatic SDK downgrade |

The account-role policy should be addressed first. Passing tests and bundle exports do not establish physical-device behavior, production data integrity, or complete security coverage. Deployment remains on hold at the user's request.
