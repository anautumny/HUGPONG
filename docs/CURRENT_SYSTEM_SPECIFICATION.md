# HUGPONG Current-System Specification

**Status:** Authoritative pre-refactor baseline  
**Audited revision:** `5502195bb855b6648ae47d89b49a071dee9f982b` (`pre-refactor`)  
**Audit date:** 2026-09-15  
**Scope:** Repository implementation, `README.md`, `docs/`, `AGENTS.md`, launch scripts, server, web, mobile, and public policy pages.

> Phase status: Sections labeled “Observed” preserve the audited pre-refactor baseline and are not a description of the current Phase 2/3 working tree. The current canonical data model is in `FIRESTORE_SCHEMA.md`; the implemented authentication authority and remaining deployment work are in `PHASE_3_AUTHENTICATION.md`.

## 1. How to read this specification

This document separates two things that the repository currently mixes:

- **Approved requirement** means the behavior that governs future maintenance and acceptance.
- **Observed implementation** means what revision `5502195` actually does, including contradictions and unsafe paths.

The approved requirements take precedence over descriptive text and existing code when they conflict. Existing contradictory behavior is documented here; it is not legitimized by being present in the baseline.

The controlling rules are:

1. HUGPONG has exactly four business roles: **Member Farmer**, **Farm Manager**, **SRA Admin**, and **Super Admin**.
2. Submitted operation logs are historical records. Their canonical lifecycle is **ACTIVE -> ARCHIVED** only. They are never permanently deleted.
3. Farm Managers do not approve or certify individual operation logs.
4. Certification belongs to the **SRA audit/report workflow**, not to the operation-log lifecycle.
5. Business rules, authorization, validation, and data mutation must be server-authoritative and persisted in the database.
6. Any future functional change must cover database/schema, server/API/controller, web, and mobile. Web and mobile behavior must remain in parity where the role is supported.

Terminology aliases found in code are normalized as follows:

| Canonical term | Current aliases |
| --- | --- |
| Member Farmer | `Member`, `member`, “Field Member” |
| Farm Manager | `Farm Manager`, `manager`, `farm_manager` |
| SRA Admin | `SRA (Admin)`, `SRA Admin`, `admin`, `sra_admin` |
| Super Admin | `Super Admin`, `superadmin`, `super_admin` |
| ACTIVE operation log | Mostly `Recorded`; sometimes `Amended`, `Certified`, or implicit flags |
| ARCHIVED operation log | `Archived`, `isArchived`, `isPastCycle`, and sometimes `isDeleted` |

## 2. Product boundary and runtime topology

HUGPONG is an offline-capable sugarcane block-farm management system for Silay City. It consists of:

- A static web portal and role-specific web dashboards served by Express.
- An Expo/React Native mobile app.
- An Express 4 server on port 3000.
- Google Cloud Firestore project `hugpong-ff`.
- Browser `localStorage` and mobile `AsyncStorage` caches.
- Semaphore SMS integration for OTP/alerts.

### Approved target topology

Clients may cache data and queue offline intent, but all authoritative validation and mutations must pass through the server/API. Firestore is the persistent database. A client cache is never an independent authority.

### Observed topology

The implementation is hybrid:

- Express reads and writes Firestore through `firebase-admin`.
- Web and mobile attach Firestore snapshot listeners directly.
- Web and mobile perform many direct Firestore mutations.
- Web can authenticate through Express, then fall back to direct Firestore/local data.
- Mobile authenticates from its in-memory/AsyncStorage/Firestore-synchronized user array and does not use `/auth/login`.
- The mobile outbox flush writes directly to Firestore.
- The server has no endpoints for audit reports, audit events, terminal telemetry, registration, full user editing, field archival, or many other client mutations.

Therefore, the code does **not** currently satisfy centralized authority.

## 3. Persistence model

Firestore is schemaless in this repository: no Firestore rules, indexes, emulator configuration, schema migrations, or validators are checked in. The following collections are referenced:

| Collection | Observed purpose | Principal writers |
| --- | --- | --- |
| `users` | Identity, role, contact, assignment, password hash, verification state | Server, web, mobile |
| `block_farms` | Block-farm identity, area, location, manager link | Server, web |
| `fields` | Plot/member assignment, hectares, crop stage/cycle, custom plan | Server, web, mobile |
| `operation_logs` | Submitted field operations and costs | Server, web, mobile, sync engine |
| `sra_prices` | Weekly raw sugar and molasses benchmarks | Server, web, mobile |
| `support_tickets` | Support requests and status | Server, web, mobile, sync engine |
| `audit_reports` | Monthly compiled dossiers, QR envelope/hash, SRA certification | Server, web, mobile |
| `audit_logs` | System/audit trail events | Web, mobile, sync engine |
| `terminal_diagnostics` | Mobile sync/device telemetry | Mobile telemetry; read by web |
| `sync_operations` | Referenced by reset utilities; no normal runtime implementation found | Reset utility only |
| `system_history`, `assignment_requests`, `draft_logs` | Referenced by cleanup utility; normal runtime primarily stores these locally | Cleanup utility/local clients |

### Core entity relationships

- A `block_farms` record may reference one Farm Manager by `farmManagerId`/`farmManagerName`.
- A `users` record may reference a block farm and a field.
- A `fields` record references a block farm and a Member Farmer.
- An `operation_logs` record references a field and optionally a submitting user.
- An `audit_reports` record represents a block farm and reporting period and contains or summarizes operation logs.
- `audit_logs` records changes and workflow events, but enforcement of immutability is client-side and inconsistent.

### Canonical operation-log lifecycle

For all future behavior and acceptance, a submitted operation log has exactly this lifecycle:

```text
ACTIVE -> ARCHIVED
```

- A newly submitted log is `ACTIVE`.
- Starting a new crop cycle or explicitly archiving the relevant history moves it to `ARCHIVED`.
- Archival preserves the record and its identifiers, values, authorship, timestamps, amendments, and audit references.
- No endpoint or client action may hard-delete a submitted log.
- Drafts are not submitted operation logs and may be discarded.
- Certification state belongs to `audit_reports`; it must not replace an operation log's `ACTIVE` or `ARCHIVED` state.
- Whether an ACTIVE log can be amended, and under whose authority, is a separate authorization/audit concern—not another lifecycle state.

### Observed lifecycle divergence

Current code creates logs as `Recorded`, changes some to `Amended` or `Certified`, archives others as `Archived`, and uses overlapping flags (`isPastCycle`, `isArchived`, `isDeleted`, `certified`, `compiled`). Server, web, and mobile all contain permanent-delete paths. This is a critical contradiction, not an alternate supported lifecycle.

## 4. Roles and responsibilities

### Member Farmer

Approved responsibility:

- Use mobile for assigned plot visibility, planning, drafts, operation submission, offline queueing/sync, active/history viewing, analytics, profile/security, and support.
- May not approve or certify operation logs or audit reports.
- Sees only authorized personal/assigned data once server-side scoping is implemented.

Observed implementation:

- Mobile home shows assigned fields, stage/progress, price data, and recent activity.
- Planner supports a six-stage plan, catalogue/custom operations, cost calculation, saving a field plan, and transferring operations to drafts.
- Field Ops supports drafts, single/batch submission, viewing/editing/deleting some logs, history, sync, and assignment requests.
- Analytics shows active-cycle cost, cost per hectare, category breakdown, stage progress, and ledger detail.
- Registration UI advertises Member, Farm Manager, and SRA Admin choices, but `registerUser()` always creates an active Member account directly in Firestore.
- There is no Member web workspace; web login collapses non-manager/non-super roles into the SRA Admin route.

### Farm Manager

Approved responsibility:

- Manage plots and Member Farmer assignments within the assigned block farm.
- Monitor operations and synchronization.
- Record a supervisory operation/takeover when permitted, with actor attribution and audit history.
- Compile active operation logs into a monthly audit/report dossier for SRA review.
- Does **not** approve or certify submitted operation logs.

Observed implementation:

- Web exposes Dashboard, Field Plot Registry, Field Operations, Sync Monitor, User Management, and Settings.
- Mobile exposes Dashboard, Planner, Field Ops, Analytics, Profile, and Sync Monitor.
- Both clients permit field/stage/plan edits, takeover logging, Member registration handling, crop-cycle rollover, and monthly report compilation.
- The server `/api/logs/certify` explicitly permits Farm Managers, contradicting the approved workflow.
- README and docs also state manager approval/certification, while much UI language says “recorded” or “compiled.”

### SRA Admin

Approved responsibility:

- District/block-farm oversight.
- Publish official price circular data.
- Inspect compiled audit reports, verify QR/report contents, and certify the audit report.
- Certification attaches to the audit/report record and its SRA audit trail, not to operation-log lifecycle status.

Observed implementation:

- Web exposes Dashboard, SRA Audit Center, SRA Price Monitor, Block Farm Registry, User Management, and Settings.
- Mobile exposes Dashboard, Field Ops/Audit Desk, Analytics, and Profile; Planner is hidden.
- Mobile blocks SRA Admin while offline.
- Web and mobile can scan/manual-enter report data, inspect a report, and issue an SRA seal.
- Certification is performed directly in Firestore from clients; the server has no audit-report endpoint.
- Certification code also marks operation logs `Certified`, contrary to the canonical log lifecycle.

### Super Admin

Approved responsibility:

- Platform governance, user/role administration, district monitoring, audit/history visibility, telemetry, support, maintenance, and security oversight.
- Universal access does not transfer SRA professional certification ownership; audit certification remains an SRA audit/report function.

Observed implementation:

- Web-only by explicit mobile authentication restriction.
- Web exposes Dashboard, District Plot Registry, User Directory Monitor, System Audit Ledger, SRA Price Monitor, Sync Monitor, Support/Tickets, Maintenance/Security, and Settings.
- Server `requireRole()` grants Super Admin universal access, including current log certification and SRA price publication.
- The shared web dashboard contains role switching code, although entry scripts also attempt role-route enforcement.

## 5. Functional workflows

### Authentication and account security

Observed features:

- Web login by 8-digit user ID or Philippine mobile number; privacy/terms acknowledgement; five-attempt, 60-second UI lockout; phone verification and first-login password change; local token/session persistence; logout.
- Mobile login, registration, forgot/reset password, first-login password change, local session restore, profile contact/password changes, PIN/biometric preferences, and five-attempt UI lockout.
- SMS OTP via server/Semaphore with simulation fallback; mobile also contains a direct Semaphore fallback.

Important baseline limitations:

- Express sessions use the default in-memory session store and a checked-in fallback secret.
- Bearer tokens are unsigned, client-generated base64 payloads; the server hydrates sessions from them without cryptographic verification.
- `/auth/login` accepts several master/default passwords regardless of the selected user's stored secret.
- Web falls back to direct Firestore/local authentication if the server fails.
- Mobile authenticates locally and writes verification/password changes directly.
- Phone verification endpoints accept client-provided identifiers and are not guarded by `requireAuth`.
- Mobile self-registration immediately creates an active Member record; no server registration endpoint exists.

### Block farms and fields

Observed features:

- SRA/Super Admin web/API block-farm creation and editing with manager linkage.
- Manager field enrollment/editing, Member assignment, hectares and agronomic metadata, active stage, crop cycle, custom stages, and custom operations.
- Six default stages: land preparation; planting/establishment; basal nutrition/early care; cultivation/weed management; maintenance/final hilling-up; harvesting/transport.
- Crop-cycle rollover resets a plot to stage 1 and archives current-cycle logs.
- Field plot archival/history exists independently from operation-log archival.

### Operation capture

Observed features:

- SRA operation catalogue plus custom direct or grouped line-item operations.
- Draft save, draft submission, batch submission, date, quantity/unit/rate, hectares, people, cost totals, offline markers, submitting actor, and manager takeover attribution.
- Current-stage progression with warnings for missing prior-stage work.
- Log amendment UI with password verification, reason, edit history, and audit event.
- Current code permits deletion of non-locked logs and clearing past history.

Approved correction to interpretation:

- Submission is recording, not a request for Farm Manager approval.
- Manager monitoring, takeover, compilation, or correction auditing must never be labeled or implemented as operation approval.
- Submitted records must be retained and eventually archived, never purged.

### SRA audit/report workflow

Approved workflow:

1. ACTIVE submitted operation logs exist independently.
2. A Farm Manager compiles eligible logs for a block farm/reporting period into an audit report.
3. The report enters an SRA review queue.
4. An SRA Admin inspects the report and its QR/hash envelope.
5. The SRA Admin certifies the **audit report** and an audit event records the action.
6. Source operation logs retain `ACTIVE` or `ARCHIVED`; report linkage/lock metadata may be stored separately.

Observed workflow:

- Web/mobile compile monthly reports, generate a report ID and locally calculated QR/hash envelope, mark source logs compiled, and write `audit_reports` directly.
- SRA web/mobile scans or enters QR/report data and directly marks the report certified.
- Some paths accept a syntactically plausible unknown hash and construct a pending report instead of proving that the report exists.
- Certification also changes related logs to `Certified` and claims ledger immutability, but enforcement remains client-side.
- Server `/api/logs/certify` certifies individual logs and has no report verification/certification API.

### Prices, analytics, sync, support, and public web

- SRA price history includes raw sugar and molasses values, change, week/date/circular/source, charts, and publication UI.
- Role-scoped analytics calculate fields, hectares, active-cycle costs, cost/hectare, categories, operations, stages, and audit compliance.
- Mobile queues offline logs/tickets/audit events and syncs on reconnection; web caches an entire data object and debounces direct Firestore writes.
- Terminal diagnostics publish mobile device/sync status for dashboards.
- Support tickets can be created on clients/server; web Super Admin can view/update local ticket state.
- Public web includes landing/download links, admin gateway, privacy policy, terms, cookie policy, and a necessary-storage consent banner.

## 6. Server API baseline

`GET` routes shown as public have no `requireAuth` in the current code.

| Endpoint | Observed authorization | Observed result |
| --- | --- | --- |
| `POST /auth/login` | Public | Firestore/canonical login; creates session |
| `POST /auth/verify-phone` | Public | Marks phone verified |
| `POST /auth/change-password` | Public | Changes password hash by supplied ID |
| `GET /auth/session` | Session | Returns current session state |
| `POST /auth/logout` | Session if present | Destroys session |
| `GET /api/users` | Public | Returns all users |
| `POST /api/users/approve` | Super Admin, Farm Manager, or generic admin | Creates/activates user; manager restricted to Members |
| `GET /api/block-farms` | Public | Returns all block farms |
| `POST`, `PUT /api/block-farms` | SRA Admin/admin/Super Admin | Creates/updates block farm |
| `GET /api/fields` | Public | Returns all fields |
| `POST /api/fields` | Farm Manager/admin/Super Admin | Creates/merges field |
| `PUT /api/fields/:id/custom-operations` | Any authenticated user | Updates custom operations |
| `PUT /api/fields/:id/custom-stages` | Any authenticated user | Updates custom stages |
| `GET /api/logs` | Public | Returns all operation logs |
| `POST /api/logs` | Public | Creates/merges operation log |
| `POST /api/logs/certify` | Farm Manager/SRA Admin/Super Admin | Certifies an individual log |
| `DELETE /api/logs/:id` | Public | Permanently deletes a log |
| `POST /api/logs/purge-past` | Public | Permanently deletes archived/past logs |
| `GET /api/prices` | Public | Returns price history |
| `POST /api/prices` | SRA Admin/admin/Super Admin | Publishes a price |
| `GET /api/tickets` | Public | Returns all tickets |
| `POST /api/tickets` | Public | Creates ticket |
| `POST /api/sms/send-otp` | Public | Sends OTP or returns it in fallback response |
| `POST /api/sms/send-alert` | Public | Sends arbitrary alert |
| `GET /api/sms/status` | Public | Exposes gateway configuration summary |
| `GET /health` | Public | Health/session details |
| `GET /api/data` | Public | Compatibility status message |

## 7. Cross-platform parity baseline

| Capability | Web | Mobile | Parity assessment |
| --- | --- | --- | --- |
| Member Farmer workspace | None | Yes | Missing on web, if web Member support is required |
| Farm Manager workspace | Yes | Yes | Broad feature parity; implementations are independent |
| SRA Admin workspace | Yes | Yes | Broad feature parity; implementations are independent |
| Super Admin workspace | Yes | Explicitly blocked | Deliberate web-only implementation |
| Offline Member/Manager work | Browser local cache | AsyncStorage + outbox | Different semantics |
| Server-authoritative mutation | Rare | Rare | Not compliant on either client |
| Audit report compile/certify | Direct client/Firestore | Direct client/Firestore | Similar behavior, no server authority |
| Operation retention | Hard-delete paths | Hard-delete paths | Both contradict approved retention |

## 8. Contradiction register

Severity meanings: **Critical** violates an approved invariant or data/security boundary; **High** can produce materially wrong access/workflow/data; **Medium** is significant documentation/parity drift; **Low** is naming or operational friction.

| ID | Severity | Contradiction | Evidence and baseline decision |
| --- | --- | --- | --- |
| C-01 | Critical | Submitted logs must never be deleted, but server/web/mobile permanently delete them. | `server/routes/logs.js`, `web/shared/core.js`, and `mobile/src/data/dataStore.js` contain delete/purge paths. Canonical behavior is archive-only. |
| C-02 | Critical | Farm Manager log approval/certification is forbidden, but README, docs, and API grant it. | README says managers approve; `system_flow_audit.md`, `folder-structure.md`, and `/api/logs/certify` assign manager certification. Canonical manager action is record/monitor/compile, not approve/certify. |
| C-03 | Critical | Certification belongs to SRA reports, but clients/server use `Certified` as an operation-log status. | Web/mobile SRA certification updates logs; server certifies individual logs. Canonical log status remains ACTIVE/ARCHIVED. |
| C-04 | Critical | `AGENTS.md` requires centralized server authority, but both clients write most collections directly. | Direct `setDoc`/`deleteDoc` calls exist throughout web/mobile; outbox flush targets Firestore. |
| C-05 | Critical | Claimed strict RBAC conflicts with unauthenticated API reads and mutations. | Users, fields, logs, prices, tickets reads are public; log create/delete/purge and ticket create are public; field plan updates accept any authenticated role. |
| C-06 | Critical | Claimed verified sessions conflict with unsigned client tokens and permissive password bypasses. | Client-generated base64 tokens are trusted by server; global default/master passwords are accepted. |
| C-07 | High | Audit certification is presented as tamper-evident/immutable but is client-generated and client-mutated. | No server audit-report routes, signature verification, transaction, or checked-in Firestore rules. Unknown hashes can yield constructed reports. |
| C-08 | High | Web and mobile authentication authorities differ. | Web uses server then Firestore/local fallback; mobile uses local synchronized users; neither is consistently server-authoritative. |
| C-09 | High | Registration implies approval workflows but mobile self-registration creates an Active Member directly. | Registration offers multiple roles; datastore ignores selected role and writes an active Member. Manager “pending registration” data is a separate client concept. |
| C-10 | High | SRA certification ownership is diluted by universal Super Admin/API permission. | Super Admin bypasses all `requireRole` checks and can call current certification paths. Approved ownership remains SRA audit/report workflow. |
| C-11 | Medium | README says an eight-stage crop cycle; web/mobile implement six stages. | Catalogue and UI consistently enumerate stages 1-6. Six is the current implemented baseline. |
| C-12 | Medium | README repository and launch instructions are stale. | It names `/admin` and `run-admin.bat`; actual paths are `/web` and `run-web.bat`. |
| C-13 | Medium | `folder-structure.md` lists incomplete/stale endpoints and says `auth/logout, auth/session` while implementation contains additional unguarded phone/password routes and no register endpoint. | Server route inventory in section 6 is authoritative for this revision. |
| C-14 | Medium | `system_flow_audit.md` says the API is authoritative while its routing matrix explicitly permits direct client streams/writes. | Read listeners may coexist with authority, but current direct mutation and conflict resolution violate `AGENTS.md`. |
| C-15 | Medium | Role naming is inconsistent and generic `admin` matching is overbroad. | Four canonical roles map to several role keys; `requireRole` matches role substrings. |
| C-16 | Medium | Web role isolation is partly UI/local-state based. | All role dashboards include nearly the same full page set and shared core; CSS visibility and `localStorage` choose layout; a role switch function exists. |
| C-17 | Medium | Legal/security text makes guarantees stronger than the implementation establishes. | Privacy/terms claim secure synchronization and immutable records; no rules/configuration or end-to-end enforcement is in the repository. TLS version is asserted but not configured here. |
| C-18 | Medium | “Single source of truth” Firebase config is duplicated. | Shared, web, and mobile config files exist; mobile uses a different app ID. |
| C-19 | Medium | Audit report status values vary (`Pending`, `Pending SRA`, `Certified`) and operation statuses vary even more. | No schema enum or server validation unifies them. |
| C-20 | Medium | Client-side scope filters are not matched by server query scope. | Public GET endpoints return entire collections; authorization relies heavily on client filtering. |
| C-21 | Low | Docs contain mojibake and stale labels such as “Admin console”/“Field Members.” | Canonical names in this specification supersede those labels. |
| C-22 | Low | No automated tests or documented CI verification exist. | Repository contains no test/spec suite; current verification must begin manually. |

## 9. Constraints for the next phase

This audit intentionally stops before refactoring. Any subsequent remediation should be planned end to end in this order:

1. Define database enums, retention fields, report/log linkage, authorization scope, and migration/backfill.
2. Implement server-side validation, authenticated scoped reads, mutation endpoints, archive-only operation handling, and SRA report certification.
3. Move web mutations to the API while retaining local cache only as cache/queued intent.
4. Move mobile authentication and sync mutations to the API while retaining offline drafts/outbox behavior.
5. Reconcile role names and parity, then update README/docs/policy claims.
6. Execute the baseline checklist and add automated contract/integration tests before behavioral cleanup.

No such refactor is part of this baseline artifact.
