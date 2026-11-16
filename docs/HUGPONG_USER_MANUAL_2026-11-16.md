# HUGPONG USER MANUAL

Step by step guide to the Android application and Web Management Console

**Revised:** 16 November 2026 | **Documentation edition:** 2.0

**Official website:** https://hugpong.org

HUGPONG supports sugarcane field recording, planning, farm supervision, monthly audits, and SRA price references. Read Section 1, go directly to your role's section, and use the remaining sections when needed.

A record becomes official only after the HUGPONG server accepts it. Drafts and unsynchronized changes remain local work.

## 1. Getting started

### Accounts and navigation

| Role | Android | Web | Main responsibility |
| --- | --- | --- | --- |
| Farm Member | Yes | No | Plan and record work on assigned fields |
| Farm Manager | Yes | Yes | Manage fields and members; compile monthly audits |
| SRA Admin | Yes | Yes | Review and certify audits; maintain price references |
| Super Admin | No | Yes | Administer accounts, support, monitoring, and backups |

Your role and farm assignment determine which records and actions you can use.

1. Open https://hugpong.org. For Android, download the official APK and follow the installation prompts. If Android blocks installation, allow installation from the browser or file source you used. Install updates over the existing application; synchronize needed work before changing or reinstalling it.
2. On Android, choose English, Filipino, or Hiligaynon. Allow notifications for reminders and supported alerts. Camera or photo access is requested for QR tools.
3. Enter your permanent eight-digit User ID or registered Philippine mobile number and your password. Keep leading zeroes in the User ID.
4. Read and acknowledge the sign-in consent, then submit.
5. Complete any required phone verification and initial-password change.
6. Wait for your workspace to load. Confirm your name, role, and assignment before entering work.

Use the sidebar on Web. Android uses **Home**, **Planner**, **Operation**, and **Profile**, depending on the role. SRA Admins use the audit workspace under **Operation** and do not have Planner. This guide uses English labels; translated labels may differ.

### Registration and recovery

For a new Farm Member, open **Register** on Android, enter the correct name, registered number, requested farm where applicable, and password. Complete the offered SMS verification or authorized-review request, accept the required consent, and submit once. Save the User ID shown afterward. Follow the approval instructions and contact the Farm Manager for field assignment.

Self-registration is for Farm Members. Authorized administrators create other roles. An approved account can still have no field.

For a forgotten password, select **Forgot Password** and follow the offered SMS or authorized-review method. Assisted recovery requires the requested identity details and an authorized identity check. After approval, set your own password within the displayed window, normally 15 minutes. If rejected or expired, read the explanation before starting again.

Passwords require 8 to 256 characters, including an uppercase letter, a lowercase letter, and a number. Follow any additional validation message. Never share passwords, OTP codes, or backup passphrases. If repeated sign-in attempts cause a lockout, wait for the stated period.

## 2. Farm Member guide

### Plan and record field work

1. Open **Home** or **Operation** on Android. Select your field and check its owner, hectares, Crop Year Cycle, and Current Stage. Ask the manager to correct a missing or incorrect assignment.
2. To plan work, open **Planner**, choose your own field, activity, and date, enter estimated costs, and save the schedule.
3. When the work is performed, use the schedule's operation-input action or open **Operation** and choose the correct field and activity.
4. Confirm the **Operation Date**. A date carried from Planner is read-only in the operation form; correct the schedule first if needed.
5. Complete the required quantity, selected unit, area, rates, labor, materials, and notes. For planting, choose the variety when required. Follow quantity requirements even for labor-only work.
6. Check the total and ensure the work area does not exceed the registered field area.
7. Save a draft if unfinished, or select **Record Operation** when ready. Review each item before submitting a batch.
8. Check the result and ledger. **Synced** means server acceptance; **Unsynced** means the change is waiting on the phone.

A plan estimates intended work. A draft is unsubmitted preparation. Neither is an official completed operation. After an interrupted upload, inspect and retry the existing entry rather than creating a duplicate.

### Corrections and crop stages

The stages are **Land Preparation, Planting, Basal, Weeding, Top-Dress, and Harvest**. Record the offered activities and use the stage-completion control when ready. Resolve any missing-work warning. Supported offline stage changes remain provisional until accepted.

For a correction, open the eligible operation's edit or amendment action, change the values, enter a meaningful **Reason for Amendment**, and submit. The history is retained. Archived or audit-locked records may require the manager or SRA reviewer. Use **Supplemental** work, where offered, for additional activity rather than replacing the original entry.

For a new cycle, synchronize the current work and submit the renewal request online when eligible. Operations are locked while it is pending. The manager reviews the request and outstanding reporting work. After approval, confirm the new cycle and stage; earlier records remain in history.

Use filters and paging to find older records. **Clear View** hides results; it does not delete them. Submitted operations are retained as active or archived records.

To review spending and activity, open **Analytics** from the available dashboard or screen control. Choose the correct field, crop year, and period before reading costs, activity counts, or price references. A cached view may be older than the live server data.

## 3. Farm Manager guide

### Pending users and field assignment

1. Open **Dashboard** on Web or **Home** on Android. Confirm your assigned Block Farm, recent work, and sync concerns. On Web, review **Operational Attention**; on Android, use the pending-user shortcut.
2. Open the pending-user item, **Pending Users**, or the pending tab in **User Management**.
3. Check the applicant's identity, registered number, role, and farm. Complete an authorized phone check if required and record the offered verification reason or details.
4. For an eligible pending Farm Member, choose **Approve and assign later** or **Approve and assign field**.
5. For later assignment, confirm approval and arrange the field afterward. This choice creates no field.
6. For immediate assignment, complete the displayed add-field inputs, including plot area, and confirm the farm and member. The area must fit the allowed range and remaining farm allocation.
7. Confirm the final action and wait for the result. Immediate assignment returns a Field ID and first Crop Year Cycle. Check acceptance before repeating an interrupted request.

These assignment choices apply to the Farm Manager approval workflow on both platforms. Phone verification and account approval are separate decisions: **Verify Phone Only**, when offered, leaves approval pending. Other administrators use their own permitted review actions and refer field assignment to the responsible manager.

To create a member account directly, use **Onboard Farm Member** in Web User Management or the offered Android provisioning action. Enter the required identity and farm details, complete verification, save, and securely give the account holder the returned User ID and initial credentials. The member completes first-login setup.

### Enroll or update fields

On Web, open **Farm & Field Registry** and **Enroll New Field Plot**. On Android, open field management under **Operation**.

1. Connect to the server and confirm the Parent Block Farm.
2. Select the owner, or leave the field unassigned only where permitted.
3. Enter the plot area in hectares and submit.
4. Verify the returned Field ID, owner, area, and Crop Year Cycle.

The system generates official IDs and cycle values. Use the edit action for permitted corrections and read archive confirmations carefully. Field allocations cannot exceed the farm's available area.

### Use Manager Takeover

1. Open another owner's field and select **Manager Takeover**.
2. Enter your own password online and wait for authorization.
3. Confirm the field, record or amend the permitted work, and verify the result.
4. Use and confirm the field-exit action when finished.

Takeover is field-specific and time-limited, normally five minutes. Authorize each field separately. Returning to an authorized field can reuse its unexpired authorization; switching fields does not extend it. A confirmed field exit ends that field's authorization. Leaving the workspace or restarting does not preserve takeover access. Saved operations remain intact.

Takeover needs a live connection. It does not transfer ownership or permit offline work on another owner's field.

### Compile a monthly audit

1. Synchronize the relevant operations. Open monthly compilation in **Field Operations** on Web or **Operation** on Android.
2. Confirm the reporting period and review member readiness. Resolve unsynchronized or incomplete source records flagged by the system.
3. Select **Compile Available Operations**. At least one eligible synchronized operation is required. Fields without work do not block compilation; only included fields contribute to coverage.
4. Check the farm, period, version, fields, quantities, costs, and report ID.
5. Select **Send Through Cloud** or **Generate QR Transfer**. For QR delivery, display the code or use **Save QR** and confirm a successful save before sharing.
6. Check delivery and review status. A queued delivery has not yet reached SRA.

Official compilation requires an online readiness check. A QR code is a report reference, not a certification or a complete offline report. Its official report must be available on the server.

For a returned report, read the reason, correct eligible source records, and compile and send the linked replacement version. Before approving cycle renewal, resolve outstanding compilation requirements. Farm Managers do not certify operation logs or SRA audit reports.

## 4. SRA Admin guide

### Review and certify reports

Open **SRA Audit Center** on Web or the SRA audit workspace under Android **Operation**.

1. Select an **Audit Inbox** report, scan its QR code, upload a QR image, or use the offered report-ID lookup.
2. Connect and wait for official retrieval and integrity verification. Confirm import separately if prompted.
3. Review the farm, period, compiler, version, operation snapshots, quantities, area, and costs.
4. Certify a correct **Pending Review** report, or return it with a clear correction reason.
5. Wait for server confirmation and verify the resulting status. Use **Audit History** or **Reports** for certified records.

Report states include **Compiled**, **Pending Submission**, **Pending Review**, **Returned**, and **Certified**. Scanning, importing, and certification are different actions. Certified versions preserve their recorded snapshots.

### Export and compile a crop year

Open a saved report and use its print, PDF, save, or share action. On Web, the print dialog can save a PDF.

For a crop-year summary, open **Crop Year Compilations** in the Web Audit Center or Android **Reports** tools. Select the cycle and farm scope, review certified sources online, choose **Compile Crop Year**, and open the saved result to export it. Later monthly certifications do not rewrite earlier saved compilations.

Check crop-year and calendar-month labels. **Operation Cost** is full saved expenditure, including applicable labor and materials; do not multiply it by field area again. Average rates summarize recorded prices for the same unit. Different units remain separate, and financial totals use saved amounts rather than rounded averages.

### Manage farms and prices

To create or edit a Block Farm, use the Web **Farm & Field Registry**, enter its name, address, declared hectares, and permitted manager assignment, and save online. Android uses the saved information but does not create Block Farms.

To publish prices, open **SRA Price Monitor** on Web or the Android publication action. Enter the date and reporting period, select each product's status, supply valid prices and required source details, then select **Publish Price Reference**. Verify the saved entry. Use **No bidding**, **Milling ended**, or **Not reported** when appropriate instead of zero.

Raw sugar uses **PHP/Lkg**, or pesos per 50-kilogram bag. Molasses uses **PHP/MT**, or pesos per metric ton.

In **Operational Analytics**, align farm, field, Crop Year Cycle, and period before comparing values. On Android, adjust and apply selections through **Filters**. Recorded costs and price references alone do not establish income or profit.

Use **User Management** or the offered mobile review tools for permitted personnel provisioning and phone-verification reviews. SRA Admins can provision permitted Farm Managers; Farm Member entries may be read-only. Follow the role limits shown by the application.

## 5. Synchronization and notifications

### Reconnect and synchronize

Android supports previously loaded, authorized owner work: plans, drafts, operation capture, and supported stage changes. A manager's supported owner work applies to their own assigned plot. Takeover, enrollment, cycle renewal, account setup, official audit actions, and price publication need a server connection. SRA cached references are for viewing, not offline certification.

Web requires a live connection and does not automatically queue offline management submissions. If it shows **HUGPONG is unavailable**, reconnect and select **Retry connection**.

Automatic synchronization is always active on Android. There is no Profile switch to turn it off.

1. Reconnect to Wi-Fi or mobile data and open or return to HUGPONG.
2. Keep it open while the server check and upload complete.
3. Open **Sync Monitor** to inspect progress. Use **Sync Now** for an immediate retry when needed.
4. Read any **Failed** or **Conflict** message, resolve the issue, and retry the existing change.
5. Confirm acceptance before dependent reporting, changing devices, or clearing local storage.

**Unsynced** means local; **Retrying** means another attempt is pending; **Synced** means server acceptance. Internet access does not prove the HUGPONG server is available. Background processing also depends on Android allowing the app to run.

Preserve drafts and queues. Do not uninstall or clear app data to fix an upload error. If your session expires, sign in again and inspect saved work. Ask the manager to review shared-record conflicts instead of creating duplicates.

### Understand notifications

Open the bell or notification list and select an item to view its related information. Use the offered read or clear actions. Clearing an alert does not delete its source record.

| Notification or reminder | Recipient |
| --- | --- |
| SRA price updated | Eligible Farm Members, Farm Managers, and SRA Admins |
| Phone verification requested | Authorized reviewers in the relevant account or farm scope |
| Phone verification completed | The applicant whose number was verified |
| Planned work overdue, today, or tomorrow | Eligible Android users with the relevant plans |
| Unsynced work or unsubmitted drafts | The relevant account through Android status reminders |
| Password-recovery request updated | The device that explicitly requested assisted recovery |

Notifications belong to the account. New accounts do not inherit earlier alerts. Signing out stops new general account alerts for that installation. If you remain signed in while offline, eligible retained notifications can appear after reconnecting, subject to session validity and retention. Assisted-recovery alerts are a separate signed-out flow.

Android alerts depend on permission, device settings, and delivery conditions. An alert handed to Android before logout may still appear; it does not belong to the next account. Check account approvals, field assignments, audit decisions, and ticket updates in their relevant screens; they are not shown as separate system notifications in this edition.

## 6. Profile and support

Open Android **Profile** or the Web account menu and **Settings**.

- Check your ID, registered number, role, and assignment. Use permitted editing controls or ask the responsible administrator.
- Change Android language or the offered Web theme as needed.
- For password or number changes, open security controls, provide authorization, complete verification, and follow any sign-in-again instruction.
- For help, open **Help & Support Desk** on Android or the Web support entry. Select a category, enter a subject and clear description, include relevant record or error-reference IDs, and submit once. Do not include credentials.
- Check Active, **My Tickets**, or History for replies. Android **Pending Submission** is local; **Open** means received by the server. Tickets normally progress through **Open, In Progress, Resolved, Closed**.
- Before **Sign Out**, check drafts and pending work. Choose **Sync First** when offered and read the confirmation.

Authorized reviewers handle assisted recovery through **Password Recovery Reviews** in User Management or the offered Android recovery-review tool. Confirm the claimant's identity and registered number before approving or rejecting with the required reason. The claimant creates the new password; reviewers do not choose or request it.

## 7. Super Admin guide

Use the Web Management Console.

1. In **User Directory Monitor**, find the account, confirm intended access, perform the permitted provisioning, review, recovery, or status action, and verify the result.
2. In **Support & Tickets Desk**, read requests, respond, and update handling status.
3. In **System Sync Monitor**, compare last activity with successful synchronization; recent activity does not prove every change was uploaded.
4. Use **Maintenance & Security**, the System Audit Ledger, and **Diagnostics Console** to investigate matching account, record, and error-reference IDs.
5. In **Backup & Recovery**, download an encrypted `.hpbak` archive with the required authorization and a separate passphrase of at least 16 characters. Keep two copies in different locations and store the passphrase separately.
6. Run a recovery drill to validate an archive and inspect missing records. For actual recovery, coordinate a pause in entry, review the plan, and enter **RECOVER MISSING RECORDS** only when ready. Verify the result on Web and Android.

Back up at least every 24 hours and perform a recovery drill at least every 30 days. Recovery recreates missing supported business records; it does not overwrite existing records or restore the entire authentication system. Super Admin access does not replace SRA certification.

## 8. Quick troubleshooting

| Problem | Action |
| --- | --- |
| Cannot sign in or receive SMS | Check ID or number, password, connection, status, and verification instructions. Use authorized review or password recovery where offered. |
| No field appears | Check filters and ask the manager to verify assignment. Approval alone does not create a field. |
| Pending user missing from attention items | Confirm role, farm scope, and connection; open Pending Users directly. Request the updated release if the shortcut is absent. |
| Approval requires field area | Enter valid hectares within remaining allocation, or choose Approve and assign later. |
| Sync fails or server is unreachable | Preserve work, reconnect, and retry the existing item through Sync Monitor. Report persistent errors with their reference and time. |
| Operation is locked | Check archival, audit protection, or pending renewal. Ask the responsible manager or reviewer. |
| Takeover expires | Authorize the field again online with your own manager password. |
| Audit will not compile | Resolve the period, unsynced or incomplete records, and any existing-coverage or quantity-validation message. |
| QR will not resolve | Reconnect, use a clear HUGPONG QR image or report-ID lookup, and confirm the report reached the server. |
| Web and Android totals differ | Align farm, field, year, period, archive selection, and sync; inspect any cached snapshot time. |
| Notification missing | Check the account, eligibility, connection, permission, and related screen. Not every action creates an alert. |
| Dialog will not close | Use Close, Cancel, back, or the confirmed exit control. |

**Key terms:** A **Block Farm** groups fields. A **Field Plot** is an individual agricultural area. A **Crop Year Cycle** identifies the production cycle. A **Draft** is unsubmitted preparation. An **Amendment** is a tracked correction. An **Audit Snapshot** preserves report values. A **QR Reference** identifies a report for official retrieval. **ha** means hectares; **PHP** means Philippine peso.

**Edition note:** This guide covers HUGPONG 1.1.3, published on 16 November 2026, including revised approval choices, account-scoped notifications, and always-on sync. Use the updated Web Console and install Android 1.1.3 to follow these workflows. Labels can vary with role, language, assignment, and connection.
