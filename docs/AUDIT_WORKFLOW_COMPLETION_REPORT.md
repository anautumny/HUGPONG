# HUGPONG Canonical Audit Workflow Completion Report

Date: 2026-09-25

## 1. Root causes found

The previous implementation had one `audit_reports` collection and server-side snapshot compilation, but the user journey and status model treated compilation and submission as the same event. Web and mobile selected a month locally, mobile could compile with unsynchronized data, and mobile automatically queued the compiled report as a submission. Web QR encoded only a hash while mobile used an unrelated pipe-delimited summary, so the transports did not share a versioned contract. QR verification looked up existing reports but did not consistently recompute the authoritative snapshot hash. The SRA queue downloaded a broad report set and filtered it client-side, so certified records remained mixed into active work. Return/version handling and explicit `COMPILED`, `PENDING_SUBMISSION`, `PENDING_REVIEW`, and `RETURNED` states were missing or inconsistent. Duplicate protection relied on lookups rather than a deterministic per-farm/period/version identity.

The existing verifier's main performance bottlenecks were broad report reads, client-side status filtering, linear hash searches, repeated QR construction in render paths, and rendering active and historical records together.

## 2. Existing audit architecture discovered

- Firestore already used `audit_reports` as the business entity; there were no separate cloud, QR, certificate, or history collections.
- Operation logs were authoritative server records. Amended operations were updated as one log and carried an amendment trail.
- Compiled reports already stored operation snapshots, so historical values were snapshots rather than live recalculations.
- The old server compile route independently loaded farm fields and logs, but the requested Block Farm ID was not consistently derived from the manager assignment.
- Old statuses were primarily `PENDING` and `CERTIFIED`; web and mobile attached different meanings and labels.
- Final server certification was online and role-protected. Mobile-local states could nevertheless imply more authority than the server had confirmed.
- There was no canonical district identifier on users and Block Farms from which to enforce SRA district filtering.

## 3. Files changed

Server and shared persistence contract:

- `server/domain/auditWorkflow.js`
- `server/routes/auditReports.js`
- `server/schema/firestoreSchema.js`
- `server/tests/audit-workflow.test.js`
- `firestore.indexes.json`
- `docs/FIRESTORE_SCHEMA.md`

Web:

- `web/react-app/src/domain/auditWorkflow.js`
- `web/react-app/src/services/auditService.js`
- `web/react-app/src/services/firestoreSchema.js`
- `web/react-app/src/components/audit/AuditCompilationModal.jsx`
- `web/react-app/src/components/audit/AuditDossierCard.jsx`
- `web/react-app/src/components/audit/AuditHistoryModal.jsx`
- `web/react-app/src/components/audit/AuditQueue.jsx`
- `web/react-app/src/components/audit/QRVerifierPanel.jsx`
- `web/react-app/src/views/audit/AuditCenterView.jsx`
- `web/react-app/src/views/dashboard/SraAdminDashboard.jsx`

Mobile:

- `mobile/src/domain/auditWorkflow.js`
- `mobile/src/data/dataStore.js`
- `mobile/src/data/firestoreSchema.js`
- `mobile/src/services/mutationOutboxCore.js`
- `mobile/src/services/mutationService.js`
- `mobile/src/services/syncEngine.js`
- `mobile/src/components/AuditHistoryModal.js`
- `mobile/src/screens/FieldOpsScreen.js`
- `mobile/src/screens/sra/SRAHomeView.js`
- `mobile/package.json`
- `mobile/package-lock.json`

## 4. Firestore/schema changes

`audit_reports` remains the single canonical collection. New writes use:

- lifecycle status: `COMPILED`, `PENDING_SUBMISSION`, `PENDING_REVIEW`, `RETURNED`, or `CERTIFIED`
- `periodKey`, `rootReportId`, `reportVersion`, and `previousVersionId`
- immutable `operationSnapshots` and derived summary values
- compiler, submission, return, certification, and integrity metadata
- `submissionMethod` plus the cumulative `submissionMethods` provenance array

No duplicate `audit_history`, `cloud_audits`, `qr_audits`, or `certified_audits` collection was added.

## 5. Indexes required/created

The checked-in index configuration now includes:

- `blockFarmId ASC, compiledAt DESC` for manager audit status/history
- `status ASC, submittedAt DESC` for the SRA Inbox
- `status ASC, certifiedAt DESC` for Audit History

These indexes must be deployed with the server release before the new production queries are exercised.

## 6. Automatic period logic

The server computes the current business period in `Asia/Manila`. `/api/audit-reports/next-period` resolves the authenticated manager's assigned Block Farm, finds months with eligible active operations, and selects the oldest month with no audit or whose latest version was returned. If no unresolved month exists, it selects the current business period. The backend rejects future periods. Web uses this endpoint. Mobile mirrors the selection for its local-first preview, while the server remains authoritative when online compilation occurs.

## 7. Compilation logic

Official compilation is a Farm Manager-only server operation. It resolves the manager's canonical farm assignment, loads active fields in that farm, loads current active operation logs for the period, requires a crop cycle, excludes drafts and out-of-period data, builds operation snapshots, and derives counts, hectares, and costs on the server. Client totals are not trusted. The compile action produces `COMPILED`; it does not submit.

The mobile client blocks compilation only for unsynchronized field/operation mutations matching the selected Block Farm and period. Unrelated outbox work does not block the audit.

## 8. Snapshot/versioning logic

Snapshots include stable operation log identity, field/cycle data, operation values, line items, and amendment history. A deterministic root identity represents Block Farm plus period; the stored report identity also includes the version. Repeating a compile for a non-returned period returns the existing report. Recompiling after `RETURNED` creates the next version and links `previousVersionId`. Certified versions are never rewritten by the workflow.

## 9. QR payload changes

Web, mobile, and server now use one compact JSON envelope with a HUGPONG audit type, schema version, report identity, Block Farm, period, report version, summary values, compiler/timestamp, and integrity hash. Operation snapshots and QR image blobs are deliberately excluded. The QR is generated from stable compiled identity rather than from an ever-growing Base64 monthly document.

## 10. QR integrity changes

The server recomputes SHA-256 over the canonical report identity, Block Farm, period, and immutable operation snapshots, then compares it with both the QR envelope and stored report. The verifier reports decoding, report discovery, integrity verification, review state, and certification separately. A decodable QR is never labeled certified.

Offline mobile scanning validates the envelope structure and can match it to a cached canonical report. An unseen offline envelope is explicitly labeled as structurally valid with cloud confirmation pending; it is not claimed to be cryptographically authenticated or certified.

## 11. Cloud submission changes

Compilation and submission are separate endpoints and UI actions. `POST /api/audit-reports/:id/submit` runs in a transaction, verifies the manager still owns the report's Block Farm, and transitions only `COMPILED` to `PENDING_REVIEW`. Repeated submissions return the existing state. Mobile retains a locally compiled package and queues a submission mutation when connectivity is unavailable.

## 12. QR/Cloud deduplication logic

Cloud and QR use the same deterministic report document ID and report version. QR import reads and updates that document; it does not create a second business record. Repeated QR import reports `alreadyImported`. A cloud submission after QR import, or QR import after cloud submission, resolves to the same `PENDING_REVIEW` or later report. The mobile outbox also deduplicates audit submission/import mutations by logical report key.

## 13. SRA Inbox changes

The web queue is now labeled Audit Inbox and shows actionable `PENDING_REVIEW` reports. The server query is status-scoped, ordered by `submittedAt`, limited, and cursor-capable. Mobile shows the bounded pending-review list before its QR tools. Certified and returned records are not retained in the normal active-review list.

## 14. Audit History changes

History is a view of the same `audit_reports` records with status `CERTIFIED`. It uses a separate ordered, paginated server query and a Load More flow. It does not copy report documents. Opening history reads the stored certified snapshot and certification metadata.

## 15. Certification changes

Certification is SRA-only, transactional, and allowed only from `PENDING_REVIEW`. The server recomputes snapshot integrity and records `certifiedByUserId`, `certifiedByName`, `certifiedAt`, `certifiedReportVersion`, and `certifiedIntegrityHash`. Retries are idempotent. Mobile blocks final certification without an online authoritative response. Certificate/print actions are shown only for certified reports and use stored snapshot values.

## 16. Return/resubmission changes

SRA can return a pending review only after supplying a reason. The workflow records the SRA identity, timestamp, reason, and audit-log event. Managers see the returned reason. A correction is recompiled as the next deterministic version, preserving the returned version rather than overwriting it, then submitted as a new review of that version.

## 17. Web changes

The compile modal now loads the automatic period preview and no longer asks for a normal month selection. Compiled reports expose a separate Submit to SRA action. The SRA workspace separates Inbox and paginated History, gives QR import secondary placement, shows status-appropriate review/certificate content, supports Return and Certify feedback states, and uses human compiler names where available. Manual report/hash entry remains a fallback.

## 18. Mobile changes

Mobile now shares the canonical lifecycle and QR contract, computes the oldest unresolved local preview, performs scoped sync blocking, separates compile from submit, queues offline submission/import work, shows returned reasons, uses an actionable SRA Inbox, loads history separately, and requires server confirmation for final certification. `expo-crypto` supplies compatible SHA-256 hashing for locally retained compiled packages.

## 19. Offline behavior changes

An offline Farm Manager can retain the compiled package, display its compact QR, and queue submission for retry. Offline SRA scanning distinguishes structural validation, cached-authority matching, and cloud confirmation. A legitimate import can be queued and reconciled by canonical identity after reconnect. Final certification remains online-only, consistent with the existing centralized-authority rule.

## 20. Performance improvements

- Inbox and History are separate bounded server queries.
- History supports cursor pagination instead of downloading all certified reports.
- QR lookup uses the canonical document ID; hash fallback is limited to one result.
- QR payloads omit operation arrays and image blobs.
- QR data derives from stable compiled report identity.
- Certification, return, import, and submit use direct document transactions.
- Mobile history is fetched separately rather than mixed into its active Inbox render.

## 21. Existing data migration/compatibility handling

Readers normalize legacy `PENDING`, `SUBMITTED`, and `VERIFIED` values to `PENDING_REVIEW`. The SRA Inbox temporarily includes legacy `PENDING` documents on its first page. `period` is read as a fallback for `periodKey`; normalized responses expose both during migration. New writes use only the canonical lifecycle. This is lazy compatibility, not a destructive bulk migration.

## 22. Tests performed and results

- Server test suite: 213 tests passed, including 7 canonical audit workflow tests.
- Web test suite: 21 tests passed.
- Web production build: passed.
- Android Expo export: passed; 1,150 modules bundled. The temporary export directory was removed afterward.
- Server syntax checks for the new domain and route modules: passed.
- `git diff --check`: no audit-source whitespace errors after final cleanup; line-ending conversion warnings remain because the Windows working tree uses CRLF.

The automated audit tests cover lifecycle constants, deterministic version IDs, Manila business-date rollover, snapshot summaries, compact QR exclusions/round-trip, route separation, and bounded one-collection query intent. Existing server tests also cover mutation outbox behavior and security regressions.

## 23. Remaining limitations or risks

- A live Farm Manager-to-SRA staging run was not executed because no isolated Firestore emulator/staging credential set was configured, and exercising the endpoints against an unknown live database would create regulatory records. The release gate should run the requested cloud, QR, duplicate, return/version, rollover, 48-report pagination, latency, and reconnect scenarios against an emulator or dedicated staging project.
- Firestore composite indexes must be deployed before rollout.
- The current data model has no canonical district ID relationship between SRA users and Block Farms. Role authorization is enforced, but true per-district SRA isolation cannot be safely inferred from display strings. Add canonical `districtId` fields and scoped rules/API queries before operating multiple districts.
- The compact QR uses a deterministic SHA-256 integrity identifier, not an asymmetric digital signature. Server verification is authoritative; an unseen QR cannot be authenticated fully offline without a trusted public-key signature design. The UI deliberately does not claim otherwise.
- Existing legacy reports receive read compatibility but are not retroactively versioned or rehashed. A controlled migration is required if every old record must expose the full new metadata.
- The project dependency install reported npm audit findings (1 low, 14 moderate, 1 high, 1 critical). They were not auto-fixed because dependency upgrades were outside this audit workflow change and could be breaking.
- Audit-specific notifications were not added because the repository does not expose an existing notification delivery pipeline for these events; creating a parallel notification system would violate the requirement.
