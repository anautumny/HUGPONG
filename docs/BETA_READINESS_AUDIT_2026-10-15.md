# Beta readiness audit — 15 October 2026

**Verdict: hold a wider beta release until the high-priority issues below are resolved.** The current working tree builds for Web and Android, but builds and the existing contract tests miss reproducible security and synchronization defects.

This audit includes the existing uncommitted changes. Application source, dependencies, credentials, and live data were not changed. Verification generated a Web build and temporary local audit artifacts. No live Firestore writes, SMS sends, or cloud deployments were performed.

## Verification results

| Check | Result |
|---|---|
| Existing server suite | 508 passed, 1 failed; 509 total |
| Existing Web suite | 38 passed, 0 failed |
| Web production build | Passed |
| Android Expo production bundle export | Passed; this is not a native APK build or device test |
| Repository secret exposure audit | Passed; zero findings within the scanner's coverage |
| Runtime authority pattern audit | Passed, but the QR import probe below demonstrates a gap in this static check |
| Default deployment configuration audit | Passed in non-production mode |
| Same locally collected configuration checked as production | Failed: `PRODUCTION_API_REQUIRES_HTTPS` for `EXPO_PUBLIC_API_BASE_URL` |
| Mobile API configuration evaluated as a release build | Rejected current local configuration with `API_CONFIGURATION_ERROR` |
| Expo SDK package compatibility check | Failed; seven packages need patch alignment |
| Current npm production dependency audits | Server: 13 affected packages; Web: 4; Mobile: 36. These are dependency-tree findings, not counts of demonstrated remotely exploitable bugs. |
| Isolated behavioral probes | Confirmed five defects below using mocks, without accessing the live database |

The top-level `verify:release` script stopped at the failing server test. Web tests, Web build, and Android export were subsequently run separately so they were still assessed.

## Findings, in fix order

### 1. High — legacy QR import trusts a client-created audit report

**References:** `server/routes/auditReports.js:139`, `server/routes/auditReports.js:483`, `server/routes/auditReports.js:493`, `server/domain/auditWorkflow.js:328`, `server/schema/firestoreSchema.js:458`.

Current reference QRs resolve to authoritative server records. However, the same endpoint still accepts legacy version-2 and version-3 full-report payloads. If the referenced report does not exist, `/api/audit-reports/qr/import` creates it from the supplied payload. The integrity check is an unkeyed SHA-256 checksum that a sender can recompute. It proves payload consistency, not that HUGPONG issued the report.

**Confirmed:** an isolated call to the SRA import handler created a report containing invented farm, field, operation, and compiler identities, with a correctly recomputed hash. It did not read source operation, field, farm, or compiler records. The report entered `PENDING_REVIEW`.

**Impact:** a fabricated legacy QR can introduce invented business data and compiler attribution when an authorized SRA reviewer imports it. The import endpoint still requires SRA authorization; this finding does not establish unauthenticated direct API writes. It violates the requirement that clients never supply authoritative business records.

**Fix:** require an existing canonical server report for all QR versions. If importing historical external records is truly required, make that a separately authorized migration process with source validation and provenance. Do not treat an unkeyed checksum as proof of issuance.

### 2. High — mobile synchronization throws while new dependent work is added

**References:** `mobile/src/services/syncEngine.js:470`, `mobile/src/services/mutationOutboxCore.js:249`, `mobile/src/services/mutationOutboxCore.js:364`.

`mergeConcurrentItems()` calls `responseVersion()` after a dependency is acknowledged. That function exists privately in `mutationOutboxCore.js`; it is neither exported nor imported into `syncEngine.js`.

**Confirmed:** initialize an outbox, begin syncing a field update, enqueue a second update to the same field while the first upload is running, then acknowledge the first upload. `processOutbox()` rejects with `ReferenceError: responseVersion is not defined`.

**Impact:** a normal edit-during-sync workflow fails after the server has accepted work. Local acknowledgement and dependent-version reconciliation can be interrupted, leaving retry/conflict handling inconsistent with the successful server write. Data loss was not established by this probe.

**Fix:** share/import the response-version helper and add a behavioral test that enqueues dependent work while an upload is in flight. Add unresolved-identifier linting; bundle export does not catch this error.

### 3. High for hosted beta — registration and phone OTP state disappears between processes

**References:** `server/security/otp.js:9`, `server/routes/auth.js:588`, `server/routes/auth.js:676`, `server/routes/auth.js:875`, `server/routes/auth.js:1046`.

Registration, first-login phone verification, and phone-change challenges live in a process-local `Map`. Unlike password recovery challenges, their state is not persisted.

**Confirmed:** the issuing OTP module accepts its generated code; a fresh module instance cannot verify that same valid code. A restart or another server instance has the same missing-state problem.

**Impact:** correct codes intermittently fail under load balancing or during deployment/restart. Expired entries also have no scheduled sweep; untouched entries remain in memory. This additionally conflicts with the project's database persistence constraint.

**Fix:** persist purpose/subject-bound challenge digests, expiry, attempt counts, and consumption state in a server-only collection. Verification and one-time consumption must be transactional across instances.

### 4. Release configuration blocker — current local Mobile configuration is unsuitable for a release APK

**References:** `mobile/src/config/apiConfig.js:39`, `mobile/src/config/apiConfig.js:63`, `mobile/eas.json:11`, `server/services/deploymentReadinessService.js:60`.

The default configuration audit ran as non-production and passed. Rechecking the same collected values as production failed the HTTPS requirement. Evaluating Mobile's configuration as a non-development build returned `API_CONFIGURATION_ERROR`.

**Impact:** an APK built with those local API values can export successfully but fail API calls at runtime. An internal `preview` distribution is still a release build unless configured as a development client.

**Fix:** verify public HTTPS API configuration and aligned Firebase values independently for the EAS `preview` and `production` environments. Run a production-mode configuration check as a release prerequisite.

**Limit:** remote EAS environment values were not inspected. This finding applies to the local environment used for this audit and is not evidence that an existing cloud build uses those same values.

### 5. Medium — repeated field creation produces duplicate fields and cycles

**References:** `server/routes/fields.js:115`, `server/routes/fields.js:124`, `server/routes/fields.js:187`, `web/react-app/src/services/fieldsService.js:80`, `mobile/src/data/dataStore.js:578`.

The field-create route validates `_mutation` but discards the returned context, then generates a fresh random field ID on every call. There is no persisted mapping from a creation idempotency key to its result.

**Confirmed:** submit the same field creation twice, with the exact same mutation/idempotency key. Both return HTTP 201 and create different field IDs and first-cycle records.

**Impact:** if the first request commits but its response is lost, retrying enrollment creates duplicate land records and consumes declared farm area twice. Mobile currently enrolls new fields directly online, so this is a lost-response/manual-retry problem as well as an API replay problem; it is not limited to offline queue replay.

**Fix:** atomically persist creation receipts keyed by actor and idempotency key, returning the original field/cycle result on retry. Both clients must retain the same creation key until a definitive response.

### 6. Medium — recovery requests can disappear behind expired or unrelated requests

**References:** `server/routes/recoveryReviews.js:72`, `server/routes/recoveryReviews.js:75`, `server/routes/recoveryReviews.js:79`, `server/services/operationalCleanupService.js:13`.

The review list selects the first 100 `PENDING` documents globally, then filters expired requests and reviewer scope in memory. Expiry does not automatically change a review's stored status. Retention cleanup uses the separate deletion timestamp, which is 30 days after creation.

**Confirmed:** seed 100 expired `PENDING` requests followed by one unexpired request. The Super Admin list returns success with zero reviews. Requests belonging to other managers can similarly crowd out a manager's own reviews.

**Fix:** apply reviewer scope and live expiry in the database query, with required indexes and cursor pagination. Alternatively, iterate bounded pages until a useful scoped page is assembled, exposing continuation explicitly. Transition expired statuses consistently.

### 7. Medium — server policy disables the Web QR camera

**References:** `server/server.js:71`, `web/react-app/src/components/audit/QRVerifierPanel.jsx:130`.

The server sends `Permissions-Policy: camera=()` for the served SPA. The Web audit scanner then requests camera video. Browsers enforcing this policy reject the request even when the user otherwise permits camera access. The current UI can misleadingly tell users to allow browser camera access, which cannot override the response policy.

**Fix:** allow the same-origin application's camera capability, keep the user permission prompt, and verify the scanner on the actual HTTPS deployment. Keep the native Mobile camera flow working.

Browser behavior is documented in [MDN's camera policy reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/camera). This was established from the policy and scanner code, not a physical camera test.

### 8. Medium release gate — existing automated verification is red

**References:** `server/tests/mobile-i18n.test.js:84`, `mobile/src/components/CustomBottomTabBar.js:176`, `mobile/src/components/CustomBottomTabBar.js:223`, `server/scripts/verifyRelease.js:47`.

The failing test is `language persistence and long-label layouts are guarded against regressions`. It expects `numberOfLines={2}` on bottom-tab text; the current component omits it. It also expects a particular minimum-height declaration that differs from the current component.

**Fix:** visually check long translations and enlarged text on small devices, decide the intended layout, then align the component and test. A source-pattern mismatch alone does not prove text is clipped. Keep the gate passing and add behavioral coverage for the confirmed defects above.

### 9. Dependency maintenance — advisories and Expo patch drift need triage

Current `npm audit --omit=dev` results:

| Project | Critical | High | Moderate | Low | Total |
|---|---:|---:|---:|---:|---:|
| Server | 1 | 3 | 9 | 0 | 13 |
| Web | 0 | 4 | 0 | 0 | 4 |
| Mobile | 1 | 22 | 12 | 1 | 36 |

These totals include parent packages inheriting a transitive advisory. Mobile dependencies also contain Expo/Metro build tooling despite `--omit=dev`.

Examples include server `proxy-addr`, `node-forge`, and `@grpc/grpc-js`, and Mobile `shell-quote`, `ws`, and build-tool dependencies. Direct references: `server/package-lock.json:185`, `server/package-lock.json:1883`, `server/package-lock.json:2038`.

**Reachability qualification:** the critical [proxy-addr advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h) concerns particular trust-subnet configurations. HUGPONG currently uses numeric `trust proxy = 1`, so this audit did not establish that exploit path. The [gRPC certificate advisory](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j) concerns particular server-side certificate/auth-context usage; presence through Firebase does not establish that the browser or native app exercises it. Other dependency paths still need individual triage.

Expo's compatibility check requests these installed → expected versions:

- `expo`: 57.0.25 → ~57.0.29
- `expo-camera`: 57.0.5 → ~57.0.6
- `expo-constants`: 57.0.19 → ~57.0.22
- `expo-crypto`: 57.0.3 → ~57.0.4
- `expo-notifications`: 57.0.21 → ~57.0.23
- `expo-sharing`: 57.0.22 → ~57.0.23
- `expo-splash-screen`: 57.0.9 → ~57.0.10

**Fix:** perform reviewed, compatible updates and rerun checks/native builds. Avoid blindly applying `npm audit fix --force`; npm suggested breaking downgrades for parts of the Mobile dependency tree.

## Required full-stack remediation

| Area | Database / Schema changes | Server / API / Controller updates | Web implementation | Mobile implementation |
|---|---|---|---|---|
| QR authority | Keep canonical reports as authority; add provenance/signature metadata only if a separately designed migration needs it | Reject missing authoritative reports for normal QR imports; validate legacy lookups against stored records | Display authoritative verification failures; accept only supported imports | Use the same verification policy and error states |
| OTP durability | Add server-only challenge documents, digest/attempt/expiry/consumption fields, indexes/retention; deny client reads/writes | Transactional issue/verify/consume across instances | Preserve server flow; explain expiry/resend safely | Same contract and behavior after restart/foreground |
| Sync reconciliation | No schema change required for the missing helper | Retain authoritative acknowledgements and conflict responses | Add equivalent edit-during-sync coverage to Web outbox behavior | Correct helper visibility; preserve concurrent queue state; test acknowledgement races |
| Enrollment retries | Add server-only mutation receipts with bounded retention | Atomically deduplicate field and cycle creation by actor/key | Reuse a stable creation key after a timeout | Reuse a stable creation key after a timeout; reconcile returned canonical IDs |
| Recovery visibility | Add scoped expiry/pagination indexes as needed | Query eligible scoped reviews before limiting; return cursor; handle expiration | Render pages and accurate pending/empty states | Same paging and expiration behavior |
| Camera policy | None | Permit same-origin camera use for the SPA | Test HTTPS camera start, denial, upload fallback | Regression-check native camera and image upload |
| Release configuration | No schema change; verify deployed rules/indexes separately | Enforce production readiness checks and correct hosted origin | Build against the intended server deployment | Set EAS preview/production HTTPS API and matching Firebase values |

## Remaining beta acceptance work

Before inviting wider testers, resolve the high-priority defects, restore the release gate, and validate the exact native APK against a staging environment:

1. Run real Web/Mobile flows for each supported role: sign-in, onboarding, approval, registration, recovery, password/phone changes, permissions, deactivation, and cross-farm access denial.
2. Exercise server restart and two-instance OTP verification, lost-response enrollment retries, offline recording, app termination/reopen, reconnect, concurrent edits during sync, and account switching with queued work.
3. Test QR scan/upload/import/certify with canonical reports and reject forged or missing-source legacy payloads.
4. Verify deployed Firestore rules/indexes, production credentials/origins, actual EAS environment values, push delivery credentials, and real SMS delivery. None was established by bundle export.
5. Perform a documented staging backup/recovery drill. The logical backup intentionally excludes credentials and identifiers and only restores missing records; separately establish the complete disaster-recovery procedure and credential recovery strategy.
6. Add integration tests using the Firestore emulator and browser/device workflows alongside the existing source-pattern checks. The isolated probes show that passing pattern checks are insufficient for release certification.
7. Reassess cross-device freshness: default polling is 30 minutes on Web and 60 minutes on Mobile, with additional refresh triggers. Agree acceptable delays for active reviews, assignments, prices, and operations, then test two devices while both remain foregrounded.

Isolated probe command: `node .tmp/beta-audit/reproduce.cjs`. It confirms the five observed defects in mocks; its successful exit means the problems reproduced, not that the application passed acceptance testing. Temporary artifacts are local audit evidence and may be cleaned up separately.

This assessment does not certify the deployed service, SMS provider, EAS cloud builds, physical Android/iOS behavior, or production data integrity. Those were not exercised. It identifies concrete reasons to hold wider beta and provides the cross-platform fix scope.
