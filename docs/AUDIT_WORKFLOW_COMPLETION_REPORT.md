# HUGPONG Canonical Audit Workflow Completion Report

Date: 2026-09-25

## 1. Root causes found

The previous implementation had one `audit_reports` collection and server-side snapshot compilation, but compilation and delivery were presented as one event. More importantly, the QR paths did not transport a report: web encoded only an identifier/hash and mobile used a separate summary string. An SRA scan therefore depended on finding a cloud document and could show an empty or incomplete shell when that lookup failed or the stored document lacked snapshots. The SRA Inbox also could not receive a report that intentionally travelled only by QR. Duplicate protection relied on lookups rather than one stable report identity shared by Cloud and QR.

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
- `docs/FIRESTORE_SCHEMA.md`

Web:

- `web/react-app/src/domain/auditWorkflow.js`
- `web/react-app/src/services/auditService.js`
- `web/react-app/src/services/firestoreSchema.js`
- `web/react-app/src/components/audit/AuditCompilationModal.jsx`
- `web/react-app/src/components/audit/AuditDossierCard.jsx`
- `web/react-app/src/components/audit/AuditQueue.jsx`
- `web/react-app/src/components/audit/QRVerifierPanel.jsx`
- `web/react-app/src/views/audit/AuditCenterView.jsx`
- `web/react-app/src/views/operations/OperationsView.jsx`
- `web/react-app/tests/phase6-system-parity.test.js`

Mobile:

- `mobile/src/domain/auditWorkflow.js`
- `mobile/src/data/firestoreSchema.js`
- `mobile/src/components/LiveQRScanner.js`
- `mobile/src/screens/FieldOpsScreen.js`

## 4. Firestore/schema changes

`audit_reports` remains the single canonical collection. New writes use:

- lifecycle status: `COMPILED`, `PENDING_SUBMISSION`, `PENDING_REVIEW`, `RETURNED`, or `CERTIFIED`
- `periodKey`, `rootReportId`, `reportVersion`, and `previousVersionId`
- immutable `operationSnapshots`, `fieldSnapshots`, `sourceLogIds`, and derived summary values
- compiler, submission, return, certification, and integrity metadata
- `deliveryMethod`/`deliveryStatus`, `submissionMethod`, and the cumulative `submissionMethods` provenance array

No duplicate `audit_history`, `cloud_audits`, `qr_audits`, or `certified_audits` collection was added.

## 5. Indexes required/created

The checked-in index configuration now includes:

- `blockFarmId ASC, compiledAt DESC` for manager audit status/history
- `status ASC, submittedAt DESC` for the SRA Inbox
- `status ASC, certifiedAt DESC` for Audit History

These indexes must be deployed with the server release before the new production queries are exercised.

## 6. Automatic period logic

The server computes the current business period in `Asia/Manila`. `/api/audit-reports/next-period` resolves the authenticated manager's assigned Block Farm, finds months with eligible active operations, and selects the oldest month with no audit, a returned version, or new operations that are not covered by a certified snapshot. If no unresolved month exists, it selects the current business period. The backend rejects future periods. Web uses this endpoint. Mobile mirrors the selection for its local-first preview, while the server remains authoritative when online compilation occurs.

## 7. Compilation logic

Official compilation is a Farm Manager-only server operation. It resolves the manager's canonical farm assignment, loads active fields in that farm, loads current active operation logs for the period, requires a crop cycle, excludes drafts and out-of-period data, builds operation snapshots, and derives counts, hectares, and costs on the server. Client totals are not trusted. The compile action produces `COMPILED`; it does not submit.

The mobile client blocks compilation only for unsynchronized field/operation mutations matching the selected Block Farm and period. Unrelated outbox work does not block the audit.

## 8. Snapshot/versioning logic

Snapshots include stable operation log identity, field/cycle data, operation values, line items, and amendment history. A deterministic root identity represents Block Farm plus period; the stored report identity also includes the version. Repeating compilation while a report is compiled, queued, or awaiting review returns that in-progress report. New eligible operations recorded after certification create the next version as a distinct batch, excluding operation IDs already protected by certified snapshots. Recompiling after `RETURNED` also creates the next version and links `previousVersionId`. Certified versions are never rewritten by the workflow.

## 9. QR payload changes

Web, mobile, and server now use one compressed version-3 JSON envelope containing the complete canonical report: identity, Block Farm, period/version, compiler, operation snapshots, field/member snapshots, source log IDs, totals, lifecycle metadata, and integrity hash. Normal reports are transferred through exactly one QR. If a compressed report exceeds safe physical QR capacity, QR generation is blocked and the manager is directed to Cloud; no operation data is truncated. QR image blobs are not persisted.

## 10. QR integrity changes

The server recomputes SHA-256 over the canonical report identity, Block Farm, period, and immutable operation snapshots, then compares it with the QR envelope and, when one exists, the stored report. Canonical validation also requires nonempty unique operations, matching source IDs, valid field attachment, complete field-operation references, and matching counts, acreage, and total cost. A decodable QR is never labeled certified.

The complete QR package can be reconstructed and inspected locally before import. The SRA sees the manager, fields, members, operations, area, and total before confirming. Import and certification still require the authoritative server. A typed report ID is only an online lookup fallback; it is not an offline report substitute.

## 11. Cloud submission changes

Compilation and submission are separate endpoints and UI actions. `POST /api/audit-reports/:id/submit` runs in a transaction, verifies the manager still owns the report's Block Farm, and transitions only `COMPILED` to `PENDING_REVIEW`. Repeated submissions return the existing state. Mobile retains a locally compiled package and queues a submission mutation when connectivity is unavailable.

## 12. QR/Cloud deduplication logic

Cloud and QR use the same deterministic report document ID and report version. If Cloud already persisted the compiled report, QR import transitions that document. If the report travelled only by QR, the server validates the complete payload and creates the full canonical `audit_reports/{reportId}` document directly in `PENDING_REVIEW`; it never creates a placeholder or second business record. Repeated import reports `alreadyImported`. Farm Manager Cloud submission remains retryable, while SRA import is a direct online server operation.

## 13. SRA Inbox changes

The web queue is now labeled Audit Inbox and shows actionable `PENDING_REVIEW` reports. The server query is status-scoped, ordered by `submittedAt`, limited, and cursor-capable. Mobile shows the bounded pending-review list before its QR tools. Certified and returned records are not retained in the normal active-review list.

## 14. Audit History changes

History is a view of the same `audit_reports` records with status `CERTIFIED`. It uses a separate ordered, paginated server query and a Load More flow. It does not copy report documents. Opening history reads the stored certified snapshot and certification metadata.

## 15. Certification changes

Certification is SRA-only, transactional, and allowed only from `PENDING_REVIEW`. The server recomputes snapshot integrity and records `certifiedByUserId`, `certifiedByName`, `certifiedAt`, `certifiedReportVersion`, and `certifiedIntegrityHash`. Retries are idempotent. Mobile blocks final certification without an online authoritative response. Certificate/print actions are shown only for certified reports and use stored snapshot values.

## 16. Return/resubmission changes

SRA can return a pending review only after supplying a reason. The workflow records the SRA identity, timestamp, reason, and audit-log event. Managers see the returned reason. A correction is recompiled as the next deterministic version, preserving the returned version rather than overwriting it, then submitted as a new review of that version.

## 17. Web changes

The Farm Operations screen now exposes the manager-only compile action without changing the Dashboard action styling. After compilation, the modal shows the saved report summary and exactly two primary delivery choices: **Send Through Cloud** and **Generate QR Transfer**. QR presents one compressed code with PNG download and a separate short report-ID copy action. The SRA verifier reconstructs the report and shows the full summary and operations before the separate Import confirmation. Manual report-ID entry remains an online fallback.

## 18. Mobile changes

Mobile now shares the canonical lifecycle, full-report validator, and compressed single-QR contract. A compiled report opens the same two delivery choices as web instead of silently submitting. The QR viewer can save the code as a PNG photo. The copy action copies only the short online report ID, never raw transfer JSON. The SRA scanner reconstructs locally and displays the complete report before confirmation. Cloud delivery can use the existing durable manager outbox when connectivity is unavailable. SRA import, return, and certification require server confirmation.

## 19. Offline behavior changes

An offline Farm Manager can retain a complete compiled package, generate its compressed single-QR transfer, or queue Cloud submission for retry. A signed-in SRA device can reconstruct and inspect that QR package without performing a report lookup, but the application intentionally does not grant SRA an offline authority mode: importing into the Inbox, returning, certifying, publishing prices, and approving users require a live authoritative server response.

## 20. Performance improvements

- Inbox and History are separate bounded server queries.
- History supports cursor pagination instead of downloading all certified reports.
- QR lookup uses the canonical document ID; hash fallback is limited to one result.
- The compressed QR contains the canonical report but omits generated image blobs and unrelated source documents.
- The code derives from one stable compiled identity and is generated only when requested.
- Certification, return, import, and submit use direct document transactions.
- Mobile history is fetched separately rather than mixed into its active Inbox render.

## 21. Existing data migration/compatibility handling

Readers normalize legacy `PENDING`, `SUBMITTED`, and `VERIFIED` values to `PENDING_REVIEW`. The SRA Inbox temporarily includes legacy `PENDING` documents on its first page. `period` is read as a fallback for `periodKey`; normalized responses expose both during migration. New writes use only the canonical lifecycle. This is lazy compatibility, not a destructive bulk migration.

## 22. Tests performed and results

- Server test suite: 243 tests passed, including full-report QR reconstruction, empty-report rejection, certified-batch, and returned-batch regressions.
- Web test suite: 25 tests passed, including server/web/mobile QR contract parity and Farm Operations placement.
- Web production build: passed.
- Android Expo export: passed; 1,151 modules bundled. The temporary export directory was removed afterward.
- Server syntax checks for the new domain and route modules: passed.
- `git diff --check`: no audit-source whitespace errors after final cleanup; line-ending conversion warnings remain because the Windows working tree uses CRLF.

The automated audit tests cover lifecycle constants, deterministic version IDs, Manila business-date rollover, snapshot summaries, compressed single-QR round-trip and cross-platform parity, empty-report rejection, route separation, and bounded one-collection query intent. Existing server tests also cover mutation outbox behavior and security regressions.

## 23. Remaining limitations or risks

- A live Farm Manager-to-SRA staging run was not executed because no isolated Firestore emulator/staging credential set was configured, and exercising the endpoints against an unknown live database would create regulatory records. The release gate should run the requested cloud, QR, duplicate, return/version, rollover, 48-report pagination, latency, and reconnect scenarios against an emulator or dedicated staging project.
- Firestore composite indexes must be deployed before rollout.
- The current data model has no canonical district ID relationship between SRA users and Block Farms. Role authorization is enforced, but true per-district SRA isolation cannot be safely inferred from display strings. Add canonical `districtId` fields and scoped rules/API queries before operating multiple districts.
- The QR uses a deterministic SHA-256 integrity identifier, not an asymmetric digital signature. Local reconstruction detects corruption and inconsistent summaries; authenticated server import remains authoritative.
- Existing legacy reports receive read compatibility but are not retroactively versioned or rehashed. A controlled migration is required if every old record must expose the full new metadata.
- The project dependency install reported npm audit findings (1 low, 14 moderate, 1 high, 1 critical). They were not auto-fixed because dependency upgrades were outside this audit workflow change and could be breaking.
- Audit-specific notifications were not added because the repository does not expose an existing notification delivery pipeline for these events; creating a parallel notification system would violate the requirement.
