# Notification eligibility and catalog

## Database / schema

`users.notificationStartedAt` records the first authenticated notification start. It is initialized transactionally at successful login or when an existing authenticated installation first upgrades. Historical broadcasts are not backfilled. The existing `createdAt` also bounds eligibility.

The private `notification_subscriptions` collection stores one record per account and installation: account ID, installation ID, authentication version, closed signed-in periods, current interval start, expiry and retention metadata. Explicit logout closes that installation's interval. A session refresh extends an open interval and cannot reopen an explicitly closed interval. A successful new login opens a new interval. Other installations remain independent. Closed intervals preserve legitimate account history; events from gaps while all installations were signed out are excluded. Offline connectivity alone does not close an interval.

Closed periods are retained for the existing 28-day notification window and pruned on updates. `deleteAfter` is retention metadata; this change does not enable a database TTL policy. Queries use the existing event ordering index and the automatic single-field subscription account index. No bulk migration or new composite index is needed. Firestore rules deny direct client access.

## Server / API

The inbox requires current account/role/farm authorization, a timestamp at or after account creation and notification start, and an event timestamp inside a signed-in interval. Read/dismiss state remains account owned. Price and account source records remain available in their respective modules regardless of notification eligibility.

Device registrations retain their original registration time for an unchanged binding, renew their expiry, and require an open signed-in interval. Delayed historical fanout cannot target a newly registered installation. Logout closes the interval and disables that installation's token binding. A server-issued notification session key prevents a delayed logout or registration from an earlier login from disabling a newer login. Delivery rechecks token ownership, authentication version and interval immediately before sending, and its provider TTL cannot exceed the binding/session expiry. An interrupted unregister request therefore cannot reopen a logged-out subscription.

## Web implementation

Login and logout carry the installation ID. The notification bell uses the server's eligible inbox and hides rows belonging to another account during account transitions. Signed-out users have no notification bell.

## Mobile implementation

Price notifications come only from the authorized server inbox. Having an older price in the price-history cache does not generate a new notification. Guest sessions produce no account inbox items. The inbox cache is versioned, and cached/native events must satisfy the server-issued account cutoff. Switching accounts or logging out removes stale scheduled/presented system and planner alerts. Native push registration is removed on logout/account switching and re-established for the next eligible owner. Planner reminders and taps include and check the recipient account ID. Explicit password-recovery requests remain an independent signed-out flow.

Recovery notification foreground presentation and navigation also require the matching, unexpired local recovery request and a signed-out app. A recovery result cannot redirect an already signed-in account.

The operating system/provider may already have accepted a remote push before logout. An already handed-off alert cannot be recalled by a server; native cleanup and foreground ownership checks prevent it from being treated as an alert for the next account. No new general account pushes are sent once the server has acknowledged logout.

## Current notification catalog

| Notification | Recipient and trigger | Surface |
| --- | --- | --- |
| SRA price updated | Signed-in Farm Members, Farm Managers and SRA Admins eligible when an official price is published | Web/mobile inbox; mobile push |
| Phone verification requested | Authorized Farm Manager, SRA Admin or Super Admin within the target role/farm scope | Web/mobile inbox; mobile push for mobile-supported roles |
| Phone verification completed | The applicant whose number was verified | Web/mobile inbox; mobile push |
| Planned farm work overdue, today or tomorrow | Farm Member/Manager with planning access to the affected fields | Mobile in-app reminders |
| Planned work tomorrow / scheduled today | Same planning scope; grouped by date, scheduled for 6 PM the previous day and 7 AM on the work date | Mobile native reminders |
| Unsynced operations | Current account with saved mutations awaiting synchronization | Mobile in-app status |
| Unsubmitted field drafts | Current member or the responsible manager for the affected fields | Mobile in-app status |
| Password recovery approved / request updated | The device that explicitly requested assisted password recovery; works while signed out | Mobile recovery push |

Account approval, field assignment, audit submission/certification and support-ticket changes are not separate durable notification event types in the current implementation. Their records and screens still update through the existing synchronization flow.
