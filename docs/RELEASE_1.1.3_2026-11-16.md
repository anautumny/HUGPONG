# HUGPONG 1.1.3

Status: preparing coordinated Web/API, Firestore rules and signed Android release on 16 November 2026, Asia/Manila. Production publication is not complete until the verification and artifact identities below are recorded.

## Included changes

- Pending users appear in dashboard operational attention. Farm Managers can approve eligible members with immediate field assignment or assign later on Web and Android; the server atomically creates the field and initial cycle when requested.
- Android automatic synchronization is always enabled, with manual retry retained and existing offline drafts/outbox preserved.
- Notification eligibility follows the account, authorized role/farm and signed-in periods. Account switches/logout clean up native alerts; new accounts do not inherit historical broadcasts. Explicit assisted recovery remains available while signed out.
- Read reduction covers farm-scoped field summaries, filtered pending queues and active push devices, coalesced authorized requests, dependency-specific cache invalidation, targeted Web/Mobile refreshes, notification state reads and bounded background delivery/retention.
- Concise eight-section user manual updated against the reviewed workflows.

## Database and server

The private `notification_subscriptions` collection and `users.notificationStartedAt` support notification eligibility. Client rules deny direct access; server authorization remains authoritative. Existing accounts initialize eligibility lazily on authenticated use; no business-record backfill is needed. No new composite index is required by the read optimizations.

Expired notification metadata/device registrations join the existing bounded retention cleanup. This does not delete field/operation/audit business records or notification read/dismiss history.

## Web and Mobile

Deploy the existing Cloudflare Worker and same-origin Web assets for https://hugpong.org. Publish Android 1.1.3 using `com.hugpong.app`, the existing signing credentials and a higher remote version code. Update the website download manifest only after the APK identity, signature and publication are verified. Keep 1.1.2 available for rollback/reference.

## Release verification and identity

Pending: source commit, complete release checks, exact mobile archive audit, EAS build and Android version code, signed APK metadata/hash, GitHub publication, Firestore rule release, Cloudflare version and read-only live checks.

Device installation, signed-in multi-role walkthroughs and physical notification delivery must be reported separately from automated checks; production business records must not be created merely to simulate a test matrix.
