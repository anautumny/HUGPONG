# Sync Monitor Completion Report

## 1. Root cause of Farm Manager Web activity not updating

Web authentication never wrote centralized activity telemetry. Only Mobile
published a startup device record, and the Web monitor interpreted that
record's generic `updatedAt` as both activity and successful synchronization.
No persistent `isLogging` flag was found; the apparent stuck state was stale
Mobile-only telemetry plus incorrect status derivation.

## 2. Existing telemetry fields discovered

The live `terminal_diagnostics` collection contained two v1 documents with:
`userId`, `deviceId`, `model`, `os`, `appVersion`, `battery`, `cachedLogs`,
`status`, and `updatedAt`.

## 3. Old or duplicate fields discovered

Legacy code also used `lastSync`, `lastSyncedAt`, `syncLagDays`, `pendingLogs`,
`offlineLogsCount`, `deviceName`, `batteryLevel`, numeric local
`lastActiveAt`, and formatted strings such as `Just now`. These are no longer
used to derive the canonical monitor state.

## 4. Files changed

- Server: authentication route, telemetry route/service, and telemetry tests.
- Web: auth heartbeat, telemetry service, Sync Monitor view/components,
  Farm Manager route/navigation, browser ticket-Outbox reporting, and local
  connectivity context.
- Mobile: installation identity, authentication headers, telemetry service,
  Outbox completion reporting, foreground activity, Sync Monitor, manager
  dashboard, and role-specific Sync Monitor links.
- Firestore/docs: server-only telemetry rules and canonical schema docs.

## 5. Web activity tracking

Web sends a stable installation identifier. Successful login records
`lastLoginAt`, `lastActiveAt`, and `lastPlatform=WEB` on the server. A
five-minute, visibility-aware heartbeat reports activity without writing on
every click or render.

## 6. Mobile activity tracking

Mobile persists a stable installation identifier in AsyncStorage. Login,
restored sessions, and foreground/resume report Mobile activity. Telemetry
failure remains non-blocking.

## 7. Sync state changes

Canonical states are `UP_TO_DATE`, `PENDING_SYNC`, `SYNCING`, `SYNC_FAILED`,
`OFFLINE`, and `UNKNOWN`. Activity writes never mutate sync fields.
`lastSuccessfulSyncAt` advances only when an actual processed Outbox flush
succeeds. A successful report older than 72 hours is presented as not recently
reported while retaining its historical timestamp.

## 8. Outbox pending-count changes

Mobile reports its durable AsyncStorage Outbox count after flush attempts.
While offline, the Member sees the current local count and the manager keeps
seeing the last central report. The Web support-ticket queue reports its own
browser count after successful reconnect/flush; the Web UI labels the local
browser count separately from centrally last-reported counts.

## 9. Role-scope changes

- Member Farmer: own Mobile synchronization only.
- Farm Manager: self plus active Member Farmers assigned through Fields in the
  manager's canonical Block Farm assignment.
- SRA Admin: no agricultural Sync Monitor.
- Super Admin: no agricultural Sync Monitor; existing Maintenance/System
  Diagnostics remains the system-health surface.

## 10. Firestore and server changes

`terminal_diagnostics` remains the one telemetry collection. v2 documents use
server ISO timestamps and separate activity, device, sync, and connection
fields. Document IDs are server-derived from authenticated user, platform, and
installation. The GET endpoint returns an authorized aggregated roster rather
than raw device rows.

## 11. Security changes

Clients cannot send an effective target user ID or Block Farm scope. Server
identity and canonical assignments determine ownership and visibility.
Firestore direct reads and writes are denied; access is through role-protected
server endpoints. SRA and Super Admin are rejected by the agricultural GET and
sync-report endpoints.

## 12. Listener and query improvements

Web uses one screen-scoped 30-second refresh subscription with focus/mutation
refresh and cleanup. Mobile starts one 30-second screen poll on focus and stops
it on blur/unmount. Server queries only assigned Block Farms, their Fields,
bounded user-ID batches, and bounded telemetry user-ID batches. There is no
district-wide Field scan, separate user download, N+1 card request, or listener
per member.

## 13. Timestamp and timezone changes

Central telemetry uses authoritative server-generated ISO-8601 timestamps.
Web and Mobile format stored values in `Asia/Manila`; formatted strings are not
persisted as canonical telemetry.

## 14. Legacy sync logic removed

Removed the fabricated role-based Samsung device IDs, estimated battery,
hardcoded `Just now`, recent-write-equals-`Active & Synced`, manager-device
Outbox reuse for other members, fake `100%` manager dashboard state, and local
member lag constants. v1 Firestore documents remain intact as history but are
treated as `UNKNOWN` until a v2 client reports.

## 15. Tests performed

- Server: 224 tests passing, including multi-device ordering, activity without
  sync, sync without activity, failed/reconnect behavior, stale telemetry,
  role separation, active-user filtering, and scoped-query source contracts.
- Web: 21 tests passing and production Vite build passing.
- Mobile: Android Expo/Hermes export passing.
- `git diff --check` passing.
- Read-only live Firestore aggregation returned exactly one manager self row
  and one assigned Member Farmer row for the single development Block Farm.

## 16. Remaining limitations

- A fully offline device cannot report its local Outbox; managers intentionally
  see the last report until reconnect.
- Refresh is near-real-time polling (30 seconds), not Firebase presence.
- Existing v1 telemetry is not destructively migrated; it becomes canonical
  when each client next reports v2 telemetry.
- Automated tests exercise the complete server write/aggregate contracts and
  production client bundles, but a credentialed two-physical-device acceptance
  run is still appropriate before release.
