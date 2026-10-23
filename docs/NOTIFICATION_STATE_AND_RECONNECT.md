# Notification state, permissions, and reconnection

Local implementation verified on 2026-10-23. Server/Web changes require deployment and Mobile changes require a new APK. No live accounts or device notifications were modified during testing.

## Causes

- Mobile saved read and dismissed IDs under shared installation keys. Logout cleared these keys, so the same generated notifications returned as unread on the next login.
- Home regenerated notifications through a subscription that could retain the previous read/dismiss sets. The rendered rows now also regenerate when those sets change.
- The startup permission request only accepted `undetermined`. The installed Expo native Android implementation can report `denied` with `canAskAgain: true` before the first request.
- Reconnect subscriptions immediately replayed their last completion. A newly mounted dashboard could show an old reconnect event after login. Native network states with unknown reachability could also be classified as offline prematurely.

## Database / schema

Added private `notification_states` documents, created on demand. No backfill or composite index is needed. Each document ID hashes the authenticated account ID and notification ID. Records hold `userId`, `notificationId`, `read`, `dismissed`, `readAt`, `dismissedAt`, and `updatedAt`.

Dismissal is a retained tombstone, so an old read request cannot resurrect the notification. This affects notification visibility only; source prices, plans, and operations remain intact. Client Firestore access is denied. Old shared local state is not assigned to an arbitrary account; previously discarded state cannot be reconstructed.

## Server / API

- `POST /api/notifications/state/query`: resolve state for up to 100 supplied IDs.
- `POST /api/notifications/state`: atomically mark up to 100 IDs read or dismissed.
- Both routes require an authenticated, ready account through the standard API boundary. Identity comes from authentication. `expectedUserId` is a precondition rejecting requests that outlive an account switch; it never grants access to another account.
- Repeated read/dismiss requests are idempotent. Dismissed state takes precedence over read state. No unread/reset action is exposed.
- Notification state requests invalidate only their own API cache resource.

## Mobile implementation

State is cached under `@hugpong_notification_state:<account ID>`, with separate pending read and dismiss intents. The cache survives ordinary logout. Actions update the visible unread indicator or remove the row immediately, even while the server is slow. Offline intents retry on refresh or reconnect and are cleared only after an explicit matching API acknowledgement. Current-account checks suppress old-account UI updates. Reads from other devices merge without undoing local actions.

On the first eligible active app launch, the notification channel is created before permission is requested. Both `undetermined` and requestable `denied` states are supported. Concurrent startup calls share one request. The installation remembers that a request was shown, avoiding automatic prompts after denial. Foreground/navigation readiness retry an initially inactive request. The notification screen includes Enable Device Notifications, with a device-settings fallback for permanently denied permission. Android POST_NOTIFICATIONS is explicit in the build configuration.

Native permission and native delivery remain controlled by the device. Older Android versions do not use the Android 13 notification runtime dialog. Expo Go intentionally skips this standalone-build notification module. Local planner reminders and recovery push delivery are separate from in-app read/dismiss state.

Reconnect status is delivered as a live event. New subscribers receive IDLE. MainTabs only displays recovery after observing a definitive offline state within its current mounted session. Unknown native reachability stays in checking while the API health probe runs.

## Web implementation

The notification state service provides the same query/read/dismiss API and account precondition for Web consumers. Web currently has no Mobile-style notification inbox; existing Mobile-only planner reminders are preserved. This change does not introduce a browser permission prompt on website entry.

Web reconnection notices now reset at an account boundary. An in-flight reconnection from an older account cannot publish a success notice into the newly signed-in account.

## Validation and device acceptance

Automated tests exercise actual API handlers, permission service, Mobile notification-state client, Home row/badge handlers, navigation reconnect listener, and the Web API adapter. Cases cover logout/login, separate accounts, fresh-device restoration, offline retries, malformed acknowledgements, slow requests, stale unread responses, permanent permission denial, unknown native network status, and actual offline-to-online recovery.

After building the APK, test on a physical Android 13+ device with a fresh installation: allow and deny the first-launch notification prompt; enable permission from the notification screen/settings; mark one item read and dismiss another; sign out and back in; switch accounts; and repeat those actions offline before reconnecting. Confirm no recovery notice appears during a normal online login. These physical OS dialogs and delivery paths cannot be established by JavaScript tests alone.
