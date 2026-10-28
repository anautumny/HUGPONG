# HUGPONG System Guide

How the system works, how to interpret analytics, and what to ask during beta testing

**Edition:** 1.0 | **Prepared:** 28 October 2026 | **Application baseline:** Beta 1.0.8

For project owners, Farm Members, Farm Managers, SRA Admins, Super Admins, and beta evaluators. This guide explains the implemented system in plain language. Use the separate User Manual for step-by-step screen instructions.

The PDF edition is black and white, with 12-point Times New Roman throughout. Examples are illustrative unless explicitly identified as the NACAYAO demonstration dataset. No password, private key, recovery passphrase, or live authentication token is included.

## 1. The system in plain language

### 1.1 What problem does HUGPONG address?

HUGPONG connects field recording, farm supervision, cost summaries, and SRA reporting. Without a shared record, a member may record work on paper, the manager may prepare a separate spreadsheet, and the reviewer may receive a report that is difficult to trace back to individual activities. HUGPONG keeps the relationships between the person, plot, crop cycle, operation, and report.

A Farm Member records what happened on an assigned plot. A Farm Manager supervises the farm, checks records and synchronization, and compiles monthly reports. An SRA Admin reviews those reports and decides whether to certify or return them. A Super Admin handles platform administration, support, diagnostics, and authorized backup/recovery.

The system improves organization and traceability. It does not physically inspect the field, prove that every submitted activity happened, or replace the professional judgment of a manager or SRA reviewer.

### 1.2 The most important distinction

**A screen value is not automatically an official shared record.** A plan is intended work. A draft is unsubmitted preparation. An offline queue is work waiting for the server. A server-accepted operation is a shared business record. A certified audit is a reviewed snapshot of selected shared records.

Example: a member records weeding while offline. The phone can retain that entry and show local progress, but the manager's live report cannot include it until the server accepts it. A successful internet connection alone does not prove that acceptance happened.

### 1.3 The two applications

| Application | Main purpose | Connectivity rule |
| --- | --- | --- |
| Web Management Console | Management, oversight, reporting, administration | Online-only; requires the live HUGPONG service |
| Android application | Field work and role-specific mobile tasks | Selected owner workflows can remain local for later synchronization |

The same account role and assignments still control what can be accessed. Mobile offline support is not an alternative permission system.

## 2. How the backend works

### 2.1 What is a backend?

The backend is the part of HUGPONG that receives requests, checks them, and saves official results. Users normally interact with the Web or Android interface, not directly with the database. The interface asks the backend to perform an action and displays the response.

The implemented backend is a Node.js application using Express. It runs on the configured managed host. Firebase Firestore stores the shared data. Firebase authentication services also support account identity and permitted client access. Hosting, authentication, and the database are related services with different responsibilities.

### 2.2 The normal request path

**User action -> Web or Android -> Express API -> validation and authorization -> Firestore -> response -> updated screen.**

For example, when enrolling a plot, the interface sends the selected farm, owner, area, and required cycle information. The API checks the actor's role, current farm assignment, allowed area and valid values. The server issues permanent identities and saves the accepted records. The interface then shows the returned field and crop cycle.

The interface may check obvious mistakes before sending, such as an empty required input. The server repeats the important checks. Disabling a button or hiding a menu is a usability measure; it is not the final access-control boundary.

### 2.3 The main components

| Component | Responsibility |
| --- | --- |
| Web client: React and Vite | Render browser screens, gather input, call the API, and show results |
| Android client: Expo and React Native | Render mobile screens, retain supported local work, and synchronize accepted changes |
| Express API | Authenticate requests; enforce roles, scope, validation, retry identity, reporting rules, and mutations |
| Firestore | Persist canonical accounts, farms, fields, cycles, operations, reports, prices, and operational metadata |
| Firebase identity services | Support authenticated identity and permitted claims/read access; they do not authorize arbitrary business writes |
| SMS provider | Deliver server-requested verification messages when available; provider secrets remain on the server |
| Device storage | Retain Mobile preferences, cached views, drafts and queued changes; secure storage protects supported session credentials |

### 2.4 What an API does

An API is a defined set of requests and responses. For example, a field-list request returns only the fields allowed for the current account. An operation-submission request sends the work details for validation. A report-compilation request asks the server to select eligible records and create a snapshot.

Read requests retrieve information. Mutation requests create or change official information. HUGPONG checks the signed-in account and record scope on the server, including when a client is modified or sends a request outside the normal screen flow.

Some changes use a transaction: related checks and writes succeed together rather than saving only half of a relationship. This helps avoid a field pointing to a cycle that was never created, or two accounts reserving the same normalized phone number at the same time.

### 2.5 Why other websites can work while HUGPONG does not

An internet connection connects the device to the network. HUGPONG also needs its own host and required services to respond. A suspended or restarting host can take time to become ready. The clients allow a startup-readiness budget of up to 75 seconds in this release and present retry information.

The public readiness endpoint indicates whether the service is ready to accept normal traffic. A readiness response is not a promise that every protected workflow has been tested on every device. A specific action can still fail because of permissions, invalid input, a conflict, or a service problem.

## 3. How the data connects

### 3.1 The relationship chain

**Account -> Block Farm -> Field -> Crop Year Cycle -> Operation -> Monthly Audit -> Certified Crop Year Compilation.**

This is a reading aid, not a rule that every account owns every item. A manager is assigned to supervise a Block Farm. A member may be affiliated with a farm before receiving a plot. A field has an owner relationship and a parent farm. A field can have multiple historical crop cycles, while the current active cycle identifies its present production workflow.

### 3.2 Important records

| Record | What it represents |
| --- | --- |
| User account | Identity, role, status, registered phone and permitted assignment information |
| Block Farm | A cooperative/farm grouping with its declared area and manager relationship |
| Field | A specific plot with a parent Block Farm, owner, hectares and current cycle reference |
| Crop Year Cycle | A dated production-cycle identity, current stage and historical cycle context |
| Operation log | An activity performed on a field, with its date, quantities, costs and recorded actor |
| Audit report | A preserved monthly selection of eligible operations and supporting field details |
| Crop Year Compilation | A saved summary of certified report sources included at the time of compilation |
| SRA price reference | A dated raw-sugar/molasses quotation or unavailable-quote status |
| Support ticket | A request and its response/status history |

Server-only records also support credentials, sessions, OTP/recovery challenges, retry receipts, diagnostics and backup activity. These are not general-purpose client-editable business records.

### 3.3 Why IDs matter more than names

A permanent ID is the stable identity of a record. A name is a label that can change or be shared by different people. HUGPONG therefore links records with fields such as blockFarmId, memberUserId, fieldId and cycleId.

Suppose a field points to farm ID BF-EXAMPLE. If the farm name changes, the relationship should still point to the same farm. Matching only the old text could show the wrong farm, miss the assignment, or confuse two farms with similar names. The current display joins resolve names from canonical IDs.

If an assigned ID appears instead of a name, the name may not be loaded. That is different from having no relationship at all. Refresh first, then ask the responsible administrator to verify the actual record.

### 3.4 Crop year and calendar month are different

A Crop Year Cycle such as 2026-2027 is a production identity. A report month such as October 2026 is a calendar reporting period. An operation also has an actual work date and a separate time when it was entered or saved.

Example: a member enters work today that was performed yesterday. The Operation Date should identify yesterday's work. Moving to a new calendar month does not automatically move a field to a new crop cycle or stage. Compare Web and Mobile using the same account scope, field, crop year and period.

## 4. Accounts, permissions and identity

### 4.1 Who is responsible for what?

| Role | Main responsibility |
| --- | --- |
| Farm Member | Record and plan work for the account's own assigned plots using Android |
| Farm Manager | Supervise the assigned farm, manage permitted members/plots, follow up and compile reports |
| SRA Admin | Perform authorized oversight, account reviews, price publication and report certification |
| Super Admin | Govern platform access, support, diagnostics, monitoring and encrypted recovery workflows on Web |

Farm Members do not have a Web workspace. Super Admin is a Web role. Farm Managers and SRA Admins have Web and Android workspaces. Access is also limited by the account's status and current farm/field relationships.

### 4.2 Registration is not plot allocation

Registration creates or requests an account through the approved workflow. Phone verification confirms the registered contact through an available method. Approval/affiliation establishes the permitted farm context. Field allocation links a specific plot to its owner. These are separate steps.

An approved member can legitimately have no plot yet. The manager must enroll or assign a plot before plot work becomes available. The system should not invent a 1.5-hectare allocation merely because no area was supplied.

### 4.3 Passwords and sessions

The server verifies passwords using salted scrypt hashes held in a server-only credential collection. It does not need to store the original readable password to check a login. Recovery creates a new password; it does not reveal the old one.

Web authentication uses a server-managed HttpOnly cookie. Mobile sends server-issued authentication credentials for API requests and uses secure storage for supported session values. Role, status, password and phone changes can invalidate old authorization. A cached profile name is not permission to perform official actions.

The password policy in this release requires 8 to 256 characters, an uppercase letter, a lowercase letter and a number, and rejects specified common passwords. Do not print real passwords or OTPs in beta reports.

### 4.4 Manager Takeover

A manager acting on another owner's field must verify the manager's own password online. The server issues a signed, field-specific, short-lived grant, normally valid for five minutes in this release. It rechecks the manager, field and current permissions when the protected change is submitted.

Takeover does not transfer the plot to the manager. A manager's takeover entry records the manager's identity. An amendment to someone else's entry keeps the original authorship and separately records the correcting actor and reason. Switching fields, expiration or reassignment can require fresh authorization. Takeover work is not an offline workflow.

## 5. From planning to an official operation

### 5.1 The stages and activities

The six Current Stages are Land Preparation, Planting, Basal, Weeding, Top-Dress and Harvest. A stage describes where the field is in the crop workflow. An activity is a particular piece of work recorded within that context. Several different activities, or repeated passes of one activity, can occur in a stage.

Example: Land Preparation may include soil sampling and other land-preparation activities. Thirty operation records across five fields do not mean there are thirty crop stages. A permitted custom activity is still an activity record, not a seventh core stage.

### 5.2 Plan, draft and submission

Planner schedules intended work and estimated expenses for an owned plot. Opening the operation-input action transfers the plan context to Field Ops; it does not automatically create a draft or prove completion. In Field Ops, the user decides whether to save a draft or submit actual recorded work.

A draft is local and editable preparation. A submitted operation is a shared record after server acceptance. The API checks required values, ownership or takeover, cycle/stage context, date and cost rules, and other applicable constraints. It returns the accepted result or a reason for rejection.

### 5.3 Costs and units

An operation can include labor and itemized material/equipment expenses. Read the unit attached to a rate. A rate per hectare is different from a rate per worker-day or per bag. The operation form's item totals must represent the same actual work without counting one expense twice.

Illustrative calculation: two workers for one day at PHP 500 per worker-day cost PHP 1,000. Adding PHP 300 of materials gives PHP 1,300, if those are separate expenses recorded by the form. A planner estimate of PHP 1,200 does not change the actual recorded total of PHP 1,300.

### 5.4 Corrections and history

Submitted operation lifecycle is Active or Archived. Supplemental, Manager Takeover and Amended are separate properties. Certification belongs to an audit report; it is not a replacement operation status.

An eligible correction records an amendment reason and history. Archived or audit-protected records can be locked. A new crop-cycle approval preserves the previous cycle's history rather than deleting it. A normal user must not create a duplicate entry to conceal a mistake.

## 6. Offline work and synchronization

### 6.1 Why Mobile has offline support

Field users may lose connectivity where work occurs. Android can preserve supported owner work on the device until the service is available. This reduces the need to rewrite notes from memory. Offline capture still needs a previously authorized account and loaded field context.

The Web console remains online-only. It does not automatically replay offline stage or ticket submissions. A connection-required screen protects the management workflow when the internet or API is unavailable.

### 6.2 What the Mobile outbox does

The outbox is an account-scoped list of pending changes. A supported mutation receives an identity that is kept for later attempts. When connectivity returns, the app sends the saved change to the server. The server checks it again, accepts it or rejects it, and records an appropriate result.

**Saved locally -> waiting -> sent -> server checks -> accepted, rejected or conflict -> screen updated.**

A change is not accepted merely because it was sent. The response can be lost even when the server saved the work. Keeping the same retry identity lets the server recognize an existing result instead of creating a second record for that same intent.

### 6.3 What duplicate protection does and does not mean

Retrying the same saved operation uses its existing identity. Manually creating a second new operation creates a different identity and may represent a duplicate business entry. Idempotency protects the same request from being applied twice; it does not decide that two separately entered descriptions describe the same real-world work.

After an uncertain response, inspect the existing entry and retry it through its saved workflow. Do not repeatedly press new-entry controls to work around a timeout.

### 6.4 Stale data and conflicts

While one device is offline, another authorized user can change shared information. A queued edit can therefore conflict with a newer record, closed cycle, revoked permission or reassigned field. The server remains the authority at synchronization time.

A rejected change is not proof that local storage failed. Read the reason and review the current record with the manager. Do not repeatedly force old values into the shared record or clear local data before preserving needed evidence.

### 6.5 Storage protection and limits

Normal cache-version upgrades preserve pending queues and drafts. If a queue cannot be read, the app pauses relevant saves/synchronization and displays a storage error instead of silently replacing the queue with an empty one.

This protection cannot recover a lost phone or guarantee survival after uninstalling, clearing app data or hardware failure. The device's local queue is not included automatically in the central business-data backup. Synchronize and verify acceptance before replacing a phone.

Manager work on another owner's plot, new takeover authorization, new enrollment, cycle renewal and official SRA actions require their live server checks. SRA may read an available cached snapshot on Android, but cached viewing is not offline certification authority.

## 7. How monthly reporting works

### 7.1 From operations to a report

The manager selects the assigned farm and reporting month and opens an online member/readiness review. The API examines eligible synchronized records. Opening this review alone does not create a report. The manager deliberately continues with Compile Available Operations.

The server selects the available eligible operations, creates operation/field snapshots, calculates report totals and assigns report identity/version information. A draft or local unsent operation cannot be silently treated as a synchronized reporting source.

A field can legitimately have no recorded operations in a month. Such fields do not automatically block compilation and are not falsely counted as audited. An empty report without eligible operations is rejected. Existing period, version, permission and duplicate-source rules still apply.

### 7.2 Why a report is a snapshot

A report should preserve what the reviewer actually received. Later changes to a current field name, operation or assignment must not silently rewrite a historical certified report. Snapshots preserve the included values and actor identities. Corrections can require a later linked version under the reporting rules.

The dashboard describes the currently selected data. A certified report describes the snapshot included at certification. Their totals can differ without either screen being broken. Compare the report period, coverage, version and source records first.

### 7.3 Delivery, QR verification and certification

| Action | What it establishes |
| --- | --- |
| Compile | A report snapshot has been prepared |
| Send through Cloud | Delivery is requested through the server |
| Generate QR Transfer | A compact reference is provided for the reviewer |
| Verify/preview QR | The server retrieves and checks the report reference and integrity |
| Confirm import, when offered | The report is brought into the permitted review workflow |
| Certify | An authorized SRA reviewer records the professional certification decision |
| Return | The reviewer requests correction with a reason |

A QR code is not an approval stamp by itself. Current QR references do not carry a complete offline database of every operation. Server retrieval and verification are needed. A reference retained while offline can be retried after reconnecting.

### 7.4 Certified crop-year compilations

An SRA Admin can compile certified monthly sources for a selected Crop Year Cycle and farm scope. The saved result describes the certified reports included at that time. It does not declare that every month is complete or replace monthly certification. Later certified reports do not silently modify an older saved compilation.

## 8. Analytics: purpose, calculations and useful decisions

### 8.1 What analytics is for

Analytics summarizes recorded information so a person can notice patterns, ask questions and plan follow-up. It is descriptive: it explains the available records. It is not a yield forecast, a guaranteed-profit calculator, an automatic agronomic prescription or an independent physical inspection.

Android organizes analytics into Overview, Costs, Operations and Market. Web presents the corresponding descriptive sections. Read the scope first: role, farm, plot, Crop Year Cycle and period. Changing the scope changes the question being answered.

### 8.2 Crop and field progress

Crop progress counts fields and hectares at the six current stages. For a selected historical crop year, the relevant cycle determines the stage context. A field with no valid recorded stage should not be invented as Stage 1 merely to fill a chart.

Stage area share = hectares represented at the stage / scoped field hectares x 100.

Example: if 3 hectares out of 7.5 scoped hectares are at Weeding, the area share is 40%. That does not mean 40% of all farm work is finished. It means 40% of the scoped area is represented at that stage.

**How it helps:** the manager can see where attention and scheduling are needed. Ask whether late records or synchronization explain a field's stage before deciding a member is inactive.

### 8.3 Production cost

Total expenditure sums the costs of eligible operation records in the selected scope. The main average-cost-per-hectare summary divides that total by the area of distinct relevant fields with matching records, not by adding the area again for every repeated activity.

Some farm comparison rows use the registered farm area. Their denominator can differ from the main recorded-coverage summary. Read the area displayed beside each row before comparing rates. The app rounds some per-hectare values to whole pesos.

**How it helps:** compare recorded spending between equivalent plots, scopes and periods; identify a field that needs invoice or activity review; discuss the difference between planned and actual expenses. A higher cost alone does not prove waste, because fields can differ in area, stage, required work and completeness of records.

### 8.4 Cost breakdown

The breakdown groups recorded expenses by operation category and shows each category's share of total recorded cost.

Category cost share = category cost / all filtered category costs x 100.

**How it helps:** identify the main recorded cost driver and decide which underlying records to review first. A broad category can contain several activities. Custom activity names should be consistent, and their category should reflect the actual work.

### 8.5 Operations and activity frequency

An operation count is a count of eligible entries. A frequency ranking groups entries by their recorded activity/operation name. A repeated pass is another entry. A custom operation appears under its recorded name; inconsistent spellings can appear as separate activities.

Activity share = entries for the activity / all eligible filtered entries x 100.

Average cost per activity entry = total cost for that activity / its entry count.

Android shows five activity types per page. Paging changes what is displayed, not the total dataset. A third page does not restart ranking or recalculate percentages using only five entries. Filter changes reset the ranking to the first page.

**How it helps:** notice frequently repeated work, investigate unusually costly activity types and compare the pattern with the selected stage/period. Frequency is not proof of effectiveness. A high weeding count can describe legitimate work, repeated treatment, duplicate entry or incomplete filtering; the records need review.

### 8.6 Labor and group labels require careful reading

The current labor/worker tile aggregates the recorded worker-count values of its eligible entries. It is not a deduplicated list of people. If the same two workers appear in five entries, a sum of ten does not mean ten different workers.

True person-days are workers multiplied by days for each work entry, then summed. Two workers over two days equal four person-days. The current summary does not independently multiply every entry's worker count by its days. Inspect labor details before treating a displayed total as person-days, despite any labor-days wording on the tile.

Similarly, a group-operation label depends on saved entry structure and can include itemized records. It should not be used by itself as a verified count of distinct multi-plot work events. Open the underlying records to confirm which plots and expenses are represented. These interpretation limits are important beta observations, not reasons to invent replacement values.

### 8.7 Market and SRA price trends

The Market section provides dated raw-sugar and molasses references. Raw sugar uses PHP per Lkg, a 50-kilogram bag. Molasses uses PHP per metric ton. A reference quotation is not the user's actual sale receipt.

Each product can be Reported, No bidding, Milling ended or Not reported. An unavailable quotation is not PHP 0. The latest bulletin can have no current numeric quote while an older last-reported value remains available with its own date.

The server calculates price summaries. A monthly mean is the arithmetic average of the reported weekly values supplied for that product. It is not volume-weighted and does not invent prices for missing weeks. Changes should not be read across missing/incompatible quotations as if they were continuous observations.

**How it helps:** discuss the dated market context, identify gaps in reference information and avoid using an old quotation as today's guaranteed selling price. The historical reference dataset is separate from the mock farm-operation costs used for beta demonstrations.

### 8.8 A worked demonstration

Consider five demonstration plots covering 7.5 hectares with 30 eligible recorded operations totaling PHP 30,000. Assume every plot contributes a matching record and each entry costs PHP 1,000.

| Question | Calculation | Meaning |
| --- | --- | --- |
| Average cost per operation | PHP 30,000 / 30 = PHP 1,000 | Average recorded expense for one entry |
| Main recorded-coverage cost per hectare | PHP 30,000 / 7.5 = PHP 4,000 | Cost per hectare of the fields represented by these records |
| Share for five Land Preparation entries | 5 / 30 x 100 = 16.67%, shown about 17% | Share of entries, not stage completion or land share |
| Custom activity with three entries | 3 / 30 x 100 = 10% | Its share of all filtered entries |
| Worker-count sum with two workers per entry | 30 x 2 = 60 | Recorded worker-count total; not 60 distinct workers |

If only one 1-hectare plot has PHP 2,000 of matching records for a narrower period, its recorded-coverage average is PHP 2,000/ha. Dividing by all 7.5 hectares would answer a different question. Always check what the denominator represents.

### 8.9 Why figures can differ

| Difference | What to check |
| --- | --- |
| Web versus Android | Same user, farm, field, crop year, period, loaded pages and synchronization time |
| Dashboard versus certified report | Live/provisional data versus the report's preserved month, version and included sources |
| Current year versus history | Crop-cycle identity, archival reason and analytics eligibility |
| Farm versus single field | Different scope and area denominator |
| Planner versus actual costs | Estimates versus completed recorded expenses |
| Price reference versus sales income | Published reference value versus actual quantity sold and sale terms |

Some Mobile summaries can reflect the local record set, including provisional pending work. They are not proof that the same work has reached the manager or server. Synchronize and compare official records before using a difference as evidence of a calculation defect.

Eligible historical operations retained after cycle completion or crop-year correction can still contribute to the selected year's descriptive analytics. Drafts are not submitted operations. A manually hidden/archived view and a certified report have their own selection rules. Read the lifecycle and report scope rather than assuming every historical record is excluded or every archived record is included.

## 9. Monitoring, support and backup

### 9.1 Activity is different from successful synchronization

Sync Monitor helps identify accounts/devices that need follow-up. Recent sign-in or app activity does not prove that the pending queue is empty. A member can have no work recorded for a month without being inactive, and offline work may not yet be visible to the server.

The existing account-activity monitoring flags attention after three days and a critical condition after five days where supporting dates are available. Missing telemetry is not proof of inactivity. Ask the member and inspect the queue and last accepted records before drawing a conclusion.

### 9.2 Support and diagnostics

Farm Members, Farm Managers and SRA Admins submit support requests; Super Admin handles them. Canonical ticket states are Open, In Progress, Resolved and Closed. Android can show Pending Submission while a supported ticket is still local. Web requires a successful online submission.

A useful report includes the app version, account role, device, time, steps, expected result, actual result, relevant record ID and exact error/reference message. The diagnostic reference helps the operator locate sanitized backend information. Do not include passwords, OTPs or backup passphrases.

### 9.3 What the backup covers

Authorized encrypted business-data backups protect supported central business records. Recovery drills validate an archive and plan what would be restored. The missing-record recovery flow recreates missing eligible records rather than silently overwriting existing ones.

This is not a complete backup of every identity, password, session or phone's local queue. Operators retain two archive copies, protect the archive passphrase separately and follow the current runbook. A successful PDF export is also not a substitute for an encrypted recovery archive.

## 10. A practical beta-testing plan

### 10.1 Prepare a controlled test

Use a coordinator-issued account for the intended role and confirm the installed app version. The NACAYAO demonstration batch has one test manager, five test members, five plots and sample operations. Those operations and identities are removable beta fixtures. Real published price references and protected administrator accounts are separate and must not be removed with the fixtures.

Do not repurpose a test member as a real person's permanent account. Keep real activity on separately enrolled real fields. If real and mock report sources are mixed, the cleanup workflow can stop for review rather than deleting mixed data. Mock profile numbers are not verified real contacts; fixture SMS delivery is intentionally unavailable while those accounts own the numbers.

### 10.2 Core acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Correct manager/member login | Opens the correct supported role workspace and assignment |
| Member attempts Web workspace | The unsupported platform is rejected; no manager/SRA access is granted |
| Existing phone used for a second registration | Registration is rejected; the original identity remains intact |
| Member with affiliation but no plot | Shows the affiliation and a genuine no-plot state, without invented area |
| Field selection and takeover summary | Farm, owner, area and stage match the selected canonical field |
| Takeover expiration or field switch | Fresh server authorization is required; ownership is unchanged |
| Owner captures supported work offline | The entry remains pending locally and survives reopening |
| Reconnect after an uncertain response | Retry uses the existing saved identity; verify one official result |
| Clear-data or sign-out warning | Pending work is clearly handled; do not continue destructively during an acceptance test |
| More than five activity types | All standard/custom types are reachable; ranks and full-set percentages remain consistent |
| Matching Web/Mobile filters | Comparable synchronized data gives matching descriptive calculations |
| Empty monthly field coverage | Fields without records are explained and do not invent report entries |
| Readiness review cancelled | No monthly report is created merely by opening/cancelling the review |
| QR preview and import | Preview is distinct from import, and both are distinct from certification |
| Returned report corrected | A later permitted version keeps the return/history context |
| Missing market quotation | Shows its status/date, not a fabricated zero or current price |
| Local ticket submitted offline | Pending Submission becomes a server ticket only after acceptance |
| Phone font scaling and narrow layout | Labels, inputs, badges, dialogs and paging remain readable and operable |

For the reconnect scenario, count the canonical result from Web or a refreshed authorized ledger. Seeing one local row is not enough to establish that a server write happened exactly once. For device upgrade, install over the previous beta and check pending work; this is an acceptance test, not an assumption based only on a matching signing key.

### 10.3 Record a finding

Use this format: test ID; app version; role; device and connection; farm/field/report reference; preconditions; numbered actions; expected result; actual result; exact message/reference ID; screenshot where useful; and whether the issue repeats.

Example: TEST-SYNC-01, Android 1.0.8, Farm Member, offline owner plot. Save one operation, close/reopen, reconnect, then inspect the live ledger. Expected: the saved intent is retained and creates one accepted result. Actual: describe only what was observed. Do not guess that a missing label means the database relationship was deleted.

### 10.4 When to stop a beta scenario

Stop and preserve evidence if another account's records appear, an official record seems duplicated, pending work disappears, an action changes the wrong plot, or an audit displays another compiler/period. Avoid further editing of the affected record until the responsible reviewer has checked it. Report the specific record and steps rather than re-entering the same work repeatedly.

## 11. Likely beta questions and suggested answers

### Q1. What is HUGPONG mainly for?

It links recorded field work to farm supervision and SRA reporting, while retaining identities, costs, cycle context and history. It helps organize evidence and follow-up; it does not physically verify work automatically.

### Q2. Why are Web and Android different?

They serve different situations. Web supports connected management/administration. Android supports field users and selected offline owner workflows. Both use the same server authority and role restrictions.

### Q3. Can a Farm Member sign in on Web?

Farm Member accounts use Android. The absence of a member Web workspace is an intentional platform restriction, not a reason to assign a more powerful role.

### Q4. Why can I have an account but no field?

Account registration, farm affiliation and plot allocation are separate. Ask the manager to confirm the correct owner/field relationship. The app must not invent a plot or area to complete the screen.

### Q5. What happens if I register with a number already in the system?

The server rejects the duplicate registration and preserves the existing account. Sign in or use the permitted recovery flow; a new registration does not take over the original identity.

### Q6. Is the password-recovery code entered in six boxes?

The Android SMS recovery flow uses the six-digit OTP input component. Authorized recovery review is a separate route, where the claimant sets a new password after approval. An OTP verifies a challenge; it does not replace every account-approval or assignment requirement.

### Q7. Can an administrator read my old password?

The normal server workflow verifies a salted hash rather than revealing the original password. Authorized recovery permits setting a new one. Never send your password to a reviewer or place it in a support ticket.

### Q8. Why does a farm ID appear instead of the farm name?

The assigned ID can be present while its name is not loaded. Refresh and verify the canonical relationship. That is different from the farm having no assignment.

### Q9. There are five plots. Why was a selector showing six choices?

Five actual plots plus the All Plots filter make six choices. All Plots is not a sixth plot. The compact selector now uses View all without that misleading count.

### Q10. Does 30 logged operations mean 30 stages?

No. There are six core stages. The total counts operation entries, which can include repeated work and different activities within the same stage.

### Q11. Where does a custom activity appear?

It appears under its recorded operation name in the activity ranking when eligible for the selected scope. Consistent naming avoids splitting equivalent work into separate labels.

### Q12. Why are only five activities visible?

That is the Mobile page size. Use Previous/Next to see more. Total counts, shares and rank positions refer to the complete filtered set, not only the current page.

### Q13. Does a frequent activity mean it is the best activity?

No. Frequency describes recorded repetition. Review the context, field condition, stage, expense and possible duplicate entry before deciding what it means.

### Q14. Does the labor total mean that many different workers?

No. The current summary adds recorded worker counts across entries. Repeated people can be counted again. Confirm entry-level workers and days before describing the total as unique workers or person-days.

### Q15. Why can average cost per hectare differ between cards?

The denominator can differ. The main recorded-coverage summary uses relevant fields with matching records; some farm comparison rows use registered farm area. Check the scope and area shown rather than assuming every per-hectare figure is directly comparable.

### Q16. Can analytics tell us the farm's profit?

Recorded production expenses and reference prices are not a complete profit statement. Actual sale proceeds, quantities, timing and other costs would be needed. The present descriptive screens do not guarantee income or yield.

### Q17. Why do Web and Mobile totals differ?

First align the account, farm, field, crop year and reporting period. Then check synchronization and cached/provisional local data. Compare the underlying record IDs before reporting a formula defect.

### Q18. Does Synced mean the manager certified my operation?

No. Synced means a change received server acceptance. Professional certification is an SRA decision on an audit report. Managers compile and supervise; they do not certify individual logs.

### Q19. Does opening Planner create a draft or operation?

No. A plan describes intended work. Its action opens the operation form with planning context. The user must deliberately save a draft or submit actual work in Field Ops.

### Q20. Can I use takeover after going offline?

No. Acting on another owner's plot requires the live server checks, even if an earlier takeover grant was issued. Supported offline owner work is a different workflow.

### Q21. Does takeover change the field owner?

No. It grants temporary authorized manager action on that field. The owner relationship remains, and the recorded manager action or amendment retains its provenance.

### Q22. What should I do after a timeout?

Inspect and retry the existing saved intent rather than creating a new entry. The first request may already have been accepted. Keeping its identity allows the server to recognize the prior result.

### Q23. Can I clear app data to fix a stuck queue?

Do not clear it while needed work is pending. Clearing storage or uninstalling can remove local drafts and queued changes. A queue-read error should be investigated while preserving the stored data.

### Q24. Will an update keep pending work?

The current cache migration is designed to preserve it, and the published APK uses the existing application identity/signing key. Install over the old version and test the upgrade. This does not protect against uninstalling or a lost/damaged phone.

### Q25. Must every plot submit an operation every month?

No operation is invented merely to satisfy a report. The manager can compile available eligible synchronized records. Fields without records are explained in coverage and are not counted as audited; existing reporting rules still apply.

### Q26. Is a member with no monthly operation automatically inactive?

No. Monthly record absence and account activity are separate facts. The member may have had no work, may need assignment or may have unsynchronized work. Follow up using available evidence.

### Q27. Does Call Member automatically place or record a call?

It opens the phone application through the registered contact. The user chooses whether to proceed. It does not automatically mark the person contacted, verified or active.

### Q28. Does scanning a QR code certify the report?

No. Lookup/preview, import and certification are separate. A permitted SRA reviewer must inspect the report and deliberately record the certification decision.

### Q29. Can the QR code verify the entire report offline?

Current compact references require server retrieval and integrity verification. Android can retain a scanned reference for retry, but offline viewing is not final official verification.

### Q30. Why does a report total differ from today's dashboard?

The report preserves its own month, version and included sources. The dashboard can reflect newer records, different filters or provisional local work. Compare those details before assuming one is wrong.

### Q31. Can certified reports silently change after a correction?

Certified snapshots are preserved. Later permitted correction/version workflows retain history; a current record edit is not permission to rewrite an earlier certified snapshot.

### Q32. Why is a price blank or marked Milling ended?

The reference indicates that no numeric quotation is available for that product/period. It is not PHP 0. A separately dated last-reported quotation is historical, not a guaranteed current selling price.

### Q33. How is a monthly reference-price average calculated?

The server averages the reported weekly numeric quotes for that product. Missing/unquoted weeks are not zeros, and the result is not weighted by sales volume. Check the reported-week count.

### Q34. Are the NACAYAO sample expenses and SRA prices both mock data?

No. The demonstration users, plots and sample operations are marked beta fixtures. Published SRA price references are a separate real dataset. A mock expense must not be treated as an actual member's business cost.

### Q35. What happens when beta data is removed?

An authorized operator reviews the tagged removal scope and backup first. The workflow preserves protected administrators and prices and can stop if beta and real records are mixed. New real accounts should be created through the normal process, not by relabeling the fixtures.

### Q36. Why can a mock member not receive an SMS?

Its random profile number is not a verified real contact. Delivery is intentionally blocked while it belongs to a fixture. Removing the fixture releases that restriction for a future legitimate owner; use coordinator-issued test credentials during beta.

### Q37. Does an encrypted backup restore everything?

It covers the supported central business-data archive, not every password, authentication identity, session or unsynchronized phone queue. Follow the actual recovery runbook and validate a drill before a real recovery.

### Q38. Does passing automated tests mean there are no bugs?

No. The release passed its automated checks and public deployment verification. Physical-device rendering, camera behavior, upgrade, real connectivity changes and signed-in role workflows still require acceptance. Report reproducible differences with specific records and steps.

## 12. Version limits and responsible interpretation

This guide describes Beta 1.0.8 as reviewed on 28 October 2026. Its source release gate passed 691 Server tests and 56 Web tests, the Web build, Android export and configuration/authority/identifier/secret checks. The signed APK's package, version, signature and selected bundle markers were verified, and public Web/API/download checks passed.

Those results establish specific checks, not independent proof of physical field work, universal device compatibility or complete absence of software/security defects. The release notes also disclose the remaining Expo CLI/Zod tooling advisory and the existing forge mitigation. Keep that tooling review separate from agronomic or audit certification.

No database/schema or Server/API behavior is changed by these documents. Web and Mobile descriptions refer to their existing supported workflows. A future change in role scope, record eligibility, formula, offline policy or reporting state requires a document review as well as appropriate implementation/testing.

## 13. Where these explanations come from

The current deployed release and repository implementation were reviewed. Earlier audit documents can describe old defects and are not automatically descriptions of current behavior. The following map helps a developer or evaluator locate the present implementation.

| Topic | Repository reference |
| --- | --- |
| Deployed version and verification | docs/RELEASE_1.0.8.md |
| Canonical fields and relationships | docs/FIRESTORE_SCHEMA.md; server/schema/firestoreSchema.js |
| Authentication and credentials | server/routes/auth.js; server/security/password.js |
| Takeover authorization | server/security/takeoverGrant.js; server/tests/operation-takeover-roundtrip.test.js |
| Mobile queue/storage recovery | mobile/src/services/storageService.js; mobile/src/services/syncEngine.js |
| Web online-only policy/session ordering | web/react-app/src/services/onlinePolicy.js; web/react-app/src/context/AuthContext.jsx |
| Operation analytics formulas | mobile/src/services/analyticsSelectors.js; web/react-app/src/services/analyticsSelectors.js |
| Price calculations | server/services/priceAnalyticsService.js; docs/HISTORICAL_SRA_PRICES.md |
| Monthly reporting and readiness | server/routes/auditReports.js; docs/MONTHLY_AUDIT_AVAILABLE_OPERATIONS.md |
| Support and recovery | docs/SUPPORT_TICKETING_COMPLETION_REPORT.md; docs/BACKUP_AND_RECOVERY_RUNBOOK.md |
| Current user instructions | docs/USER_MANUAL.md |

Repository paths identify evidence; they are not menus that ordinary users must open. Private deployment credentials, backups and account secrets must remain outside the distributed training material.

## 14. Quick glossary

| Term | Plain meaning |
| --- | --- |
| Backend | The server-side application that checks requests and manages official results |
| API | Defined requests/responses used by a client to communicate with the backend |
| Canonical | The authoritative form of an accepted record or relationship |
| Client | The Web or Android interface used by a person |
| Firestore | The shared database used for supported business and operational records |
| Foreign/reference ID | A stable identity pointing from one record to a related record |
| Idempotency | Repeating the same saved intent does not apply that same intent twice |
| Mutation | A request to create or change official information |
| Outbox | The account-scoped queue of supported Mobile changes awaiting server acceptance |
| Snapshot | A preserved set of report values from a particular compilation/version |
| Scope | The records allowed for an account and selected filters |
| Telemetry | Recorded account/device activity and synchronization observations |
| Transaction | A group of database checks/writes that succeeds together or is not applied |
| Person-day | One person's work for one day; different from unique-person count |
| Lkg / MT / ha | 50-kilogram sugar bag / metric ton / hectare |

End of guide. Use the User Manual for screen-by-screen tasks, the coordinator for beta credentials, and the appropriate role owner for account, field or audit decisions.
