# HUGPONG User Manual

Sugarcane block-farm management and SRA oversight

**Edition:** 1.0 | **Prepared:** 20 October 2026 | **Application baseline:** Beta 1.0.4

For Farm Members, Farm Managers, SRA Admins, and Super Admins using the Web Management Console and Android application.

## Contents

1. [About HUGPONG](#1-about-hugpong)
2. [Roles and available tools](#2-roles-and-available-tools)
3. [Getting started](#3-getting-started)
4. [Accounts, sign-in, and recovery](#4-accounts-sign-in-and-recovery)
5. [Navigating web and mobile](#5-navigating-web-and-mobile)
6. [Farm Member: plan and record work](#6-farm-member-plan-and-record-work)
7. [Farm Manager: farms, fields, and users](#7-farm-manager-farms-fields-and-users)
8. [Crop stages and cycle renewal](#8-crop-stages-and-cycle-renewal)
9. [Operations, corrections, and archives](#9-operations-corrections-and-archives)
10. [Monthly audits and QR verification](#10-monthly-audits-and-qr-verification)
11. [SRA prices and analytics](#11-sra-prices-and-analytics)
12. [Offline work and synchronization](#12-offline-work-and-synchronization)
13. [Profile, settings, and support](#13-profile-settings-and-support)
14. [Super Admin: platform administration](#14-super-admin-platform-administration)
15. [Troubleshooting](#15-troubleshooting)
16. [Quick reference and glossary](#16-quick-reference-and-glossary)

## 1. About HUGPONG

HUGPONG supports sugarcane field operations and regulatory oversight for block farms in Silay City. It connects field recording, crop planning, costs, farm supervision, monthly audit reports, and SRA price references.

The Web Management Console provides management and administration tools. The Android application supports Farm Members, Farm Managers, and SRA Admins, including selected offline workflows.

### How records become official

The HUGPONG server checks permissions and validates changes before saving official records in the shared database. A saved draft, cached screen, or unsynchronized change on a phone is local work. It becomes a shared record only after the server accepts it.

Keep these distinctions in mind:

- **Draft:** editable preparation for an operation; it has not been submitted.
- **Unsynced:** a change is saved locally and is waiting for server acceptance.
- **Active operation:** a submitted record in the current operational history.
- **Archived operation:** a retained historical record.
- **Certified audit:** a report that an SRA Admin has reviewed and certified.

Farm Managers monitor and compile operation records. They do not approve or certify individual operation logs. SRA certification applies to an audit report.

### Reading this manual

The instructions use English interface labels. Android also offers Hiligaynon and Filipino. Some labels change with the selected language. Buttons and data depend on your role, assignments, connection, and installed version. Use the screen's explicit **Close**, **Cancel**, or back control to leave a dialog.

## 2. Roles and available tools

| Role | Web console | Android app | Main responsibility |
| --- | --- | --- | --- |
| Farm Member | No member workspace | Yes | Plan and record work for assigned fields |
| Farm Manager | Yes | Yes | Supervise an assigned block farm, manage fields and members, and compile monthly audits |
| SRA Admin | Yes | Yes | Review and certify audits, publish price references, and oversee farms |
| Super Admin | Yes | No | Govern accounts, support, diagnostics, and backup/recovery |

### What each role can do

**Farm Member:** view assigned fields; prepare plans and drafts; record operations; view authorized operation history and analytics; request a new crop cycle; manage personal settings; and submit support tickets.

**Farm Manager:** manage fields and Farm Members within the assigned farm; monitor work and synchronization; record work on another owner's field through authorized Manager Takeover; compile and deliver monthly audits; and review cycle-renewal requests.

**SRA Admin:** inspect farm information; review, return, or certify monthly audits; verify audit QR references; compile certified reports by crop year; publish price references; and perform permitted account provisioning and verification reviews. Farm Member directory entries may be read-only for this role.

**Super Admin:** administer permitted accounts and roles; handle support tickets; inspect the system audit ledger and diagnostics; monitor synchronization; and manage encrypted business-data backups. SRA professional certification remains an SRA Admin function.

Access to a menu does not grant access to every record. Farm and field assignments determine which data you can use.

## 3. Getting started

### Before your first session

Have the following ready:

- The official HUGPONG website address or Android installer supplied by your organization.
- Your permanent eight-digit User ID or registered Philippine mobile number.
- Your password, or the initial password provided by an authorized administrator.
- A working connection for sign-in, verification, and initial data loading.
- Your correct farm and field assignment, if already arranged.

### Open the web console

1. Open your organization's HUGPONG website in a current browser.
2. Select its sign-in or management-console entry.
3. Sign in with an account that supports web access.
4. Complete any verification or first-login password prompts.
5. Confirm that the displayed name, role, and farm assignment are correct.

On a narrow browser window, use the menu button to open navigation.

### Install and open Android

1. Download the official Android APK using your organization's HUGPONG download page.
2. Open the downloaded file. If Android asks, allow installation from the source you used, then follow the installation prompts.
3. Open **HUGPONG** and choose Hiligaynon, Filipino, or English.
4. Complete the introduction and sign in or register as a Farm Member.
5. Respond to the notification-permission prompt. Notifications support reminders and recovery-request alerts.
6. Allow camera access when you use the QR scanner. Photo access is requested when selecting an image containing an audit QR code.

When updating, install the official update over the existing installation. Synchronize pending work first. Uninstalling the app or clearing its storage can remove drafts and unsynchronized work.

## 4. Accounts, sign-in, and recovery

### 4.1 Register as a Farm Member on Android

1. On the sign-in screen, open **Register** or the account-creation option.
2. Enter your official name, including the required first and last names.
3. Select your Block Farm if known. You can continue unassigned where the form permits it.
4. Enter your registered Philippine mobile number in the displayed format, such as `09XXXXXXXXX`.
5. Choose an available phone-verification method. For SMS, request the code and enter the six digits. Otherwise, request authorized phone-verification review.
6. Create and confirm a password, review the privacy and terms notices, and accept the required consent.
7. Submit the form once and wait for the result.
8. Save the permanent eight-digit User ID shown on the success screen, including any leading zeroes.
9. Follow any remaining review or assignment instructions. Contact your Farm Manager if your field is not available.

Self-registration is for Farm Members. Farm Manager, SRA Admin, and Super Admin accounts are created through authorized administration workflows.

### 4.2 Sign in and complete first-login setup

1. Enter your eight-digit User ID or registered mobile number and your password.
2. Complete any required consent prompt and select the sign-in button.
3. If phone verification is required, choose SMS or authorized review as offered.
4. If prompted to change an initial password, create and confirm your own password.
5. Wait until HUGPONG opens your role's workspace.

Passwords must contain 8 to 256 characters, including an uppercase letter, a lowercase letter, and a number. Common or predictable passwords are rejected.

The interface currently directs Smart and TNT users to authorized review when SMS verification is unavailable. Follow the options shown by the application. An authorized reviewer must verify the registered number before clearing a review requirement.

Repeated failed sign-in attempts can temporarily lock the account. Wait and follow the displayed message; restarting the app or refreshing the page does not clear the server's lockout.

### 4.3 Reset a forgotten password

**When SMS recovery is available:**

1. Select **Forgot Password** from sign-in.
2. Enter the identity details requested by the form.
3. Request and enter the SMS code.
4. Create and confirm your new password.
5. Return to sign-in and use the new password.

**When authorized recovery review is needed:**

1. Open password recovery and choose the authorized-review option.
2. Enter your permanent User ID and registered mobile number.
3. Submit the request and arrange an identity check with an authorized Farm Manager, SRA Admin, or Super Admin, as appropriate to your account.
4. Keep the recovery screen available for status updates. Android may also notify you if notification permission is enabled.
5. After approval, set your own new password within the 15-minute approval window.
6. If the request is rejected or expires, read the explanation and start a new request when ready.

The reviewer authorizes recovery; you create the new password yourself. Phone-verification review and forgotten-password recovery are separate processes.

## 5. Navigating web and mobile

### Web navigation

Use the left sidebar for workspaces and the account menu for settings, support where available, and sign-out.

| Role | Main sidebar destinations |
| --- | --- |
| Farm Manager | Dashboard; Farm & Field Registry; Field Operations; Operational Analytics; Sync Monitor; User Management |
| SRA Admin | Dashboard; SRA Audit Center; SRA Price Monitor; Operational Analytics; Farm & Field Registry; User Management |
| Super Admin | Dashboard; User Directory Monitor; System Sync Monitor; Support & Tickets Desk; Maintenance & Security; Diagnostics Console; Backup & Recovery |

### Android navigation

The main tabs are **Home**, **Planner**, **Field Ops**, and **Profile**, subject to role and connection. SRA Admins use **Field Ops** as the Audit Desk and do not have the Planner tab. Analytics and Sync Monitor open from the relevant dashboard or screen controls.

Mobile uses a shared font scale across all tabs, with secondary text at least 14 points and darker supporting text. Your phone's font-size setting also applies; longer descriptions can wrap to additional lines.

For Farm Members and Farm Managers, offline navigation emphasizes field work. Some Home, Profile, and management controls are unavailable until connectivity returns. Farm Member planning remains available within the supported offline navigation.

### Filters and detail views

- Select the correct Block Farm and Field before reviewing or entering data.
- Treat **Crop Year Cycle** and **Field** as separate filters.
- Open a record to inspect its operation date, costs, author, amendments, and synchronization state.
- Use **Load More** or the available paging control to inspect additional records.
- An empty filtered view can mean no matching data; it does not necessarily mean records are missing.

## 6. Farm Member: plan and record work

### 6.1 Check your field

1. Sign in on Android and open **Home** or **Field Ops**.
2. Select your assigned field.
3. Check its owner, area in hectares, Crop Year Cycle, and Current Stage.
4. Contact your Farm Manager if the assignment or area is incorrect. Do not use another person's field to record your work.

If no field appears, your account may still need assignment. A newly registered account does not create a field automatically.

### 6.2 Prepare a plan

1. Open **Planner** and choose your own field.
2. Select the crop stage and an operation from the catalogue, or use a permitted custom operation.
3. Enter the requested quantities, units, rates, labor, materials, and planning details.
4. Review the estimate and schedule information shown by the planner.
5. Save the plan, or transfer an intended operation to a draft using the available action.

A plan is an estimate. It does not prove that field work happened and does not become a submitted operation until you record and submit the actual work. Reminder delivery depends on the device's notification permission and settings.

### 6.3 Save a draft

1. Open **Field Ops**, select your field, and open the relevant operation or add-operation action.
2. Enter the work details you know.
3. Select the draft-saving action and confirm it.
4. Reopen the draft later and complete or correct its details before submission.

Drafts remain local preparation. You can discard a draft, but you cannot permanently delete a submitted operation through the normal record workflow.

### 6.4 Record completed work

1. In **Field Ops**, choose the correct field, stage, and operation.
2. Enter the **Operation Date**: the date the activity was performed.
3. Fill in the required quantity, unit, rate, area, labor, material, or line-item details shown for that operation.
4. For planting, choose the sugarcane variety when required. The variety is associated with that Crop Year Cycle.
5. Check every line item and the calculated total. Record actual quantities and actual costs.
6. Select the submission action and review its confirmation. If submitting a batch, inspect each included draft first.
7. Read the result: **Synced** means the server accepted it; **Unsynced** means it remains on the device awaiting synchronization.
8. Open the ledger or history and verify the operation, date, field, and total.

**Example:** If a form uses quantity multiplied by rate, three units at PHP 500 per unit total PHP 1,500. Check that the selected unit represents the real activity before submitting.

Use the existing saved entry if the connection drops. Check its synchronization state before attempting another submission.

### 6.5 Additional work and stage completion

Use a **Supplemental** entry, where offered, to record additional work against an already completed task. It is a separate activity record, not a replacement for the original operation.

After all required activities in a stage are complete, use the stage-completion or next-stage control and review any warning about missing work. An offline stage change stays provisional until the server accepts it.

## 7. Farm Manager: farms, fields, and users

### Block Farm setup by an authorized SRA Admin

Before field enrollment, an authorized SRA Admin can create or update a Block Farm through the web **Farm & Field Registry**:

1. Open the Block Farm create or edit action.
2. Enter the farm name, address, and declared area in hectares.
3. Select an available Farm Manager, or leave the assignment empty if permitted.
4. Save online and verify the returned farm details and permanent ID.
5. Confirm the manager assignment before asking that manager to enroll fields.

The Android app does not provide Block Farm creation. Use web for this setup; both clients use the saved farm and assignment afterward.

### 7.1 Start the day

1. Open **Dashboard** on web or **Home** on Android.
2. Confirm your assigned Block Farm.
3. Review field counts, area, crop progress, recent operations, and attention items.
4. Open **Sync Monitor** to investigate unsynchronized work or outdated member activity.
5. Follow up with the relevant member before compiling reports that depend on that work.

Activity and successful synchronization are different measures. Recent sign-in activity does not prove all field changes have reached the server.

### 7.2 Enroll a field

**Web:** open **Farm & Field Registry** and choose **Enroll New Field Plot**. **Android:** open the field-management/enrollment action available in **Field Ops**.

1. Connect to the server. New field enrollment requires an online response.
2. Confirm the Parent Block Farm.
3. Choose the Assigned Field Owner, or leave it unassigned if permitted.
4. Enter the Plot Area in hectares. It must fit the Block Farm's remaining area.
5. Review and submit the form.
6. Wait for the permanent Field Plot ID and Crop Year Cycle to be returned.
7. Reopen the field and verify the area, assignment, and cycle.

Field IDs, Block Farm IDs, and internal cycle IDs are system-generated. The enrollment cycle preview is read-only; the server sets the official value.

For an existing field, use its edit action to update permitted details. Read an archive confirmation carefully: field archival and operation-history viewing are different actions.

### 7.3 Provision and review Farm Member accounts

**Web:** open **User Management**. **Android:** use the user-management, provisioning, or pending-review controls in **Field Ops**.

1. Choose the relevant create or review action.
2. Enter or verify the person's name, registered number, permitted role, and farm assignment.
3. Complete the verification method required by the form. Document an authorized manual phone check using the offered reason and details.
4. Save the account or review decision and wait for server confirmation.
5. Give the account holder the permanent User ID and any initial credentials through your organization's normal process.
6. Arrange the correct field assignment and ask the member to complete first-login setup.

Farm Managers provision Farm Members within their allowed scope. SRA Admins and Super Admins have different account permissions. If an action is absent or a row says read-only, use the appropriately authorized administrator.

### 7.4 Use Manager Takeover

1. Open the member's field in **Field Operations** on web or **Field Ops** on Android.
2. Select **Manager Takeover** or its authorization action.
3. Enter your own account password while connected to the server.
4. Wait for authorization for that specific field.
5. Record or amend the permitted operation and review the result.

Takeover authorization is time-limited. Reauthorize if it expires or you switch to a different field. The system preserves the manager's identity and **Manager Takeover** provenance. A takeover entry is distinct from an amendment. Planning and drafts are available to the field owner; takeover does not transfer ownership.

## 8. Crop stages and cycle renewal

### The six stages

| Order | Current Stage |
| --- | --- |
| 1 | Land Preparation |
| 2 | Planting |
| 3 | Basal |
| 4 | Weeding |
| 5 | Top-Dress |
| 6 | Harvest |

Record operations against the appropriate activity and stage. Follow the current-stage controls and any missing-work warnings. Keep the Operation Date accurate even when entering work later.

### Request and approve a new Crop Year Cycle

Cycle renewal uses an online request and review process.

1. The field owner finishes recording and synchronizing the previous cycle's work.
2. The owner opens the field's new-cycle or renewal action and reviews the selected cycle type. A manager acting for another owner needs valid Manager Takeover authorization.
3. Submit the request while connected. The application confirms that the request was sent; this does not mean the new cycle has started.
4. The field's operations are locked while the request is pending.
5. The Farm Manager compiles all outstanding submitted operations and reviews the pending renewal request.
6. The manager approves or rejects the request using the review controls. If approval is blocked, resolve the outstanding compilation requirement first.
7. After approval, confirm that the previous cycle is closed, its operation history is archived, and the next cycle is active at Land Preparation.

Historical operations remain available under their previous Crop Year Cycle. A request is not a way to erase an inaccurate record. Resolve a correction through the appropriate amendment process before closure.

## 9. Operations, corrections, and archives

### 9.1 Read a record

Open the record details to check the Field, Crop Year Cycle, Operation Date, operation type, quantities, costs, recorded-by identity, and history.

| Label | Meaning |
| --- | --- |
| Active | Submitted operation retained in the active lifecycle |
| Archived | Historical operation retained after archival |
| Supplemental | Additional work recorded separately |
| Manager Takeover | Entry recorded through authorized manager supervision |
| Amended | The record has a correction history |
| Synced / Unsynced | Whether a local change has received server acceptance |

Several labels can appear together. For example, an Active operation can be Supplemental, have Manager Takeover provenance, and have amendments. These labels describe different properties.

### 9.2 Correct an eligible operation

1. Open the operation and choose its edit or amendment action, if available.
2. Confirm your authorization. Managers editing another owner's field need valid Takeover authorization.
3. Change the inaccurate values.
4. Enter a meaningful **Reason for Amendment**.
5. Review and submit the correction.
6. Check the record's amendment history and synchronization result.

The original authorship and amendment trail are retained. Archived operations and records protected by the audit workflow may be locked. If no correction action is available, contact the Farm Manager or relevant SRA reviewer; do not create a duplicate to hide the mistake.

### 9.3 Review archived records

**Web:** use the history/archive controls in **Field Operations**. **Android:** open the ledger, history, or archive view in **Field Ops**.

1. Select the Crop Year Cycle.
2. Filter by Field and operation type where needed.
3. Use exact record-ID search when offered, and load additional pages as necessary.
4. Open the matching record to inspect its stored details.

**Clear View** hides the currently displayed results. **Show Records** restores the view from its first page. Neither action deletes records. Submitted operation records follow **Active -> Archived** and are retained.

## 10. Monthly audits and QR verification

### 10.1 Understand the audit states

| State | What it means | Next responsible action |
| --- | --- | --- |
| Compiled | A report snapshot has been prepared | Manager chooses a delivery method |
| Pending Submission | Delivery is waiting for synchronization | Manager restores connectivity and checks delivery |
| Pending Review | Report is in the SRA review workflow | SRA Admin reviews it |
| Returned | SRA reviewer requested corrections | Manager reads the reason and recompiles after correction |
| Certified | SRA Admin certified the report | View the preserved certified snapshot or export it |

Compiling, delivering, importing, and certifying are separate actions. Generating or scanning a QR code does not certify a report.

### 10.2 Farm Manager: compile and deliver

**Web:** open **Field Operations** and its monthly audit compilation action. **Android:** use the monthly compilation action in **Field Ops**.

1. Synchronize the relevant field operations for your assigned Block Farm and reporting period.
2. Review the proposed month. The system prioritizes unresolved reporting work; follow the period offered and any validation message.
3. Compile the eligible submitted operations. Drafts are not audit entries.
4. Review the report ID, farm, month, version, fields, operation count, area, and costs.
5. Select **Send Through Cloud** or **Generate QR Transfer**.
6. For Cloud delivery, wait for server confirmation that the report is awaiting SRA review. A queued delivery is still waiting to be sent.
7. For QR delivery, display or save the QR image and give it to the SRA reviewer through the organization's reporting process.
8. Reopen the report to check its status and any return reason.

Current QR codes contain a compact report reference and integrity information. The server retrieves and verifies the full report. They are not standalone offline copies of all operations. If the report was prepared locally, ensure the canonical report has reached the server before expecting the reference to resolve.

Android can retain supported locally prepared reporting work and queue supported Cloud delivery. Final compilation and delivery are established by server acceptance. Unsynchronized operations for the selected farm and period must be resolved first.

### 10.3 SRA Admin: open and verify a report

**Web:** open **SRA Audit Center**. **Android:** open the **SRA Audit Desk** in **Field Ops**.

1. Select a report in **Audit Inbox**, or open the QR verification tools.
2. Scan the manager's QR code, choose a QR image when offered, or use the online report-ID lookup.
3. Wait for the server to retrieve and verify the report.
4. Review its farm, month, manager/compiler, fields, operation snapshots, costs, version, and integrity result.
5. If an import confirmation is offered, confirm it only after reviewing the report. Import places it in the review workflow; certification is a separate decision.

Android can retain a reference scanned while offline and retry when the server is available. Final lookup/verification of current reference QR codes requires connectivity. Older QR formats may remain readable, but server confirmation is still required for official actions.

### 10.4 Certify or return

1. Open a **Pending Review** report while connected.
2. Inspect its contents and supporting operation snapshots.
3. If correct, choose the certification action and confirm it.
4. If corrections are needed, choose the return action and provide a clear reason.
5. Wait for server confirmation and verify the resulting status.

A returned report remains in history. The manager corrects eligible source records and recompiles as a new linked version, then sends that version for review. Certified versions preserve their recorded snapshot and certification identity. Certification does not change source operation lifecycle labels to a new approval state.

### 10.5 History, certificates, and crop-year compilations

Open **Audit History** to review certified monthly snapshots and their certification details. Use the print, PDF, or share control offered for the certified report. On web, the browser print dialog can save a PDF; Android uses its export/share flow.

To compile certified reports by Crop Year Cycle as an SRA Admin:

1. On web, open **SRA Audit Center -> Crop Year Compilations**. On Android, use the calendar control in the Audit Desk or **Crop Year Compilations** from Monthly Audit History.
2. Select the Crop Year Cycle and All Block Farms or one Block Farm.
3. Review the online preview, including covered months, source reports, unique operations, fields, members, hectares, and costs.
4. Choose **Compile Crop Year** and wait for the saved result.
5. Open a saved compilation and use **Print / Save PDF** on web or **Export / Share PDF** on Android.

These compilations cover **certified reports to date**. They do not declare the crop year complete or replace monthly certification. They require a live connection, and older saved compilations remain unchanged when later monthly reports are certified.

## 11. SRA prices and analytics

### 11.1 Read price references

Use the price cards, market history, or analytics price section available to your role. SRA Admins manage references through **SRA Price Monitor** on web and the publication action available on Android.

| Product | Display unit | Read it as |
| --- | --- | --- |
| Raw sugar | PHP/Lkg | Philippine pesos per 50-kilogram bag |
| Molasses | PHP/MT | Philippine pesos per metric ton |

Check the reporting period and effective date. A blank or unquoted period is not a zero price. The application distinguishes **Reported**, **No bidding**, **Milling ended**, and **Not reported**. These are reference prices, not records of your individual sale proceeds.

### 11.2 SRA Admin: publish a price reference

1. Connect to the server and open the price-publication action.
2. Enter the Effective Date and Reporting Period.
3. Choose a status separately for raw sugar and molasses.
4. For a Reported product, enter a valid positive price in the correct unit. For an unavailable quote, use its status instead of entering zero.
5. Complete the circular/reference and issuing-authority/source details required by the form.
6. Review and select **Publish Price Reference**.
7. Wait for server confirmation and verify the saved entry in history.

### 11.3 Use operational analytics

**Web:** open **Operational Analytics**. **Android:** open **Analytics** from the relevant screen or dashboard.

1. Choose the available farm scope.
2. Select the Crop Year Cycle or reporting period.
3. Select **All Fields** or a particular Field independently of the year.
4. Review **Crop Progress**, **Production Cost**, **Cost Breakdown**, **Farm Operations**, and price-reference information.
5. Check filters and synchronization before comparing values between devices.

Production costs describe recorded operations; planner estimates describe intended work. A price reference alone does not establish farm income or profit. Cached analytics may be older than live data; inspect the snapshot time where shown.

On Android, the activity frequency ranking shows five activity types per page. Use **Previous** and **Next** to reach all standard and custom activities. Rank numbers continue across pages; activity shares and analytics totals use the complete filtered set. Changing the farm, field, Crop Year Cycle, or reporting period returns the ranking to the first page. Web keeps its full activity grid.

## 12. Offline work and synchronization

### 12.1 What remains available

| Task | Offline expectation |
| --- | --- |
| Farm Member field work | Supported plans, local drafts, operation capture, and stage changes can remain on the device for later submission |
| Farm Manager field work | Supported field changes and already authorized actions may be queued; new Takeover authorization requires the server |
| New field enrollment or cycle renewal | Requires an online server response |
| New sign-in, account recovery, or verification | Requires the server |
| SRA mobile reference viewing | Last account-scoped analytics and certified history can be read as timestamped cached data when available |
| Current audit QR lookup | Requires the server to retrieve the full report; Android can retain a scan for retry |
| SRA import, return, certification, publication, or crop-year compilation | Requires server confirmation; do not treat local viewing as an official action |
| Support creation | Supported local queues retain pending submissions for later delivery |
| Web Management Console | Online-only. A live server connection is required for access and submissions; stage changes and support tickets are never queued for automatic offline replay |

Offline work depends on having previously signed in and loaded the authorized data. SRA cached views do not provide an offline pending-review queue or permission to certify.

The Web console blocks interaction when the internet connection or HUGPONG server is unavailable. Reconnect and choose **Retry connection** if needed. Forms already open can remain in memory, and saved form drafts may be retained, but this does not provide offline Web access or background submission. Browser queues saved by older releases are not automatically submitted or deleted; retain them for administrator review before clearing browser storage.

### 12.2 Read synchronization states

| State | Meaning | What to do |
| --- | --- | --- |
| Synced | Server accepted the change | Confirm the record details if needed |
| Unsynced | Change is stored locally and waiting | Restore connectivity and synchronize |
| Retrying | A retry is in progress or scheduled | Allow it to complete |
| Failed | Synchronization needs attention | Read the reason and resolve it |
| Conflict | The shared record changed or cannot accept this version | Review the current record with the responsible manager |

An internet connection and a working HUGPONG server are separate requirements. **No internet connection** means the device cannot reach the network. **HUGPONG server unavailable** can appear even when other websites work.

### 12.3 Synchronize on Android

1. Reconnect to Wi-Fi or mobile data and let the server connection check finish.
2. If automatic synchronization is enabled, wait for the result.
3. If automatic synchronization is off or changes remain, open **Sync Monitor** and tap **Sync Now**.
4. Review the number processed, the remaining count, and the explanation for any failures or conflicts.
5. Resolve the stated issue, then retry the existing queued change.
6. Confirm that no relevant changes remain before compiling audits, changing devices, clearing storage, or signing out.

A retry can resume a saved change without creating a new record. Avoid creating another operation to work around a failed upload. For a conflict, compare the saved and current values with the Farm Manager before deciding how to correct the record.

### 12.4 Protect local work

If Android cannot read its saved queue, new saves and synchronization pause instead of replacing it with an empty queue. Sync Monitor shows the storage error and an unknown pending count. Retry **Sync Now** after the device can read storage again. Do not clear storage to resolve this error.

Do not uninstall, clear app data, use **Clear Local Cache**, or clear browser storage while drafts or unsynchronized changes are still needed. These actions can remove local work. A phone's local queue is not a substitute for the central business-data backup.

If the application requires sign-in again, restore the authorized session and inspect the queue. Do not assume that seeing the same field name proves an earlier upload succeeded.

## 13. Profile, settings, and support

### 13.1 Profile and preferences

**Web:** open the account menu and **Settings**. **Android:** open **Profile**.

Review your User ID, name, role, registered number, and assignment. Use the permitted profile-edit controls for corrections. On Android, change the interface language from Profile. On web, choose the offered light, dark, or system theme preference.

### 13.2 Password and registered-number changes

1. Open **Security** or **Security & Password**.
2. For a password change, enter the current password, the new password, and its confirmation.
3. Select the offered session option: retain the current session or sign out all devices.
4. Submit online and follow the result. Other sessions are ended by a password change; sign in again where required.
5. For a registered-number change, authorize it with the current password and complete the verification workflow shown.

### 13.3 Ask for support

Farm Members, Farm Managers, and SRA Admins can create tickets. Super Admins handle them.

**Web:** use the account menu's support entry. **Android:** open **Profile -> Help & Support Desk**.

1. Choose **New Ticket** or **Create Ticket**.
2. Select a category: Account / Login; Synchronization; Field / Operation Data; Audit / QR; SRA Price; or Other.
3. Enter a short subject and a clear description of what happened.
4. Include relevant field, operation, report, or error-reference IDs and the approximate time. Never include your password or SMS code.
5. Submit once and check its state. On Android, **Pending Submission** means it is queued locally. Web requires an online server response and does not queue support tickets. **Open** means the server received the ticket.
6. Use **My Tickets** or the Active view to read replies and add a follow-up while the ticket is active.
7. Use **History** or **Ticket History** for resolved and closed tickets.

The ticket lifecycle is **Open -> In Progress -> Resolved -> Closed**. Requesters see their own tickets; the Super Admin manages handling and status changes.

### 13.4 Sign out

Check for drafts and unsynchronized work first. On web, open the account menu and choose **Sign Out**. On Android, use **Profile -> Sign Out** and choose **Sync First** when pending work is reported. Read the confirmation before continuing.

## 14. Super Admin: platform administration

Super Admin work is performed in the Web Management Console.

### 14.1 Accounts and roles

1. Open **User Directory Monitor**.
2. Locate the account and inspect its role, status, registered number, and assignments.
3. Use the permitted provision, edit, verification-review, recovery-review, or disable/reactivate action.
4. Check identity and intended access before saving a role or account-status change.
5. Review the saved result and relevant audit entry.

Account provisioning follows role-specific limits. For example, SRA Admins can provision permitted Farm Managers; Farm Managers provision scoped Farm Members. Do not assume a visible directory row is editable by every administrative role.

### 14.2 Support, monitoring, and diagnostics

- **Support & Tickets Desk:** open an active ticket, review the original request and conversation, add a response, and advance it through In Progress, Resolved, and Closed. The original subject and description are retained.
- **System Sync Monitor:** examine account/device connectivity, queued-work indicators, last activity, and successful sync information. Stale or unknown telemetry is not proof of successful synchronization.
- **Maintenance & Security:** inspect health summaries and the System Audit Ledger. Use the ledger's filters and paging to investigate recorded actions.
- **Diagnostics Console:** inspect sanitized error details and reference IDs to investigate reported failures.

Opening monitoring screens does not repair data. Match the account, field, report, and error reference before taking a corrective action.

### 14.3 Create and retain a backup

Create an encrypted business-data backup at least every 24 hours, after daily operations and before major changes.

1. Open **Backup & Recovery** and choose the create/download action.
2. Supply the required authorization and choose an archive passphrase of at least 16 characters. Use a passphrase separate from the account password.
3. Download the encrypted `.hpbak` archive.
4. Save two copies in separate locations.
5. Store the passphrase separately in a password manager.
6. Confirm that the activity entry shows **READY** or **VERIFIED** and record its reference.

### 14.4 Validate and recover

Run a recovery drill at least every 30 days and after changing the backup passphrase.

1. Select the intended `.hpbak` file.
2. Enter the current Super Admin password and the archive passphrase.
3. Select **Run recovery drill**.
4. Review checksum validation and the plan showing existing and missing records. A drill does not restore records.

For actual missing-record recovery:

1. Coordinate a pause in normal data entry and identify the affected records.
2. Validate the intended archive and review its date and recovery plan.
3. Only when the plan is correct, enter **RECOVER MISSING RECORDS** and run the recovery action.
4. Record the recovery reference and inspect the Audit Ledger.
5. Verify the affected records on both web and Android after refreshing/synchronizing.

Recovery recreates missing business records in the same project. It does not overwrite existing records or restore passwords, authentication identities, sessions, or every operational dataset. It is not a complete sign-in-system backup. Use the repository's Backup and Recovery Runbook for detailed operator procedures.

## 15. Troubleshooting

| Problem | Checks and next action |
| --- | --- |
| Cannot sign in | Check User ID leading zeroes or registered number, password, connection, verification requirements, and whether the account supports this platform. Use password recovery when needed. |
| Account is temporarily locked | Follow the displayed wait instruction. Repeated retries and restarting do not reset the lockout. |
| SMS does not arrive | Check the registered number and resend timer. Use authorized review when offered, including the current Smart/TNT alternative. |
| No assigned field appears | Check filters and connection; ask the Farm Manager to verify the account-to-field assignment. |
| Enrollment fails | Verify parent farm, owner, positive hectares, available farm area, and a live connection. Wait for the server-issued ID. |
| Field is locked for renewal | Ask the manager to review the pending cycle request and compile outstanding operations. The next cycle begins after approval. |
| Save says Unsynced | The change is local. Open Sync Monitor after reconnecting and inspect the remaining count. |
| Internet works but HUGPONG does not | Wait for the server-readiness check and its retry. Preserve local work and report persistent server unavailability. |
| Sync shows Failed or Conflict | Read the reason, restore permissions/session or correct invalid input as appropriate, and involve the Farm Manager for a shared-record conflict. |
| Operation cannot be edited | Check ownership, valid Takeover authorization, archival, and audit locks. Request an authorized correction. |
| Takeover authorization expired | Reconnect and authorize again using the manager's own password for the selected field. |
| Monthly audit cannot compile | Confirm assigned farm, valid period, eligible submitted operations, and synchronization of the relevant work. An existing report or no new eligible work may explain the result. |
| QR code will not resolve | Check that it is a HUGPONG audit code, use an unobstructed image, reconnect, and ensure the report reached the server. Retry retained scans or use the online report-ID lookup. |
| Audit disappeared from Inbox | Check its current status and Audit History. Certified reports leave the active review queue. |
| Web and mobile totals differ | Align account scope, Field, Crop Year Cycle/period, active/archive selection, and synchronization. Inspect cached snapshot time. |
| Price is unavailable | Read the quote status and period. No bidding, milling ended, or not reported does not mean a zero price. |
| Recovery approval expired | Start a new authorized recovery request; only the claimant can set the new password after approval. |
| Cannot find a submitted ticket | Check Pending Submission, Active, and Ticket History. Reconnect and refresh before creating another ticket. |
| Cannot close a dialog by tapping outside | Use its explicit Close, Cancel, or supported back control. |

When escalating an issue, provide the affected User ID, device/app version, farm/field or report reference, time, visible message, and sync state. Keep passwords, OTP codes, and backup passphrases private.

## 16. Quick reference and glossary

### Daily checklists

**Farm Member:** verify field and stage; record actual work and costs; check the ledger; synchronize pending changes; preserve drafts before signing out.

**Farm Manager:** check member activity and synchronization; confirm assignments; resolve eligible corrections and cycle requests; compile outstanding monthly work; check delivery and return reasons.

**SRA Admin:** review the live Audit Inbox; verify report contents; certify or return with a reason; check price periods; export certified records when needed.

**Super Admin:** review support and health; investigate errors with reference IDs; maintain account access; download the daily backup; keep two copies; schedule the recovery drill.

### Glossary

| Term | Meaning |
| --- | --- |
| Block Farm | A managed group of sugarcane fields |
| Field / Field Plot | An individual agricultural area with an owner assignment and crop-cycle records |
| Crop Year Cycle | The annual production-cycle identity, displayed in a form such as 2026-2027 |
| Current Stage | The field's current position in the six-stage crop workflow |
| Draft | Local, unsubmitted operation preparation |
| Outbox | Saved changes waiting to be sent to and accepted by the server |
| Operation Date | The date work was performed, separate from the time it was entered |
| Manager Takeover | Time-limited authorization for a manager to act on another owner's field |
| Supplemental | Additional recorded work for an activity |
| Amendment | A correction with a retained reason, actor, and change history |
| Audit snapshot | The report's preserved set of operation values and supporting details |
| QR reference | A scannable report identity and integrity reference used to retrieve the official report |
| Certified reports to date | The certified monthly sources included in a crop-year compilation at its creation |
| ha | Hectares |
| Lkg | A 50-kilogram sugar bag |
| MT | Metric ton, equivalent to 1,000 kilograms |
| PHP | Philippine peso |

### Document control

This edition covers the Beta 1.0.4 application baseline and repository workflows reviewed on 20 October 2026. Review the manual when navigation, permissions, reporting, or synchronization behavior changes. Your administrator supplies the official deployment address and support contact.

Repository operator references: [Backup and Recovery Runbook](BACKUP_AND_RECOVERY_RUNBOOK.md), [Crop Year Compilations](CROP_YEAR_COMPILATIONS.md), and [Mobile Connectivity and Deployment](MOBILE_API_CONNECTIVITY_AND_DEPLOYMENT.md).
