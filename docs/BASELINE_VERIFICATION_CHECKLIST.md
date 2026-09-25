# HUGPONG Baseline Verification Checklist

**Applies to:** revision `5502195bb855b6648ae47d89b49a071dee9f982b` and the pre-refactor behavior documented in `CURRENT_SYSTEM_SPECIFICATION.md`.  
**Purpose:** Establish repeatable evidence for every existing feature before behavior changes.  
**Result codes:** `PASS`, `FAIL`, `BLOCKED`, `NOT IMPLEMENTED`, `NOT APPLICABLE`.

## Test protocol

- [ ] Record tester, date/time, branch, commit, OS, browser, mobile platform/device, API URL, Firebase project, and network state.
- [ ] Use a disposable non-production Firestore project or emulator. Current tests can permanently delete data.
- [ ] Seed a known dataset and record its collection/document counts before testing.
- [ ] Prepare one account for each canonical role: Farm Member, Farm Manager, SRA Admin, Super Admin.
- [ ] Capture request/response, console log, screenshot, and changed Firestore documents for every mutation.
- [ ] Run web and mobile checks against the same starting dataset.
- [ ] Repeat offline-capable mobile cases offline, reconnecting, and after a cold restart.
- [ ] For every contradiction test, record both observed current behavior and required future behavior. Do not “pass” a test merely because the contradictory behavior matches current code.

## A. Build, launch, and static surfaces

- [ ] A-01 `npm start` at repository root starts the Express server.
- [ ] A-02 `run-server.bat` starts port 3000.
- [ ] A-03 `run-web.bat` opens `/login.html` and keeps the server running.
- [ ] A-04 `run-mobile.bat` starts Expo from `/mobile`.
- [ ] A-05 `/health` returns server/Firebase/session status.
- [ ] A-06 `/api/data` returns the compatibility message.
- [ ] A-07 `/` serves the public landing page with admin and release/download links.
- [ ] A-08 Privacy, terms, and cookie pages open and cross-link correctly.
- [ ] A-09 Necessary-storage consent banner displays once and persists acknowledgement.
- [ ] A-10 Web login requires privacy/terms acknowledgement.
- [ ] A-11 External assets (Tailwind, fonts, QR scanner) load when online and degradation is recorded when offline.

## B. Authentication and sessions

- [ ] B-01 Web login accepts valid 8-digit ID credentials for Farm Manager, SRA Admin, and Super Admin.
- [ ] B-02 Web login accepts a registered Philippine mobile number.
- [ ] B-03 Invalid web credentials show an error; five failures trigger a 60-second UI lockout.
- [ ] B-04 Web first-login phone verification blocks dashboard entry until completed.
- [ ] B-05 Web first-login password change enforces length, mixed case, number, confirmation, and non-default password.
- [ ] B-06 Web session survives reload and routes to the correct role dashboard.
- [ ] B-07 Web logout clears local session data and server session.
- [ ] B-08 New login requires the server; a previously authenticated web/Firebase session restores offline without rechecking a password locally.
- [ ] B-09 Mobile login accepts valid Farm Member, Farm Manager, and SRA Admin credentials.
- [ ] B-10 Mobile rejects Super Admin with the web-only message.
- [ ] B-11 Invalid mobile credentials show an error; five failures trigger a 60-second UI lockout.
- [ ] B-12 Mobile first-login password change meets the same password rules.
- [ ] B-13 Mobile session restores after process restart and logout clears it.
- [ ] B-14 Forgot-password displays the administrator-assisted recovery path and performs no client-side OTP or password mutation.
- [ ] B-15 Profile mobile-number change verifies password, validates PH format, and updates linked plot contact display.
- [ ] B-16 Profile password change verifies the current password on the server and persists only a server-side scrypt hash.
- [ ] B-17 PIN, biometric, auto-lock, session-alert, language, and other profile/security preferences render and persist as implemented.

### Security characterization

- [ ] B-18 An unsigned/modified `HUGPONG.*` bearer payload is rejected by the server.
- [ ] B-19 A default/master password cannot authenticate an unrelated user.
- [ ] B-20 `/auth/verify-phone` and `/auth/change-password` reject unauthenticated mutation.
- [ ] B-22 Firebase custom tokens contain the correct canonical claim for each of the four roles.
- [ ] B-23 Unauthenticated Firestore reads fail, and all client access to `user_credentials` fails.
- [ ] B-24 Public `users` documents, API responses, local storage, and realtime caches contain no credential fields.
- [ ] B-21 API session cookies use production-safe secret/store/secure settings in production. **Not established by repository.**

## C. Role access and scoping

- [ ] C-01 Farm Member sees only assigned fields, personal logs, personal analytics, planner, field ops, profile, and support/sync surfaces intended for the role.
- [ ] C-02 Farm Manager sees only the assigned block farm's fields, Members, operations, reports, and telemetry.
- [ ] C-03 SRA Admin sees district oversight, report audit/certification, price publication, block farms, fields, and users.
- [ ] C-04 Super Admin sees platform governance, district monitoring, history, telemetry, tickets, maintenance, and settings on web.
- [ ] C-05 SRA Admin mobile Planner tab is absent.
- [ ] C-06 SRA Admin mobile is blocked offline and can retry connectivity.
- [ ] C-07 Super Admin mobile remains unavailable by explicit design.
- [ ] C-08 Direct navigation to another web role's URL is denied or rerouted.
- [ ] C-09 Changing browser local role state cannot grant authority. **Required; current UI design needs characterization.**
- [ ] C-10 Public collection endpoints do not leak users/fields/logs/tickets. **Required; expected current FAIL.**
- [ ] C-11 All server reads return only role/assignment-scoped records. **Required; expected current FAIL.**

## D. Registration and user management

- [ ] D-01 Mobile registration validates name, phone, password, OTP, and block farm.
- [ ] D-02 Record the effect of selecting each advertised registration role.
- [ ] D-03 New self-registration does not create privileged roles.
- [ ] D-04 Determine whether a new registration is immediately Active or pending review; compare with UI wording.
- [ ] D-05 Manager can approve/reject Member registration within the assigned block farm only.
- [ ] D-06 Manager cannot create/approve Farm Manager, SRA Admin, or Super Admin.
- [ ] D-07 SRA/Super Admin user creation/editing preserves 8-digit prefix conventions and assignments.
- [ ] D-08 User edit OTP and phone validation behave consistently.
- [ ] D-09 Assigning a Farm Manager updates both user and block-farm references.
- [ ] D-10 User directory search, sort, pagination, filters, history, and removal behavior are captured.
- [ ] D-11 All user mutations pass through authenticated server validation. **Required; expected current FAIL.**

## E. Block farms and field plots

- [ ] E-01 Create a block farm with name, location, hectares, and optional manager; verify the server returns a unique permanent ID/code.
- [ ] E-02 Edit a block farm and verify manager linkage remains symmetrical.
- [ ] E-03 Enroll a field with system-generated ID, Farm Member, hectares, Block Farm, and soil; verify its server-created Crop Year Cycle starts at Stage 1 with no variety until Planting.
- [ ] E-04 Reject client-supplied Field IDs, identity changes, and hectares outside accepted limits.
- [ ] E-05 Farm Manager cannot enroll or edit a field outside the assigned block farm.
- [ ] E-06 Field/member links resolve consistently by permanent IDs, not display names.
- [ ] E-07 Edit plot metadata and confirm web/mobile/Firestore converge.
- [ ] E-08 Archive a field plot and confirm it leaves active views but remains in history.
- [ ] E-09 Search, filter, sort, pagination, card/table modes, and plot detail/history views work.
- [ ] E-10 Direct client field writes are identified. **Expected current observation; future target is API-only.**

## F. Six-stage planner and crop cycle

- [ ] F-01 Both clients show the same six canonical stages in the same order.
- [ ] F-02 Each stage exposes the same SRA catalogue operations and baseline costing.
- [ ] F-03 Add/edit/remove a custom direct-rate operation and verify cost math.
- [ ] F-04 Add/edit/remove a grouped operation with child materials/labor and verify totals.
- [ ] F-05 Save one stage plan and a full-season plan; reload on web and mobile.
- [ ] F-06 Transfer a single operation and all stage operations to drafts.
- [ ] F-07 Removing a stage with submitted logs is prevented.
- [ ] F-08 Reset one stage and all stages to the standard template.
- [ ] F-09 Stage advancement records current stage consistently and warns on skipped/missing work.
- [ ] F-10 Completed-stage entries are treated as supplemental without moving the active stage backward.
- [ ] F-11 Starting a new cycle resets to stage 1 and preserves prior submitted logs as ARCHIVED.
- [ ] F-12 README's obsolete eight-stage statement is not used as an acceptance expectation.

## G. Drafts and operation submission

- [ ] G-01 Farm Member creates a draft while online.
- [ ] G-02 Farm Member creates a draft while offline and it survives restart.
- [ ] G-03 Edit and discard a draft without creating a submitted history record.
- [ ] G-04 Submit one draft and verify identity, field, stage, date, operation ID/name, quantities, units, people, hectares, subitems, and total cost.
- [ ] G-05 Batch-submit selected drafts and verify unique stable IDs and totals.
- [ ] G-06 Submit a catalogue operation and a custom operation directly.
- [ ] G-07 Duplicate and abnormal-cost warnings trigger as implemented.
- [ ] G-08 Offline submission is queued once, remains visible, and syncs exactly once after reconnection.
- [ ] G-09 Cold restart before reconnection does not lose or duplicate an offline submission.
- [ ] G-10 Web/mobile ledgers converge after submission and snapshot refresh.
- [ ] G-11 A submitted operation is immediately ACTIVE/recorded and does not enter manager approval. **Required.**
- [ ] G-12 No Manager approval/rejection action or status appears for an operation. **Required; documentation/API expected current FAIL.**

## H. Operation amendments, retention, and history

- [ ] H-01 Authorized amendment requires identity/password and a reason.
- [ ] H-02 Amendment preserves the same log identity, original values/history, editor, time, and reason.
- [ ] H-03 Unauthorized users cannot amend another scope's logs.
- [ ] H-04 Logs linked to certified reports obey the defined lock/amendment policy consistently on server, web, and mobile.
- [ ] H-05 Crop-cycle rollover changes submitted log lifecycle from ACTIVE to ARCHIVED only.
- [ ] H-06 Archived logs remain queryable in field, block-farm, and audit history.
- [ ] H-07 Submitted log deletion is absent from UI and API. **Required; expected current FAIL.**
- [ ] H-08 `DELETE /api/logs/:id` is unavailable. **Required; expected current FAIL.**
- [ ] H-09 `/api/logs/purge-past` never hard-deletes submitted logs. **Required; expected current FAIL.**
- [ ] H-10 Web “delete operation/clear history” paths cannot erase submitted records. **Required; expected current FAIL.**
- [ ] H-11 Mobile `deleteOperationLog`/`deletePastLogsForField` cannot erase submitted records. **Required; expected current FAIL.**
- [ ] H-12 Certification never changes operation lifecycle status away from ACTIVE/ARCHIVED. **Required; expected current FAIL.**

## I. Farm Manager monitoring and takeover

- [ ] I-01 Manager dashboard totals fields, hectares, operations, costs, and latest activity within assigned farm.
- [ ] I-02 Field Operations filters/searches fields and shows stage, logs, cost, sync, and history.
- [ ] I-03 Takeover requires manager authorization and records actor/action source.
- [ ] I-04 Manager can record a supervisory operation and advance an authorized stage.
- [ ] I-05 Takeover/amendment creates a durable audit event.
- [ ] I-06 Manager sync monitor shows members/devices, pending counts, last sync, health thresholds, and filters.
- [ ] I-07 Manager can compile eligible ACTIVE logs into a monthly audit report.
- [ ] I-08 Compilation marks report linkage without approving/certifying operation logs.
- [ ] I-09 Manager cannot invoke individual-log certification. **Required; expected current API FAIL.**

## J. SRA audit/report workflow

- [ ] J-01 Manager selects reporting month and sees eligible/uncompiled counts and missing-field warnings.
- [ ] J-02 Compilation produces stable report ID, farm, period, area, log count, total cost, stage breakdown, operation snapshot, compiler, and timestamp.
- [ ] J-03 Compiling after an already certified report creates a distinct revision/batch for new eligible logs without overwriting the certificate.
- [ ] J-04 Generated QR/envelope resolves to the exact persisted report and exact content digest.
- [ ] J-05 Unknown, malformed, or modified QR/envelope is rejected. **Required; expected current FAIL/needs characterization.**
- [ ] J-06 SRA Admin can scan via camera/file and enter a code manually.
- [ ] J-07 SRA Admin inspection shows farm, period, plots/hectares, operations, cost, compiler, hash, and current status.
- [ ] J-08 Only SRA Admin can certify a report. **Required; Super Admin bypass needs explicit resolution.**
- [ ] J-09 Certification persists `Certified`, SRA actor, role, timestamp, and immutable audit event on the report.
- [ ] J-10 Certification is idempotent and cannot silently certify a different report/hash revision.
- [ ] J-11 Certification does not set operation-log status to Certified. **Required; expected current FAIL.**
- [ ] J-12 Manager can view/download/print report and QR but cannot issue the SRA seal.
- [ ] J-13 Web and mobile show the same Pending/Certified report result.
- [ ] J-14 Audit report mutations and verification pass through a server transaction/API. **Required; expected current FAIL.**

## K. Prices

- [ ] K-01 Latest raw sugar and molasses benchmarks render on web/mobile.
- [ ] K-02 Price history sorts correctly and charts/time filters use actual records.
- [ ] K-03 SRA Admin publishes a complete weekly price/circular online.
- [ ] K-04 Invalid/empty/non-numeric price values are rejected server-side.
- [ ] K-05 Farm Member and Farm Manager cannot publish prices.
- [ ] K-06 Decide and test whether Super Admin oversight includes publication or read-only monitoring; approved role ownership currently favors SRA publication.
- [ ] K-07 New price appears on both clients after synchronization.
- [ ] K-08 All price mutation uses authenticated API. **Required; expected direct-write current FAIL.**

## L. Analytics and history

- [ ] L-01 Member analytics scopes to assigned active plots/logs.
- [ ] L-02 Manager analytics scopes to assigned block farm.
- [ ] L-03 SRA analytics can filter district/block farm/plot.
- [ ] L-04 Active-cycle total cost equals the sum of ACTIVE scoped logs.
- [ ] L-05 Cost/hectare handles zero area and uses the selected scope.
- [ ] L-06 Category breakdown sums to the total and uses consistent category mapping.
- [ ] L-07 Each active field belongs to exactly one of six stage buckets.
- [ ] L-08 Ledger search/filter/pagination/detail/receipt views use real records.
- [ ] L-09 Archived records do not inflate active-cycle totals but remain accessible in history.
- [ ] L-10 Audit compliance derives from persisted reports and defined denominator, including the zero-report case.
- [ ] L-11 Web dashboard and mobile analytics agree for the same scope and snapshot.
- [ ] L-12 CSV/PDF/print/download controls produce a real artifact where claimed; simulated alerts are recorded as not implemented.

## M. Offline storage, sync, and telemetry

- [ ] M-01 Mobile first launch initializes storage and cloud listeners without seed contamination.
- [ ] M-02 Cached fields, logs, drafts, users, prices, tickets, reports, history, and session restore correctly.
- [ ] M-03 Outbox records operation log, ticket, field-stage update, and audit event intent as implemented.
- [ ] M-04 FIFO flush, retries, conflict handling, and retry limits are observed under forced failures.
- [ ] M-05 Reconnection triggers automatic sync and manual sync is also available.
- [ ] M-06 Concurrent web/mobile edits do not overwrite newer authoritative values. **No server conflict authority; likely current FAIL.**
- [ ] M-07 Archived logs are not re-uploaded as ACTIVE or lost during snapshot merge.
- [ ] M-08 Locally deleted IDs do not mask legitimate archived history. **Must be resolved under archive-only rule.**
- [ ] M-09 Reset local cache affects only local HUGPONG storage and does not delete cloud history.
- [ ] M-10 Terminal telemetry publishes actor/device, pending count, sync time, health, app/OS/battery data as available.
- [ ] M-11 Manager/Super Admin telemetry dashboards update from `terminal_diagnostics`.
- [ ] M-12 Offline queue mutation ultimately reaches the server API, not Firestore directly. **Required; expected current FAIL.**

## N. Support and notifications

- [ ] N-01 Member/manager can create a support ticket with title, category, priority, details, author, and block farm.
- [ ] N-02 Ticket persists offline and syncs after reconnection.
- [ ] N-03 Super Admin lists, searches, filters, paginates, opens, updates, and resolves tickets.
- [ ] N-04 Ticket visibility is role/scoped and sensitive data is not public. **Required; expected current API FAIL.**
- [ ] N-05 OTP SMS success path does not expose the OTP in responses/logs.
- [ ] N-06 SMS failure fallback is safe and cannot be abused to bypass verification. **Expected current concern.**
- [ ] N-07 Alert sending requires authenticated authorized callers. **Required; expected current FAIL.**
- [ ] N-08 Mobile notification read/dismiss state persists where surfaced.

## O. Super Admin maintenance and governance

- [ ] O-01 District plot and user monitors are read/scoped as intended.
- [ ] O-02 System audit ledger renders registration, field, operation, audit, security, and archive events without fabricating missing data.
- [ ] O-03 Backup export contains the documented collections and excludes secrets/password material.
- [ ] O-04 Restore validates schema, requires authorization, and persists through server-controlled transactions. **Expected current direct/local limitation.**
- [ ] O-05 Maintenance controls clearly distinguish functional controls from UI-only simulations.
- [ ] O-06 Cache/reset actions cannot delete canonical data or submitted log history.
- [ ] O-07 User and security logs are append-only under server authority. **Not established currently.**

## P. API contract and authorization matrix

- [ ] P-01 Every non-public endpoint rejects missing/expired/forged credentials with 401.
- [ ] P-02 Every role-restricted endpoint rejects an authenticated wrong role with 403.
- [ ] P-03 `GET /api/users`, fields, logs, and tickets are authenticated and server-scoped. **Expected current FAIL.**
- [ ] P-04 Log creation derives actor/scope on server instead of trusting payload. **Expected current FAIL.**
- [ ] P-05 Field custom-stage/custom-operation updates enforce manager scope and valid role. **Expected current FAIL.**
- [ ] P-06 Log create validates field existence, assignment/scope, lifecycle, numeric bounds, date, operation schema, and idempotency. **Current validation incomplete.**
- [ ] P-07 No API accepts permanent deletion of a submitted log. **Expected current FAIL.**
- [ ] P-08 Report compile/certify endpoints exist and enforce Farm Manager/SRA Admin separation. **Not implemented.**
- [ ] P-09 Price publishing validates finite positive bounds and official metadata. **Current validation incomplete.**
- [ ] P-10 CORS is allowlisted and session cookies are production-safe outside local development. **Current CORS is permissive.**
- [ ] P-11 Server errors do not expose secrets or internal identifiers.
- [ ] P-12 API behavior is covered by automated contract/integration tests. **Not implemented.**

## Q. Cross-platform parity and regression exit

- [ ] Q-01 For each shared role capability, execute the same scenario on web and mobile and compare Firestore/API results field by field.
- [ ] Q-02 Canonical role labels and role keys map consistently at every boundary.
- [ ] Q-03 Six-stage catalogue, custom plan, costing, field scope, and lifecycle semantics match.
- [ ] Q-04 Operation ACTIVE/ARCHIVED status and report Pending/Certified status are not conflated.
- [ ] Q-05 Offline differences are intentional and documented; reconnection yields the same authoritative state.
- [ ] Q-06 All existing functional controls have a recorded PASS/FAIL/NOT IMPLEMENTED result.
- [ ] Q-07 Every contradiction C-01 through C-22 has an owner, disposition, and future acceptance test.
- [ ] Q-08 No application behavior changed during baseline creation.
- [ ] Q-09 Repository diff contains documentation only.
- [ ] Q-10 Refactoring does not begin until this baseline is reviewed and approved.
