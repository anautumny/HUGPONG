# HUGPONG real-time synchronization audit

Status: implementation and local automated verification passed. Live staging/browser/Android acceptance is pending the isolated staging URL, Firebase configuration, and secure role-account credential location. No production records were created, modified, or deleted during verification. Existing local edits to HomeScreen and FieldOpsScreen were retained.

## Root causes

1. Direct Firestore client listeners had intentionally been removed in favor of server-authorized API reads. Firestore rules deny direct client access. The API replacement had no notification channel between devices or API instances.
2. Web subscriptions refreshed from events dispatched only in the current browser, with a 30-minute fallback. Mobile fetched operational replicas hourly, with a four-hour secondary-data window. Remote assignments, registrations, tickets, reports and profile changes could therefore remain invisible.
3. Web composite loaders and Mobile canonical refreshes discarded invalidations arriving while a read was in flight. Older responses could become the final UI state.
4. Mobile's shared arrays are mutated in place. Home reused the same array/session references, and FieldOps depended on the stable fields-array reference when selecting an assigned field. React could retain stale projections.
5. Several secondary workspaces loaded only on opening, including archive/history, recovery reviews, backup status, compilation previews and diagnostics. Selected audit reports could also retain an old lifecycle state.
6. Server presentation and assignment caches were local to each API instance. A client's reload could land on an instance whose change listener had not caught up. In-flight authorization reads also needed protection when their cache was invalidated.

## Database / schema

The existing server-only `system_metadata` collection now contains `realtime_revisions`, with a `revisions` map of resource names to opaque revision tokens. This document contains no business-record payloads or account identifiers.

No business-record migration, new index, record cleanup, or Firestore rule relaxation is required. The metadata document is created by the first applicable API mutation. Clients continue to read and mutate application data only through the API.

## Server / API

- Successful application and relevant authentication mutations publish revisions after the domain write commits, before acknowledging success. Notification persistence failures back off and retry; success is held until the notification is durable. An interrupted request retains the existing uncertain-response/idempotent-retry behavior.
- One Firestore document listener per API process fans changes out through authenticated `GET /api/sync/events` streams. Screen count and connected-device count do not create additional Firestore listeners.
- Revision comparisons include disappeared/empty snapshots. Terminal listener errors close affected streams and restart the listener with bounded exponential backoff.
- Streams carry resource names and opaque revision hashes. Records are fetched again through existing authorization, onboarding and role policies.
- A client's observed revision travels in `x-hugpong-sync-revision`. If a different API instance has not observed that revision, it invalidates its presentation, assignment and account caches before authorization/routing.
- Streams have heartbeats, bounded client retry delays, slow-reader disconnection, lifecycle cleanup, and periodic authorization renewal. An unchanged revision during routine renewal avoids an unnecessary client data reload.
- Read-only notification queries, credential renewal and QR verification do not publish mutation signals, avoiding feedback loops. Actual notification-state changes and recovery requests do publish signals.

## Web

The existing authenticated API subscriptions remain the screen data source. One authenticated stream invalidates their shared cache and refreshes affected resources, coalescing in-flight reads. Composite loaders now retain forced invalidations and perform a follow-up read. Superseded requests cannot repopulate the cache. Delayed 401 responses cannot revoke a different account that signed in afterward.

Authentication rechecks update current profile and assignment information without clearing valid same-account reads. Archive/history, selected audit dossiers, recovery queues, compilation previews, backup status and maintenance/diagnostic views now react to the same invalidation mechanism.

The existing Web online-only policy is preserved. This change does not add offline Web authority or an offline Web mutation queue.

## Mobile / Android

The existing canonical store receives the same signals through Expo's streaming fetch. It batches changes, re-fetches affected endpoints, refreshes session assignments when needed, retries transient read errors and reconnects on foreground/network restoration. A generation guard prevents concurrent listener restarts and prevents old/disposed reads from committing.

Authoritative empty results remove obsolete replicas. Confirmed manager reports are no longer resurrected merely because an older local copy exists. Home uses fresh array/session references, and FieldOps tracks store revisions when resolving assignments. Secondary views, archive data, audit inspection, recovery, notification state and compilation previews receive invalidations.

Existing account-scoped queues, local drafts, QR workflows and conflict/version checks remain in place. Pending local plans are overlaid only on fields the server still authorizes. Assignment revocation removes canonical field/audit visibility while retaining pending intent privately in the existing queue. Synchronization preferences continue to govern automatic uploads; reconnecting read replicas does not grant offline mutation authority.

## Modified application files

| Area | Files |
| --- | --- |
| Server | `server/server.js`; `server/services/changeFeed.js`; `server/middleware/auth.js`; `server/middleware/requestPermissions.js` |
| Web core | `web/react-app/src/context/AuthContext.jsx`; `web/react-app/src/services/apiClient.js`; `web/react-app/src/services/changeStream.js`; `web/react-app/src/services/realtimeService.js` |
| Web screens/components | `web/react-app/src/views/operations/OperationsView.jsx`; `web/react-app/src/views/audit/AuditCenterView.jsx`; `web/react-app/src/views/backups/BackupManagementView.jsx`; `web/react-app/src/views/diagnostics/DiagnosticsConsoleView.jsx`; `web/react-app/src/views/maintenance/MaintenanceView.jsx`; `web/react-app/src/components/audit/CropYearCompilationModal.jsx`; `web/react-app/src/components/users/RecoveryReviewQueue.jsx` |
| Mobile core | `mobile/src/data/dataStore.js`; `mobile/src/domain/pendingFieldReplica.js`; `mobile/src/services/authService.js`; `mobile/src/services/changeStream.js`; `mobile/src/services/realtimeService.js` |
| Mobile screens/components | `mobile/src/screens/HomeScreen.js`; `mobile/src/screens/FieldOpsScreen.js`; `mobile/src/screens/SyncMonitorScreen.js`; `mobile/src/components/CropYearCompilationScreen.js`; `mobile/src/components/RecoveryReviewQueue.js` |

Tests: added `server/tests/realtime-synchronization.test.js`. Updated the existing auth-security, crop-cycle-renewal, firestore-quota-optimization, mobile-ui-pagination, mutation-outbox, pagination-retention, performance-optimization, runtime-stabilization and web-api-read-boundary suites to cover the stream-based API architecture and retain existing security/offline assertions.

## Verification results

| Check | Result | Evidence |
| --- | --- | --- |
| Full server regression suite | 713 passed, 0 failed | `output/realtime-server-tests.tap` |
| Web regression suite | 56 passed, 0 failed | `output/realtime-web-tests.tap` |
| Targeted synchronization behavior | 19 tests within the server suite | `server/tests/realtime-synchronization.test.js` |
| Web production build | Passed | `output/realtime-web-build.txt` |
| Android development export | Passed; bundle generation only | `output/realtime-android-dev-export.txt` |
| Client binding audit | 0 findings | `output/realtime-client-bindings.txt` |
| Runtime authority audit | 0 findings | `output/realtime-runtime-authority.txt` |
| Git whitespace check | Passed | `output/realtime-whitespace-check.txt` |
| Android release export | Blocked by current local non-public/non-HTTPS API origin | `output/realtime-android-export.txt` |

Behavioral tests exercise real HTTP streaming between independent API service instances, with an isolated in-memory Firestore boundary. Web/Mobile-labelled transport clients cover all four delivery directions. These tests do **not** represent running installed Android applications or real browser sessions against staging Firebase.

The behavioral tests cover listener sharing, cross-instance invalidation, missed changes after disconnection, empty/deleted snapshots, durable notification acknowledgement, listener/write recovery, fragmented streaming frames, unauthorized streams, read coalescing, changes during in-flight requests, stale-account responses, Android canonical-store replacement for Member/Manager/SRA roles, selective resource reads, preserved offline plans/base versions, and retained private intent after scope revocation. Existing regression suites cover domain mutations, RBAC, authentication, outbox replay, QR verification and audit/crop-cycle workflows.

## Live acceptance still required

The user selected an existing staging environment. Repository inspection found preview and production pointing at the same beta API URL, so that URL has not been assumed to be isolated staging. The staging URL and secure configuration/credential locations were requested and remain outstanding.

On that environment, deploy the server and Web changes together and install an Android build containing these changes. Keep the following acceptance matrix open until performed with real sessions:

| Scenario | Automated evidence | Live acceptance |
| --- | --- | --- |
| Web to Web | Shared transport/invalidation tested | Pending |
| Mobile to Mobile | Shared transport and canonical store tested | Pending on two Android sessions |
| Web to Mobile | Shared transport/store tested | Pending |
| Mobile to Web | Shared transport/subscriptions tested | Pending |
| Member | Android store and role boundaries tested | Pending on Android |
| Farm Manager and SRA Admin | Android store, Web API subscriptions and role policies tested | Pending on both clients |
| Super Admin | Stream permission and existing Web RBAC tested | Pending on Web |
| Create, update, assign, submit, archive, permitted deletion | Mutation invalidation classification plus domain regression coverage | Pending through actual workflows |
| Offline queue replay, reconnect, background/foreground, account switch | Queue and synchronization regression coverage | Pending on devices/browser network controls |

Member Web and Super Admin Mobile remain unauthorized by the existing platform policy. No new delete capability or cross-platform privilege was introduced to make an otherwise forbidden test pass. Local drafts remain account/device-local work.

Staging should verify that its reverse proxy forwards event-stream bytes without buffering and measure Firestore usage under representative concurrent sessions. Direct administrative database edits/scripts bypassing API mutation middleware must explicitly publish the relevant invalidation; this implementation does not scan every business collection for out-of-band writes.

The domain write and revision publication are separate commits. A process termination between them can leave an **unacknowledged** committed write. Existing idempotent mutation/outbox replay remains necessary for that uncertain-response case; successful API acknowledgement now waits for revision persistence. This task has not replaced those existing recovery semantics or claimed transactional exactly-once delivery.

Implementation references: [Firestore listener lifecycle and errors](https://firebase.google.com/docs/firestore/query-data/listen) and [Expo streaming fetch](https://docs.expo.dev/versions/latest/sdk/expo/).

This report records local implementation and verification. It does not declare the system-wide live acceptance matrix complete.
