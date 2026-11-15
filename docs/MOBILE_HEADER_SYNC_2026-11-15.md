# Mobile header synchronization indicator — 15 November 2026

Status: implemented and verified locally, prepared for the next Android APK (Mobile metadata 1.1.2). No new APK has been built or published, and the hosted deployment has not changed for this correction. Installed 1.1.1 apps retain their existing layout until updated.

The supplied screenshots show the navigator-level updating/offline row overlapping Android's clock and network icons. The row was rendered before the screen navigator, outside the screens' safe-area containers. The user's final preference is to remove that row and use the existing HUGPONG header indicator.

## Result

- The extra updating/offline/saved-data row and its unused component/styles are removed.
- The existing header observes read-refresh status through its existing canonical-store subscription. Automatic read refresh and manual synchronization share one rotating icon and the existing localized “Syncing…” text.
- Animation stops after both activities finish, when an automatic refresh goes offline, or on unmount. Repeated renders do not start duplicate loops. Busy text remains visible on narrow/large-font layouts.
- Offline state uses the existing header indicator. Failed reads do not show a green synchronized state; the indicator allows a connection/read retry. Pending submissions retain their count.
- Account identity scopes the read-refresh state. Loading from an obsolete account cannot activate another account's indicator.
- The initial loading/retry screen stays in place so a first login does not display an unexplained empty data screen.

## Layers and modified files

- Database/schema: no change or data migration.
- Server/API: no mutation, authentication, permission, queue or notification-delivery change.
- Web: inspected as a separate browser layout; this Android status-bar overlap does not require a Web behavior change. Its existing update/subscription handling remains in use.
- Mobile: `src/components/AppHeader.js`, `src/components/InitialDataLoading.js`, `src/navigation/RootNavigator.js`, and prepared 1.1.2 app/package/lock metadata.
- Regression coverage: `server/tests/mobile-ui-pagination.test.js` executes the real header component through its existing Native hook harness for Member, Farm Manager and SRA Admin. It covers automatic loading, overlap with manual upload, offline/error/ready transitions, retry, narrow/large-font busy text, account ownership and subscription/animation counts. It also checks that the removed banner has no remaining UI references.

## Verification

- Focused Native UI/loading suites: **27 tests passed**.
- Full local release verification: **813 server tests and 66 Web tests passed**, zero failures; configuration/authority/secret/binding checks, Web build and Android JavaScript/Hermes export also passed.
- Evidence: `output/mobile-header-sync-tests-2026-11-15.tap`, `output/mobile-header-release-gate-2026-11-15.txt`.
- These tests verify the component behavior and compilation. Physical appearance and native animation on the user's phone still require installing the next APK; no physical-device rendering result is claimed.
