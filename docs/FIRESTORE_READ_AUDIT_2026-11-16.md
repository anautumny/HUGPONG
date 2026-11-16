# Firestore read audit

## Observations

The supplied usage screenshot shows approximately 46,000 reads near the 50,000 daily no-cost line. It does not establish that the quota was exhausted or identify which queries caused those reads. The reported mobile message and web unavailable screen indicate failed API connectivity/readiness checks, not a specific Firestore error.

Read-only checks of `https://hugpong.org/health/live` and `/health/ready` returned HTTP 200, active gateway mode, in approximately 1.5 and 1.4 seconds respectively during this investigation. This establishes current public reachability, not the cause of the earlier outage. Authenticated database errors and historical request logs were not measured.

Firestore charges document reads, not just HTTP requests. Re-reading a 50-document result 1,000 times accounts for 50,000 document reads before additional queries and other applicable charges. Empty queries also have a minimum charge. Usage from all clients and environments connected to a project contributes to its database usage.

## Database / schema

No new schema or composite index is required by these optimizations. Review queries use the existing automatic single-field indexes on account status and explicit manual-review requests. No live database scans or load tests were run to measure the changes.

Farm-area queries use the existing `fields.blockFarmId` index. Push delivery selects `mobile_push_devices.enabled == true`, retaining document-ID pagination supported by the existing single-field index. No summary counters or client-owned authoritative state were introduced.

The existing six-hour cleanup job now also deletes expired notification events, delivery receipts, subscription metadata and device registrations. It uses their existing `deleteAfter` timestamps or numeric `expiresAtMs`; no managed TTL billing feature is enabled. Notification read/dismiss state is retained. Expiry policies remain unchanged: events/receipts end at their existing 28-day deadline, subscriptions retain their recorded history window, and push registrations expire after seven days without renewal. This stops retained expired rows increasing future scans and storage.

## Server / API and Cloudflare

The review-only users endpoint previously loaded the whole directory, and for managers also loaded member fields/accounts before filtering for reviews. It now queries pending accounts and explicit manual-review requests, deduplicates those candidates, resolves their assignments and applies the current role/farm scope.

A route-level in-memory test with 1,000 unrelated active accounts and one pending member counts two user-query read units, including the empty manual-review query, and four total document/minimum-query reads including assignment lookup. This is a mocked query-budget check; it excludes authentication middleware, index-entry billing, transaction retries and other production traffic. It is not a measurement of the production daily bill.

Additional fixes from the full-system scan:

| Path | Previous read amplification | Implemented change |
| --- | --- | --- |
| Block-farm list / area summaries | Every scoped farm list read all system fields | Query only returned farm IDs, in chunks of ten; preserve complete authoritative area totals |
| Concurrent API reads | Identical requests arriving before the first response could repeat the query | Coalesce by authenticated owner, role, authorization version, assignment and URL; each request still passes authorization |
| Cache invalidation | A second mutation hook cleared unrelated cached datasets after the change feed already invalidated dependencies | Use the change feed's dependent-resource invalidation before acknowledgement; login, telemetry and state queries do not flush business datasets |
| In-flight cache entries | Unrelated mutations prevented otherwise valid reads being cached | Track resource versions separately; affected mutations release waiters and prevent stale publication |
| Revision headers | Older client tokens could repeatedly flush caches while events were in transit | Recognize recent older Node revisions; the single-writer Worker relies on its own commit invalidations and hydration rather than client-driven global flushes |
| Notification inbox | Account document read again after verified API authorization | Reuse the internal verified account snapshot; retain subscription-window, recipient and farm checks |
| Push delivery | Every event paged through disabled installations as well as eligible devices | Filter disabled installations in Firestore, retaining final live binding/subscription checks |
| Operation amendments / support tickets | Presentation fetched account names even when already stamped on records | Reuse existing name/role snapshots; keep legacy missing-value lookups |
| Worker wakeups | Every POST/upload/telemetry/login/state query could wake the pending-delivery scanner | Wake only current durable notification producers: price/user mutations, registration and manual verification-review requests |
| Idle Worker alarm | Two identical empty queue queries per drain | One queue query when idle or waiting; query again only after dispatch changes queue state |

Notification producer routing matches the current three durable audit event types. A future notification producer must also be added to the Worker wake classification. Existing durable alarms still recover pending events at initialization, follow retry deadlines and perform retention work without new writes.

Authentication and assignment guard TTLs remain 15 seconds and 60 seconds respectively. `Cache-Control: no-cache` continues to bypass presentation caching. Recovery reviews, certified compilation sources and notification inboxes retain their deliberate live-read behavior. Failed/aborted reads never become successful cache entries; waiters recover after an error, mutation or abandoned request.

## Web implementation

Farm Manager and SRA directories already include all scoped pending/manual-review users. Their user screen no longer opens a duplicate review subscription. Super Admin keeps the separate queue because its directory is paginated. Dashboard review counts continue using the server-authoritative review endpoint.

Dashboard tiles now use the resource-invalidated client cache: a terminal activity update fetches the affected tile while reusing fresh prices, fields, farms, cycles, operations and pending users. Explicit cache expiry, connection recovery and relevant revision changes still reload data. A failed coherent field graph retains its prior snapshot while independent tiles can update.

## Mobile implementation

The native-alert presenter previously fetched read/dismiss state for every inbox row after every refresh. It now requests state only for unseen candidates that could produce an OS alert. Unchanged/previously presented rows cause no extra native state reads; disabled notification permissions skip those state reads. Confirmed read/dismiss states are monotonic, so those candidates do not need repeated alert-state lookups. The visible inbox still uses the existing account-owned state and reconnect flow.

Refreshing the session no longer automatically reloads every replica endpoint. The store compares the authorized owner, role, farm, field and authorization version. An unchanged session reuses unaffected responses; an assignment change refreshes the full core and secondary scope. Local mutations refresh the same dependent resource groups as the server instead of adding a profile refresh to every write. Initial login, foreground/reconnect recovery, missed revisions and always-on upload synchronization remain intact.

## Local read-budget evidence

These are deterministic fixture counts, not production billing measurements. They exclude authentication, transaction retries and index-entry charges unless the specific test includes them.

| Regression scenario | Verified result |
| --- | --- |
| Review queue: 1,000 unrelated active users, one pending user | Two user-query units; four total handler-level document/minimum-query units |
| Farm totals: 23 returned farms, 69 relevant field documents, 1,000 unrelated fields | Three chunked queries; 69 result reads; complete active-area totals |
| Five owners, twenty overlapping identical requests each, 50-document fixture per owner | Five query executions / 250 result reads, versus 100 executions / 5,000 result reads without reuse; no owner data crosses scopes |
| Push delivery with 1,000 disabled registrations and one active device | Two device reads: selected device and final binding check; disabled rows are excluded |
| Idle delivery alarm | One minimum queue query and a sleep until the scheduled retention deadline |
| Web dashboard terminal activity update | One terminal endpoint request; zero requests for unrelated fresh tiles |
| Mobile field + session event with unchanged assignment | Session and fields requests only; a changed assignment restores the full scoped refresh |
| Mobile local operation mutation | Fields, cycles, operations, audit reports and audit history refresh; no profile, price, directory or ticket requests |

## Five-account operating budget

The intended workload is approximately five accounts and five devices. Aim for at most 40,000 daily reads total, leaving roughly 10,000 below the no-cost read allowance for security checks, delivery, retries and maintenance. This is a planning target, not an enforced user limit or a measured forecast.

For illustration, five accounts each performing twenty complete 200-document loads would consume 20,000 result reads before other charges. At 2,000 documents per complete load, the same activity would consume 200,000. Account count alone cannot establish a daily read total. The mocked results above measure avoided duplication rather than assuming every navigation causes a fresh complete load.

The twelve retention policies need about 48 minimum empty-query reads per day at a six-hour cadence, plus approximately four idle queue checks on a continuously running Worker. Startup, actual expired rows, active notification deliveries and retry work add reads. There is no minute-by-minute empty delivery polling loop.

## Remaining scaling costs and rollout checks

1. Current clients assemble complete scoped operation pages for accurate totals and offline work. Large histories still cost one read per returned document on a cold or invalidated complete load. Cross-farm operations/audit/user views legitimately cost more than member views; pagination alone does not reduce costs when every page is needed.
2. Operation pages resolve live field scope and report locks. Uncached pages can repeat some scope/report reads. Incremental replication with deletion tracking and authoritative summaries would be the next larger change if growing histories dominate actual usage; simply truncating results would break offline completeness and audit totals.
3. Revision events are resource-based across the system, so another farm's mutation can refresh an active client's corresponding resource. Farm-specific revision channels could reduce that fanout if usage grows beyond the current five-device target.
4. Notification history is live and paginated; recipient eligibility, subscription windows, read/dismiss state and final push authorization still require reads. Reconnects and active system broadcasts remain real work.
5. Explicit uncached refreshes, multiple development servers using production Firebase, emulator/device reload loops, imports and administrative scripts can bypass normal reuse. Ensure test workloads use a separate Firebase project or local emulator; do not run seeded stress traffic against the production quota.
6. The performance changes must ship to the Worker/web host and the mobile app before hosted/installed behavior changes. Observe one comparable day after deployment and distinguish its reads from earlier traffic. Use Firebase usage and matching API errors to attribute any future limit failure; the local tests do not establish which historical request caused the screenshot.

Verification completed: 952 server tests, 75 web tests, web production build, Cloudflare Worker build, Android production bundle export and zero client-binding findings. Evidence is saved under `output/free-tier-audit-*2026-11-16*`.

References: [Firestore quotas](https://firebase.google.com/docs/firestore/quotas), [billing rules](https://firebase.google.com/docs/firestore/pricing), [automatic index ordering](https://firebase.google.com/docs/firestore/query-data/index-overview).

## Follow-up regression verification

Rechecked the complete changed source after the request to preserve system behavior. All 952 server tests and 75 web tests passed again. Runtime-authority, tracked-secret-exposure and client-binding audits reported zero findings; local configuration parity and the mobile dependency mitigation check passed. The previously verified web/Worker production builds and Android bundle remain applicable; the only follow-up source edit restored original line endings in unchanged profile-screen lines, with normalized source content explicitly checked for equality.

Coverage includes account/role isolation, authorization revocation, pending approvals with both field choices, complete area totals, operation/audit calculations, notifications across account switching and logout, offline queued work, reconnect catch-up, concurrent reads, invalidation races and failed-request recovery. No functional regression was detected by these automated checks. Source checks and mocked integration tests do not substitute for deployed-device smoke tests. No deployment or production data mutation was performed during this verification.

Fresh evidence: `output/regression-assurance-server-tests-2026-11-16.txt`, `output/regression-assurance-web-tests-2026-11-16.txt`, and the `output/regression-assurance-*.json` audit reports.

## Limits of this investigation

Existing actor-scoped server caching, client request coalescing and revision-based refreshes remain in place. Read efficiency can still depend on dataset size, users/devices, reconnects, navigation, invalidations and uncached refreshes. These changes do not guarantee that all workloads fit within a 50,000-read daily allowance.

The fixes are local until deployed. Local changes that have not been deployed cannot explain hosted traffic by themselves, although any running local application pointed at the same Firestore project shares that project's quota. The original outage cannot be attributed specifically to Firestore quota without its provider/API error or matching historical logs.
