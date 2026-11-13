# Price synchronization and verification notifications

## Findings

The user reproduced this on the hosted Web application and an installed APK. Earlier synchronization changes were still local; those installed/hosted builds have not received them. This task has not deployed anything or replaced the installed APK.

Code inspection found additional gaps:

1. Price notices were generated inside Mobile Home from loaded price records. They were not remote phone notifications. The existing server push transport was used only for assisted password-recovery decisions; there was no general authenticated device registration, price push dispatch or phone-verification notification delivery.
2. Android had no `android.googleServicesFile` configuration. The existing Web Firebase configuration does not initialize native FCM. The user supplied `mobile/google-services.json` during the task; it was inspected without printing its contents. It is an Android client configuration, has no service-account private key, matches `com.hugpong.app`, and passes local Firebase project/sender checks.
3. Same-effective-date price publications were sorted by effective date without publication time as a tie-breaker. Selecting a price by an unrelated record ID could retain an older publication. The ordering helper's selector list uses fallback timestamps, so supplying effective date and publication date together did not produce a tie-breaker.
4. Mobile's combined replica refresh could hold back a valid price response when an unrelated endpoint failed. Reconnection primarily relied on reopening the stream. The first-login authorized-review dialog also had no automatic approval subscription.
5. Separate native notification modules could overwrite the foreground presentation handler. The new implementation shares the existing native module/handler.

## Database / schema

The existing domain records, audit ledger and account-owned `notification_states` remain authoritative. No migration or record deletion was performed. Three private operational collections support the missing delivery function:

- `notification_events`: stable notification ID, source audit ID, type, entity ID, text, resources, timestamps, expiration, dispatch state, retries and distributed lease.
- `notification_deliveries`: per-event/device provider ticket, receipt confirmation/error, retry/permanent/unconfirmed status.
- `mobile_push_devices`: private token binding to the authenticated account, installation and auth version. A token has one owner; registering it after account switching replaces the old binding.

Selected audit events atomically create notification intents in the same transaction/batch as the domain mutation: `SRA_PRICE_PUBLISHED`, `USER_PHONE_VERIFICATION_REVIEW_REQUESTED`, and `USER_PHONE_VERIFIED_BY_AUTHORITY`. Existing registration with authorized phone review already uses the review-request event, so it is covered too. Unrelated audit events do not create notifications. Idempotent publication/review retries do not create another intent.

`firestore.rules` denies direct client access to all three collections. `firestore.indexes.json` adds the pending-notification queue index and the price ordering index. Deploy and wait for those indexes before deploying the new query consumers. New operational notification copies expire from the inbox after 28 days; domain prices, users and audit records are preserved. `deleteAfter` metadata is present, but no new TTL policy or deletion job was enabled in this task.

## Server / API

The existing push transport now supports notification channels, a positive TTL, stable Android tags and strict provider-ticket validation. Durable dispatch uses one queue listener per server instance, distributed leases, paginated device fanout, persistent per-device results and bounded retries. It does not poll application collections continuously. Failed listener connections restart with backoff, and shutdown removes listeners/timers.

Accepted tickets are checked for provider receipts after 15 minutes. Invalid device tokens are disabled; retryable send/receipt failures remain queued. A receipt that never becomes available is recorded as unconfirmed after 24 hours rather than called a delivered phone alert. Provider confirmation establishes handoff to FCM/APNs, not that a person saw a handset notification.

Recipients are reauthorized using current account status/auth version. Price updates go to Member, Farm Manager and SRA Admin accounts. Phone-review requests reuse `assertPhoneVerificationAuthority`, including the assigned-farm restrictions and prohibition on self-review. Completed requests no longer alert reviewers. Verification decisions go only to the applicant. Super Admin remains Web-only; no Mobile role restriction was expanded. Notification text contains no phone-verification evidence, passwords or recovery secrets.

New endpoints extend the existing authentication/notification routes:

- `POST /auth/push-device`: register the authenticated Mobile installation, including incomplete setup sessions.
- `POST /auth/push-device/unregister`: disable the current account's installation binding.
- `GET /api/notifications/inbox`: scoped, bounded and paginated durable inbox. Existing read/dismissal endpoints remain in use.
- `GET /auth/session/events`: authenticated revision metadata for incomplete setup sessions; it grants no access to application data.

Price history orders by effective date, publication time, then ID. The cursor includes the ordering tuple and can reopen an older cursor from its source record. All publications remain in history; analytics select the latest publication per effective date to avoid treating revisions as additional weeks. Successful publication returns its committed record without a second history query that could incorrectly turn a committed write into an error. Explicit notification-driven fresh reads bypass stale server read/account caches.

Server files:

- `server/services/systemNotificationService.js` (new)
- `server/services/mobilePushService.js`, `auditWriter.js`, `priceService.js`, `priceAnalyticsService.js`, `scopedReadCache.js`
- `server/routes/notifications.js`, `auth.js`, `prices.js`
- `server/middleware/auth.js`, `requestPermissions.js`
- `server/schema/firestoreSchema.js`, `server/server.js`

## Web

Price subscriptions and dashboards use publication time to resolve same-date revisions. The existing shared change stream invalidates prices and notification subscriptions.

A notification bell subscribes to the scoped durable inbox in the top bar and uses the existing account-owned read state. It supports older pages and opens the price/review workspace. The authorized-review setup dialog subscribes to session revision events, rechecks its own account and continues the existing setup flow after approval. It queues a recheck if approval arrives during an in-flight session read. Visibility/reconnection cleanup prevents duplicate listeners.

Web files:

- `web/react-app/src/components/layout/NotificationBell.jsx` (new), `Topbar.jsx`
- `web/react-app/src/components/auth/FirstLoginVerifyModal.jsx`
- `web/react-app/src/services/apiClient.js`, `pricesService.js`, `dashboardService.js`
- `web/react-app/src/views/prices/PricesView.jsx`

## Android

One application-owned notification controller registers the current installation, listens to existing data/change/network events, keeps an account-scoped cached inbox, and refreshes authorized resources when a push arrives or the phone reconnects. It uses the existing notification permissions/module, adds the `system-updates` channel and reconciles missed alerts. Read/dismissed/seen/displayed alerts are suppressed where known. A new installation establishes its inbox baseline without playing a month of old notification sounds. Account switches and late responses are guarded, and all subscriptions are disposed on unmount. Native push/permission failures do not block the in-app inbox.

Push messages use a positive expiration so the provider can retain messages while a phone is offline. When the application next connects, the durable inbox recovers missed events and presents unseen alerts locally when permissions permit. Open-app prices also refresh directly from an uncached authorized API response, without waiting for unrelated replica endpoints. SRA's existing account-scoped offline snapshot receives the confirmed price data while preserving its fields/certified reports. Local prices, queues and drafts stay accessible offline; publishing still requires the existing online, SRA-authorized server mutation.

The pending authorized-phone-review dialog uses the existing stream transport with the setup endpoint and automatically proceeds to the required password change or application after verification. It does not bypass account readiness.

Android files:

- `mobile/src/services/systemNotificationService.js` (new)
- `mobile/src/services/recoveryNotificationService.js`, `plannerNotificationService.js`, `authService.js`, `realtimeService.js`
- `mobile/src/data/dataStore.js`, `mobile/src/screens/HomeScreen.js`, `mobile/src/screens/auth/LoginScreen.js`, `mobile/App.js`
- `mobile/scripts/androidPushConfiguration.cjs` (new), `mobile/app.config.js`

Android build configuration accepts an EAS file variable `GOOGLE_SERVICES_JSON` or `GOOGLE_SERVICES_FILE`, the existing configured path, or local `./google-services.json`. It validates package/project/sender identity and rejects service-account private keys. Preview/production builds refuse to silently omit the Android push configuration. The provided Android configuration is not a replacement for the server's private service-account credential.

## Verification results

- Full server suite: **762 passed, 0 failed**, `output/price-notification-server-tests.tap`.
- Full Web suite: **60 passed, 0 failed**, `output/price-notification-web-tests.tap`.
- Web production build passed, `output/price-notification-web-build.txt`.
- Android development bundle export passed with the supplied Firebase client file, `output/price-notification-android-export.txt`.
- Runtime authority and client binding audits returned zero findings, `output/price-notification-runtime-authority.json` and `output/price-notification-client-bindings.json`.
- `git -c core.safecrlf=false diff --check` passed.

New behavioral coverage is in `server/tests/system-notifications.test.js` and `server/tests/system-notification-clients.test.js`. It checks atomic/replay-safe intent creation; concurrent server claims; failed-provider retries across restarts; no resend to successful devices; provider receipt confirmation and stale tokens; device paging beyond the first page; revoked/disabled accounts; token/account rebinding and logout scope; reviewer authorization; offline inbox paging/expiration; queue listener recovery/disposal; same-week price ordering and real API pagination over 65 revisions; native reconnect catch-up/deduplication; permission/native-configuration failure; late old-account responses; preservation of SRA offline snapshots when unrelated refreshes fail; and a Web approval arriving during an initial session read.

Existing tests were updated for the shared native handler, the Home inbox dependency, and the explicit private server-only collection contract. The price test fixture now keeps audit and notification records in their actual separate collections rather than counting both as audit rows. No test altered a cloud account or beneficiary record. Transport/native interactions used isolated test fixtures/stubs; these are not evidence of physical-device delivery.

## Remaining release and device validation

The hosted site and the currently installed APK are unchanged. The Android output above is a JavaScript bundle export, not an installable replacement APK. Delivery is **not verified on a physical phone**.

Before claiming the user's reported issue resolved in the deployed system:

1. Verify the Expo project's separate FCM v1 sending credential and matching Firebase project. The Android client file alone cannot authenticate Expo's FCM sending service. Never embed a service-account private key in the APK or paste it into a chat.
2. Deploy Firestore rules/indexes, wait for index readiness, and release the server/Web and a newly built APK together. Earlier local login changes also require the matching APK contract.
3. Test SRA Web-to-Web, Web-to-Android, Android-to-Web and Android-to-Android publication, including two publications for the same effective date. Check both current price and notification/inbox state without restarting.
4. Test reviewer request arrival and applicant approval while the setup dialog is open, backgrounded and reconnecting. Verify Farm Manager scope and Web-only Super Admin behavior.
5. On physical Android devices, test foreground, background, normal app closure and internet disconnection/reconnection. Inspect stored Expo tickets and receipts, notification permission/channel state and actual displayed alerts. Disabled notifications, Android force-stop, missing Play Services or provider/OS expiry can prevent or delay a background alert; the durable inbox still reconciles when the app is permitted to connect. No zero-latency handset guarantee is claimed.

References: [Expo FCM credential setup](https://docs.expo.dev/push-notifications/fcm-credentials/), [Firebase Android configuration](https://firebase.google.com/docs/android/setup), [Expo sending, tickets and receipts](https://docs.expo.dev/push-notifications/sending-notifications/), [Expo notification handling](https://docs.expo.dev/push-notifications/receiving-notifications/).
