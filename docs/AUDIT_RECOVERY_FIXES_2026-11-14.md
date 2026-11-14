# Audit recovery fixes — 14 November 2026

Audit-time status: implemented locally while deployment, native APK builds and publication were on hold. The user subsequently lifted that hold and requested rollout before final testing. Current release progress is recorded in [RELEASE_1.1.1_2026-11-14.md](RELEASE_1.1.1_2026-11-14.md); the test results below describe the verified corrective source.

The four reported defects and QR preview guard have been corrected. Related findings A05–A07 were also corrected. A01/A09 startup and service-outage fixes from the preceding audit remain included. This is not a certification of every production configuration or device workflow.

## Root causes and resulting behavior

| Finding | Root cause | Correction |
|---|---|---|
| Failed secondary requests / A04 | Aggregate reads rejected as a unit. A failed ticket, directory, history, or profile read prevented successful unrelated responses from reaching the screen. | Both clients retain the last valid failed-resource data, apply successful independent updates, expose partial failure and retry automatically. Fields/cycles/farms/operations remain a coherent group. Genuine authorization failures still prevent applying the batch. Successful empty snapshots still remove records. |
| Duplicate price retries / A10 | The API discarded mutation context; clients generated a new identity for each attempt after a lost response. | Web and Mobile persist/reuse an account-scoped publication intent. The server records an actor-scoped receipt atomically with the price, audit and notification intent. Replays return the original publication even if the candidate record ID differs; changed details under the same key receive 409. |
| Delayed Mobile token refresh / A02 | Credential writes and Firebase sign-ins lacked authentication-generation checks. An old request could overwrite a new login, including a new login to the same account. | Requests capture the authentication generation and identity, check before sending and before committing, and serialize credential/Firebase transitions. Late 401s cannot clear the next account. Current valid refresh and genuine revocation remain effective. Canonical synchronization also checks the store owner/generation before replacing the session. |
| Cache clearing / A03 | Prefix-based removal deleted all account-scoped queues/drafts. Rewriting captured credentials afterward also risked restoring an older token. | An allowlist clears replaceable read projections only. Every account's drafts, outbox, uncertain creation intents, credentials and unknown future pending keys survive. Reset does not clear the in-memory pending queue or falsely mark it synced. English, Filipino and Hiligaynon confirmation/success text describes the new behavior. |
| QR preview / A08 | The displayed SVG was not bound to the selected payload; effect completion had no cleanup guard. | Previous SVGs are hidden immediately when payload/options change. Loading feedback is displayed; old successes/errors and completions after unmount are ignored. Server QR verification remains unchanged. The original persistent out-of-order overwrite was a forced-timing scenario, not a confirmed normal-production reproduction with the installed synchronous SVG generator. |
| Missing invalidation / A05 | Exact change-event matching treated trailing-slash URLs differently from the permission/router boundary. | Change classification reuses the existing canonical request-path function. |
| Retry storms / A06 | Stream and Mobile refresh/notification retries ignored Retry-After. Events during cooldown could also be discarded. | Web/Android streaming honors seconds and HTTP-date Retry-After. Mobile store/notification retries honor deadlines. Invalidation events during cooldown are retained and applied afterward. Failure retries reuse healthy responses; no continuous polling was added. |
| Notification fanout reads / A07 | Each inbox event individually fetched its target, even for a Member who cannot review verification requests. | Members skip reviewer-account lookups. Reviewers batch target/farm reads once per inbox request and reuse the existing authority policy. Caches do not cross requests or accounts. |

## Database and schema

No business-record migration, index change, production record deletion or role change is required. Price publications use the existing `mutation_receipts` collection with namespace `PRICE_PUBLICATION`, actor identity, input hash, original result and the existing 90-day receipt retention convention. Price, audit event, notification intent and receipt commit in the same transaction. Clients still cannot write directly to Firestore.

Legacy callers with an explicit stable price ID retain the existing record-ID replay behavior. Updated clients supply the durable mutation identity. An HTTP publication lacking both an identity and a stable record ID is rejected. This guarantees retries of the same saved intent; it deliberately does not collapse distinct authorized publications solely because their dates or amounts match.

## Modified production files for this correction

| Layer | Files |
|---|---|
| Server / API | `server/routes/prices.js`, `server/services/priceService.js`, `server/services/creationReceipt.js`, `server/services/systemNotificationService.js`, `server/services/changeFeed.js`, `server/middleware/requestPermissions.js` |
| Web | `web/react-app/src/services/apiClient.js`, `fieldsService.js`, `blockFarmsService.js`, `dashboardService.js`, `pricesService.js`, `changeStream.js`; `web/react-app/src/components/prices/PublishPriceModal.jsx`; `web/react-app/src/components/audit/QRCodeView.jsx` |
| Mobile | `mobile/src/data/dataStore.js`; `mobile/src/services/authService.js`, `storageService.js`, `enrollmentIntentService.js`, `changeStream.js`, `systemNotificationService.js`, `i18n.js`; `mobile/src/screens/ProfileScreen.js`; `mobile/src/components/PublishPriceModal.js` |

Both price modals now initialize on opening, so an incoming live price does not reset the user's current entries. Web reuses its existing creation-intent helper; Mobile generalizes its existing field-intent helper. No second outbox, authority store, notification delivery system or realtime transport was introduced.

The preceding startup/loading changes and their files are documented in [MOBILE_INITIAL_LOADING_2026-11-14.md](MOBILE_INITIAL_LOADING_2026-11-14.md) and [SYSTEM_WIDE_AUDIT_2026-11-14.md](SYSTEM_WIDE_AUDIT_2026-11-14.md).

## Verification

The final local release verification runs behavioral/contract tests, configuration/authority/secret/binding checks, the existing Mobile dependency mitigation check, Web compilation and Android JavaScript/Hermes export. Android export is not an APK build.

- New `server/tests/audit-recovery-regressions.test.js` executes actual authentication/storage/intent/publication functions: old-account and same-account login races, late 401, valid refresh and real revocation, two-account cache preservation, server receipt replays/conflicts, lost successful responses across fresh Web/Mobile runtimes, and batched reviewer reads.
- Expanded `server/tests/realtime-synchronization.test.js` executes actual subscribers/canonical stores: secondary/profile failures, coherent field graphs, retry recovery, cooldown invalidations, healthy-resource reuse, trailing-slash events, Retry-After formats, role dashboards and price notifications to open screens. Existing real HTTP/SSE coverage exercises four transport clients in both cross-platform directions.
- New `web/react-app/tests/qr-selection-race.test.js` renders the actual component through React DOM with controlled deferred QR generation: A finishing after B, immediate old-SVG removal, old errors, return to a previous selection, selected errors and unmount cleanup.
- For 50 review events, an authorized Farm Manager inbox uses one event query plus two batched lookups (targets and distinct farms); Member inbox performs no target/farm lookups. This reduces RPC round trips, not the number of billable documents an authorized reviewer legitimately needs to read.
- Existing static contract assertions were updated for the new guarded paths and supplemented by the behavioral cases above.

Final results: **812 server tests passed, 66 Web tests passed, zero failures**. The complete release verification passed, including all listed audits, Web production build and Android JavaScript/Hermes export. The focused final synchronization/recovery run passed 46 tests. Evidence: `output/audit-fixes-release-gate-2026-11-14.txt`, `output/audit-recovery-targeted.tap`, `output/qr-selection-race.tap`.

## Remaining validation and separate audit risks

- Actual installed-APK cold restarts, native secure storage, background/closed-app push delivery and physical cross-device role/reconnect workflows remain unverified. Local fixtures and HTTP/SSE tests do not substitute for those checks. Member Web and Super Admin Mobile access remain prohibited by existing platform rules.
- No production accounts were impersonated and no production business records were created, changed or deleted for these tests. The later authorized rollout is tracked in the release document.
- Separate audit concerns still require follow-up: individual bearer-token revocation on logout, dependency advisories, Cloudflare background-wake classification and representative capacity, notification infrastructure retention, and deployed Firebase rules/IAM. These are detailed in the original audit. This patch does not silently replace the session model, upgrade framework majors, alter production retention or claim those risks resolved.
